# مستندات فنی Iranian Provider Media / Persian Streams

این سند بر اساس **ساختار فعلی کد** در `addon.js` (۸۶۰ خط) نوشته شده است و با اجرای واقعی برنامه راستی‌آزمایی شده است.

پروژه یک افزونه غیررسمی Stremio با نام نمایشی **Persian Streams** است که فقط resource نوع `stream` ارائه می‌کند و لینک‌های پخش را از منبع ایرانیِ پیکربندی‌شده با `BASE_URL` استخراج می‌کند.

> ⚠️ این پروژه هیچ فایل ویدیویی، زیرنویس یا محتوای رسانه‌ای را میزبانی نمی‌کند و فقط لینک‌های موجود در منبع پیکربندی‌شده را پردازش می‌کند.

---

## فهرست مطالب

- [تغییرات مهم نسبت به نسخه‌های قبلی مستندات](#تغییرات-مهم-نسبت-به-نسخههای-قبلی-مستندات)
- [نمای کلی معماری](#نمای-کلی-معماری)
- [ساختار مخزن](#ساختار-مخزن)
- [وابستگی‌ها و اسکریپت‌ها](#وابستگیها-و-اسکریپتها)
- [متغیرهای محیطی](#متغیرهای-محیطی)
- [Manifest افزونه](#manifest-افزونه)
- [کلاینت HTTP](#کلاینت-http)
- [جریان پردازش درخواست](#جریان-پردازش-درخواست)
- [نقشه تابع‌ها](#نقشه-تابعها)
- [تابع‌های کمکی عمومی](#تابعهای-کمکی-عمومی)
- [لایه استخراج متادیتای انتشار](#لایه-استخراج-متادیتای-انتشار)
- [استخراج stream فیلم](#استخراج-stream-فیلم)
- [استخراج stream سریال](#استخراج-stream-سریال)
- [مسیر fallback دایرکتوری فصل (Legacy)](#مسیر-fallback-دایرکتوری-فصل-legacy)
- [هماهنگ‌کننده و هندلر Stremio](#هماهنگکننده-و-هندلر-stremio)
- [سرور HTTP و routeها](#سرور-http-و-routeها)
- [ساختار خروجی stream](#ساختار-خروجی-stream)
- [نمونه درخواست‌ها](#نمونه-درخواستها)
- [نکات استقرار](#نکات-استقرار)
- [مسائل شناخته‌شده و بدهی فنی](#مسائل-شناختهشده-و-بدهی-فنی)
- [عیب‌یابی](#عیبیابی)
- [حمایت از پروژه](#حمایت-از-پروژه)

---

## تغییرات مهم نسبت به نسخه‌های قبلی مستندات

اگر نسخه قدیمی این سند را خوانده‌اید، موارد زیر تغییر کرده‌اند و دیگر معتبر نیستند:

| مورد در مستندات قدیمی | وضعیت واقعی در کد فعلی |
|------------------------|--------------------------|
| «`fetchTitleFromMeta` حذف شده است» | ❌ نادرست — این تابع وجود دارد و در ابتدای هر `getStreams` صدا زده می‌شود (Cinemeta) |
| متغیر محیطی `PUBLIC_URL` | ❌ در کد فعلی **اصلاً وجود ندارد**؛ فقط `BASE_URL` و `PORT` خوانده می‌شوند |
| helper `logoUrlFor(origin)` | ❌ وجود ندارد؛ URL لوگو مستقیماً از `req.protocol` + `Host` ساخته می‌شود |
| تابع `normalizeDigits` | ✅ نام واقعی: `toEnglishDigits` |
| «`detectQuality` ابتدا URL را decode می‌کند» | ❌ decode نمی‌کند؛ اما یک fallback روی پارامتر `?quality=` دارد |
| «`hd`/`sd` فقط به‌صورت کلمه مستقل تشخیص داده می‌شوند» | ❌ با `includes` ساده تشخیص داده می‌شوند (منشأ false positive) |
| فایل `UNUSED_CODE_REPORT.md` | ❌ در مخزن وجود ندارد؛ از ساختار حذف شد |
| «`extractSeriesStreams` همگام است» | ✅ اکنون `async` است و fallback دایرکتوری فصل دارد |
| مجوز MIT | ⚠️ فایل `LICENSE` مخزن **Apache License 2.0** است (`package.json` هنوز `MIT` دارد) |
| «سرور با `app.listen` بالا می‌آید» | ✅ اکنون `http.createServer(app)` با مدیریت خطای `EADDRINUSE` |

موارد **جدید** که در مستندات قبلی نبودند: تشخیص برچسب کیفیت و انکودر از خود صفحه، تشخیص وضعیت زیرنویس فارسی، fallback استخراج از دایرکتوری باز فصل (open directory)، و ساخت نام stream با `buildStreamName`.

---

## نمای کلی معماری

پروژه یک سرویس Node.js تک‌فایلی است:

1. `addon.js` هنگام load شدن، `dotenv` را اجرا و متغیرهای محیطی را می‌خواند.
2. اگر `BASE_URL` تنظیم نشده باشد، process با کد ۱ خارج می‌شود.
3. یک نمونه `axios` (`client`) با `baseURL` برابر منبع ساخته می‌شود.
4. `stremio-addon-sdk` یک manifest و یک stream handler ثبت می‌کند.
5. `module.exports = builder.getInterface()` تا افزونه قابل import باشد.
6. فقط در اجرای مستقیم (`require.main === module`) سرور Express/HTTP بالا می‌آید.
7. Stremio endpointهای stream را صدا می‌زند.
8. افزونه محتوا را با IMDb ID از `quick-search` منبع پیدا می‌کند.
9. صفحه محتوا دانلود و با Cheerio تحلیل می‌شود.
10. خروجی در قالب `{ streams: [...] }` برگردانده می‌شود.

```text
Stremio
  │  GET /stream/movie/tt....json
  │  GET /stream/series/tt....:S:E.json
  ▼
stremio-addon-sdk router (getRouter)
  ▼
builder.defineStreamHandler(args)
  ▼
getStreams(type, imdbId, season, episode)
  ├─► fetchTitleFromMeta(type, imdbId)      ← Cinemeta (نتیجه فعلاً استفاده نمی‌شود)
  ├─► resolveViaQuickSearch(imdbId)         ← {BASE_URL}/quick-search
  ├─► fetchPage(contentUrl)                 ← HTML + cheerio.load
  └─► extractMovieStreams($)
      یا extractSeriesStreams($, S, E)
            └─ (اگر خالی بود) extractLegacySeriesStreams($, S, E)
                                 └─ extractStreamsFromSeasonDirectory(url, S, E)
  ▼
{ streams: [...] }
```

---

## ساختار مخزن

```text
.
├── .gitignore                 # نادیده‌گرفتن .env و node_modules/
├── LICENSE                    # Apache License 2.0
├── README.md                  # راهنمای کاربر، نصب، اجرا و استقرار
├── addon.js                   # کل منطق افزونه (manifest، استخراج، سرور)
├── package.json               # اسکریپت‌ها و وابستگی‌ها
├── package-lock.json          # نسخه‌های قفل‌شده
├── assets/
│   └── icons/
│       ├── logo.png           # لوگوی manifest
│       └── player-fa.png      # فایل استاتیک؛ در manifest استفاده نشده
└── docs/
    └── DOCUMENTATION.md       # همین سند
```

| مسیر | نقش |
|------|-----|
| `addon.js` | نقطه ورود؛ manifest، تابع‌های استخراج، هندلر stream، export interface و سرور HTTP |
| `package.json` | اسکریپت‌های `start` و `dev` و وابستگی‌ها |
| `package-lock.json` | قفل نسخه‌ها؛ `cheerio` قفل‌شده `engines.node >= 20.18.1` دارد |
| `README.md` | مستندات کاربری |
| `docs/DOCUMENTATION.md` | مستندات فنی |
| `assets/icons/logo.png` | لوگویی که manifest به‌صورت URL مطلق به آن اشاره می‌کند |
| `assets/icons/player-fa.png` | فایل استاتیک؛ فقط از طریق `/assets/icons/player-fa.png` قابل دریافت است |
| `LICENSE` | متن کامل Apache License 2.0 |

> در مخزن فعلی هیچ فایل تست، پیکربندی lint، `Dockerfile`، CI workflow یا `.env.example` وجود ندارد.

---

## وابستگی‌ها و اسکریپت‌ها

### اسکریپت‌های npm

| دستور | عملکرد |
|-------|--------|
| `npm start` | اجرای `node addon.js` |
| `npm run dev` | اجرای `node --watch addon.js` |

> اسکریپت `test` تعریف نشده است.

### وابستگی‌های runtime

| پکیج | نسخه در `package.json` | کاربرد |
|------|------------------------|--------|
| `axios` | `^1.6.0` | درخواست به quick-search، صفحه محتوا، Cinemeta و دایرکتوری فصل |
| `cheerio` | `^1.0.0-rc.12` | parse کردن HTML با selectorهای شبیه jQuery |
| `dotenv` | `^17.4.2` | خواندن `.env` |
| `express` | `^4.18.2` | سرور HTTP، static assets و route سفارشی manifest |
| `stremio-addon-sdk` | `^1.6.10` | ساخت manifest، `defineStreamHandler` و `getRouter` |

> `express` و `path` در **بالای فایل** require می‌شوند (نه داخل بلاک `require.main`)، بنابراین حتی هنگام import شدن افزونه هم load می‌شوند.

### نسخه Node.js

`package.json` فیلد `engines` ندارد، اما `cheerio` قفل‌شده در `package-lock.json` مقدار `"engines": { "node": ">=20.18.1" }` دارد. بنابراین **Node.js نسخه `20.18.1` یا بالاتر** لازم است. کد با Node.js 22 نیز تست شده است.

---

## متغیرهای محیطی

```js
require('dotenv').config();

const PORT = process.env.PORT || 8000;
const BASE_URL = process.env.BASE_URL;

if (!BASE_URL) {
  console.error('BASE_URL is not set. Please define it in your .env file ...');
  process.exit(1);
}
```

| متغیر | پیش‌فرض | اجباری؟ | توضیح |
|-------|---------|---------|-------|
| `BASE_URL` | — | ✅ بله | آدرس پایه منبع ایرانی؛ مبنای `baseURL` کلاینت axios و هدر `Referer` |
| `PORT` | `8000` | خیر | پورت سرور HTTP در اجرای مستقیم |

**فقط همین دو متغیر در کد خوانده می‌شوند.** هیچ متغیر دیگری (از جمله `PUBLIC_URL`) پشتیبانی نمی‌شود.

نمونه `.env`:

```env
PORT=8000
BASE_URL=https://www.example.com
```

⚠️ نکته مهم: بررسی `BASE_URL` در سطح ماژول انجام می‌شود، بنابراین **حتی import کردن `addon.js` بدون `BASE_URL` باعث `process.exit(1)` می‌شود** — این رفتار برای تست‌نویسی و embed کردن افزونه در میزبان دیگر مشکل‌ساز است.

---

## Manifest افزونه

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
| `id` | `org.alirostami.streams.persian` | شناسه یکتای افزونه |
| `name` | `Persian Streams` | نام نمایشی |
| `version` | `1.2.0` | نسخه manifest — مستقل از `version` در `package.json` که `1.0.0` است |
| `resources` | `['stream']` | فقط stream؛ بدون catalog/meta/subtitles |
| `types` | `['movie', 'series']` | فیلم و سریال |
| `idPrefixes` | `['tt']` | فقط شناسه IMDb |
| `catalogs` | `[]` | catalog اختصاصی ندارد |
| `contactEmail` | `rostami.ali@gmail.com` | ایمیل تماس |
| `author` | `Ali Rostami rostami.ali@gmail.com` | نویسنده |
| `logo` | مسیر نسبی در builder | در route سفارشی `/manifest.json` به URL **مطلق** بازنویسی می‌شود |

خروجی واقعی `/manifest.json` هنگام اجرا روی پورت `8123`:

```json
{
  "id": "org.alirostami.streams.persian",
  "name": "Persian Streams",
  "description": "Fast streaming links from Iranian media providers ...",
  "version": "1.2.0",
  "resources": ["stream"],
  "types": ["movie", "series"],
  "idPrefixes": ["tt"],
  "catalogs": [],
  "contactEmail": "rostami.ali@gmail.com",
  "author": "Ali Rostami rostami.ali@gmail.com",
  "logo": "http://localhost:8123/assets/icons/logo.png"
}
```

---

## کلاینت HTTP

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

- `baseURL` باعث می‌شود مسیر نسبی `/quick-search` مستقیماً قابل استفاده باشد.
- timeout: ۱۵ ثانیه — تا ۵ redirect دنبال می‌شود.
- statusهای زیر ۵۰۰ throw نمی‌شوند؛ کد خودش `response.status` را بررسی می‌کند.

علاوه بر این `client`، دو مصرف‌کننده مستقل axios هم وجود دارد که تنظیمات خودشان را دارند:

| محل | تنظیمات |
|------|---------|
| `fetchTitleFromMeta` | `axios.get` مستقیم به `v3-cinemeta.strem.io` با timeout ۵ ثانیه |
| `extractStreamsFromSeasonDirectory` | `axios.get` مستقیم به URL دایرکتوری فصل با timeout ۱۵ ثانیه و ۵ redirect |

---

## جریان پردازش درخواست

### فیلم

```text
GET /stream/movie/tt1234567.json
  ↓ defineStreamHandler → imdbId = 'tt1234567'
  ↓ getStreams('movie', 'tt1234567')
  ↓ fetchTitleFromMeta('movie', 'tt1234567')        (نتیجه فعلاً بلااستفاده)
  ↓ resolveViaQuickSearch('tt1234567')
  ↓ GET {BASE_URL}/quick-search?q=tt1234567&sort=modified_at%3Adesc
  ↓ انتخاب آیتمی که imdb_id آن دقیقاً برابر است
  ↓ fetchPage(contentUrl) → cheerio.load
  ↓ extractMovieStreams($)
  ↓ { streams: [...] }
```

### سریال

```text
GET /stream/series/tt1234567:2:5.json
  ↓ id.split(':') → imdbId='tt1234567', season=2, episode=5
  ↓ getStreams('series', 'tt1234567', 2, 5)
  ↓ resolveViaQuickSearch → fetchPage
  ↓ extractSeriesStreams($, 2, 5)
      ├─ مسیر اصلی: .download-season → .series-downloaditems .d-flex
      └─ اگر خروجی خالی بود: extractLegacySeriesStreams($, 2, 5)
             └─ لینک‌های فصل → extractStreamsFromSeasonDirectory(...)
  ↓ { streams: [...] }
```

---

## نقشه تابع‌ها

| خط | تابع | نوع | نقش |
|----|------|-----|-----|
| 63 | `fetchTitleFromMeta(type, imdbId)` | async | گرفتن نام و سال از Cinemeta |
| 95 | `resolveViaQuickSearch(imdbId)` | async | پیدا کردن URL صفحه محتوا از روی IMDb ID |
| 132 | `fetchPage(url)` | async | دریافت HTML و `cheerio.load` |
| 150 | `detectQuality(url, context)` | sync | تشخیص heuristic کیفیت |
| 171 | `toEnglishDigits(value)` | sync | تبدیل ارقام فارسی/عربی به ASCII |
| 188 | `decodeUrlPart(value)` | sync | `decodeURIComponent` امن |
| 196 | `extractReleaseFormatFromFilename(name)` | sync | ساخت برچسب انتشار از نام فایل |
| 222 | `resolveUrl(href, baseUrl)` | sync | مطلق‌سازی امن URL |
| 234 | `cleanMetadataValue(value)` | sync | پاک‌سازی مقدار متادیتا |
| 255 | `extractLabeledValue(text, labels)` | sync | استخراج مقدار بعد از برچسب‌هایی مثل «کیفیت :» |
| 325 | `detectPersianSubtitleStatus(text)` | sync | تشخیص `'persian'` / `'none'` / `null` |
| 367 | `formatSubtitleLabel(status)` | sync | تبدیل وضعیت زیرنویس به برچسب نمایشی |
| 373 | `extractReleaseInfoFromElement($, el)` | sync | خواندن کیفیت/انکودر/زیرنویس از یک المان |
| 391 | `extractReleaseInfoNearElement($, el, maxDepth)` | sync | همان کار با بالا رفتن در والدها |
| 408 | `buildStreamName(quality, dubbedLabel, subtitleStatus)` | sync | ساخت فیلد `name` استریم |
| 420 | `isDubbed(text)` | sync | تشخیص نسخه دوبله |
| 431 | `extractSeasonNumberFromLegacyLink(text, href)` | sync | تشخیص شماره فصل از لینک legacy |
| 443 | `extractEpisodeMatchFromFilename(file, S, E)` | sync | تطبیق نام فایل با فصل/قسمت هدف |
| 464 | `extractStreamsFromSeasonDirectory(url, S, E, sub)` | async | استخراج از دایرکتوری باز فصل |
| 517 | `extractLegacySeriesStreams($, S, E)` | async | یافتن لینک دایرکتوری فصل در صفحه |
| 556 | `extractSeriesStreams($, S, E)` | async | استخراج اصلی سریال |
| 683 | `extractMovieStreams($)` | sync | استخراج اصلی فیلم |
| 745 | `getStreams(type, imdbId, S, E)` | async | هماهنگ‌کننده کل جریان |
| 773 | `builder.defineStreamHandler(...)` | — | هندلر رسمی Stremio |

---

## تابع‌های کمکی عمومی

### `fetchTitleFromMeta(type, imdbId)`

```js
async function fetchTitleFromMeta(type, imdbId) // Promise<{name, year}|null>
```

نام و سال محتوا را از سرویس متادیتای رسمی Stremio می‌گیرد:

```text
https://v3-cinemeta.strem.io/meta/{type}/{imdbId}.json
```

- timeout: ۵ ثانیه
- در موفقیت `{ name, year }` و در خطا `null` برمی‌گرداند (خطا فقط log می‌شود).

> ⚠️ در نسخه فعلی، مقدار برگشتی در `getStreams` در متغیرهای `title` و `year` ذخیره می‌شود اما **هیچ‌جا استفاده نمی‌شود**. یعنی این تابع در هر درخواست یک round-trip شبکه اضافه می‌کند بدون اثر روی خروجی. باقی مانده از مسیر قدیمی «جستجو بر اساس عنوان» است و کاندیدای حذف یا استفاده مجدد (مثلاً برای fallback مبتنی بر عنوان) است.

---

### `resolveViaQuickSearch(imdbId)`

```js
async function resolveViaQuickSearch(imdbId) // Promise<string|null>
```

تنها راه تطبیق محتوا در نسخه فعلی.

مراحل:

1. ساخت مسیر:

   ```text
   /quick-search?q={imdbId}&sort=modified_at%3Adesc
   ```

2. ارسال درخواست با `client.get`.
3. اگر status ≠ 200 یا پاسخ آرایه نباشد → `null`.
4. انتخاب اولین آیتمی که:

   ```js
   (r.imdb_id || '').toLowerCase() === imdbId.toLowerCase()
   ```

5. اگر `url` نسبی باشد با `BASE_URL` کامل می‌شود (الحاق رشته‌ای ساده).
6. اگر URL نهایی شامل `/profile/` باشد → به‌عنوان «پیدا نشد» رد می‌شود.
7. در موفقیت، URL کامل صفحه محتوا برگردانده می‌شود.

قرارداد مورد انتظار از منبع:

```json
[
  { "imdb_id": "tt1234567", "url": "/12345/example-title/" }
]
```

---

### `fetchPage(url)`

```js
async function fetchPage(url) // Promise<CheerioAPI|null>
```

- GET به URL داده‌شده با `client`.
- فقط status `200` پذیرفته می‌شود؛ در غیر این صورت `null`.
- در موفقیت `cheerio.load(response.data)` برگردانده می‌شود.
- خطاها catch و log می‌شوند و `null` برمی‌گردد.

---

### `detectQuality(url, context = '')`

```js
function detectQuality(url, context = '')
// '4K' | '1080p' | '720p' | '480p' | '360p' | 'Unknown'
```

fallback زمانی که صفحه منبع برچسب کیفیت مشخصی ندارد. URL و متن پیرامونی lowercase و به هم چسبانده می‌شوند و به ترتیب بررسی می‌شوند:

| خروجی | نشانه‌ها |
|-------|----------|
| `4K` | `2160`، `4k`، `uhd` |
| `1080p` | `1080`، `full hd`، `fhd` |
| `720p` | `720`، `hd` |
| `480p` | `480`، `sd` |
| `360p` | `360` |

سپس اگر هیچ‌کدام مطابقت نکرد، پارامتر `?quality=` در URL decode و بررسی می‌شود (`2160/4k`، `1080`، `720`، `480`).

در نهایت `'Unknown'` برمی‌گردد.

> ⚠️ محدودیت شناخته‌شده: `hd` و `sd` با `includes` ساده تشخیص داده می‌شوند و **مرز کلمه بررسی نمی‌شود**. یک hash تصادفی در URL مثل `.../a3hd91/...` می‌تواند باعث برچسب اشتباه `720p` شود. همچنین ورودی `url` قبل از بررسی decode نمی‌شود، پس کیفیت‌های percent-encoded ممکن است از قلم بیفتند (به‌جز مسیر `?quality=`).

---

### `toEnglishDigits(value)`

```js
function toEnglishDigits(value) // string
```

ارقام فارسی (`۰۱۲۳۴۵۶۷۸۹`) و عربی-هندی (`٠١٢٣٤٥٦٧٨٩`) را به ASCII تبدیل می‌کند. ورودی `null`/`undefined` به رشته خالی تبدیل می‌شود.

```text
"فصل ۲ - قسمت ۵"  →  "فصل 2 - قسمت 5"
```

کاربرد: مسیر legacy (تشخیص شماره فصل از لینک و تطبیق نام فایل اپیزود).

---

### `decodeUrlPart(value)` و `resolveUrl(href, baseUrl)`

```js
function decodeUrlPart(value)        // decodeURIComponent با try/catch
function resolveUrl(href, baseUrl)   // new URL(href, baseUrl).toString() با try/catch
```

هر دو در صورت خطا مقدار ورودی را بدون تغییر برمی‌گردانند تا استخراج به‌خاطر یک URL خراب متوقف نشود.

---

### `isDubbed(text)`

```js
function isDubbed(text) // boolean
```

متن lowercase می‌شود و در صورت وجود یکی از موارد زیر `true` برمی‌گردد:

`dubbed` • `dooble` • `دوبله` • `farsi dub` • `persian dub`

در صورت مثبت بودن، رشته `' • دوبله'` به نام stream اضافه می‌شود.

---

## لایه استخراج متادیتای انتشار

این لایه جدید است و هدفش نمایش **برچسب دقیق خود منبع** (مثل `WEB-DL 4K 2160p 10bit HDR`) به‌جای کاهش آن به یک `1080p` ساده است.

### `cleanMetadataValue(value)`

`&nbsp;`، نویسه‌های کنترلی راست‌به‌چپ (`\u200c`، `\u200e`، `\u200f`)، جداکننده‌های ابتدایی (`: ： ؛ ; ، , | - – —`) و فاصله‌های اضافی را حذف می‌کند. اگر نتیجه خالی شود `null` برمی‌گردد.

### `extractLabeledValue(text, labels)`

```js
function extractLabeledValue(text, labels) // string|null
```

مقدار بعد از یک برچسب را استخراج می‌کند:

```text
"کیفیت : WEB-DL 4K 2160p 10bit HDR"  →  "WEB-DL 4K 2160p 10bit HDR"
"انکودر : PSA"                        →  "PSA"
```

الگوریتم:

1. متن نرمال‌سازی می‌شود (`&nbsp;`، نویسه‌های RTL، `\r` → `\n`).
2. اولین برچسب موجود از آرایه `labels` پیدا می‌شود.
3. جداکننده‌های بعد از برچسب (`فاصله`, `:`, `：`, `؛`) رد می‌شوند.
4. پایان مقدار = نزدیک‌ترین حد از میان: انتهای خط، انتهای متن، یا شروع یکی از **برچسب‌های مرزی**.
5. نتیجه از `cleanMetadataValue` عبور می‌کند.

فهرست `boundaryLabels` داخلی حدود ۵۰ برچسب فارسی/انگلیسی دارد (کیفیت، انکودر، حجم، زبان، فرمت، رزولوشن، مدت، فصل، قسمت، دانلود، انواع حالت‌های زیرنویس، صوت، امتیاز، IMDb، ژانر، سال، کشور، کارگردان، بازیگران، رده، وضعیت، شبکه، خلاصه و ...) تا مقدار یک فیلد به فیلد بعدی سرریز نکند.

### `detectPersianSubtitleStatus(text)`

```js
function detectPersianSubtitleStatus(text) // 'persian' | 'none' | null
```

ابتدا الگوهای **منفی** بررسی می‌شوند (اولویت با نفی است):

```text
بدون زیرنویس / فاقد زیرنویس / زیرنویس فارسی: ندارد|موجود نیست|اضافه نشده
no [persian|farsi] subs / without [persian|farsi] subs
```

سپس الگوهای **مثبت**:

```text
زیرنویس فارسی / زیرنویس: دارد|موجود / با زیرنویس / دارای زیرنویس / زیرنویس چسبیده
persian subs / farsi subs / hardsub(bed) / hardcoded subtitles / subbed
```

اگر هیچ‌کدام مطابقت نکند `null` برمی‌گردد. الگوها فاصله اختیاری داخل «زیر نویس» را هم پوشش می‌دهند.

### `formatSubtitleLabel(status)`

```js
function formatSubtitleLabel(status) {
  if (status === 'persian') return '';
  if (status === 'none') return '';
  return null;
}
```

> ⚠️ در نسخه فعلی این تابع برای هر دو وضعیت **رشته خالی** برمی‌گرداند. یعنی هرچند وضعیت زیرنویس تشخیص داده و در سراسر کد منتقل می‌شود، **هیچ برچسب زیرنویسی در خروجی Stremio نمایش داده نمی‌شود**. این عمداً «خاموش» شده و نقطه اتصال آماده‌ای برای فعال‌سازی است؛ کافی است مقادیر بازگشتی به مثلاً `'زیرنویس فارسی'` و `'بدون زیرنویس'` تغییر کنند.

### `extractReleaseInfoFromElement($, element)`

خروجی:

```js
{ quality: string|null, encoder: string|null, subtitleStatus: 'persian'|'none'|null }
```

متن المان را می‌گیرد و سه فیلد را با `extractLabeledValue(['کیفیت','Quality'])`، `extractLabeledValue(['انکودر','Encoder','Encode'])` و `detectPersianSubtitleStatus` پر می‌کند.

### `extractReleaseInfoNearElement($, element, maxDepth = 4)`

از خود المان شروع می‌کند و تا ۴ سطح والد بالا می‌رود. **هر فیلد مستقل merge می‌شود** (اولین مقدار غیرخالی برنده است)، بنابراین پیدا شدن `quality` در ردیف دانلود مانع خواندن `subtitleStatus` از یک wrapper بالاتر نمی‌شود. به‌محض پر شدن هر سه فیلد حلقه می‌شکند.

### `extractReleaseFormatFromFilename(filename)`

```js
function extractReleaseFormatFromFilename(filename) // string|null
```

از نام فایل یک برچسب انتشار تمیز می‌سازد (مخصوص مسیر legacy):

1. decode، حذف پسوند (`.mkv|.mp4|.m3u8|.avi`)، تبدیل `.` و `_` به فاصله.
2. اگر الگوی `S01E02` پیدا شود، فقط بخش **بعد از** آن در نظر گرفته می‌شود.
3. توکن‌هایی که در یکی از این دسته‌ها باشند نگه داشته می‌شوند:

| دسته | نمونه‌ها |
|------|----------|
| رزولوشن | `2160p`، `1080p`، `720p`، `480p`، `360p`، `4k`، `uhd`، `fhd`، `hd` |
| منبع | `web-dl`، `webrip`، `bluray`، `brrip`، `hdrip`، `dvdrip`، `hdtv` |
| کدک | `x264`، `x265`، `h264`، `h265`، `hevc`، `avc` |
| رنگ/عمق | `10bit`، `8bit`، `hdr`، `dv`، `dolbyvision` |
| پلتفرم | `nf`، `amzn`، `dsnp`، `hulu`، `atvp`، `max` |

4. اگر هیچ توکنی پیدا نشد `null` برمی‌گردد تا `detectQuality` جایگزین شود.

مثال:

```text
Show.S01E02.1080p.NF.WEB-DL.x265.10bit.mkv  →  "1080p NF WEB-DL x265 10bit"
```

### `buildStreamName(quality, dubbedLabel, subtitleStatus)`

```js
`${quality}${dubbedLabel}${subtitlePart}`.trim()
```

که `subtitlePart` تنها در صورتی اضافه می‌شود که `formatSubtitleLabel` مقدار غیرخالی برگرداند (در حال حاضر: هرگز).

---

## استخراج stream فیلم

```js
function extractMovieStreams($) // Stream[]   (همگام)
```

مراحل:

1. متادیتای سطح صفحه یک بار خوانده می‌شود:

   ```js
   const pageReleaseInfo = extractReleaseInfoFromElement(
     $, $('main, article, .single, .post, body').first()[0]
   );
   ```

2. روی کانتینرهای دانلود پیمایش می‌شود:

   ```css
   .download-list, .download-box, .dl-box
   ```

3. برچسب کیفیت باکس از `.title span` اول خوانده می‌شود.
4. داخل هر باکس، لینک‌های زیر انتخاب می‌شوند:

   ```css
   a[href*=".mkv"], a[href*=".mp4"], a[href*="http"]
   ```

   و سپس **فیلتر سخت‌گیرانه** اعمال می‌شود: `href` باید شامل `.mkv`، `.mp4` یا `abrtech` باشد.

5. اگر `onclick` شامل `handleDownloadClick('URL')` باشد، URL واقعی از آن استخراج و جایگزین `href` می‌شود.
6. نزدیک‌ترین کانتینر ردیف پیدا می‌شود:

   ```css
   .d-flex, li, .download-item, .download-list, .download-box, .dl-box
   ```

7. کیفیت با اولویت زیر تعیین می‌شود:

   ```text
   releaseInfo.quality → boxReleaseInfo.quality → detectQuality(videoUrl, fallbackContext)
   ```

   و `encoder` و `subtitleStatus` نیز با همین الگوی آبشاری (تا سطح `pageReleaseInfo` برای زیرنویس) پر می‌شوند.

8. stream ساخته می‌شود:

   ```js
   {
     name: buildStreamName(quality, dubbedLabel, subtitleStatus),
     title: `${quality}${encoderTitle}${subtitleTitlePart}`,
     url: videoUrl
   }
   ```

   که `encoderTitle` در صورت وجود برابر `' • encoder: PSA'` است.

9. در پایان، همه `iframe[src]`ها بررسی می‌شوند و اگر `src` شامل `.mp4` یا `.m3u8` باشد یک stream ساده اضافه می‌شود:

   ```js
   { name: 'Stream', title: 'Embedded Stream', url: src }
   ```

---

## استخراج stream سریال

```js
async function extractSeriesStreams($, targetSeason, targetEpisode) // Promise<Stream[]>
```

### مرحله ۱ — یافتن کانتینر فصل

روی `.download-season` پیمایش می‌شود و شماره فصل به این ترتیب حدس زده می‌شود:

1. مقدار پیش‌فرض = ایندکس کانتینر + ۱.
2. متن دکمه `button[data-bs-toggle="collapse"]` با نگاشت واژه‌های فارسی بررسی می‌شود:

   ```text
   اول=1، دوم=2، سوم=3، چهارم=4، پنجم=5،
   ششم=6، هفتم=7، هشتم=8، نهم=9، دهم=10
   ```

3. سپس regex عددی اعمال می‌شود:

   ```js
   /(?:season|fصل)[\s\u06F0-\u06F9\u0660-\u0669]*(\d+)/i
   ```

   > 🐞 در الگوی بالا `fصل` یک تایپو است (حرف لاتین `f` + `صل`) و باید `فصل` باشد. نتیجه: متن‌هایی مثل «فصل 12» با این regex تشخیص داده نمی‌شوند و فصل‌های بالای ۱۰ فقط در صورت وجود کلمه `Season` یا با fallback ایندکس درست تشخیص داده می‌شوند.

4. اگر شماره فصل با درخواست برابر نباشد، کانتینر رد می‌شود.

### مرحله ۲ — یافتن قسمت

روی `.series-downloaditems .d-flex` پیمایش می‌شود و شماره قسمت با اولویت زیر تعیین می‌گردد:

1. `قسمت \d+` در متن `a.btn-block.btn-default`
2. `episode|ep \d+` در همان متن
3. `[?&]episode=\d+` در `href`
4. fallback: ایندکس + ۱

### مرحله ۳ — یافتن URL ویدیو (سه استراتژی)

| # | استراتژی |
|---|-----------|
| ۱ | اولین `a[onclick]` داخل ردیف و استخراج `handleDownloadClick('URL')` |
| ۲ | `href` مستقیم لینک اپیزود، اگر شامل `.mkv`، `.mp4` یا `http` باشد |
| ۳ | پیمایش همه `a[onclick]`های ردیف و استخراج اولین `handleDownloadClick(...)` |

> ⚠️ شرط `href.includes('http')` در استراتژی ۲ بسیار بازتر از دو مورد دیگر است و می‌تواند یک لینک مطلق غیرویدیویی را هم به‌عنوان stream بپذیرد.

### مرحله ۴ — ساخت stream

```js
{
  name: buildStreamName(quality, dubbedLabel, subtitleStatus),
  title: `S${targetSeason}E${targetEpisode} - ${quality}${encoderTitle}${subtitleTitlePart}`,
  url: videoUrl
}
```

### مرحله ۵ — fallback

اگر آرایه streams خالی بماند، `extractLegacySeriesStreams($, S, E)` صدا زده می‌شود.

---

## مسیر fallback دایرکتوری فصل (Legacy)

بعضی صفحات منبع به‌جای باکس دانلود ساختاریافته، فقط لینکی به یک **دایرکتوری باز (open directory)** فصل دارند. این مسیر آن حالت را پوشش می‌دهد.

### `extractLegacySeriesStreams($, targetSeason, targetEpisode)`

1. وضعیت زیرنویس در سطح صفحه یک بار خوانده می‌شود:

   ```js
   detectPersianSubtitleStatus($('main, article, .single, .post, body').first().text())
   ```

2. همه `a[href]`ها بررسی می‌شوند و شماره فصل با `extractSeasonNumberFromLegacyLink` استخراج می‌شود.
3. لینک فقط وقتی «دایرکتوری فصل» در نظر گرفته می‌شود که:

   ```text
   href شامل الگوی /S01/  باشد
   یا متن لینک شامل «دانلود فصل» / «download season» باشد
   ```

4. لینک‌های یکتا مطلق می‌شوند و به‌ترتیب به `extractStreamsFromSeasonDirectory` داده می‌شوند.

### `extractSeasonNumberFromLegacyLink(text, href)`

متن و href (decode‌شده، با ارقام انگلیسی‌شده) با هم بررسی می‌شوند:

```js
/(?:فصل|season|\bS)\s*0*(\d{1,2})\b/i   // «فصل 2»، «Season 2»، «S02»
/\/S0*(\d{1,2})(?:\/|$)/i                // مسیر پوشه‌ای مثل /S02/
```

### `extractEpisodeMatchFromFilename(filename, S, E)`

نام فایل decode و انگلیسی‌سازی می‌شود، سپس به ترتیب:

| الگو | مثال | معیار تطبیق |
|------|------|-------------|
| `S01E02` | `Show.S02E05.1080p.mkv` | هم فصل و هم قسمت باید برابر باشند |
| `2x05` | `Show.2x05.mkv` | هم فصل و هم قسمت |
| `E05` | `Show.E05.mkv` | فقط شماره قسمت |

اگر هیچ الگویی پیدا نشود `false` برمی‌گردد.

### `extractStreamsFromSeasonDirectory(seasonUrl, S, E, pageSubtitleStatus)`

1. GET مستقیم با axios (timeout ۱۵ ثانیه، ۵ redirect، `validateStatus < 500`).
2. URL نهایی بعد از redirect از `response.request?.res?.responseUrl` خوانده می‌شود تا مطلق‌سازی لینک‌های نسبی درست انجام شود.
3. لینک‌های `../` و لینک‌های شروع‌شده با `?` (مرتب‌سازی ستون‌های index page) رد می‌شوند.
4. فقط پسوندهای `.mkv|.mp4|.m3u8|.avi` پذیرفته می‌شوند.
5. نام فایل با `extractEpisodeMatchFromFilename` بررسی می‌شود.
6. کیفیت: `extractReleaseFormatFromFilename(filename) || detectQuality(videoUrl, filename)`
7. وضعیت زیرنویس: `detectPersianSubtitleStatus(filename) || pageSubtitleStatus`
8. stream ساخته می‌شود:

   ```js
   {
     name: buildStreamName(quality, dubbedLabel, subtitleStatus),
     title: `S${S}E${E} - ${quality}${subtitleTitlePart}`,
     url: videoUrl
   }
   ```

> در این مسیر فیلد `encoder` در `title` قرار نمی‌گیرد (برخلاف مسیر اصلی سریال و فیلم)، چون اطلاعات انکودر معمولاً داخل خود برچسب انتشار نام فایل است.

---

## هماهنگ‌کننده و هندلر Stremio

### `getStreams(type, imdbId, season = null, episode = null)`

```js
async function getStreams(type, imdbId, season = null, episode = null) // Stream[]
```

1. لاگ `=== Stream Request ===` چاپ می‌شود.
2. `fetchTitleFromMeta(type, imdbId)` صدا زده می‌شود و در `title`/`year` ذخیره می‌شود (استفاده نمی‌شود).
3. `contentUrl = await resolveViaQuickSearch(imdbId)`
4. `$ = await fetchPage(contentUrl)`
5. اگر `type === 'series'` و season/episode موجود باشند → `await extractSeriesStreams($, season, episode)`
6. اگر `type === 'movie'` → `extractMovieStreams($)`
7. تعداد streamها log و آرایه برگردانده می‌شود.

> 🐞 مسئله شناخته‌شده: بین مرحله ۳ و ۴ هیچ بررسی‌ای برای `contentUrl === null` وجود ندارد. اگر quick-search نتیجه ندهد، `fetchPage(null)` اجرا می‌شود، `$` برابر `null` می‌شود و در ادامه `extractMovieStreams(null)` خطای `TypeError: $ is not a function` می‌دهد. این خطا در `.catch` هندلر گرفته می‌شود و پاسخ نهایی همچنان `{"streams":[]}` است، اما لاگ‌ها با stack trace غیرضروری پر می‌شوند. افزودن دو گارد کوتاه (`if (!contentUrl) return [];` و `if (!$) return [];`) این مورد را برطرف می‌کند.

### `builder.defineStreamHandler((args) => { ... })`

ورودی فیلم:

```js
{ type: 'movie', id: 'tt1234567' }
```

ورودی سریال:

```js
{ type: 'series', id: 'tt1234567:1:3' }
```

رفتار:

- برای فیلم، کل `id` همان `imdbId` است.
- برای سریال:

  ```js
  const parts = id.split(':');
  imdbId  = parts[0];
  season  = parts[1] ? parseInt(parts[1], 10) : null;
  episode = parts[2] ? parseInt(parts[2], 10) : null;
  ```

- خروجی: `getStreams(...).then(streams => ({ streams }))`
- در خطا: log و `{ streams: [] }`

### Export

```js
module.exports = builder.getInterface();
```

توجه: در بلاک `require.main === module` یک بار دیگر `builder.getInterface()` صدا زده می‌شود و در متغیر محلی `addonInterface` نگهداری می‌شود.

---

## سرور HTTP و routeها

سرور فقط در اجرای مستقیم بالا می‌آید:

```js
if (require.main === module) {
  const http = require('http');
  const { getRouter } = require('stremio-addon-sdk');
  const addonInterface = builder.getInterface();
  const app = express();
  ...
}
```

### ترتیب ثبت middlewareها (مهم)

| ترتیب | route | منبع | توضیح |
|-------|-------|------|-------|
| ۱ | `GET /manifest.json` | route سفارشی | **قبل از** router SDK ثبت می‌شود تا لوگوی مطلق را جایگزین کند |
| ۲ | `*` | `getRouter(addonInterface)` | مسیرهای استاندارد Stremio (`/stream/...`) |
| ۳ | `GET /assets/icons/*` | `express.static` | سرو فایل‌های `assets/icons` |
| ۴ | `GET /` | route ساده | صفحه معرفی HTML با لینک نصب محلی |

مسیرهای stream که SDK تولید می‌کند:

```text
GET /stream/movie/{imdbId}.json
GET /stream/series/{imdbId}:{season}:{episode}.json
```

> route `/health` وجود ندارد؛ درخواست به آن `404` برمی‌گرداند. برای health check از `/manifest.json` استفاده کنید.

### route سفارشی manifest

```js
app.get('/manifest.json', (req, res) => {
  const protocol = req.protocol || 'http';
  const host = req.get('host') || `localhost:${PORT}`;
  const manifestWithLogo = {
    ...addonInterface.manifest,
    logo: `${protocol}://${host}/assets/icons/logo.png`
  };
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(manifestWithLogo));
});
```

- Stremio برای تصاویر manifest به URL **مطلق** نیاز دارد.
- origin کاملاً از درخواست ساخته می‌شود؛ هیچ متغیر محیطی در آن دخیل نیست.
- پشت reverse proxy با TLS، برای اینکه `req.protocol` مقدار `https` بدهد باید `app.set('trust proxy', true)` اضافه شود — این خط در کد فعلی **وجود ندارد**؛ در نتیجه ممکن است لوگو با `http://` تولید شود و مرورگر آن را به‌عنوان mixed content بلاک کند.

### مدیریت خطای سرور

```js
const server = http.createServer(app);

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`\nPort ${PORT} is already in use.`);
    console.error('Stop the other process using this port, or start the addon with another port:');
    console.error(`PORT=${Number(PORT) + 1 || 8001} npm start\n`);
    process.exit(1);
  }
  console.error('Server error:', error);
  process.exit(1);
});
```

لاگ راه‌اندازی موفق:

```text
===========================================
Persian Streams Stremio Addon (Iranian Source)
===========================================
Server running on port 8000
Manifest: http://localhost:8000/manifest.json
Install: stremio://localhost:8000/manifest.json
===========================================
```

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
| `name` | برچسب کوتاه در لیست Stremio: کیفیت + (در صورت تشخیص) ` • دوبله` |
| `title` | خط توضیح: برای سریال با پیشوند `S{season}E{episode}`، به‌علاوه `• encoder: X` در صورت وجود |
| `url` | لینک مستقیم قابل پخش |

> هیچ فیلد اضافی مثل `behaviorHints`، `subtitles`، `fileIdx` یا `bingeGroup` تولید نمی‌شود.

### نمونه‌های واقعی

فیلم با برچسب منبع:

```js
{ name: "WEB-DL 4K 2160p 10bit HDR",
  title: "WEB-DL 4K 2160p 10bit HDR • encoder: PSA",
  url: "https://example.com/movie-2160p.mkv" }
```

فیلم دوبله بدون برچسب منبع (fallback به `detectQuality`):

```js
{ name: "720p • دوبله", title: "720p", url: "https://example.com/movie-dubbed-720.mp4" }
```

قسمت سریال از مسیر اصلی:

```js
{ name: "1080p", title: "S1E8 - 1080p", url: "https://example.com/series-s01e08.mkv" }
```

قسمت سریال از دایرکتوری legacy:

```js
{ name: "1080p NF WEB-DL x265 10bit",
  title: "S2E5 - 1080p NF WEB-DL x265 10bit",
  url: "https://cdn.example.com/S02/Show.S02E05.1080p.NF.WEB-DL.x265.10bit.mkv" }
```

iframe فیلم:

```js
{ name: "Stream", title: "Embedded Stream", url: "https://example.com/playlist.m3u8" }
```

---

## نمونه درخواست‌ها

فرض: سرور روی پورت `8000` اجرا شده است.

```bash
# manifest
curl http://localhost:8000/manifest.json

# stream فیلم
curl http://localhost:8000/stream/movie/tt1234567.json

# stream قسمت سریال
curl http://localhost:8000/stream/series/tt1234567:1:3.json

# لوگو
curl -I http://localhost:8000/assets/icons/logo.png

# صفحه معرفی
curl http://localhost:8000/
```

اجرای سریع بدون فایل `.env`:

```bash
BASE_URL=https://www.example.com PORT=8123 node addon.js
```

---

## نکات استقرار

1. Node.js `20.18.1+` روی محیط اجرا لازم است.
2. `BASE_URL` باید در Environment Variables تعریف شود، در غیر این صورت process بلافاصله exit می‌کند.
3. `PORT` از محیط خوانده می‌شود (سازگار با Railway/Render/Fly/Heroku).
4. دستور اجرا: `npm start` یا `node addon.js`.
5. مسیرهای زیر باید از بیرون قابل دسترسی باشند:

   ```text
   /manifest.json
   /stream/movie/{imdbId}.json
   /stream/series/{imdbId}:{season}:{episode}.json
   /assets/icons/logo.png
   ```

6. آدرس نصب: `stremio://YOUR_DOMAIN/manifest.json`
7. پشت reverse proxy با HTTPS، برای درست شدن URL لوگو یا `app.set('trust proxy', true)` را اضافه کنید یا مطمئن شوید proxy هدر `X-Forwarded-Proto` را طوری تنظیم می‌کند که Express آن را اعمال کند.

---

## مسائل شناخته‌شده و بدهی فنی

| # | مورد | اثر | پیشنهاد |
|---|------|-----|---------|
| ۱ | نبود گارد برای `contentUrl === null` در `getStreams` | خطای `TypeError: $ is not a function` در لاگ‌ها | افزودن `if (!contentUrl) return [];` و `if (!$) return [];` |
| ۲ | `fetchTitleFromMeta` صدا زده می‌شود ولی نتیجه‌اش استفاده نمی‌شود | تأخیر شبکه اضافه در هر درخواست | حذف یا استفاده برای fallback مبتنی بر عنوان |
| ۳ | `formatSubtitleLabel` برای هر دو وضعیت `''` برمی‌گرداند | برچسب زیرنویس هرگز نمایش داده نمی‌شود | برگرداندن متن واقعی در صورت نیاز |
| ۴ | تایپوی `fصل` در regex فصل | فصل‌های عددی فارسی بالای ۱۰ درست تشخیص داده نمی‌شوند | اصلاح به `فصل` |
| ۵ | `detectQuality` با `includes('hd')`/`includes('sd')` | false positive روی hashهای CDN | استفاده از مرز کلمه (`\bhd\b`) |
| ۶ | `href.includes('http')` در استراتژی ۲ سریال | احتمال افزودن لینک غیرویدیویی | محدود کردن به پسوندهای ویدیویی یا دامنه‌های شناخته‌شده |
| ۷ | نبود `app.set('trust proxy', true)` | لوگوی `http://` پشت پراکسی TLS | افزودن تنظیم trust proxy |
| ۸ | ناسازگاری مجوز: `LICENSE` = Apache-2.0 اما `package.json` = `MIT` | ابهام حقوقی | هم‌راستا کردن `license` در `package.json` |
| ۹ | ناسازگاری نسخه: manifest `1.2.0` در برابر `package.json` `1.0.0` | سردرگمی در انتشار | یکسان‌سازی یا خواندن نسخه از `package.json` |
| ۱۰ | نبود cache، rate limiting، retry و تست خودکار | فشار روی منبع و شکنندگی | افزودن cache کوتاه‌مدت و تست واحد برای تابع‌های خالص |
| ۱۱ | `player-fa.png` بلااستفاده | حجم اضافی | استفاده در manifest (`background`) یا حذف |
| ۱۲ | خروج فوری process در نبود `BASE_URL` حتی هنگام import | مانع تست‌نویسی | تبدیل به throw یا بررسی فقط در حالت اجرای مستقیم |

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

و الگوی جاوااسکریپتی صفحه:

```js
handleDownloadClick('URL')
```

---

## عیب‌یابی

### خطای `BASE_URL is not set`

```env
BASE_URL=https://www.example.com
```

را در `.env` اضافه کنید و دوباره اجرا کنید.

---

### `Port 8000 is already in use`

پیام راهنمای خود برنامه:

```bash
PORT=8001 npm start
```

---

### quick-search نتیجه نمی‌دهد

- آیا `BASE_URL` درست است؟
- آیا `{BASE_URL}/quick-search?q=tt1234567&sort=modified_at%3Adesc` پاسخ می‌دهد؟
- آیا پاسخ یک آرایه JSON است؟
- آیا آیتم‌ها فیلد `imdb_id` دارند و مقدارش دقیقاً برابر شناسه درخواستی است؟
- آیا URL نتیجه شامل `/profile/` است (که عمداً رد می‌شود)؟

---

### `TypeError: $ is not a function` در لاگ

یعنی `resolveViaQuickSearch` مقدار `null` برگردانده (محتوا پیدا نشده یا شبکه در دسترس نبوده). پاسخ HTTP همچنان `{"streams":[]}` است. برای حذف این خطا از لاگ، گاردهای ذکرشده در بخش مسائل شناخته‌شده را اضافه کنید.

---

### صفحه محتوا parse نمی‌شود

`fetchPage` فقط status `200` را می‌پذیرد. اگر منبع redirect غیرمنتظره، JSON، صفحه challenge یا خطا برگرداند، خروجی خالی خواهد بود.

---

### برای فیلم stream پیدا نمی‌شود

بررسی کنید صفحه شامل یکی از `.download-list`، `.download-box` یا `.dl-box` باشد و لینک‌ها `.mkv`، `.mp4` یا `abrtech` داشته باشند (یا URL واقعی داخل `handleDownloadClick(...)` باشد).

---

### برای سریال قسمت درست پیدا نمی‌شود

- متن فصل باید شامل `Season 2` یا یکی از واژه‌های فارسی `اول..دهم` باشد (به تایپوی `fصل` توجه کنید).
- متن قسمت باید شامل `قسمت 5`، `Episode 5` یا `Ep 5` باشد، یا لینک `?episode=5` داشته باشد.
- اگر ساختار `.download-season` وجود ندارد، مسیر legacy فعال می‌شود؛ آن مسیر به لینکی با الگوی `/S02/` یا متن «دانلود فصل» نیاز دارد.

---

### لوگو در Stremio نمایش داده نمی‌شود

- `assets/icons/logo.png` باید وجود داشته باشد و `/assets/icons/logo.png` از بیرون قابل دسترسی باشد.
- پشت پراکسی HTTPS، مقدار `logo` را در خروجی `/manifest.json` بررسی کنید؛ اگر `http://` بود، `trust proxy` را فعال کنید.

---

### `/health` جواب نمی‌دهد

چنین routeای تعریف نشده و `404` برمی‌گرداند. از `/manifest.json` برای health check استفاده کنید یا route جدید اضافه کنید.

---

## حمایت از پروژه

اگر این افزونه برایت مفید بوده، حمایت تو کمک می‌کند پروژه پایدارتر، تمیزتر و هماهنگ‌تر با تغییرات منابع ایرانی باقی بماند ❤️

```text
alirostami.com/support
```
