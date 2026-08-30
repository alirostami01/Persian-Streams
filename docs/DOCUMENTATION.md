# مستندات فنی Persian Streams Stremio Addon

افزونه Stremio که لینک‌های پخش فیلم و سریال را از یک منبع ایرانی (پیکربندی شده از طریق `BASE_URL` در فایل `.env`) استخراج می‌کند. تمام محتوا شامل زیرنویس فارسی است.

---

## فهرست مطالب

- [نمودار جریان کلی](#نمودار-جریان-کلی)
- [متغیرها و تنظیمات](#متغیرها-و-تنظیمات)
- [تابع‌ها](#تابع‌ها)
  - [fetchTitleFromMeta](#fetchtitlefrommeta)
  - [searchSite](#searchsite)
  - [slugifyTitle](#slugifytitle)
  - [resolveViaQuickSearch](#resolveviaquicksearch)
  - [resolveViaEndpoint](#resolveviaendpoint)
  - [fetchPage](#fetchpage)
  - [detectQuality](#detectquality)
  - [isDubbed](#isdubbed)
  - [extractSeriesStreams](#extractseriesstreams)
  - [extractMovieStreams](#extractmoviestreams)
  - [getStreams (هرдыنه اصلی)](#getstreams)
- [هندلر استرمیو](#هندلر-استرمیو)
- [سرور Express](#سرور-express)
- [نمودار فراخوانی توابع](#نمودار-فراخوانی-توابع)
- [ساختار داده خروجی](#ساختار-داده-خروجی)
- [عیب‌یابی](#عیب‌یابی)

---

## نمودار جریان کلی

```
کاربر در Stremio فیلم/سریالی را انتخاب می‌کند
        │
        ▼
┌─────────────────────────────┐
│  defineStreamHandler        │  ← نقطه ورود از Stremio (SDK)
│  دریافت type + imdbId       │
│  استخراج season/episode     │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│  getStreams()               │  ← هماهنگ‌کننده اصلی
│  ۵ مرحله جستجو + استخراج   │
└─────────────┬───────────────┘
              │
   ┌──────────┼──────────┬──────────────┐
   ▼          ▼          ▼              ▼
resolveVia  resolveVia  searchSite   fetchPage
QuickSearch Endpoint                + extract
(JSON API)  (URL Slug)              Streams
   │          │          │              │
   └──────────┴──────────┴──────┬───────┘
                                ▼
                         لینک‌های ویدیو
                         (URL + کیفیت)
                                │
                                ▼
                         پاسخ به Stremio
```

---

## متغیرها و تنظیمات

### متغیرهای محیطی (`.env`)

| متغیر      | پیش‌فرض     | توضیح                                      |
|------------|-------------|--------------------------------------------|
| `PORT`     | `8000`      | پورت سرور HTTP                             |
| `BASE_URL` | — (اجباری)  | آدرس منبع ایرانی (مثلاً `https://www.example.com`) |

### متغیرهای سراسری

| متغیر            | مقدار / توضیح                                                                 |
|------------------|-------------------------------------------------------------------------------|
| `PORT`           | از `.env` خوانده می‌شود، پیش‌فرض `8000`                                         |
| `BASE_URL`       | آدرس پایه منبع، از `.env` خوانده می‌شود                                         |
| `BASE_HOST`      | هاست (domain) استخراج شده از `BASE_URL` — مثلاً `www.example.com`               |
| `contentUrlRegex`| رجکس داینامیک برای تطبیق صفحات محتوا: `/<id>/<slug>/`                         |
| `client`         | نمونه axios با هدرها و تنایم‌اوت پیش‌فرض برای درخواست‌های HTTP                  |
| `builder`        | نمونه `addonBuilder` از stremio-addon-sdk با منیفست افزونه                     |
| `Persian_Streams`| نام نمایشی افزونه در لیست استریم‌ها                                             |

---

## تابع‌ها

### fetchTitleFromMeta

```javascript
async function fetchTitleFromMeta(type, imdbId) → { name, year } | null
```

**فایل:** `addon.js:76-98`

**عملکرد:**
با استفاده از شناسه IMDb، عنوان و سال ساخت محتوا را از سرویس Cinemeta استرمیو دریافت می‌کند. این اولین قدم در هر درخواست است — بدون عنوان، جستجو در سایت منبع ممکن نیست.

**ورودی:**
- `type`: نوع محتوا (`'movie'` یا `'series'`)
- `imdbId`: شناسه IMDb (مثلاً `tt11198330`)

**خروجی:**
- آبجکت `{ name: "House of the Dragon", year: 2022 }` یا `null`

**منبع داده:**
```
https://v3-cinemeta.strem.io/meta/{type}/{imdbId}.json
```

**فراخوانی شده توسط:** `getStreams`

---

### searchSite

```javascript
async function searchSite(query) → string | null
```

**فایل:** `addon.js:107-151`

**عملکرد:**
در سایت منبع با عبارت جستجو (query) جستجو کرده و بهترین نتیجه را برمی‌گرداند. از الگوریتم امتیازدهی برای رتبه‌بندی نتایج استفاده می‌کند.

**ورودی:**
- `query`: عبارت جستجو (مثلاً `"House of the Dragon"`)

**خروجی:**
- URL صفحه محتوا (مثلاً `https://www.example.com/76906/house-of-the-dragon/`) یا `null`

**الگوریتم:**
1. درخواست GET به `/?s={query}` ارسال می‌شود
2. پاسخ HTML با `cheerio` پردازش می‌شود
3. تمام لینک‌هایی که با الگوی `/<id>/<slug>/` تطبیق پیدا کنند، کاندید می‌شوند
4. هر کاندید بر اساس تعداد توکن‌های query که در slug وجود دارد، امتیاز می‌گیرد
5. بهترین نتیجه (بالاترین امتیاز) برگردانده می‌شود

**استفاده از:** `contentUrlRegex` (رجکس سراسری)

**فراخوانی شده توسط:** `getStreams`

---

### slugifyTitle

```javascript
function slugifyTitle(title) → string
```

**فایل:** `addon.js:158-165`

**عملکرد:**
یک عنوان محتوا را به یک slug سازگار با URL تبدیل می‌کند. این slug برای دسترسی مستقیم به صفحه محتوا استفاده می‌شود.

**ورودی:**
- `title`: عنوان محتوا (مثلاً `"Don't Say Good Luck"`)

**خروجی:**
- slug (مثلاً `dont-say-good-luck`)

**تبدیل‌ها:**
1. حروف به کوچک تبدیل می‌شوند (`toLowerCase`)
2. کوتیشن‌ها و آپاستروف‌ها حذف می‌شوند
3. کاراکترهای غیر الفبایی با خط تیره جایگزین می‌شوند
4. خط‌تیره‌های اضافی ابتدا/انتها حذف می‌شوند
5. خط‌تیره‌های پشت سر هم یکی می‌شوند

**فراخوانی شده توسط:** `resolveViaEndpoint`

---

### resolveViaQuickSearch

```javascript
async function resolveViaQuickSearch(imdbId) → string | null
```

**فایل:** `addon.js:175-207`

**عملکرد:**
دقیق‌ترین روش تطبیق محتوا. از اندپوینت `quick-search` سایت منبع با شناسه IMDb استفاده می‌کند و نتیجه‌ای که `imdb_id` آن با درخواست تطبیق داشته باشد برمی‌گرداند.

**ورودی:**
- `imdbId`: شناسه IMDb

**خروجی:**
- URL صفحه محتوا یا `null`

**مزیت:** چون مستقیماً با شناسه IMDb کار می‌کند، نیازی به تبدیل عنوان به slug نیست و احتمال خطا کمتر است.

**.Endpoint:** `/quick-search?q={imdbId}&sort=modified_at%3Adesc`

**فراخوانی شده توسط:** `getStreams` (اولین انتخاب)

---

### resolveViaEndpoint

```javascript
async function resolveViaEndpoint(title, type) → string | null
```

**فایل:** `addon.js:219-238`

**عملکرد:**
با استفاده از عنوان محتوا (تبدیل شده به slug)، مستقیماً به اندپوینت محتوا درخواست می‌فرستد. رفتار سایت بر اساس نوع محتوا متفاوت است:

- **فیلم:** `/movie/{slug}/` → ریدایرکت 302 به `/{id}/{slug}/` (صفحه محتوا)
- **سریال:** `/series/{slug}/` → مستقیماً صفحه محتوا (HTTP 200)
- **نامعتبر:** ریدایرکت به `/profile/` (تلقی می‌شود = پیدا نشد)

**ورودی:**
- `title`: عنوان محتوا
- `type`: `'movie'` یا `'series'`

**خروجی:**
- URL نهایی صفحه محتوا یا `null`

**استفاده از:** `slugifyTitle`

**فراخوانی شده توسط:** `getStreams` (انتخاب دوم)

---

### fetchPage

```javascript
async function fetchPage(url) → cheerio.Root | null
```

**فایل:** `addon.js:243-255`

**عملکرد:**
یک صفحه HTML را دانلود و با `cheerio` پردازش می‌کند. شیء برگشتی (`$`) امکان جستجوی المان‌ها در DOM را فراهم می‌کند.

**ورودی:**
- `url`: URL صفحه

**خروجی:**
- شیء `cheerio` (operable `$`) یا `null` در صورت خطا

**فراخوانی شده توسط:** `getStreams`

---

### detectQuality

```javascript
function detectQuality(url, context) → string
```

**فایل:** `addon.js:260-279`

**عملکرد:**
کیفیت ویدیو را از روی URL و متن پیرامونی تشخیص می‌دهد. ابتدا متن ترکیبی (URL + context) را بررسی می‌کند، سپس پارامتر `quality` در URL را.

**ورودی:**
- `url`: URL ویدیو
- `context`: متن اضافی (مثلاً متن دکمه یا عنوان اپیزود)

**خروجی:**
- یکی از: `'4K'`, `'1080p'`, `'720p'`, `'480p'`, `'360p'`, `'Unknown'`

**اولویت تشخیص:**
1. `2160` / `4k` / `uhd` → 4K
2. `1080` / `full hd` / `fhd` → 1080p
3. `720` / `hd` → 720p
4. `480` / `sd` → 480p
5. `360` → 360p
6. پارامتر `?quality=...` در URL
7. در غیر این صورت → `'Unknown'`

**فراخوانی شده توسط:** `extractSeriesStreams`, `extractMovieStreams`

---

### isDubbed

```javascript
function isDubbed(text) → boolean
```

**فایل:** `addon.js:287-296`

**عملکرد:**
بررسی می‌کند آیا متن شامل نشانه‌های دوبله فارسی است یا خیر.

**ورودی:**
- `text`: متن بررسی (متن دکمه، نام فایل، URL ویدیو)

**خروجی:**
- `true` اگر دوبله باشد، `false` در غیر این صورت

**عبارات جستجو:**
- `dubbed`
- `dooble`
- `دوبله`
- `farsi dub`
- `persian dub`

**فراخوانی شده توسط:** `extractSeriesStreams`, `extractMovieStreams`

---

### extractSeriesStreams

```javascript
function extractSeriesStreams($, targetSeason, targetEpisode) → Stream[]
```

**فایل:** `addon.js:301-411`

**عملکرد:**
از صفحه HTML یک سریال، لینک‌های پخش برای فصل و قسمت مشخص استخراج می‌کند. این پیچیده‌ترین تابع در برنامه است چون ساختار HTML سایت منبع را تحلیل می‌کند.

**ورودی:**
- `$`: شیء cheerio (DOM پردازش شده)
- `targetSeason`: شماره فصل مورد نظر
- `targetEpisode`: شماره قسمت مورد نظر

**خروجی:**
- آرایه‌ای از آبجکت‌های Stream

**مراحل استخراج:**

#### ۱. شناسایی فصل‌ها
- المان‌های `.download-season` حاوی اطلاعات فصل هستند
- شماره فصل از متن دکمه خوانده می‌شود
- پشتیبانی از اعداد فارسی: اول=۱, دوم=۲, سوم=۳, ... دهم=۱۰
- پشتیبانی از الگوهای `season 3` یا `فصل ۳`

#### ۲. شناسایی اپیزودها
- المان‌های `.series-downloaditems .d-flex` حاوی اپیزودها هستند
- شماره اپیزود از متن دکمه خوانده می‌شود
- پشتیبانی از `قسمت ۵` یا `episode 5` یا `ep 5`
- اگر متن عدد نداشت، از پارامتر `?episode=` در URL خوانده می‌شود

#### ۳. استخراج لینک ویدیو (۳ استراتژی)
- **استراتژی ۱:** هندلر `onclick` روی دکمه (`handleDownloadClick('URL')`)
- **استراتژی ۲:** لینک مستقیم `href` حاوی `.mkv` یا `.mp4`
- **استراتژی ۳:** بررسی المان‌های خواهر (`a[onclick]`)

#### ۴. تشخیص کیفیت و دوبله
- `detectQuality()` کیفیت را تشخیص می‌دهد
- `isDubbed()` برچسب دوبله را اضافه می‌کند

**فراخوانی شده توسط:** `getStreams` (فقط برای سریال)

---

### extractMovieStreams

```javascript
function extractMovieStreams($) → Stream[]
```

**فایل:** `addon.js:416-461`

**عملکرد:**
از صفحه HTML یک فیلم، لینک‌های پخش را استخراج می‌کند.

**ورودی:**
- `$`: شیء cheerio (DOM پردازش شده)

**خروجی:**
- آرایه‌ای از آبجکت‌های Stream

**مراحل:**

#### ۱. باکس‌های دانلود
- المان‌های `.download-list`, `.download-box`, `.dl-box` بررسی می‌شوند
- لینک‌هایی با پسوند `.mkv` یا `.mp4` استخراج می‌شوند
- اگر هندلر `onclick` وجود داشته باشد، URL واقعی از آن خوانده می‌شود
- کیفیت و دوبله تشخیص داده می‌شود

#### ۲. iframeها
- المان‌های `iframe[src]` حاوی `.mp4` یا `.m3u8` بررسی می‌شوند
- این‌ها استریم‌های جاسازی شده هستند

**فراخوانی شده توسط:** `getStreams` (فقط برای فیلم)

---

### getStreams

```javascript
async function getStreams(type, imdbId, season, episode) → Stream[]
```

**فایل:** `addon.js:466-539`

**عملکرد:**
هماهنگ‌کننده اصلی برنامه. تمام مراحل جستجو، تطبیق و استخراج را اجرا می‌کند. این تابع точته ورود اصلی منطق برنامه است.

**ورودی:**
- `type`: `'movie'` یا `'series'`
- `imdbId`: شناسه IMDb
- `season`: شماره فصل (فقط برای سریال)
- `episode`: شماره قسمت (فقط برای سریال)

**خروجی:**
- آرایه‌ای از آبجکت‌های Stream (ممکن است خالی باشد)

**۵ مرحله:**

#### مرحله ۱: دریافت متادیتا
```
fetchTitleFromMeta(type, imdbId) → { name, year }
```
عنوان و سال از سرویس Cinemeta استرمیو دریافت می‌شود.

#### مرحله ۲: تطبیق از طریق quick-search (اولویت اول)
```
resolveViaQuickSearch(imdbId) → URL | null
```
دقیق‌ترین روش — مستقیماً با شناسه IMDb.

#### مرحله ۳: تطبیق از طریق اندپوینت مستقیم (اولویت دوم)
```
resolveViaEndpoint(title, type) → URL | null
```
با استفاده از slug عنوان.

#### مرحله ۴: تطبیق از طریق جستجو (اولویت سوم)
```
searchSite(query) → URL | null
```
با چند عبارت جستجو (عنوان، عنوان+سال، عنوان با کوتیشن فارسی).

#### مرحله ۵: استخراج لینک‌ها
```
fetchPage(contentUrl) → $ | null
```
صفحه دانلود و پردازش می‌شود:
- اگر سریال → `extractSeriesStreams($, season, episode)`
- اگر فیلم → `extractMovieStreams($)`

---

## هندلر استرمیو

```javascript
builder.defineStreamHandler((args) => { ... })
```

**فایل:** `addon.js:542-564`

**عملکرد:**
نقطه ورود از Stremio. SDK استرمیو این تابع را با آرگومان‌های درخواست کاربر فراخوانی می‌کند.

**آرگومان‌های دریافتی:**
```javascript
{
  type: 'movie' | 'series',
  id: 'tt11198330' | 'tt11198330:1:3'  // برای سریال: imdbId:season:episode
}
```

**پردازش:**
1. اگر سریال باشد، `id` با `:` جدا شده و `imdbId`, `season`, `episode` استخراج می‌شوند
2. `getStreams` فراخوانی می‌شود
3. نتیجه به صورت `{ streams: [...] }` برگردانده می‌شود

---

## سرور Express

**فایل:** `addon.js:570-613`

فقط زمانی اجرا می‌شود که فایل به صورت مستقیم اجرا شود (`node addon.js`).

### روت‌ها

| روت                       | توضیح                                      |
|---------------------------|--------------------------------------------|
| `GET /manifest.json`      | منیفست افزونه با لوگوی مطلق               |
| `GET /`                   | صفحه اصلی با لینک نصب                     |
| `GET /assets/icons/*`     | سرو فایل‌های استاتیک (لوگو)                |
| `GET /:resource/:type/:id.json` | هندلر استریم (از getRouter SDK)   |

### روت سفارشی manifest.json

چون Stremio به URL مطلق برای لوگو نیاز دارد، روت سفارشی `manifest.json` قبل از `getRouter` SDK ثبت شده و `logo` را با URL مطلق بر اساس درخواست تنظیم می‌کند:

```javascript
app.get('/manifest.json', (req, res) => {
  const protocol = req.protocol || 'http';
  const host = req.get('host') || `localhost:${PORT}`;
  const manifestWithLogo = {
    ...addonInterface.manifest,
    logo: `${protocol}://${host}/assets/icons/logo.png`
  };
  res.json(manifestWithLogo);
});
```

---

## نمودار فراخوانی توابع

```
defineStreamHandler (SDK callback)
  │
  └─► getStreams(type, imdbId, season, episode)
        │
        ├─► fetchTitleFromMeta(type, imdbId)
        │     └─► HTTP GET → v3-cinemeta.strem.io
        │
        ├─► resolveViaQuickSearch(imdbId)          [اولویت ۱]
        │     └─► HTTP GET → /quick-search?q=...
        │
        ├─► resolveViaEndpoint(title, type)         [اولویت ۲]
        │     ├─► slugifyTitle(title)
        │     └─► HTTP GET → /movie/{slug}/ یا /series/{slug}/
        │
        ├─► searchSite(query)                       [اولویت ۳]
        │     ├─► HTTP GET → /?s={query}
        │     ├─► cheerio.load() → پردازش HTML
        │     └─► contentUrlRegex.test() → فیلتر نتایج
        │
        ├─► fetchPage(contentUrl)
        │     ├─► HTTP GET → صفحه محتوا
        │     └─► cheerio.load() → پردازش HTML
        │
        └─► یکی از:
              ├─► extractSeriesStreams($, season, episode)   [series]
              │     ├─► detectQuality(url, context)
              │     └─► isDubbed(text)
              │
              └─► extractMovieStreams($)                     [movie]
                    ├─► detectQuality(url, context)
                    └─► isDubbed(text)
```

---

## ساختار داده خروجی

### Stream Object

```javascript
{
  name: "Persian_Streams\n1080p • Iranian Source • دوبله",
  title: "S3E6 - 1080p\nPersian Subtitles",
  url: "https://cdn.example.com/video/file.mkv"
}
```

| فیلد     | توضیح                                                                 |
|----------|-----------------------------------------------------------------------|
| `name`   | نام نمایشی در لیست استریم‌ها (شامل نام افزونه، کیفیت و وضعیت دوبله) |
| `title`  | عنوان جزئی‌تر (شامل فصل/قسمت و کیفیت)                                |
| `url`    | لینک مستقیم ویدیو (.mkv, .mp4, .m3u8)                                |

---

## عیب‌یابی

### هیچ استریمی پیدا نشد
- آیا `BASE_URL` در `.env` تنظیم شده؟
- آیا شناسه IMDb در سایت منبع وجود دارد؟
- لاگ سرور را بررسی کنید — مراحل جستجو نمایش داده می‌شوند

### لوگو نمایش داده نمی‌شود
- آیا فایل `assets/icons/logo.png` وجود دارد؟
- آیا URL لوگو در منیفست مطلق است؟ (`http://...`)

### خطای Connection Refused
- آیا سرور در حال اجراست؟ (`node addon.js`)
- آیا پورت آزاد است؟

### کیفیت نامشخص نمایش داده می‌شود
- URL ویدیو ممکن است شامل اطلاعات کیفیت نباشد
- `detectQuality` فقط متن‌های شناخته شده را تشخیص می‌دهد
