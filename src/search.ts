import type { IncomingMessage, ServerResponse } from 'node:http';

import { log } from 'crawlee';

import { PLAYWRIGHT_REQUEST_TIMEOUT_NORMAL_MODE_SECS, Routes } from './const.js';
import { addContentCrawlRequest, createAndStartContentCrawler } from './crawlers.js';
import { UserInputError } from './errors.js';
import { processInput } from './input.js';
import { createResponsePromise } from './responses.js';
import type { ContentCrawlerOptions, ContentScraperSettings, Input, Output } from './types.js';
import {
    addTimeMeasureEvent,
    createRequest,
    interpretAsUrl,
    parseParameters,
    randomId,
} from './utils.js';

/**
 * Prepares one content request for a single target page.
 */
function prepareRequest(
    input: Input,
    contentScraperSettings: ContentScraperSettings,
) {
    const interpretedUrl = interpretAsUrl(input.query);
    if (!interpretedUrl) {
        throw new UserInputError('This Actor scrapes one page only. Provide a valid HTTP or HTTPS URL in `query`.');
    }

    const responseId = randomId();
    const req = createRequest(
        interpretedUrl,
        { url: interpretedUrl },
        responseId,
        contentScraperSettings,
        null,
        input.id,
    );

    addTimeMeasureEvent(req.userData!, 'request-received', Date.now());
    return { req, responseId };
}

/**
 * Internal function that handles the common logic for search.
 * Returns a promise that resolves to the final results array of Output objects.
 */
async function runSearchProcess(params: Partial<Input>): Promise<Output[]> {
    // Process the query parameters the same way as normal inputs
    const {
        input,
        contentCrawlerOptions,
        contentScraperSettings,
    } = await processInput(params);

    contentCrawlerOptions.crawlerOptions.keepAlive = true;

    const { key: contentCrawlerKey } = await createAndStartContentCrawler(contentCrawlerOptions);

    const { req, responseId } = prepareRequest(
        input,
        contentScraperSettings,
    );

    // Create a promise that resolves when all requests are processed
    const resultsPromise = createResponsePromise(responseId, input.requestTimeoutSecs);

    log.info(`Scraping single page: ${input.query}`);
    await addContentCrawlRequest(req, responseId, contentCrawlerKey);

    // Return promise that resolves when all requests are processed
    return resultsPromise;
}

/**
 * Handles the search request at the /search endpoint (HTTP scenario).
 * Uses the unified runSearchProcess function and then sends an HTTP response.
 */
export async function handleSearchRequest(request: IncomingMessage, response: ServerResponse) {
    try {
        const params = parseParameters(request.url?.slice(Routes.SEARCH.length) ?? '');
        log.info(`Received query parameters: ${JSON.stringify(params)}`);

        const results = await runSearchProcess(params);

        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(results));
    } catch (e) {
        const error = e as Error;
        const statusCode = error instanceof UserInputError ? 400 : 500;
        log.error(`Error occurred: ${error.message}`);
        response.writeHead(statusCode, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ errorMessage: error.message }));
    }
}

/**
 * Handles the model context protocol scenario (non-HTTP scenario).
 * Uses the same runSearchProcess function but just returns the results as a promise.
 */
export async function handleModelContextProtocol(params: Partial<Input>): Promise<Output[]> {
    try {
        log.info(`Received parameters: ${JSON.stringify(params)}`);
        return await runSearchProcess(params);
    } catch (e) {
        const error = e as Error;
        log.error(`UserInputError occurred: ${error.message}`);
        return [{ text: error.message }] as Output[];
    }
}

/**
 * Runs the search and scrape in normal mode.
 */
export async function handleSearchNormalMode(input: Input,
    contentCrawlerOptions: ContentCrawlerOptions,
    contentScraperSettings: ContentScraperSettings,
) {
    /* eslint-disable no-param-reassign */
    const startedTime = Date.now();
    contentCrawlerOptions.crawlerOptions.requestHandlerTimeoutSecs = PLAYWRIGHT_REQUEST_TIMEOUT_NORMAL_MODE_SECS;

    const {
        crawler: contentCrawler,
        key: contentCrawlerKey,
    } = await createAndStartContentCrawler(contentCrawlerOptions, false);

    const { req } = prepareRequest(
        input,
        contentScraperSettings,
    );
    log.info(`Scraping single page: ${input.query}`);
    await addContentCrawlRequest(req, '', contentCrawlerKey);

    addTimeMeasureEvent(req.userData!, 'before-playwright-run', startedTime);
    log.info(`Running target page crawler with request: ${JSON.stringify(req)}`);
    await contentCrawler!.run();
    /* eslint-enable no-param-reassign */

    const { requestsFinished, requestsFailed } = contentCrawler!.stats.state;
    return { requestsFinished, requestsFailed };
}
