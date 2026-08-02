# F2My.top Stremio Addon

An unofficial Stremio addon that provides streaming links scraped from https://www.f2my.top for movies and TV series.

## Features

- **Movies & Series Support**: Works with both movie and TV series content
- **Automatic Slug Generation**: Converts content titles to URL-friendly slugs
- **Fallback Search**: If direct URL lookup fails, searches the site automatically
- **Quality Detection**: Extracts and labels video quality (1080p, 720p, 4K, etc.)
- **Multiple Source Extraction**: Parses iframes, data attributes, inline scripts, and more

## Installation

### Prerequisites

- Node.js 16+ 
- npm or yarn

### Setup

1. Install dependencies:

```bash
npm install
```

2. Start the server:

```bash
npm start
```

The addon will run on `http://localhost:7000` by default.

### Development Mode

For auto-reload during development:

```bash
npm run dev
```

## Usage

### Installing in Stremio

1. Start the addon server
2. In Stremio, go to **Addons** → **Add Addon**
3. Enter the manifest URL: `http://localhost:7000/manifest.json`
4. Or click: [stremio://localhost:7000/manifest.json](stremio://localhost:7000/manifest.json)

### API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /manifest.json` | Addon manifest for Stremio |
| `GET /stream/movie/{imdb_id}.json` | Get streams for a movie |
| `GET /stream/series/{imdb_id}:{season}:{episode}.json` | Get streams for a series episode |
| `GET /health` | Health check endpoint |

### Example Requests

**Movie:**
```
GET /stream/movie/tt15398776.json
```

**Series:**
```
GET /stream/series/tt1190634:1:5.json
```
(This requests Season 1, Episode 5 of the series)

## How It Works

### 1. Title to Slug Conversion

When Stremio requests streams, the addon:
- Receives the IMDB ID and content type
- Converts the title to a URL slug (lowercase, spaces to hyphens, no special chars)
- Example: "House of the Dragon" → "house-of-the-dragon"

### 2. Page Fetching

- Constructs URL: `https://www.f2my.top/movie/{slug}/` or `https://www.f2my.top/series/{slug}/`
- Fetches the page using Axios with proper headers
- Falls back to search if direct URL returns 404

### 3. Content Scraping

The addon uses Cheerio to parse HTML and extract video sources through multiple strategies:

1. **Iframe Detection**: Finds embedded video players
2. **Data Attributes**: Looks for `data-video`, `data-src`, etc.
3. **Video Sources**: Parses `<video><source>` elements
4. **Episode Selection**: For series, finds correct season/episode
5. **Inline Scripts**: Extracts URLs from JavaScript code
6. **Button/Link Elements**: Finds play/watch buttons with video links

### 4. Quality Detection

Quality is determined by:
- URL patterns (e.g., `.1080p.`, `-720p-`)
- Data attributes (`data-quality`)
- Element text content
- File extensions (`.m3u8` → HLS)

### 5. Stream Response

Returns streams in Stremio format:
```json
{
  "streams": [
    {
      "name": "F2My.top\n1080p",
      "title": "1080p Stream",
      "url": "https://example.com/video.mp4"
    }
  ]
}
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `7000` | Server port |

### Customization

Edit `server.js` to modify:
- `BASE_URL`: Change the source website
- `USER_AGENT`: Customize request headers
- Scraping selectors in `extractVideoSources()`

## Troubleshooting

### No Streams Found

- The content might not be available on f2my.top
- The site structure may have changed (update selectors)
- Check server logs for errors

### Site Structure Changes

If f2my.top changes their HTML structure:
1. Inspect the page source
2. Update selectors in `extractVideoSources()`
3. Look for new data attributes or element patterns

### Rate Limiting

If you encounter rate limiting:
- Add delays between requests
- Use proxy rotation
- Respect the site's terms of service

## Legal Disclaimer

This addon is for educational purposes only. The developer is not responsible for:
- Copyright infringement
- Terms of service violations
- Any legal issues arising from use

Always respect content creators' rights and local laws.

## License

MIT License - See LICENSE file for details

## Contributing

Contributions welcome! Please ensure any changes:
- Maintain code quality
- Include appropriate comments
- Don't break existing functionality