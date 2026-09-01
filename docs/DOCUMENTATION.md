# مستندات فنی Iranian Provider Media / Persian Streams

این سند بر اساس ساختار فعلی کد در `addon.js` بازنویسی شده است. نسخه فعلی پروژه یک افزونه غیررسمی Stremio با نام نمایشی **Persian Streams** است که فقط resource نوع `stream` ارائه می‌کند و لینک‌های پخش را از منبع ایرانی پیکربندی‌شده با `BASE_URL` استخراج می‌کند.

> نکته مهم: در کد فعلی دیگر تابع‌هایی مثل `fetchTitleFromMeta`، `searchSite`، `slugifyTitle` یا `resolveViaEndpoint` وجود ندارند. مسیر فعلی تطبیق محتوا فقط از طریق `quick-search` و شناسه IMDb انجام می‌شود.

---

## فهرست مطالب

- [نمای کلی معماری](#نمای-کلی-معماری)
- [ساختار مخزن](#ساختار-مخزن)
- [وابستگی‌ها و اسکریپت‌ها](#وابستگیها-و-اسکریپتها)
- [متغیرهای محیطی](#متغیرهای-محیطی)
- [Manifest افزونه](#manifest-افزونه)
- [کلاینت HTTP](#کلاینت-http)
- [جریان پردازش درخواست](#جریان-پردازش-درخواست)
- [تابع‌ها و مسئولیت‌ها](#تابعها-و-مسئولیتها)
- [سرور Express و routeها](#سرور-express-و-routeها)
- [ساختار خروجی stream](#ساختار-خروجی-stream)
- [نمونه درخواست‌ها](#نمونه-درخواستها)
- [نکات استقرار](#نکات-استقرار)
- [محدودیت‌ها و نکات نگهداری](#محدودیتها-و-نکات-نگهداری)
- [عیب‌یابی](#عیبیابی)
- [حمایت از پروژه](#حمایت-از-پروژه)

---

## نمای کلی معماری

پروژه یک سرویس Node.js تک‌فایلی است:

1. `addon.js` هنگام اجرا متغیرهای محیطی را می‌خواند.
2. اگر `BASE_URL` تنظیم نشده باشد، برنامه متوقف می‌شود.
3. یک `axios` client برای ارتباط با منبع ایرانی ساخته می‌شود.
4. `stremio-addon-sdk` یک manifest و stream handler ثبت می‌کند.
5. در صورت اجرای مستقیم (`node addon.js`)، یک سرور Express بالا می‌آید.
6. Stremio برای فیلم یا سریال، endpointهای stream افزونه را فراخوانی می‌کند.
7. افزونه با IMDb ID محتوا را از `quick-search` پیدا می‌کند.
8. صفحه محتوا دانلود و با Cheerio تحلیل می‌شود.
9. لینک‌های قابل پخش در قالب `{ streams: [...] }` به Stremio برگردانده می‌شوند.

نمودار خلاصه:

```text
Stremio
  │
  │  GET /stream/movie/tt....json
  │  GET /stream/series/tt....:S:E.json
  ▼
stremio-addon-sdk router
  ▼
defineStreamHandler(args)
  ▼
getStreams(type, imdbId, season, episode)
  ▼
resolveViaQuickSearch(imdbId)
  │
  ├─ اگر محتوا پیدا نشد → []
  ▼
fetchPage(contentUrl)
  │
  ├─ اگر HTML معتبر نبود → []
  ▼
extractMovieStreams($)
یا
extractSeriesStreams($, season, episode)
  ▼
{ streams: [...] }
```

---

## ساختار مخزن

```text
.
├── addon.js
├── package.json
├── package-lock.json
├── README.md
├── UNUSED_CODE_REPORT.md
├── docs/
│   └── DOCUMENTATION.md
└── assets/
    └── icons/
        ├── logo.png
        └── player-fa.png
```

| مسیر | نقش فعلی |
|------|----------|
| `addon.js` | نقطه ورود برنامه، تعریف manifest، منطق استخراج stream، export افزونه و سرور Express |
| `package.json` | تعریف اسکریپت‌های اجرا و وابستگی‌ها |
| `package-lock.json` | قفل نسخه وابستگی‌ها؛ نسخه قفل‌شده `cheerio` به Node.js جدید نیاز دارد |
| `README.md` | راهنمای کاربر، نصب، اجرا و استقرار |
| `docs/DOCUMENTATION.md` | مستندات فنی همین فایل |
| `assets/icons/logo.png` | لوگوی manifest و فایل استاتیک اصلی |
| `assets/icons/player-fa.png` | فایل استاتیک موجود؛ در manifest فعلی استفاده نشده است |
| `UNUSED_CODE_REPORT.md` | گزارش تحلیل کدهای حذف‌شده/بلااستفاده و drift مستندات قدیمی |

---

## وابستگی‌ها و اسکریپت‌ها

### اسکریپت‌های npm

| دستور | عملکرد |
|------|--------|
| `npm start` | اجرای `node addon.js` |
| `npm run dev` | اجرای `node --watch addon.js` برای توسعه |

### وابستگی‌های runtime

| پکیج | کاربرد در پروژه |
|------|-----------------|
| `axios` | ارسال درخواست به منبع ایرانی و دریافت quick-search / HTML صفحه محتوا |
| `cheerio` | parse کردن HTML و انتخاب المان‌ها با selectorهای شبیه jQuery |
| `dotenv` | خواندن فایل `.env` |
| `express` | سرور HTTP مستقل برای manifest، assets و routeهای افزونه |
| `stremio-addon-sdk` | ساخت manifest، تعریف stream handler و تولید router استاندارد Stremio |

### نسخه Node.js

در `package.json` مقدار `engines` تعریف نشده، اما با توجه به `package-lock.json`، نسخه نصب‌شده `cheerio` در زنجیره وابستگی خود به Node.js `>=20.18.1` نیاز دارد. بنابراین برای نصب بدون هشدار و اجرای پایدار، Node.js `20.18.1` یا بالاتر توصیه می‌شود.

---

## متغیرهای محیطی

کد در ابتدای اجرا `dotenv` را load می‌کند:

```js
require('dotenv').config();
```

سپس مقادیر زیر استفاده می‌شوند:

| متغیر | پیش‌فرض | اجباری؟ | توضیح |
|-------|---------|---------|-------|
| `BASE_URL` | ندارد | بله | آدرس پایه منبع ایرانی. تمام درخواست‌های quick-search و صفحه محتوا بر اساس آن انجام می‌شوند. |
| `PORT` | `8000` | خیر | پورت سرور Express در حالت اجرای مستقیم. |
| `PUBLIC_URL` | `http://localhost:{PORT}` در manifest اولیه | خیر | origin عمومی افزونه برای ساخت URL مطلق لوگو. در route سفارشی `/manifest.json` اگر تنظیم نشده باشد، origin از Host درخواست ساخته می‌شود. |

نمونه `.env`:

```env
PORT=8000
BASE_URL=https://www.example.com
PUBLIC_URL=https://your-addon-domain.example
```

رفتار مهم:

```js
if (!BASE_URL) {
  console.error('BASE_URL is not set...');
  process.exit(1);
}
```

یعنی نبودن `BASE_URL` حتی در زمان import شدن `addon.js` نیز باعث خروج process می‌شود.

---

## Manifest افزونه

Manifest با `addonBuilder` ساخته می‌شود:

```js
const builder = new addonBuilder({
  id: 'org.alirostami.streams.persian',
  name: 'Persian Streams',
  version: '1.2.0',
  resources: ['stream'],
  types: ['movie', 'series'],
  idPrefixes: ['tt'],
  catalogs: [],
  logo: LOGO
});
```

| فیلد | مقدار فعلی | توضیح |
|------|------------|-------|
| `id` | `org.alirostami.streams.persian` | شناسه افزونه در Stremio |
| `name` | `Persian Streams` | نام نمایشی افزونه |
| `version` | `1.2.0` | نسخه manifest، مستقل از نسخه `package.json` |
| `resources` | `['stream']` | افزونه فقط لینک stream برمی‌گرداند |
| `types` | `['movie', 'series']` | پشتیبانی از فیلم و سریال |
| `idPrefixes` | `['tt']` | فقط شناسه‌های IMDb پشتیبانی می‌شوند |
| `catalogs` | `[]` | catalog اختصاصی ندارد |
| `logo` | URL مطلق لوگو | در manifest route بازنویسی می‌شود تا با host فعلی سازگار باشد |
| `contactEmail` | `rostami.ali@gmail.com` | ایمیل تماس ثبت‌شده در manifest |
| `author` | `Ali Rostami rostami.ali@gmail.com` | نویسنده manifest |

توضیح manifest شامل وب‌سایت حمایت و مخزن GitHub نیز هست:

```text
Website: alirostami.com/support
GitHub: https://github.com/alirostami01/iranian-provider-media
```

---

## کلاینت HTTP

یک نمونه `axios` با تنظیمات ثابت ساخته می‌شود:

```js
const client = axios.create({
  baseURL: BASE_URL,
  headers: {
    'User-Agent': 'Mozilla/5.0 ...',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Referer': BASE_URL,
  },
  timeout: 15000,
  maxRedirects: 5,
  validateStatus: status => status < 500
});
```

نکات:

- `baseURL` برای endpoint نسبی `quick-search` استفاده می‌شود.
- timeout برابر ۱۵ ثانیه است.
- تا ۵ redirect دنبال می‌شود.
- statusهای زیر ۵۰۰ توسط axios throw نمی‌شوند؛ کد خودش status را بررسی می‌کند.
- برای شبیه‌سازی مرورگر، هدرهای `User-Agent`، `Accept` و `Referer` ارسال می‌شوند.

---

## جریان پردازش درخواست

### فیلم

```text
GET /stream/movie/tt1234567.json
  ↓
defineStreamHandler
  ↓
imdbId = 'tt1234567'
  ↓
getStreams('movie', 'tt1234567')
  ↓
resolveViaQuickSearch('tt1234567')
  ↓
GET {BASE_URL}/quick-search?q=tt1234567&sort=modified_at%3Adesc
  ↓
پیدا کردن آیتمی که imdb_id آن برابر tt1234567 است
  ↓
fetchPage(contentUrl)
  ↓
extractMovieStreams($)
  ↓
{ streams: [...] }
```

### سریال

```text
GET /stream/series/tt1234567:2:5.json
  ↓
defineStreamHandler
  ↓
id.split(':') → imdbId='tt1234567', season=2, episode=5
  ↓
getStreams('series', 'tt1234567', 2, 5)
  ↓
resolveViaQuickSearch('tt1234567')
  ↓
fetchPage(contentUrl)
  ↓
extractSeriesStreams($, 2, 5)
  ↓
{ streams: [...] }
```

---

## تابع‌ها و مسئولیت‌ها

### `resolveViaQuickSearch(imdbId)`

```js
async function resolveViaQuickSearch(imdbId) // Promise<string|null>
```

مسئول پیدا کردن URL نهایی صفحه محتوا از روی شناسه IMDb است.

مراحل:

1. مسیر زیر ساخته می‌شود:

   ```text
   /quick-search?q={imdbId}&sort=modified_at%3Adesc
   ```

2. با `client.get` درخواست ارسال می‌شود.
3. اگر status برابر `200` نباشد یا پاسخ آرایه نباشد، `null` برمی‌گردد.
4. در آرایه پاسخ، اولین آیتمی انتخاب می‌شود که:

   ```js
   (r.imdb_id || '').toLowerCase() === imdbId.toLowerCase()
   ```

5. اگر `url` نسبی باشد، با `BASE_URL` کامل می‌شود.
6. اگر URL شامل `/profile/` باشد، به عنوان «پیدا نشد» رد می‌شود.
7. در موفقیت، URL کامل صفحه محتوا برگردانده می‌شود.

خروجی نمونه مورد انتظار از منبع:

```json
[
  {
    "imdb_id": "tt1234567",
    "url": "/12345/example-title/"
  }
]
```

---

### `fetchPage(url)`

```js
async function fetchPage(url) // Promise<cheerio.Root|null>
```

صفحه HTML محتوا را دریافت و parse می‌کند.

رفتار:

- درخواست GET به URL داده‌شده ارسال می‌شود.
- فقط status `200` پذیرفته می‌شود.
- پاسخ باید رشته HTML باشد.
- در موفقیت `cheerio.load(response.data)` برگردانده می‌شود.
- در خطا، `null` برمی‌گردد و پیام خطا در log چاپ می‌شود.

---

### `detectQuality(url, context = '')`

```js
function detectQuality(url, context = '') // '4K' | '1080p' | '720p' | '480p' | '360p' | 'Unknown'
```

کیفیت ویدیو را از URL و متن پیرامونی تشخیص می‌دهد.

مراحل:

1. ابتدا URL با `decodeURIComponent` decode می‌شود تا کیفیت‌های percent-encoded نیز قابل تشخیص باشند.
2. URL decode‌شده و `context` کنار هم قرار می‌گیرند و lowercase می‌شوند.
3. الگوهای زیر بررسی می‌شوند:

| خروجی | نشانه‌ها |
|-------|----------|
| `4K` | `2160`، `4k`، `uhd` |
| `1080p` | `1080`، `full hd`، `fhd` |
| `720p` | `720` یا کلمه مستقل `hd` |
| `480p` | `480` یا کلمه مستقل `sd` |
| `360p` | `360` |
| `Unknown` | هیچ‌کدام از موارد بالا پیدا نشود |

برای جلوگیری از تشخیص اشتباه در hashهای CDN، `hd` و `sd` فقط به صورت کلمه مستقل تشخیص داده می‌شوند.

---

### `normalizeDigits(text)`

```js
function normalizeDigits(text) // string
```

اعداد فارسی (`۰۱۲۳۴۵۶۷۸۹`) و عربی-هندی (`٠١٢٣٤٥٦٧٨٩`) را به اعداد ASCII تبدیل می‌کند.

کاربرد فعلی:

- تشخیص شماره فصل از متن دکمه فصل
- تشخیص شماره قسمت از متن دکمه اپیزود

نمونه:

```text
"فصل ۲ - قسمت ۵" → "فصل 2 - قسمت 5"
```

---

### `isDubbed(text)`

```js
function isDubbed(text) // boolean
```

بررسی می‌کند آیا متن شامل نشانه‌های نسخه دوبله است یا نه.

کلمات کلیدی فعلی:

- `dubbed`
- `dooble`
- `دوبله`
- `farsi dub`
- `persian dub`

اگر یکی از این موارد در متن دکمه، عنوان، نام فایل یا URL وجود داشته باشد، در خروجی stream برچسب `• دوبله` اضافه می‌شود.

---

### `extractSeriesStreams($, targetSeason, targetEpisode)`

```js
function extractSeriesStreams($, targetSeason, targetEpisode) // Stream[]
```

از صفحه سریال، لینک‌های پخش فصل و قسمت مشخص را استخراج می‌کند.

#### ورودی‌ها

| ورودی | توضیح |
|-------|-------|
| `$` | شیء Cheerio ساخته‌شده از HTML صفحه سریال |
| `targetSeason` | شماره فصل درخواستی از Stremio |
| `targetEpisode` | شماره قسمت درخواستی از Stremio |

#### شناسایی فصل

Selector اصلی فصل‌ها:

```css
.download-season
```

برای هر فصل:

1. دکمه فصل از selector زیر خوانده می‌شود:

   ```css
   button[data-bs-toggle="collapse"]
   ```

2. اگر متن شامل نام ترتیبی فارسی باشد، season number تنظیم می‌شود:

   | متن | عدد |
   |-----|-----|
   | `اول` | 1 |
   | `دوم` | 2 |
   | `سوم` | 3 |
   | `چهارم` | 4 |
   | `پنجم` | 5 |
   | `ششم` | 6 |
   | `هفتم` | 7 |
   | `هشتم` | 8 |
   | `نهم` | 9 |
   | `دهم` | 10 |

3. اگر متن شامل الگوی عددی باشد، مقدار عددی override می‌شود:

   ```regex
   /(?:season|فصل)\s*(\d+)/i
   ```

4. اگر فصل با `targetSeason` برابر نباشد، آن فصل نادیده گرفته می‌شود.

#### شناسایی قسمت

Selector آیتم‌های قسمت:

```css
.series-downloaditems .d-flex
```

برای هر قسمت، لینک اصلی از این selector خوانده می‌شود:

```css
a.btn-block.btn-default
```

شماره قسمت با این ترتیب تشخیص داده می‌شود:

1. متن فارسی: `قسمت 5`
2. متن انگلیسی: `episode 5` یا `ep 5`
3. پارامتر URL: `?episode=5`
4. در نهایت، اندیس آیتم در لیست (`epIdx + 1`)

#### استخراج URL ویدیو

دو روش فعلی:

1. جستجوی همه لینک‌های دارای `onclick` در ردیف اپیزود و استخراج URL از:

   ```js
   handleDownloadClick('URL')
   handleDownloadClick("URL")
   ```

2. اگر مورد قبلی پیدا نشد، استفاده از `href` لینک اصلی در صورتی که شامل `.mkv`، `.mp4` یا `http` باشد.

#### خروجی

برای هر لینک پیدا شده:

```js
{
  name: "1080p • دوبله",
  title: "S2E5 - 1080p",
  url: "https://cdn.example.com/video.mkv"
}
```

اگر نسخه دوبله تشخیص داده نشود:

```js
{
  name: "1080p",
  title: "S2E5 - 1080p",
  url: "https://cdn.example.com/video.mkv"
}
```

---

### `extractMovieStreams($)`

```js
function extractMovieStreams($) // Stream[]
```

از صفحه فیلم لینک‌های پخش را استخراج می‌کند.

#### باکس‌های دانلود

Selectorهای کانتینر:

```css
.download-list, .download-box, .dl-box
```

داخل هر کانتینر، لینک‌هایی بررسی می‌شوند که `href` آن‌ها شامل یکی از موارد زیر باشد:

```css
a[href*=".mkv"], a[href*=".mp4"], a[href*="abrtech"]
```

برای هر لینک:

1. مقدار `href` به عنوان URL اولیه در نظر گرفته می‌شود.
2. اگر `onclick` شامل `handleDownloadClick('URL')` باشد، URL واقعی از آن استخراج و جایگزین می‌شود.
3. کیفیت با `detectQuality` تشخیص داده می‌شود.
4. دوبله با `isDubbed` تشخیص داده می‌شود.
5. stream به آرایه خروجی اضافه می‌شود.

خروجی نمونه:

```js
{
  name: "720p • دوبله",
  title: "720p",
  url: "https://cdn.example.com/movie-720p.mp4"
}
```

#### iframeها

علاوه بر باکس‌های دانلود، همه `iframe[src]`ها بررسی می‌شوند. اگر `src` شامل `.mp4` یا `.m3u8` باشد، یک stream با عنوان `Embedded Stream` ساخته می‌شود:

```js
{
  name: "Stream",
  title: "Embedded Stream",
  url: "https://example.com/player/video.m3u8"
}
```

---

### `getStreams(type, imdbId, season = null, episode = null)`

```js
async function getStreams(type, imdbId, season = null, episode = null) // Stream[]
```

هماهنگ‌کننده اصلی منطق استخراج است.

مراحل:

1. اطلاعات درخواست در log چاپ می‌شود.
2. `resolveViaQuickSearch(imdbId)` فراخوانی می‌شود.
3. اگر URL محتوا پیدا نشود، `[]` برمی‌گردد.
4. `fetchPage(contentUrl)` فراخوانی می‌شود.
5. اگر صفحه قابل خواندن نباشد، `[]` برمی‌گردد.
6. اگر `type === 'series'` و season/episode وجود داشته باشد:

   ```js
   extractSeriesStreams($, season, episode)
   ```

7. اگر `type === 'movie'` باشد:

   ```js
   extractMovieStreams($)
   ```

8. تعداد streamهای پیدا شده log می‌شود و آرایه خروجی برگردانده می‌شود.

---

### `builder.defineStreamHandler((args) => { ... })`

هندلر رسمی Stremio برای دریافت درخواست‌های stream است.

ورودی نمونه فیلم:

```js
{
  type: 'movie',
  id: 'tt1234567'
}
```

ورودی نمونه سریال:

```js
{
  type: 'series',
  id: 'tt1234567:1:3'
}
```

رفتار:

- برای فیلم، کل `id` همان `imdbId` است.
- برای سریال، `id` با `:` جدا می‌شود:

  ```js
  imdbId = parts[0]
  season = parseInt(parts[1], 10)
  episode = parseInt(parts[2], 10)
  ```

- سپس `getStreams` فراخوانی می‌شود.
- خروجی همیشه در قالب استاندارد زیر به SDK داده می‌شود:

```js
{ streams }
```

اگر خطایی رخ دهد، خطا log شده و خروجی خالی برگردانده می‌شود:

```js
{ streams: [] }
```

---

### Export افزونه

پس از تعریف handler:

```js
const addonInterface = builder.getInterface();
module.exports = addonInterface;
```

این export برای سناریوهایی لازم است که افزونه توسط یک میزبان دیگر import می‌شود، نه اینکه مستقیماً با `node addon.js` اجرا شود.

---

## سرور Express و routeها

سرور Express فقط زمانی اجرا می‌شود که فایل مستقیماً اجرا شود:

```js
if (require.main === module) {
  const { getRouter } = require('stremio-addon-sdk');
  const express = require('express');
  const path = require('path');
  const app = express();
  ...
  app.listen(PORT, ...);
}
```

### routeهای ثبت‌شده

| route | منبع ثبت | توضیح |
|-------|----------|-------|
| `GET /manifest.json` | route سفارشی پروژه | برگرداندن manifest با URL مطلق لوگو |
| `GET /assets/icons/*` | `express.static` | سرو کردن فایل‌های `assets/icons` |
| `GET /stream/movie/{id}.json` | `getRouter(addonInterface)` | streamهای فیلم |
| `GET /stream/series/{id}:{season}:{episode}.json` | `getRouter(addonInterface)` | stream قسمت سریال |
| `GET /` | route ساده پروژه | صفحه معرفی کوتاه و لینک نصب محلی |

در نسخه فعلی route مجزایی برای `/health` وجود ندارد.

### route سفارشی manifest

Stremio برای تصویر manifest به URL مطلق نیاز دارد. به همین دلیل route سفارشی `/manifest.json` قبل از router SDK تعریف شده است:

```js
app.get('/manifest.json', (req, res) => {
  const origin = process.env.PUBLIC_URL
    ? PUBLIC_URL
    : `${req.protocol}://${req.get('host') || `localhost:${PORT}`}`;

  const manifestWithLogo = {
    ...addonInterface.manifest,
    logo: logoUrlFor(origin)
  };

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(manifestWithLogo));
});
```

رفتار:

- اگر `PUBLIC_URL` تنظیم شده باشد، همان استفاده می‌شود.
- اگر تنظیم نشده باشد، origin از `req.protocol` و `Host` درخواست ساخته می‌شود.
- مسیر لوگو همیشه `/assets/icons/logo.png` است.
- ساخت URL مطلق لوگو در هر دو حالت (manifest اولیه و این route) از طریق helper مشترک `logoUrlFor(origin)` انجام می‌شود که `LOGO_PATH` را به origin می‌چسباند.

---

## ساختار خروجی stream

Stremio انتظار دارد پاسخ stream handler چنین ساختاری داشته باشد:

```json
{
  "streams": [
    {
      "name": "1080p • دوبله",
      "title": "S1E3 - 1080p",
      "url": "https://cdn.example.com/video.mkv"
    }
  ]
}
```

### فیلدهای هر stream

| فیلد | توضیح |
|------|-------|
| `name` | نام کوتاه قابل نمایش؛ در کد فعلی معمولاً کیفیت و برچسب دوبله است. |
| `title` | توضیح تکمیلی؛ برای سریال شامل `S{season}E{episode}` و کیفیت است. |
| `url` | لینک مستقیم یا قابل پخش توسط Stremio. |

### نمونه‌های واقعی بر اساس کد فعلی

فیلم معمولی:

```js
{
  name: "1080p",
  title: "1080p",
  url: "https://example.com/movie-1080.mkv"
}
```

فیلم دوبله:

```js
{
  name: "720p • دوبله",
  title: "720p",
  url: "https://example.com/movie-dubbed-720.mp4"
}
```

قسمت سریال:

```js
{
  name: "480p",
  title: "S1E8 - 480p",
  url: "https://example.com/series-s01e08-480.mp4"
}
```

iframe فیلم:

```js
{
  name: "Stream",
  title: "Embedded Stream",
  url: "https://example.com/playlist.m3u8"
}
```

---

## نمونه درخواست‌ها

فرض کنید سرور روی پورت `8000` اجرا شده است.

### بررسی manifest

```bash
curl http://localhost:8000/manifest.json
```

### درخواست stream فیلم

```bash
curl http://localhost:8000/stream/movie/tt1234567.json
```

### درخواست stream سریال

```bash
curl http://localhost:8000/stream/series/tt1234567:1:3.json
```

### بررسی لوگو

```bash
curl -I http://localhost:8000/assets/icons/logo.png
```

---

## نکات استقرار

برای اجرای عمومی افزونه:

1. سرویس باید Node.js `20.18.1+` داشته باشد.
2. `BASE_URL` باید در محیط اجرا تعریف شود.
3. اگر سرویس پشت دامنه عمومی است، `PUBLIC_URL` را تنظیم کنید.
4. پورت باید از متغیر `PORT` میزبان خوانده شود؛ کد این کار را انجام می‌دهد.
5. مسیرهای زیر باید از بیرون قابل دسترسی باشند:

   ```text
   /manifest.json
   /stream/movie/{imdbId}.json
   /stream/series/{imdbId}:{season}:{episode}.json
   /assets/icons/logo.png
   ```

6. برای نصب در Stremio از آدرس زیر استفاده کنید:

   ```text
   stremio://YOUR_DOMAIN/manifest.json
   ```

### نکته درباره `PUBLIC_URL`

اگر `addon.js` مستقیماً با Express همین پروژه اجرا شود و `PUBLIC_URL` تنظیم نشده باشد، route سفارشی manifest از Host درخواست استفاده می‌کند و معمولاً لوگو درست ساخته می‌شود.

اما اگر `addonInterface` توسط یک سرویس دیگر import و serve شود، بهتر است `PUBLIC_URL` حتماً تنظیم شود؛ چون manifest اولیه در زمان ساخت از مقدار `PUBLIC_URL` یا fallback لوکال استفاده می‌کند.

---

## محدودیت‌ها و نکات نگهداری

- افزونه فقط stream provider است و catalog، meta، subtitle یا addon setting ارائه نمی‌کند.
- تطبیق محتوا فقط با `quick-search` و IMDb ID انجام می‌شود؛ fallback مبتنی بر عنوان یا slug در نسخه فعلی وجود ندارد.
- منبع باید endpoint زیر را داشته باشد و پاسخ آن آرایه JSON باشد:

  ```text
  /quick-search?q={imdbId}&sort=modified_at%3Adesc
  ```

- تغییر ساختار HTML منبع می‌تواند extractorها را از کار بیندازد؛ selectorهای حساس:

  ```css
  .download-season
  button[data-bs-toggle="collapse"]
  .series-downloaditems .d-flex
  a.btn-block.btn-default
  .download-list, .download-box, .dl-box
  a[href*=".mkv"], a[href*=".mp4"], a[href*="abrtech"]
  iframe[src]
  ```

- map فصل‌های فارسی فعلاً تا `دهم` را به صورت کلمه‌ای پوشش می‌دهد؛ فصل‌های بالاتر در صورت داشتن عدد، با regex عددی تشخیص داده می‌شوند.
- تشخیص کیفیت heuristic است و به نام فایل، URL یا متن باکس دانلود وابسته است.
- در extractor سریال، fallback فعلی `href.includes('http')` می‌تواند لینک مطلق غیر ویدیویی را هم بپذیرد؛ اگر منبع HTML تغییر کند، بهتر است این شرط محدودتر شود.
- cache، rate limiting و تست خودکار در نسخه فعلی وجود ندارد.
- `player-fa.png` در حال حاضر در manifest استفاده نشده، اما به دلیل static serving از مسیر `/assets/icons/player-fa.png` قابل دریافت است.

---

## عیب‌یابی

### خطای `BASE_URL is not set`

علت: متغیر `BASE_URL` تعریف نشده است.

راه‌حل:

```env
BASE_URL=https://www.example.com
```

سپس برنامه را دوباره اجرا کنید.

---

### quick-search نتیجه نمی‌دهد

موارد زیر را بررسی کنید:

- آیا `BASE_URL` درست است؟
- آیا endpoint زیر در منبع پاسخ می‌دهد؟

  ```text
  {BASE_URL}/quick-search?q=tt1234567&sort=modified_at%3Adesc
  ```

- آیا پاسخ JSON آرایه است؟
- آیا در آیتم‌های پاسخ، فیلد `imdb_id` وجود دارد؟
- آیا مقدار `imdb_id` دقیقاً با شناسه درخواستی برابر است؟

---

### صفحه محتوا parse نمی‌شود

`fetchPage` فقط status `200` و پاسخ رشته‌ای HTML را می‌پذیرد. اگر منبع redirect غیرمنتظره، JSON، صفحه خطا یا HTML محافظت‌شده برگرداند، خروجی stream خالی خواهد شد.

---

### برای فیلم stream پیدا نمی‌شود

selectorهای باکس دانلود را بررسی کنید:

```css
.download-list, .download-box, .dl-box
```

و مطمئن شوید لینک‌ها شامل `.mkv`، `.mp4` یا `abrtech` هستند، یا URL واقعی در `handleDownloadClick(...)` قرار دارد.

---

### برای سریال قسمت درست پیدا نمی‌شود

موارد زیر را بررسی کنید:

- متن فصل شامل `فصل 2`، `Season 2` یا یکی از نام‌های فارسی مثل `دوم` باشد.
- متن قسمت شامل `قسمت 5`، `Episode 5` یا `Ep 5` باشد.
- اگر متن قسمت عدد ندارد، لینک دارای query مثل `?episode=5` باشد.
- ساختار HTML همچنان شامل `.download-season` و `.series-downloaditems .d-flex` باشد.

---

### لوگو در Stremio نمایش داده نمی‌شود

- فایل `assets/icons/logo.png` باید وجود داشته باشد.
- مسیر `/assets/icons/logo.png` باید از بیرون قابل دسترسی باشد.
- در deploy عمومی، `PUBLIC_URL` را روی origin نهایی تنظیم کنید.

---

### `/health` جواب نمی‌دهد

در کد فعلی route سلامت (`/health`) تعریف نشده است. برای health check در سرویس‌های میزبانی می‌توانید فعلاً از `/manifest.json` استفاده کنید یا route جدیدی در Express اضافه کنید.

---

## حمایت از پروژه

اگر این افزونه برایت مفید بوده، حمایت تو کمک می‌کند پروژه پایدارتر، تمیزتر و هماهنگ‌تر با تغییرات منابع ایرانی باقی بماند ❤️

```text
alirostami.com/support
```

با هر حمایت، انگیزه ادامه توسعه، نگهداری و بهبود تجربه کاربران فارسی‌زبان Stremio بیشتر می‌شود.
