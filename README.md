<p align="center">
  <img src="assets/icons/logo.png" alt="Persian Streams" width="220" />
</p>

<h1 align="center">Persian Streams</h1>

<p align="center">
  افزونه غیررسمی Stremio برای دریافت لینک‌های پخش فیلم و سریال از ارائه‌دهنده‌های رسانه‌ای ایرانی
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Stremio-Addon-blue?style=flat-square" alt="Stremio Addon" />
  <img src="https://img.shields.io/badge/Node.js-18%2B-green?style=flat-square" alt="Node.js" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="License" />
  <img src="https://img.shields.io/badge/Persian-Subtitles-orange?style=flat-square" alt="Persian Subtitles" />
</p>

---

## 📖 معرفی

**Persian Streams** یک افزونه غیررسمی برای [Stremio](https://www.stremio.com/) است که با دریافت شناسه IMDb از Stremio، صفحه محتوای متناظر را در منبع ایرانی تنظیم‌شده پیدا می‌کند و لینک‌های مستقیم پخش/دانلود را به Stremio برمی‌گرداند.

منبع داده در کد ثابت نیست و از طریق متغیر محیطی `BASE_URL` تنظیم می‌شود؛ برای نمونه می‌توان آن را روی دامنه‌هایی مثل `https://www.f2my.top` قرار داد، در صورتی که ساختار HTML و API آن با استخراج‌کننده فعلی سازگار باشد.

> ⚠️ این پروژه فقط جنبه آموزشی دارد. افزونه هیچ محتوایی را میزبانی نمی‌کند و صرفاً لینک‌هایی را که از منبع پیکربندی‌شده دریافت می‌شوند به Stremio ارائه می‌دهد. مسئولیت رعایت قوانین محلی و حقوق نشر با کاربر است.

---

## ✨ قابلیت‌های فعلی

- 🎬 پشتیبانی از دو نوع محتوای Stremio: `movie` و `series`
- 🆔 تطبیق محتوا بر اساس IMDb ID از طریق اندپوینت `quick-search` منبع
- 🎞️ استخراج لینک‌های مستقیم ویدیو از صفحه دانلود فیلم و سریال
- 📺 انتخاب دقیق فصل و قسمت برای سریال‌ها (`tt...:season:episode`)
- 🔍 ارسال کیفیت دقیق اعلام‌شده در صفحه منبع، مثل `WEB-DL 4K 2160p 10bit HDR`، بدون پیشوند `کیفیت :`
- 🧬 استخراج اطلاعات انکودر در صورت وجود، مثل `encoder: PSA`، و نمایش آن در `title` استریم
- 🔁 تشخیص کیفیت از روی URL و متن اطراف لینک به‌عنوان fallback: `4K`، `1080p`، `720p`، `480p`، `360p`
- 🔊 تشخیص نسخه‌های دوبله با عبارت‌هایی مثل `dubbed`، `dooble`، `دوبله`، `farsi dub` و `persian dub`
- 🧩 پشتیبانی از لینک‌های داخل `onclick`، لینک‌های مستقیم `href` و بعضی `iframe`ها
- 🖼️ سرو لوگو از مسیر محلی و تزریق URL مطلق لوگو در `manifest.json`

---

## 🧱 تکنولوژی‌ها و وابستگی‌ها

- Node.js و npm
- Express
- Stremio Addon SDK
- Axios
- Cheerio
- dotenv

---

## 🚀 نصب و راه‌اندازی محلی

### پیش‌نیازها

- [Node.js](https://nodejs.org/) نسخه ۱۸ یا بالاتر پیشنهاد می‌شود
- npm
- Stremio Desktop یا یک کلاینت سازگار با افزونه‌های Stremio

### ۱. دریافت پروژه

```bash
git clone https://github.com/alirostami01/iranian-provider-media.git
cd iranian-provider-media
```

### ۲. نصب وابستگی‌ها

```bash
npm install
```

### ۳. ساخت فایل محیطی

در ریشه پروژه یک فایل `.env` بسازید:

```env
PORT=8000
BASE_URL=https://www.f2my.top
```

| متغیر | وضعیت | توضیح |
|---|---|---|
| `PORT` | اختیاری | پورتی که سرور HTTP روی آن اجرا می‌شود. مقدار پیش‌فرض: `8000` |
| `BASE_URL` | اجباری | آدرس پایه منبع ایرانی که لینک‌ها از آن استخراج می‌شوند |

> اگر `BASE_URL` تنظیم نشده باشد، برنامه هنگام اجرا متوقف می‌شود و پیام خطا نمایش می‌دهد.

### ۴. اجرای افزونه

```bash
npm start
```

یا برای توسعه با حالت watch:

```bash
npm run dev
```

پس از اجرا، خروجی مشابه زیر نمایش داده می‌شود:

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

## ➕ نصب در Stremio

بعد از اجرای سرور، یکی از روش‌های زیر را استفاده کنید:

1. آدرس زیر را در مرورگر یا Stremio باز کنید:

   ```text
   stremio://localhost:8000/manifest.json
   ```

2. یا در مرورگر ابتدا منیفست را بررسی کنید:

   ```text
   http://localhost:8000/manifest.json
   ```

در صورت استقرار روی دامنه عمومی، به‌جای `localhost:8000` دامنه خود را قرار دهید:

```text
stremio://YOUR_DOMAIN/manifest.json
```

---

## 🔌 مسیرهای HTTP

| مسیر | توضیح |
|---|---|
| `GET /` | صفحه ساده معرفی افزونه و لینک نصب محلی |
| `GET /manifest.json` | منیفست افزونه با URL مطلق لوگو |
| `GET /assets/icons/logo.png` | لوگوی افزونه |
| `GET /stream/movie/{imdbId}.json` | دریافت استریم‌های فیلم، مثل `tt1234567` |
| `GET /stream/series/{imdbId}:{season}:{episode}.json` | دریافت استریم‌های یک قسمت سریال، مثل `tt1234567:1:2` |

---

## ⚙️ نحوه عملکرد کد

جریان اصلی در فایل `addon.js` پیاده‌سازی شده است:

1. **دریافت درخواست از Stremio**
   - `defineStreamHandler` نوع محتوا (`movie` یا `series`) و شناسه را دریافت می‌کند.
   - برای سریال، فصل و قسمت از شناسه‌ای با قالب `imdbId:season:episode` جدا می‌شود.

2. **دریافت متادیتا از Cinemeta**
   - تابع `fetchTitleFromMeta` نام و سال محتوا را از سرویس `v3-cinemeta.strem.io` دریافت می‌کند.
   - در نسخه فعلی، این متادیتا برای لاجیک اصلی تطبیق استفاده مستقیم ندارد، اما در جریان درخواست خوانده می‌شود و برای توسعه‌های بعدی قابل استفاده است.

3. **پیدا کردن صفحه محتوا در منبع**
   - تابع `resolveViaQuickSearch` درخواست زیر را به منبع می‌فرستد:

     ```text
     /quick-search?q={imdbId}&sort=modified_at%3Adesc
     ```

   - اگر نتیجه‌ای با `imdb_id` برابر با شناسه درخواستی پیدا شود، URL همان محتوا انتخاب می‌شود.
   - اگر URL به مسیر `/profile/` اشاره کند، به‌عنوان نتیجه نامعتبر نادیده گرفته می‌شود.

4. **دانلود و پردازش HTML صفحه محتوا**
   - تابع `fetchPage` صفحه را با `axios` دریافت و با `cheerio` پردازش می‌کند.

5. **استخراج استریم‌ها**
   - برای فیلم‌ها: `extractMovieStreams`
   - برای سریال‌ها: `extractSeriesStreams`

---

## 🎬 استخراج استریم فیلم

برای فیلم‌ها، کد این کانتینرها را بررسی می‌کند:

- `.download-list`
- `.download-box`
- `.dl-box`

سپس لینک‌هایی را استخراج می‌کند که شامل یکی از موارد زیر باشند:

- `.mkv`
- `.mp4`
- `abrtech`
- لینک‌هایی که در `onclick` با الگوی `handleDownloadClick('URL')` قرار گرفته‌اند

همچنین `iframe[src]`هایی که به `.mp4` یا `.m3u8` اشاره کنند به‌عنوان استریم جاسازی‌شده برگردانده می‌شوند.

---

## 📺 استخراج استریم سریال

برای سریال‌ها، کد ابتدا فصل هدف را در کانتینرهای `.download-season` پیدا می‌کند و سپس قسمت هدف را در `.series-downloaditems .d-flex` جستجو می‌کند.

تشخیص فصل از موارد زیر انجام می‌شود:

- ترتیب کانتینر فصل در صفحه
- واژه‌های فارسی مثل `اول`، `دوم`، `سوم` تا `دهم`
- الگوهای متنی مثل `season 2` یا `فصل 2`

تشخیص قسمت از موارد زیر انجام می‌شود:

- ترتیب آیتم قسمت در صفحه
- الگوهای `قسمت 5`، `episode 5` یا `ep 5`
- پارامتر `episode` در URL، در صورت وجود

برای هر قسمت، لینک ویدیو از `onclick` یا `href` استخراج می‌شود.

---

## 🧾 قالب پاسخ استریم

هر استریم خروجی به Stremio به شکل زیر است:

```json
{
  "name": "WEB-DL 4K 2160p 10bit HDR • دوبله",
  "title": "S1E2 - WEB-DL 4K 2160p 10bit HDR • encoder: PSA",
  "url": "https://example.com/video/file.mkv"
}
```

اگر در متن آیتم دانلود عبارتی مثل `کیفیت : WEB-DL 4K 2160p 10bit HDR` وجود داشته باشد، پیشوند `کیفیت :` حذف می‌شود و فقط مقدار کیفیت به Stremio ارسال می‌شود. فیلد `name` فقط شامل فرمت/کیفیت و وضعیت دوبله است و اطلاعات اضافی مثل `encoder` یا عبارت‌های نامرتبط مثل `میانگین امتیاز` وارد آن نمی‌شود.

اگر `انکودر : PSA` یا `Encoder: PSA` پیدا شود، به شکل `encoder: PSA` فقط در `title` استریم اضافه می‌شود. برای فیلم‌ها، `title` معمولاً کیفیت و انکودر است؛ برای سریال‌ها، شماره فصل/قسمت هم در `title` قرار می‌گیرد.

---

## ☁️ استقرار

این پروژه روی هر سرویس پشتیبان Node.js قابل اجراست؛ مثل VPS، Railway، Render یا سرویس‌های مشابه.

تنظیمات ضروری:

1. نصب وابستگی‌ها با `npm install`
2. تنظیم Start Command روی:

   ```bash
   npm start
   ```

3. تعریف متغیرهای محیطی:
   - `BASE_URL`
   - `PORT` در صورت نیاز سرویس میزبان

برای اجرا با PM2 روی سرور شخصی:

```bash
npm install -g pm2
pm2 start addon.js --name persian-streams
pm2 save
```

---

## 🧪 عیب‌یابی

### برنامه اجرا نمی‌شود

- مطمئن شوید `.env` ساخته شده و `BASE_URL` مقدار دارد.
- وابستگی‌ها را دوباره نصب کنید:

  ```bash
  npm install
  ```

- بررسی کنید پورت انتخابی آزاد باشد.

### هیچ استریمی پیدا نمی‌شود

- ممکن است محتوای مورد نظر در منبع تنظیم‌شده موجود نباشد.
- ممکن است `quick-search` منبع، آن IMDb ID را برنگرداند.
- ساختار HTML منبع ممکن است تغییر کرده باشد و نیاز به اصلاح selectorها باشد.
- لاگ‌های سرور را بررسی کنید؛ مراحل درخواست در خروجی کنسول چاپ می‌شوند.

### کیفیت `Unknown` نمایش داده می‌شود

- URL یا متن لینک شامل نشانه‌های قابل تشخیص کیفیت نیست.
- تابع `detectQuality` فقط الگوهای رایج مثل `2160`، `4k`، `1080`، `720`، `480` و `360` را تشخیص می‌دهد.

### لوگو در Stremio نمایش داده نمی‌شود

- وجود فایل زیر را بررسی کنید:

  ```text
  assets/icons/logo.png
  ```

- مسیر `/manifest.json` باید مقدار `logo` را به صورت URL مطلق برگرداند.

---

## 📁 ساختار پروژه

```text
.
├── addon.js                 # منطق اصلی افزونه و سرور Express
├── package.json             # اسکریپت‌ها و وابستگی‌ها
├── package-lock.json
├── assets/
│   └── icons/
│       ├── logo.png
│       └── player-fa.png
└── docs/
    └── DOCUMENTATION.md
```

---

## 👤 نویسنده

- Ali Rostami
- Website: `alirostami.com/support`
- GitHub: `https://github.com/alirostami01/iranian-provider-media`
- Email: `rostami.ali@gmail.com`

---

## 📄 مجوز

این پروژه تحت مجوز MIT منتشر شده است.

---

<p align="center">
  ساخته شده با ❤️ برای جامعه فارسی‌زبان Stremio
</p>
