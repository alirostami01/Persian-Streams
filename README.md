# F2My.top Stremio Addon

An unofficial Stremio addon that provides streaming links scraped from **https://www.f2my.top** - an Iranian source offering movies and TV series with Persian subtitles.

## Features

- **Movies & Series Support**: Works with both movies and TV shows
- **Multiple Quality Options**: Extracts 4K, 1080p, 720p, 480p streams
- **Persian Subtitles**: All content includes Persian/Farsi subtitles
- **IMDB Integration**: Uses IMDB IDs for content matching
- **Season/Episode Selection**: Proper handling of series with season and episode numbers

## Installation

### Local Testing

1. **Clone or download this addon:**
   ```bash
   cd /workspace
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the server:**
   ```bash
   npm start
   # or
   node server.js
   ```

4. **Install in Stremio:**
   - Open Stremio desktop app
   - Go to: `stremio://localhost:7000/manifest.json`
   - Or visit in browser: http://localhost:7000/manifest.json

### Deployment (Optional)

Deploy to any Node.js hosting service (Heroku, Railway, Render, etc.):

```bash
# Set PORT environment variable if needed
export PORT=8080
node server.js
```

## Usage

Once installed, the addon will automatically appear in your Stremio addons list. When you browse movies or series in Stremio:

1. Select any movie or TV show
2. The addon will search f2my.top for matching content using the IMDB ID
3. Available streams will be displayed with quality labels
4. For series, select the season and episode you want to watch

## Stream Format

Streams are returned with the following format:
- **Name**: `F2My.top\n[Quality] • Iranian Source`
- **Title**: `[Season/Episode] - [Quality]\nPersian Subtitles`
- **URL**: Direct video link (.mkv, .mp4)

Example:
```json
{
  "name": "F2My.top\n1080p • Iranian Source",
  "title": "S3E6 - 1080p\nPersian Subtitles",
  "url": "https://...abrtech.top/.../House.of.the.Dragon.S03E06.1080p...mkv"
}
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `/manifest.json` | Addon manifest for Stremio |
| `/stream/movie/{imdbId}.json` | Movie stream request |
| `/stream/series/{imdbId}:{season}:{episode}.json` | Series stream request |
| `/health` | Health check endpoint |

## Technical Details

### How It Works

1. **Search**: When Stremio requests streams for an IMDB ID, the addon searches f2my.top
2. **Page Parsing**: Fetches and parses the content page using Cheerio
3. **Season/Episode Matching** (for series):
   - Identifies season containers (`.download-season`)
   - Parses Persian season numbers (اول, دوم, سوم, etc.)
   - Matches episode numbers from text or URL parameters
4. **Video Extraction**: Extracts direct video URLs from:
   - `onclick` handlers (`handleDownloadClick('URL')`)
   - Direct `href` attributes on download links
   - iframe sources
5. **Quality Detection**: Analyzes URLs and context to determine video quality

### Site Structure

The addon is designed to work with f2my.top's WordPress-based structure:
- Seasons in `.download-season` containers
- Episodes in `.series-downloaditems .d-flex` elements
- Video URLs in onclick handlers or direct links
- Quality information in button text or URL parameters

## Troubleshooting

### No Streams Found

- The content might not be available on f2my.top
- The IMDB ID might not match any content on the site
- Check server logs for detailed error messages

### Server Not Starting

- Ensure port 7000 is not in use
- Check that all npm packages are installed: `npm install`
- Verify Node.js version (requires Node 14+)

### Slow Response

- The addon makes HTTP requests to external sites
- First request may be slower due to search and parsing
- Consider deploying closer to your location

## Logs

View server logs for debugging:
```bash
# If running in foreground, logs appear in terminal
# If running in background:
tail -f /tmp/server.log
```

## Disclaimer

This addon is for educational purposes only. It scrapes publicly available links from f2my.top. The addon does not host any content itself. Users should comply with their local copyright laws when streaming content.

## License

MIT License - See LICENSE file for details

## Support

For issues or questions, please check the server logs first. The addon is maintained as-is with no official support.
