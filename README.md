# Single Page Scraper

An Apify Actor that scrapes exactly one HTTP or HTTPS page and returns cleaned content as Markdown, plain text, or HTML.

This is a simplified version of the original RAG Web Browser Actor. It does not run Google Search, follow search results, or crawl additional pages. You give it one URL, and it extracts that page.

## Input

```json
{
    "query": "https://example.com",
    "outputFormats": ["markdown"],
    "scrapingTool": "raw-http"
}
```

The `query` field must be a full URL starting with `http://` or `https://`.

## Output

The Actor saves one item to the default dataset:

```json
{
    "metadata": {
        "url": "https://example.com",
        "title": "Example Domain"
    },
    "markdown": "# Example Domain\n\nThis domain is for use in illustrative examples...",
    "crawl": {
        "httpStatusCode": 200,
        "requestStatus": "handled"
    }
}
```

## Scraping Modes

- `raw-http`: Fast mode for mostly static pages.
- `browser-playwright`: Browser mode for JavaScript-heavy pages.

## Standby HTTP Usage

When running in Apify Standby mode, call:

```shell
curl "https://YOUR-ACTOR.apify.actor/search?token=<APIFY_API_TOKEN>&query=https%3A%2F%2Fexample.com"
```

The endpoint returns a JSON array with one scraped result.

## Local Development

```shell
npm install
npm run build
npm run start:dev
```

For local Apify runs, provide input through `storage/key_value_stores/default/INPUT.json` or the Apify CLI.

## Deploy To Apify

```shell
apify login
apify push
```
