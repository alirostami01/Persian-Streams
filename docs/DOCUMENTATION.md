# مستندات فنی Iranian Provider Media / Persian Streams

این سند بر اساس **ساختار جدید و ماژولار پروژه** نوشته شده است و با کد واقعی در شاخه `main` راستی‌آزمایی شده است.

پروژه از حالت تک‌فایلی (`addon.js` شامل همه‌چیز) به معماری چندماژولی تفکیک شده تا هم روی **Node.js/Express** و هم روی **Cloudflare Workers** بدون وابستگی‌های اضافی اجرا شود.

- هسته استخراج و منطق Stremio در `addon.js` است.
- بیلدر سبک Stremio در `stremio-builder.js` جایگزین SDK رسمی برای Workers شده است.
- سرور Node.js در `server.js` قرار دارد.
- آداپتور Cloudflare Worker در `worker.js` است.
- پیکربندی Worker در `wrangler.jsonc` است.

> ⚠️ این پروژه هیچ فایل ویدیویی یا رسانه‌ای را میزبانی نمی‌کند؛ فقط لینک‌هایی را که منبع پیکربندی‌شده با `BASE_URL` ارائه می‌دهد پردازش می‌کند.

---

## فهرست مطالب

- [معماری جدید و دلیل تفکیک](#معماری-جدید-و-دلیل-تفکیک)
- [ساختار واقعی مخزن](#ساختار-واقعی-مخزن)
- [وابستگی‌ها و اسکریپت‌ها](#وابستگیها-و-اسکریپتها)
- [متغیرهای محیطی](#متغیرهای-محیطی)
- [Manifest افزونه](#manifest-افزونه)
- [کلاینت HTTP](#کلاینت-http)
- [نقشه ماژول‌ها](#نقشه-ماژولها)
  - [stremio-builder.js](#stremio-builderjs)
  - [addon.js - هسته](#addonjs---هسته)
  - [server.js - سرور Node](#serverjs---سرور-node)
  - [worker.js - آداپتور Cloudflare](#workerjs---آداپتور-cloudflare)
  - [wrangler.jsonc](#wranglerjsonc)
- [جریان پردازش درخواست](#جریان-پردازش-درخواست)
- [تابع‌های کمکی عمومی](#تابعهای-کمکی-عمومی)
- [لایه استخراج متادیتای انتشار](#لایه-استخراج-متادیتای-انتشار)
- [استخراج stream فیلم](#استخراج-stream-فیلم)
- [استخراج stream سریال](#استخراج-stream-سریال)
- [مسیر fallback دایرکتوری فصل (Legacy)](#مسیر-fallback-دایرکتوری-فصل-legacy)
- [هماهنگ‌کننده getStreams و هندلر Stremio](#هماهنگکننده-getstreams-و-هندلر-stremio)
- [سرور Node.js و روت‌ها](#سرور-nodejs-و-روتها)
- [Cloudflare Worker و روت‌ها](#cloudflare-worker-و-روتها)
- [ساختار خروجی stream](#ساختار-خروجی-stream)
- [نمونه درخواست‌ها](#نمونه-درخواستها)
- [استقرار](#استقرار)
- [CI/CD](#cicd)
- [مسائل شناخته‌شده و بدهی فنی](#مسائل-شناختهشده-و-بدهی-فنی)
- [عیب‌یابی](#عیبیابی)
- [حمایت از پروژه](#حمایت-از-پروژه)

---

## معماری جدید و دلیل تفکیک

در نسخه‌های قدیمی، `addon.js` هم manifest، هم استخراج، هم سرور Express و هم `http.createServer` را در خود داشت. این باعث می‌شد:

1.  باندل Cloudflare Workers وابستگی `express` و `body-parser` از `stremio-addon-sdk` را حمل کند.
2.  تست و import کردن هسته بدون اجرای سرور سخت باشد.
3.  منطق مربوط به تولید لوگوی مطلق در دو محیط (Node و Edge) تکرار شود.

معماری جدید:

```text
                    ┌─────────────────────┐
                    │   stremio-builder.js│  بیلدر سبک، بدون Express
                    │  AddonBuilder       │
                    └──────────┬──────────┘
                               │  used by
                               ▼
┌──────────────┐      ┌─────────────────────┐      ┌──────────────────┐
│ wrangler.jsonc│      │      addon.js       │      │   server.js      │
│ alias SDK →  │      │  manifest +         │◄─────┤  Express +       │
│ builder      │      │  getStreams() +     │      │  official SDK    │
│ vars.BASE_URL│      │  extract*()         │      │  getRouter()     │
└──────┬───────┘      └──────────┬──────────┘      └────────┬─────────┘
       │                         │                          │
       │         ┌───────────────┴───────────────┐          │
       └────────►│           worker.js           │◄─────────┘
                 │  Cloudflare Worker adapter    │
                 │  /streams/manifest.json       │
                 │  /streams/stream/...          │
                 │  /streams/assets/...          │
                 └───────────────────────────────┘
```

- `addon.js` دیگر هیچ کدی برای `express` یا `http.createServer` ندارد و فقط interface را export می‌کند: `module.exports = { ...addonInterface, getStreams }`
- `server.js` نقطه ورود Node است (`main` در `package.json`) و با `getRouter` از SDK رسمی روت‌های Stremio را می‌سازد.
- `worker.js` نقطه ورود Cloudflare است (`main` در `wrangler.jsonc`) و با `env.ASSETS` فایل‌های استاتیک را سرو می‌کند.
- `wrangler.jsonc` با فیلد `alias` تضمین می‌کند که داخل `addon.js` به‌جای `stremio-addon-sdk`، نسخه سبک `stremio-builder.js` باندل شود.

---

## ساختار واقعی مخزن

خروجی `find` در شاخه اصلی:

```text
.
├── .gitignore
├── .github/
│   └── workflows/
│       └── deploy-streams.yml   # دیپلوی خودکار Worker به Cloudflare
├── LICENSE                      # Apache License 2.0
├── README.md                    # راهنمای کاربر
├── addon.js                     # هسته: manifest، استخراج، getStreams
├── stremio-builder.js           # بیلدر سبک جایگزین SDK رسمی
├── server.js                    # سرور Node.js / Express
├── worker.js                    # آداپتور Cloudflare Workers
├── wrangler.jsonc               # پیکربندی Cloudflare Worker
├── package.json                 # main: server.js، اسکریپت‌ها، وابستگی‌ها
├── package-lock.json
├── assets/
│   └── icons/
│       ├── logo.png             # لوگوی manifest
│       └── player-fa.png        # فایل استاتیک اضافی
└── docs/
    └── DOCUMENTATION.md         # همین سند
```

> نکته: `README.md` فعلی در بخش «ساختار پروژه» هنوز ساختار قدیمی تک‌فایلی را نشان می‌دهد و به `server.js`، `worker.js`، `stremio-builder.js` و `wrangler.jsonc` اشاره نمی‌کند. ساختار بالا، ساختار واقعی کد است.

| مسیر | نقش |
|------|-----|
| `addon.js` | هسته؛ تمام تابع‌های `fetch*`، `extract*`، `detect*`، manifest و `defineStreamHandler` |
| `stremio-builder.js` | کلاس `AddonBuilder` با متدهای `defineStreamHandler`، `defineMetaHandler`، `defineCatalogHandler`، `defineSubtitlesHandler` و `getInterface()` |
| `server.js` | سرور Node؛ لود `dotenv`، ساخت manifest با لوگوی مطلق، `getRouter(addonInterface)`، سرو استاتیک `assets/icons`، صفحه `/` |
| `worker.js` | Worker؛ پارسر مسیرهای `/streams/...`، تولید JSON با CORS، سرو assetها از `env.ASSETS`، فراخوانی `getStreams` |
| `wrangler.jsonc` | نام Worker، alias، assets directory، `vars.BASE_URL`، `compatibility_date` |
| `.github/workflows/deploy-streams.yml` | دیپلوی خودکار Worker هنگام push به `main` |
| `assets/icons/logo.png` | لوگوی استفاده‌شده در manifest |
| `assets/icons/player-fa.png` | فایل استاتیک قابل سرو، فعلاً در manifest استفاده نشده |

---

## وابستگی‌ها و اسکریپت‌ها

### package.json

```json
{
  "name": "f2my-stremio-addon",
  "version": "1.0.0",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js"
  },
  "dependencies": {
    "axios": "^1.6.0",
    "cheerio": "^1.0.0-rc.12",
    "dotenv": "^17.4.2",
    "express": "^4.18.2",
    "stremio-addon-sdk": "^1.6.10"
  }
}
```

| دستور | عملکرد |
|-------|--------|
| `npm start` | اجرای `node server.js` |
| `npm run dev` | اجرای `node --watch server.js` (Node 20+) |

> اسکریپت `test` وجود ندارد.

### وابستگی‌های runtime

| پکیج | کاربرد | نکته |
|------|--------|------|
| `axios` | درخواست به `quick-search`، صفحه محتوا، Cinemeta، دایرکتوری فصل | در `addon.js` به‌صورت `client` با `baseURL` + دو استفاده مستقل |
| `cheerio` | parse HTML | نسخه قفل‌شده `engines.node >= 20.18.1` دارد |
| `dotenv` | خواندن `.env` در Node | در `addon.js` و `server.js` هر دو صدا زده می‌شود |
| `express` | سرور HTTP در `server.js` | در Worker استفاده نمی‌شود؛ به‌لطف alias باندل نمی‌شود |
| `stremio-addon-sdk` | فقط در `server.js` برای `getRouter` | در Worker با `stremio-builder.js` جایگزین می‌شود |

### نسخه Node.js

`package.json` فیلد `engines` ندارد، اما `cheerio` قفل‌شده نیاز به `>=20.18.1` دارد. تست‌شده با Node 22.

---

## متغیرهای محیطی

### در Node.js (server.js + addon.js)

```js
// addon.js
const BASE_URL = process.env.BASE_URL;
if (!BASE_URL) { console.error(...); process.exit(1); }

// server.js
const PORT = process.env.PORT || 8000;
```

| متغیر | پیش‌فرض | اجباری؟ | محل مصرف | توضیح |
|-------|---------|---------|----------|-------|
| `BASE_URL` | — | ✅ | `addon.js` | آدرس پایه منبع ایرانی؛ `baseURL` کلاینت axios و `Referer` |
| `PORT` | `8000` | خیر | `server.js` | پورت Express |

نمونه `.env`:

```env
PORT=8000
BASE_URL=https://www.example.com
```

اجرای بدون `.env`:

```bash
BASE_URL=https://www.example.com PORT=8000 node server.js
```

⚠️ بررسی `BASE_URL` در سطح ماژول `addon.js` انجام می‌شود، بنابراین حتی `require('./addon.js')` بدون `BASE_URL` باعث `process.exit(1)` می‌شود.

### در Cloudflare Workers (wrangler.jsonc + worker.js)

```jsonc
{
  "vars": {
    "BASE_URL": "https://f2my.top"
  },
  "assets": { "directory": "./assets", "binding": "ASSETS" },
  "alias": { "stremio-addon-sdk": "./stremio-builder.js" }
}
```

- `BASE_URL` از `vars` می‌آید و در داشبورد Cloudflare قابل override است.
- `ASSETS` بایندینگ فایل‌های `./assets` است که در `worker.js` با `env.ASSETS.fetch()` سرو می‌شود.
- `alias` باعث می‌شود `require('stremio-addon-sdk')` در `addon.js` به `stremio-builder.js` نگاشت شود.

> نکته فنی: `addon.js` مقدار `BASE_URL` را از `process.env.BASE_URL` می‌خواند، اما در Workers مقدار اصلی در `env.BASE_URL` است. Wrangler نسخه 4، `vars` را هم در `env` و هم (در بسیاری از حالت‌ها) روی `process.env` تزریق می‌کند، اما اگر در محیطی `process.env` خالی باشد، باید در `worker.js` قبل از import مقداردهی انجام شود. این نقطه‌ای است که در مستندات Worker باید تست شود.

---

## Manifest افزونه

در `addon.js`:

```js
const LOGO = '/assets/icons/logo.png';

const builder = new addonBuilder({
  id: 'org.alirostami.streams.persian',
  name: 'Persian Streams',
  description: 'Fast streaming links from Iranian media providers with Persian subtitles and audio.\n\nAuthor: Ali Rostami  \nWebsite: alirostami.com/support \nGitHub: https://github.com/alirostami01/iranian-provider-media',
  version: '1.2.0',
  resources: ['stream'],
  types: ['movie', 'series'],
  idPrefixes: ['tt'],
  catalogs: [],
  contactEmail: 'rostami.ali@gmail.com',
  author: 'Ali Rostami rostami.ali@gmail.com',
  logo: LOGO
});
```

| فیلد | مقدار | توضیح |
|------|-------|-------|
| `id` | `org.alirostami.streams.persian` | شناسه یکتا |
| `name` | `Persian Streams` | نام نمایشی |
| `version` | `1.2.0` | نسخه manifest — مستقل از `package.json` که `1.0.0` است |
| `resources` | `['stream']` | فقط stream |
| `types` | `['movie','series']` | فیلم و سریال |
| `idPrefixes` | `['tt']` | فقط IMDb |
| `catalogs` | `[]` | بدون catalog |
| `logo` | مسیر نسبی `/assets/icons/logo.png` | در هر محیط به URL مطلق بازنویسی می‌شود |

خروجی واقعی:

- Node: `http://localhost:8000/assets/icons/logo.png` (ساخته‌شده از `x-forwarded-proto` + `Host`)
- Worker: `https://<worker-domain>/streams/assets/icons/logo.png` (ساخته‌شده از `url.origin`)

---

## کلاینت HTTP

در `addon.js`:

```js
const client = axios.create({
  baseURL: BASE_URL,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Referer': BASE_URL,
  },
  timeout: 15000,
  maxRedirects: 5,
  validateStatus: status => status < 500
});
```

- `baseURL` امکان استفاده از مسیر نسبی `/quick-search` را می‌دهد.
- timeout ۱۵ ثانیه، تا ۵ redirect.
- statusهای زیر ۵۰۰ throw نمی‌شوند؛ کد خودش بررسی می‌کند.

دو کلاینت مستقل دیگر:

| محل | تنظیمات |
|------|---------|
| `fetchTitleFromMeta` | `axios.get` مستقیم به `v3-cinemeta.strem.io` با timeout ۵ ثانیه |
| `extractStreamsFromSeasonDirectory` | `axios.get` مستقیم به URL دایرکتوری فصل با timeout ۱۵ ثانیه |

---

## نقشه ماژول‌ها

### stremio-builder.js

بیلدر سبک و بدون وابستگی، برای جلوگیری از باندل شدن Express در Workers.

```js
class AddonBuilder {
  constructor(manifest) { this.manifest = manifest; this.handlers = new Map(); }
  defineStreamHandler(handler) { this.handlers.set('stream', handler); return this; }
  defineMetaHandler(handler) { ... }
  defineCatalogHandler(handler) { ... }
  defineSubtitlesHandler(handler) { ... }
  getInterface() {
    return Object.freeze({
      manifest,
      get: async ({ resource, type, id, extra }) => {
        const handler = handlers.get(resource);
        if (!handler) return {};
        return handler({ type, id, extra });
      }
    });
  }
}
function addonBuilder(manifest) { return new AddonBuilder(manifest); }
module.exports = { addonBuilder };
```

- API سازگار با `stremio-addon-sdk` در حد نیاز پروژه (فقط `stream`).
- `getInterface()` یک آبجکت freeze شده با `manifest` و متد `get` برمی‌گرداند که `server.js` و `worker.js` هر دو از آن استفاده می‌کنند.
- در `wrangler.jsonc` با alias جایگزین SDK رسمی می‌شود.

### addon.js - هسته

خطوط ~802. شامل تمام منطق استخراج.

| خط | تابع | نوع | نقش |
|----|------|-----|-----|
| 59 | `fetchTitleFromMeta(type, imdbId)` | async | گرفتن نام و سال از Cinemeta |
| 91 | `resolveViaQuickSearch(imdbId)` | async | یافتن URL صفحه محتوا از quick-search |
| 128 | `fetchPage(url)` | async | GET HTML و `cheerio.load` |
| 146 | `detectQuality(url, context)` | sync | تشخیص heuristic کیفیت |
| 167 | `toEnglishDigits(value)` | sync | تبدیل ارقام فارسی/عربی به ASCII |
| 184 | `decodeUrlPart(value)` | sync | `decodeURIComponent` امن |
| 192 | `extractReleaseFormatFromFilename(name)` | sync | برچسب انتشار از نام فایل |
| 218 | `resolveUrl(href, baseUrl)` | sync | مطلق‌سازی امن URL |
| 230 | `cleanMetadataValue(value)` | sync | پاک‌سازی مقدار متادیتا |
| 251 | `extractLabeledValue(text, labels)` | sync | استخراج مقدار بعد از برچسب |
| 321 | `detectPersianSubtitleStatus(text)` | sync | تشخیص `'persian'`/`'none'`/`null` |
| 363 | `formatSubtitleLabel(status)` | sync | تبدیل وضعیت زیرنویس به برچسب (فعلاً خاموش) |
| 369 | `extractReleaseInfoFromElement($, el)` | sync | خواندن کیفیت/انکودر/زیرنویس از یک المان |
| 387 | `extractReleaseInfoNearElement($, el, maxDepth)` | sync | همان با بالا رفتن در والدها |
| 404 | `buildStreamName(quality, dubbedLabel, subStatus)` | sync | ساخت `name` استریم |
| 416 | `isDubbed(text)` | sync | تشخیص دوبله |
| 427 | `extractSeasonNumberFromLegacyLink(text, href)` | sync | تشخیص شماره فصل legacy |
| 439 | `extractEpisodeMatchFromFilename(file, S, E)` | sync | تطبیق نام فایل با فصل/قسمت |
| 460 | `extractStreamsFromSeasonDirectory(url, S, E, sub)` | async | استخراج از دایرکتوری باز فصل |
| 513 | `extractLegacySeriesStreams($, S, E)` | async | یافتن لینک دایرکتوری فصل |
| 552 | `extractSeriesStreams($, S, E)` | async | استخراج اصلی سریال |
| 679 | `extractMovieStreams($)` | sync | استخراج اصلی فیلم |
| 741 | `getStreams(type, imdbId, S, E)` | async | هماهنگ‌کننده کل جریان |
| 769 | `builder.defineStreamHandler` | — | هندلر Stremio |

Export نهایی:

```js
const addonInterface = builder.getInterface();
module.exports = {
  ...addonInterface, // manifest + get()
  getStreams         // تابع خالص برای استفاده در Worker
};
```

### server.js - سرور Node

```js
require('dotenv').config();
const express = require('express');
const path = require('path');
const { getRouter } = require('stremio-addon-sdk');
const addonInterface = require('./addon.js');

const PORT = process.env.PORT || 8000;
const app = express();

app.get('/manifest.json', (req, res) => {
  const protocol = req.get('x-forwarded-proto') || req.protocol || 'http';
  const host = req.get('host') || `localhost:${PORT}`;
  const manifest = { ...addonInterface.manifest, logo: `${protocol}://${host}/assets/icons/logo.png` };
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(manifest));
});

app.use(getRouter(addonInterface));
app.use('/assets/icons', express.static(path.join(__dirname, 'assets', 'icons')));

app.get('/', (_, res) => { ... });

const server = app.listen(PORT, ...);
server.on('error', ...);
```

نکات:

- `manifest.json` **قبل** از `getRouter` ثبت می‌شود تا لوگوی مطلق جایگزین شود.
- `getRouter(addonInterface)` مسیرهای `/stream/...` را می‌سازد.
- `/assets/icons` با `express.static` سرو می‌شود.
- `x-forwarded-proto` برای سازگاری با پراکسی‌های TLS خوانده می‌شود (بهبود نسبت به نسخه قدیمی که فقط `req.protocol` داشت).
- هنوز `app.set('trust proxy', true)` ندارد؛ اگر پراکسی `X-Forwarded-Proto` را ست نکند، `req.protocol` ممکن است `http` بماند.

### worker.js - آداپتور Cloudflare

```js
import addonModule from './addon.js';
const { manifest, getStreams } = addonModule;

function json(data, status, extraHeaders) { ... }
function withAbsoluteLogo(request) { return { ...manifest, logo: `${url.origin}/streams/assets/icons/logo.png` }; }
function parseStreamRequest(pathname) { /^\/streams\/stream\/(movie|series)\/(.+?)(?:\.json)?\/?$/ }
function parseStreamArgs(streamRequest) { split ':' → [type, imdbId, season, episode] }
async function handleStream(streamRequest) { getStreams(...args) }

export default {
  async fetch(request, env) {
    // / → status ok
    // /streams → redirect به /streams/manifest.json
    // /streams/manifest.json → json(withAbsoluteLogo)
    // /streams/assets/* → env.ASSETS.fetch()
    // /streams/stream/... → handleStream
    // else 404
  }
}
```

ویژگی‌ها:

- تمام پاسخ‌های JSON هدر `access-control-allow-origin: *` دارند.
- `parseStreamRequest` هم `.json` و هم بدون `.json` و هم اسلش انتهایی را می‌پذیرد.
- `parseStreamArgs` برای سریال اعتبارسنجی می‌کند که `season` و `episode` عدد صحیح باشند، در غیر این صورت `400` با `streams: []`.
- خطاهای `getStreams` گرفته می‌شوند و `200` با `streams: []` برمی‌گردد تا Stremio کرش نکند.
- لوگو با `url.origin` مطلق می‌شود، نه با `Host` header.

### wrangler.jsonc

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "stremio-streams",
  "main": "worker.js",
  "compatibility_date": "2026-09-02",
  "alias": { "stremio-addon-sdk": "./stremio-builder.js" },
  "assets": { "directory": "./assets", "binding": "ASSETS" },
  "vars": { "BASE_URL": "https://f2my.top" }
}
```

- `alias` کلید حل مشکل باندل Express است.
- `assets.directory` به Wrangler می‌گوید محتوای `./assets` را به عنوان static asset آپلود کند.
- `vars.BASE_URL` مقدار پیش‌فرض منبع است؛ در داشبورد Cloudflare می‌توان override کرد.

---

## جریان پردازش درخواست

### حالت Node.js (server.js)

```text
GET /stream/movie/tt1234567.json
  ↓ Express
  ↓ app.get('/manifest.json') ? → نه
  ↓ getRouter(addonInterface) → addonInterface.get({ resource:'stream', type:'movie', id:'tt1234567' })
  ↓ builder.defineStreamHandler → getStreams('movie','tt1234567')
  ↓ fetchTitleFromMeta('movie','tt1234567') (نتیجه فعلاً بلااستفاده)
  ↓ resolveViaQuickSearch('tt1234567') → GET {BASE_URL}/quick-search?q=tt1234567&sort=...
  ↓ fetchPage(contentUrl) → cheerio
  ↓ extractMovieStreams($) → streams[]
  ↓ { streams: [...] }
```

### حالت Cloudflare Workers (worker.js)

```text
GET /streams/stream/movie/tt1234567.json
  ↓ worker fetch()
  ↓ parseStreamRequest → { type:'movie', id:'tt1234567' }
  ↓ parseStreamArgs → ['movie','tt1234567',null,null]
  ↓ handleStream → getStreams(...)
  ↓ همان هسته addon.js
  ↓ json({ streams: [...] })
```

سریال:

```text
GET /stream/series/tt1234567:2:5.json  (Node)
GET /streams/stream/series/tt1234567:2:5.json (Worker)
  ↓ split(':') → imdbId, season, episode
  ↓ extractSeriesStreams($, 2, 5)
      ├─ .download-season → .series-downloaditems .d-flex
      └─ اگر خالی → extractLegacySeriesStreams → extractStreamsFromSeasonDirectory
```

---

## تابع‌های کمکی عمومی

### `fetchTitleFromMeta(type, imdbId)`

```js
async function fetchTitleFromMeta(type, imdbId) // Promise<{name, year}|null>
```

- از `https://v3-cinemeta.strem.io/meta/{type}/{imdbId}.json` نام و سال می‌گیرد.
- timeout ۵ ثانیه، خطا فقط log.
- در `getStreams` ذخیره می‌شود اما استفاده نمی‌شود (باقی‌مانده از مسیر قدیمی جستجو بر اساس عنوان). هر درخواست یک round-trip اضافه.

### `resolveViaQuickSearch(imdbId)`

تنها راه تطبیق محتوا.

1. `GET /quick-search?q={imdbId}&sort=modified_at%3Adesc` با `client`
2. اگر status ≠ 200 یا آرایه نباشد → `null`
3. انتخاب آیتمی که `imdb_id` دقیقاً برابر باشد (case-insensitive)
4. اگر `url` نسبی باشد با `BASE_URL` الحاق می‌شود
5. اگر شامل `/profile/` باشد → `null`
6. برگرداندن URL کامل

قرارداد منبع:

```json
[ { "imdb_id": "tt1234567", "url": "/12345/title/" } ]
```

### `fetchPage(url)`

- فقط `200` قبول است، در غیر این صورت `null`
- `cheerio.load`

### `detectQuality(url, context)`

fallback کیفیت:

| خروجی | نشانه‌ها |
|-------|----------|
| `4K` | `2160`, `4k`, `uhd` |
| `1080p` | `1080`, `full hd`, `fhd` |
| `720p` | `720`, `hd` |
| `480p` | `480`, `sd` |
| `360p` | `360` |
| `Unknown` | هیچ‌کدام |

سپس پارامتر `?quality=` بررسی می‌شود. محدودیت: `hd`/`sd` با `includes` ساده → false positive روی hashهای CDN.

### `toEnglishDigits(value)`

تبدیل `۰۱۲۳۴۵۶۷۸۹` و `٠١٢٣٤٥٦٧٨٩` به ASCII. `null` → `''`.

### `decodeUrlPart` و `resolveUrl`

هر دو با try/catch امن شده‌اند.

### `isDubbed(text)`

بررسی `dubbed`, `dooble`, `دوبله`, `farsi dub`, `persian dub` (case-insensitive). در صورت مثبت بودن `' • دوبله'` اضافه می‌شود.

---

## لایه استخراج متادیتای انتشار

هدف: نمایش برچسب دقیق منبع مثل `WEB-DL 4K 2160p 10bit HDR` به‌جای `1080p` ساده.

### `cleanMetadataValue(value)`

حذف `&nbsp;`, `\u200c`, `\u200e`, `\u200f`, جداکننده‌های ابتدایی/انتهایی (`: ؛ ; ، , | - – —`) و فاصله‌های اضافی.

### `extractLabeledValue(text, labels)`

مقدار بعد از برچسب:

```text
کیفیت : WEB-DL 4K 2160p 10bit HDR → WEB-DL 4K 2160p 10bit HDR
انکودر : PSA → PSA
```

الگوریتم:

1. نرمال‌سازی (`&nbsp;`, RTL, `\r`→`\n`)
2. یافتن اولین برچسب موجود
3. رد کردن جداکننده‌های بعد از برچسب
4. پایان مقدار = نزدیک‌ترین حد از: انتهای خط، انتهای متن، شروع یکی از ~۵۰ `boundaryLabels` (کیفیت، انکودر، حجم، زبان، فرمت، رزولوشن، مدت، فصل، قسمت، دانلود، انواع زیرنویس، صوت، امتیاز، IMDb، ژانر، سال، کشور، کارگردان، بازیگران، رده، وضعیت، شبکه، خلاصه...)
5. `cleanMetadataValue`

### `detectPersianSubtitleStatus(text)`

- ابتدا الگوهای منفی (اولویت): `بدون زیرنویس`, `فاقد زیرنویس`, `زیرنویس فارسی: ندارد`, `no/without [persian|farsi] subs`
- سپس مثبت: `زیرنویس فارسی`, `زیرنویس: دارد`, `با زیرنویس`, `دارای زیرنویس`, `زیرنویس چسبیده`, `persian/farsi subs`, `hardsub`, `subbed`
- خروجی: `'persian'` | `'none'` | `null`

### `formatSubtitleLabel(status)`

```js
function formatSubtitleLabel(status) {
  if (status === 'persian') return '';
  if (status === 'none') return '';
  return null;
}
```

> در نسخه فعلی عمداً خاموش است؛ هر دو وضعیت رشته خالی برمی‌گرداند. نقطه اتصال آماده برای فعال‌سازی.

### `extractReleaseInfoFromElement` و `extractReleaseInfoNearElement`

- اولی از یک المان سه فیلد `quality`, `encoder`, `subtitleStatus` می‌خواند.
- دومی از خود المان تا ۴ والد بالا می‌رود و هر فیلد مستقل merge می‌شود.

### `extractReleaseFormatFromFilename(filename)`

از نام فایل برچسب تمیز می‌سازد:

1. decode، حذف پسوند، `.` و `_` → فاصله
2. اگر `S01E02` باشد فقط بخش بعد از آن
3. نگه‌داشتن توکن‌های: رزولوشن (`2160p`, `4k`...)، منبع (`web-dl`, `bluray`...)، کدک (`x265`, `hevc`...)، رنگ (`10bit`, `hdr`...)، پلتفرم (`nf`, `amzn`...)
4. مثال: `Show.S01E02.1080p.NF.WEB-DL.x265.10bit.mkv` → `1080p NF WEB-DL x265 10bit`

### `buildStreamName`

```js
`${quality}${dubbedLabel}${subtitlePart}`.trim()
```

---

## استخراج stream فیلم

```js
function extractMovieStreams($) // Stream[]
```

1. متادیتای سطح صفحه: `$('main, article, .single, .post, body').first()`
2. کانتینرها: `.download-list, .download-box, .dl-box`
3. برچسب کیفیت باکس: `.title span` اول
4. لینک‌ها: `a[href*=".mkv"], a[href*=".mp4"], a[href*="http"]` سپس فیلتر سخت‌گیرانه `href` شامل `.mkv` یا `.mp4` یا `abrtech`
5. اگر `onclick` شامل `handleDownloadClick('URL')` باشد، URL واقعی جایگزین می‌شود
6. نزدیک‌ترین ردیف: `.d-flex, li, .download-item, .download-list, .download-box, .dl-box`
7. کیفیت با اولویت: `releaseInfo.quality → boxReleaseInfo.quality → detectQuality(...)`
8. خروجی:

```js
{ name: buildStreamName(...), title: `${quality}${encoderTitle}${subtitleTitlePart}`, url }
```

9. در پایان `iframe[src]` با `.mp4` یا `.m3u8` → `{ name:'Stream', title:'Embedded Stream', url: src }`

---

## استخراج stream سریال

```js
async function extractSeriesStreams($, targetSeason, targetEpisode) // Promise<Stream[]>
```

### مرحله ۱ — فصل

روی `.download-season`، شماره فصل:

1. پیش‌فرض = ایندکس + ۱
2. نگاشت فارسی: `اول=1 ... دهم=10` از متن `button[data-bs-toggle="collapse"]`
3. regex عددی: `/(?:season|fصل)[\s\u06F0-\u06F9\u0660-\u0669]*(\d+)/i`

> 🐞 تایپوی `fصل` (حرف لاتین f + صل) به‌جای `فصل` → فصل‌های فارسی بالای ۱۰ با این regex تشخیص داده نمی‌شوند.

### مرحله ۲ — قسمت

روی `.series-downloaditems .d-flex`:

1. `قسمت \d+` در `a.btn-block.btn-default`
2. `episode|ep \d+`
3. `[?&]episode=\d+` در href
4. fallback ایندکس + ۱

### مرحله ۳ — URL ویدیو

| # | استراتژی |
|---|-----------|
| ۱ | اولین `a[onclick]` و استخراج `handleDownloadClick('URL')` |
| ۲ | href مستقیم اگر شامل `.mkv`, `.mp4` یا `http` باشد |
| ۳ | همه `a[onclick]`های ردیف |

> ⚠️ استراتژی ۲ با `includes('http')` بسیار باز است و می‌تواند لینک غیرویدیویی بپذیرد.

### مرحله ۴ — ساخت stream

```js
{ name: buildStreamName(...), title: `S${S}E${E} - ${quality}${encoderTitle}${subtitleTitlePart}`, url }
```

### مرحله ۵ — fallback

اگر خالی بود → `extractLegacySeriesStreams($, S, E)`

---

## مسیر fallback دایرکتوری فصل (Legacy)

برای صفحاتی که فقط لینک دایرکتوری باز فصل دارند.

### `extractLegacySeriesStreams`

1. وضعیت زیرنویس سطح صفحه
2. همه `a[href]`ها و تشخیص فصل با `extractSeasonNumberFromLegacyLink`
3. لینک «دایرکتوری فصل» اگر:
   - شامل `/S01/` باشد
   - یا متن شامل «دانلود فصل» / «download season»
4. مطلق‌سازی و فراخوانی `extractStreamsFromSeasonDirectory` برای هر فصل

### `extractSeasonNumberFromLegacyLink`

```js
/(?:فصل|season|\bS)\s*0*(\d{1,2})\b/i  // فصل 2، Season 2، S02
/\/S0*(\d{1,2})(?:\/|$)/i             // /S02/
```

### `extractEpisodeMatchFromFilename`

| الگو | مثال | تطبیق |
|------|------|-------|
| `S01E02` | `Show.S02E05.1080p.mkv` | فصل و قسمت |
| `2x05` | `Show.2x05.mkv` | فصل و قسمت |
| `E05` | `Show.E05.mkv` | فقط قسمت |

### `extractStreamsFromSeasonDirectory`

1. GET مستقیم با axios (timeout ۱۵s)
2. URL نهایی از `response.request?.res?.responseUrl`
3. رد `../` و `?...`
4. فقط `.mkv|.mp4|.m3u8|.avi`
5. تطبیق نام فایل
6. کیفیت: `extractReleaseFormatFromFilename || detectQuality`
7. زیرنویس: `detectPersianSubtitleStatus(filename) || pageSubtitleStatus`
8. خروجی:

```js
{ name: buildStreamName(...), title: `S${S}E${E} - ${quality}${subtitleTitlePart}`, url }
```

> در این مسیر `encoder` جداگانه در title نمی‌آید چون معمولاً داخل نام فایل است.

---

## هماهنگ‌کننده getStreams و هندلر Stremio

### `getStreams(type, imdbId, season, episode)`

```js
async function getStreams(type, imdbId, season = null, episode = null) // Stream[]
```

1. لاگ `=== Stream Request ===`
2. `fetchTitleFromMeta` (نتیجه بلااستفاده)
3. `contentUrl = await resolveViaQuickSearch(imdbId)`
4. `$ = await fetchPage(contentUrl)`
5. اگر سریال → `await extractSeriesStreams($, season, episode)`
6. اگر فیلم → `extractMovieStreams($)`
7. لاگ تعداد و بازگشت

> 🐞 نبود گارد `if (!contentUrl) return [];` و `if (!$) return [];` بین مرحله ۳ و ۴ → اگر quick-search نتیجه ندهد `fetchPage(null)` و سپس `extractMovieStreams(null)` خطای `TypeError: $ is not a function` می‌دهد. این خطا در هندلر catch می‌شود و پاسخ `streams:[]` است، اما لاگ‌ها شلوغ می‌شوند.

### `defineStreamHandler`

ورودی فیلم: `{ type:'movie', id:'tt1234567' }`
ورودی سریال: `{ type:'series', id:'tt1234567:1:3' }`

```js
const parts = id.split(':');
imdbId = parts[0];
season = parts[1] ? parseInt(parts[1], 10) : null;
episode = parts[2] ? parseInt(parts[2], 10) : null;
```

خروجی: `getStreams(...).then(streams => ({ streams })).catch(() => ({ streams: [] }))`

### Export

```js
module.exports = { ...addonInterface, getStreams };
```

- `addonInterface` شامل `manifest` و `get` است که `server.js` با `getRouter` استفاده می‌کند.
- `getStreams` تابع خالص که `worker.js` مستقیماً صدا می‌زند.

---

## سرور Node.js و روت‌ها

فقط در `server.js` و فقط وقتی `main` است (اجرای مستقیم) بالا می‌آید.

### ترتیب middleware (مهم)

| ترتیب | روت | منبع | توضیح |
|-------|-----|------|-------|
| ۱ | `GET /manifest.json` | سفارشی | لوگوی مطلق با `x-forwarded-proto` + `Host` |
| ۲ | `*` | `getRouter(addonInterface)` | مسیرهای Stremio: `/stream/movie/...`, `/stream/series/...` |
| ۳ | `GET /assets/icons/*` | `express.static` | فایل‌های استاتیک |
| ۴ | `GET /` | سفارشی | صفحه HTML معرفی با لینک نصب محلی |

### جزئیات manifest route

```js
const protocol = req.get('x-forwarded-proto') || req.protocol || 'http';
const host = req.get('host') || `localhost:${PORT}`;
logo: `${protocol}://${host}/assets/icons/logo.png`
```

- نسبت به نسخه قدیمی که فقط `req.protocol` داشت، `x-forwarded-proto` هم خوانده می‌شود.
- اما `app.set('trust proxy', true)` هنوز وجود ندارد؛ اگر پراکسی هدر را ست نکند، ممکن است `http` تولید شود.

### مدیریت خطای سرور

```js
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use.`);
    process.exit(1);
  }
  ...
});
```

لاگ موفق:

```text
Persian Streams running on port 8000
Manifest: http://localhost:8000/manifest.json
```

---

## Cloudflare Worker و روت‌ها

### روت‌های پشتیبانی‌شده

| مسیر | توضیح |
|------|-------|
| `GET /` | JSON وضعیت: `{ name, status:'ok', manifest:'/streams/manifest.json' }` |
| `GET /streams` یا `/streams/` | Redirect 302 به `/streams/manifest.json` |
| `GET /streams/manifest.json` | manifest با لوگوی مطلق `https://<origin>/streams/assets/icons/logo.png` |
| `GET /streams/assets/*` | فایل استاتیک از `env.ASSETS` (مثلاً `/streams/assets/icons/logo.png`) |
| `GET /streams/stream/movie/{imdbId}.json` | stream فیلم |
| `GET /streams/stream/series/{imdbId}:{season}:{episode}.json` | stream سریال |
| سایر | `404 { error:'Not found' }` |

> تفاوت مهم با Node: تمام مسیرهای Worker زیر `/streams` هستند، نه ریشه `/`. این برای جلوگیری از تداخل با سایر روت‌های دامنه است.

### پیاده‌سازی `parseStreamRequest`

```js
/^\/streams\/stream\/(movie|series)\/(.+?)(?:\.json)?\/?$/
```

- `.json` اختیاری، اسلش انتهایی اختیاری، `decodeURIComponent` امن.

### `parseStreamArgs`

برای سریال اعتبارسنجی سخت‌گیرانه:

```js
if (!imdbId || !Number.isInteger(season) || !Number.isInteger(episode)) return null;
```

→ `400 { streams: [] }`

### CORS

همه پاسخ‌های JSON هدر `access-control-allow-origin: *` دارند.

---

## ساختار خروجی stream

```json
{
  "streams": [
    {
      "name": "WEB-DL 1080p x265",
      "title": "S1E3 - WEB-DL 1080p x265 • encoder: PSA",
      "url": "https://cdn.example.com/video.mkv"
    }
  ]
}
```

| فیلد | توضیح |
|------|-------|
| `name` | برچسب کوتاه لیست Stremio: کیفیت + ` • دوبله` |
| `title` | توضیح: برای سریال `S{season}E{episode}` + `• encoder: X` + زیرنویس (فعلاً خاموش) |
| `url` | لینک مستقیم |

> هیچ فیلد اضافی مثل `behaviorHints`، `subtitles`، `bingeGroup` تولید نمی‌شود.

### نمونه‌ها

فیلم با برچسب منبع:

```js
{ name: "WEB-DL 4K 2160p 10bit HDR", title: "WEB-DL 4K 2160p 10bit HDR • encoder: PSA", url: "https://example.com/movie-2160p.mkv" }
```

فیلم دوبله fallback:

```js
{ name: "720p • دوبله", title: "720p", url: "https://example.com/movie-dubbed-720.mp4" }
```

سریال اصلی:

```js
{ name: "1080p", title: "S1E8 - 1080p", url: "https://example.com/series-s01e08.mkv" }
```

سریال legacy:

```js
{ name: "1080p NF WEB-DL x265 10bit", title: "S2E5 - 1080p NF WEB-DL x265 10bit", url: "https://cdn.example.com/S02/Show.S02E05.1080p.NF.WEB-DL.x265.10bit.mkv" }
```

iframe:

```js
{ name: "Stream", title: "Embedded Stream", url: "https://example.com/playlist.m3u8" }
```

---

## نمونه درخواست‌ها

### Node.js (پورت 8000)

```bash
curl http://localhost:8000/manifest.json
curl http://localhost:8000/stream/movie/tt1234567.json
curl http://localhost:8000/stream/series/tt1234567:1:3.json
curl -I http://localhost:8000/assets/icons/logo.png
curl http://localhost:8000/
```

### Cloudflare Workers (مثال لوکال با wrangler)

```bash
npx wrangler dev
curl http://localhost:8787/streams/manifest.json
curl http://localhost:8787/streams/stream/movie/tt1234567.json
curl http://localhost:8787/streams/stream/series/tt1234567:1:3.json
curl http://localhost:8787/streams/assets/icons/logo.png
curl http://localhost:8787/
```

---

## استقرار

### گزینه A: Node.js hosting (VPS, Railway, Render, Fly.io, Heroku)

1. Node.js `20.18.1+`
2. `npm install`
3. دستور اجرا: `npm start` (یعنی `node server.js`)
4. متغیر محیطی `BASE_URL` اجباری
5. `PORT` معمولاً توسط میزبان تزریق می‌شود
6. مسیرهای عمومی:
   ```
   /manifest.json
   /stream/movie/{imdbId}.json
   /stream/series/{imdbId}:{season}:{episode}.json
   /assets/icons/logo.png
   ```
7. نصب: `stremio://YOUR_DOMAIN/manifest.json`

### گزینه B: Cloudflare Workers (پیشنهادی برای Edge)

1. `wrangler.jsonc` مقدار `vars.BASE_URL` را دارد؛ می‌توان در داشبورد override کرد.
2. `npm install`
3. `npx wrangler deploy` (یا via GitHub Actions)
4. آدرس نصب: `https://<worker>.workers.dev/streams/manifest.json` → تبدیل به `stremio://<worker>.workers.dev/streams/manifest.json`
5. لوگو خودکار: `https://<worker>.workers.dev/streams/assets/icons/logo.png`
6. assets از `./assets` سرو می‌شود؛ نیازی به سرور جدا نیست.

### نکات HTTPS و Proxy

- در Node، اگر پشت TLS proxy هستید، مطمئن شوید `X-Forwarded-Proto: https` ست می‌شود تا لوگو `https` شود. در صورت نیاز `app.set('trust proxy', true)` اضافه کنید.
- در Workers، `url.origin` همیشه scheme درست را دارد.

---

## CI/CD

### `.github/workflows/deploy-streams.yml`

```yaml
name: Deploy Streams Worker
on:
  push:
    branches: [main]
    paths:
      - 'worker.js'
      - 'stremio-builder.js'
      - 'addon.js'
      - 'wrangler.jsonc'
      - 'package.json'
      - 'package-lock.json'
      - 'assets/**'
      - '.github/workflows/deploy-streams.yml'
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npx --yes wrangler@4.128.0 deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

- فقط تغییرات مرتبط با Worker دیپلوی را trigger می‌کند.
- نسخه Wrangler پین شده `4.128.0`.
- نیاز به secrets `CLOUDFLARE_API_TOKEN` و `CLOUDFLARE_ACCOUNT_ID`.

---

## مسائل شناخته‌شده و بدهی فنی

| # | مورد | اثر | پیشنهاد |
|---|------|-----|---------|
| ۱ | نبود گارد `contentUrl === null` در `getStreams` | `TypeError: $ is not a function` در لاگ | `if (!contentUrl) return []; if (!$) return [];` |
| ۲ | `fetchTitleFromMeta` استفاده نمی‌شود | تأخیر اضافه هر درخواست | حذف یا fallback مبتنی بر عنوان |
| ۳ | `formatSubtitleLabel` همیشه `''` | برچسب زیرنویس نمایش داده نمی‌شود | برگرداندن متن واقعی |
| ۴ | تایپوی `fصل` در regex فصل | فصل‌های فارسی بالای ۱۰ تشخیص داده نمی‌شوند | اصلاح به `فصل` |
| ۵ | `detectQuality` با `includes('hd')` | false positive روی hash CDN | استفاده از `\bhd\b` |
| ۶ | `href.includes('http')` در سریال | لینک غیرویدیویی ممکن است پذیرفته شود | محدود به پسوند ویدیو |
| ۷ | نبود `trust proxy` در `server.js` | لوگوی `http` پشت TLS | افزودن `app.set('trust proxy', true)` |
| ۸ | مجوز: `LICENSE` Apache-2.0 اما `package.json` MIT | ابهام حقوقی | هم‌راستا کردن |
| ۹ | نسخه: manifest `1.2.0` vs `package.json` `1.0.0` | سردرگمی | خواندن نسخه از `package.json` |
| ۱۰ | نبود cache/rate limit/retry | فشار روی منبع | cache کوتاه‌مدت + تست واحد |
| ۱۱ | `player-fa.png` بلااستفاده | حجم اضافی | استفاده در `background` یا حذف |
| ۱۲ | `process.exit(1)` هنگام import بدون `BASE_URL` | مانع تست | throw یا بررسی فقط در `server.js` |
| ۱۳ | `BASE_URL` در Worker از `process.env` خوانده می‌شود اما در `env` ست می‌شود | ممکن است در بعضی runtimeها خالی باشد | در `worker.js` قبل از import `process.env.BASE_URL = env.BASE_URL` یا refactor به تابع سازنده |
| ۱۴ | تفاوت مسیرها بین Node (`/manifest.json`) و Worker (`/streams/manifest.json`) | مستندات نصب دوگانه نیاز دارد | یکسان‌سازی یا مستندسازی واضح در README |
| ۱۵ | `README.md` هنوز ساختار قدیمی تک‌فایلی را نشان می‌دهد | سردرگمی کاربر | به‌روزرسانی بخش ساختار پروژه در README |

### selectorهای حساس به تغییر HTML منبع

```css
.download-season
button[data-bs-toggle="collapse"]
.series-downloaditems .d-flex
a.btn-block.btn-default
.download-list, .download-box, .dl-box
.title span
a[href*=".mkv"], a[href*=".mp4"], a[href*="http"]
iframe[src]
```

و الگوی JS صفحه:

```js
handleDownloadClick('URL')
```

---

## عیب‌یابی

### `BASE_URL is not set`

```env
BASE_URL=https://www.example.com
```

در `.env` یا Environment Variables اضافه کنید. در Workers، `vars.BASE_URL` در `wrangler.jsonc` یا داشبورد Cloudflare را چک کنید.

### `Port 8000 is already in use` (Node)

```bash
PORT=8001 npm start
```

### quick-search نتیجه نمی‌دهد

- آیا `BASE_URL` درست است؟
- آیا `{BASE_URL}/quick-search?q=tt1234567&sort=modified_at%3Adesc` آرایه JSON با `imdb_id` برمی‌گرداند؟
- آیا URL شامل `/profile/` است (عمداً رد می‌شود)؟

### `TypeError: $ is not a function`

یعنی `resolveViaQuickSearch` null برگردانده. پاسخ HTTP همچنان `{"streams":[]}` است. گاردهای پیشنهادی را اضافه کنید.

### صفحه محتوا parse نمی‌شود

`fetchPage` فقط `200` می‌پذیرد. اگر منبع redirect غیرمنتظره، challenge یا خطا بدهد، خروجی خالی است.

### فیلم stream ندارد

بررسی کنید صفحه شامل `.download-list` / `.download-box` / `.dl-box` و لینک `.mkv`/`.mp4`/`abrtech` یا `handleDownloadClick` باشد.

### سریال قسمت درست ندارد

- متن فصل باید `Season 2` یا `اول..دهم` باشد (به تایپوی `fصل` توجه کنید).
- متن قسمت باید `قسمت 5` یا `Episode 5` یا `?episode=5` داشته باشد.
- اگر `.download-season` وجود ندارد، مسیر legacy با `/S02/` یا «دانلود فصل» فعال می‌شود.

### لوگو نمایش داده نمی‌شود

- Node: `http://YOUR_DOMAIN/assets/icons/logo.png` قابل دسترسی است؟ مقدار `logo` در `/manifest.json` را چک کنید.
- Worker: `https://<worker>/streams/assets/icons/logo.png` را چک کنید.
- پشت HTTPS، `http` بودن لوگو باعث mixed-content block می‌شود.

### `/health` 404 می‌دهد

routeای به این نام وجود ندارد. از `/manifest.json` (Node) یا `/streams/manifest.json` (Worker) یا `/` برای health check استفاده کنید.

### Worker دیپلوی نمی‌شود

- `CLOUDFLARE_API_TOKEN` و `CLOUDFLARE_ACCOUNT_ID` در secrets گیت‌هاب ست شده‌اند؟
- نسخه Wrangler پین شده `4.128.0` است؛ لاگ Action را چک کنید.

---

## حمایت از پروژه

اگر این افزونه برایت مفید بوده، حمایت تو کمک می‌کند پروژه پایدارتر و هماهنگ با تغییرات منابع ایرانی بماند ❤️

```text
alirostami.com/support
```

ساخته شده با ❤️ برای جامعه فارسی‌زبان Stremio
