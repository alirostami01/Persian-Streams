<p align="center">
  <img src="assets/icons/logo.png" alt="Iranian Provider Media" width="220" />
</p>

<h1 align="center">Iranian Provider Media</h1>

<p align="center">
  افزونه غیررسمی استرمیو (Stremio) برای پخش فیلم و سریال‌های ایرانی با زیرنویس فارسی
</p>

<p align="center">
  اگر این افزونه برایت مفید بوده، با حمایتت کمک کن پروژه زنده، سریع و به‌روز بماند ❤️<br />
  <strong>حمایت از پروژه:</strong>
  <a href="https://alirostami.com/support">alirostami.com/support</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Stremio-Addon-blue?style=flat-square" alt="Stremio Addon" />
  <img src="https://img.shields.io/badge/Node.js-20.18.1%2B-green?style=flat-square" alt="Node.js" />
  <img src="https://img.shields.io/badge/Manifest-v1.2.0-purple?style=flat-square" alt="Manifest Version" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="License" />
</p>

---

## 📖 معرفی

**Iranian Provider Media** یک افزونه غیررسمی برای [Stremio](https://www.stremio.com/) است که با نام نمایشی **Persian Streams** در استرمیو ثبت می‌شود. این سرویس لینک‌های پخش فیلم و سریال را از یک منبع رسانه‌ای ایرانی که از طریق متغیر محیطی `BASE_URL` تنظیم می‌شود، دریافت و به فرمت استاندارد استرمیو تبدیل می‌کند.

نسخه فعلی کد بر پایه شناسه IMDb کار می‌کند: افزونه شناسه `tt...` دریافتی از استرمیو را به اندپوینت `quick-search` منبع می‌فرستد، نتیجه‌ای را که `imdb_id` آن دقیقاً با درخواست برابر است انتخاب می‌کند، صفحه محتوا را با Cheerio می‌خواند و لینک‌های قابل پخش را برای فیلم یا قسمت سریال استخراج می‌کند.

> ⚠️ این پروژه هیچ فایل ویدیویی، زیرنویس یا محتوای رسانه‌ای را میزبانی نمی‌کند. افزونه فقط لینک‌هایی را که منبع پیکربندی‌شده در اختیار می‌گذارد، پردازش می‌کند. مسئولیت رعایت قوانین کپی‌رایت و قوانین محلی بر عهده کاربر است.

---

## ✨ قابلیت‌ها

- 🎬 **پشتیبانی از فیلم و سریال** از طریق resource نوع `stream`
- 🔎 **تطبیق مستقیم با IMDb** با استفاده از `/quick-search?q={imdbId}`
- 📺 **استخراج فصل و قسمت سریال** از شناسه‌های استاندارد استرمیو مثل `tt1234567:1:3`
- 🔢 **پشتیبانی از اعداد فارسی و عربی-هندی** برای تشخیص فصل و قسمت
- 🎞️ **تشخیص کیفیت** از روی URL و متن پیرامونی: `4K`، `1080p`، `720p`، `480p`، `360p` یا `Unknown`
- 🔊 **تشخیص نسخه دوبله** با کلمات کلیدی مثل `Dubbed`، `Dooble`، `دوبله`، `Farsi Dub` و `Persian Dub`
- 🧩 **استخراج لینک از ساختارهای رایج صفحه دانلود** شامل `handleDownloadClick(...)`، لینک مستقیم و `iframe`
- 🖼️ **لوگوی مطلق در manifest** با پشتیبانی از `PUBLIC_URL` یا تشخیص خودکار میزبان درخواست
- 📦 **قابل اجرا به دو شکل**: اجرای مستقیم با Express یا import به‌عنوان interface افزونه استرمیو

---

## 🗂️ ساختار فعلی پروژه

```text
.
├── addon.js                 # منطق کامل افزونه، manifest، هندلر stream و سرور Express
├── package.json             # اسکریپت‌ها و وابستگی‌های Node.js
├── package-lock.json        # نسخه‌های قفل‌شده وابستگی‌ها
├── README.md                # راهنمای کاربر و راه‌اندازی
├── docs/
│   └── DOCUMENTATION.md     # مستندات فنی مطابق ساختار فعلی کد
├── assets/
│   └── icons/
│       ├── logo.png         # لوگوی استفاده‌شده در manifest
│       └── player-fa.png    # فایل استاتیک موجود در پروژه؛ فعلاً در manifest استفاده نشده است
└── UNUSED_CODE_REPORT.md    # گزارش تحلیل کدهای بلااستفاده/قدیمی
```

---

## 🚀 نصب و راه‌اندازی محلی

### پیش‌نیازها

- [Node.js](https://nodejs.org/) نسخه `20.18.1` یا بالاتر
  - دلیل: نسخه قفل‌شده `cheerio` در `package-lock.json` به Node.js جدید نیاز دارد.
- npm
- برنامه Stremio برای تست نصب افزونه

### ۱. دریافت کد

```bash
git clone https://github.com/alirostami01/iranian-provider-media.git
cd iranian-provider-media
```

### ۲. نصب وابستگی‌ها

```bash
npm install
```

### ۳. ساخت فایل `.env`

در ریشه پروژه یک فایل `.env` بسازید:

```env
PORT=8000
BASE_URL=https://www.example.com
# برای استقرار عمومی یا زمانی که addon.js توسط یک میزبان دیگر import می‌شود:
# PUBLIC_URL=https://your-addon-domain.example
```

| متغیر | وضعیت | توضیح |
|-------|-------|-------|
| `BASE_URL` | اجباری | آدرس پایه منبع ایرانی. اگر تنظیم نشود، برنامه با خطا متوقف می‌شود. |
| `PORT` | اختیاری | پورت سرور Express. مقدار پیش‌فرض `8000` است. |
| `PUBLIC_URL` | اختیاری | آدرس عمومی افزونه برای ساخت URL مطلق لوگو در manifest؛ برای Deploy توصیه می‌شود. |

> `BASE_URL` را بدون اسلش انتهایی هم می‌توان وارد کرد. کد برای routeهای داخلی از مسیرهای نسبی مثل `/quick-search` استفاده می‌کند.

### ۴. اجرای برنامه

اجرای معمولی:

```bash
npm start
```

یا اجرای توسعه با watch mode:

```bash
npm run dev
```

خروجی موفق شبیه این خواهد بود:

```text
===========================================
Persian Streams Stremio Addon (Iranian Source)
===========================================
Server running on port 8000
Manifest: http://localhost:8000/manifest.json
Install: stremio://localhost:8000/manifest.json
===========================================
```

### ۵. نصب در Stremio

برای اجرای محلی، این آدرس را در Stremio باز کنید:

```text
stremio://localhost:8000/manifest.json
```

یا ابتدا manifest را در مرورگر بررسی کنید:

```text
http://localhost:8000/manifest.json
```

---

## ☁️ استقرار (Deployment)

این پروژه یک برنامه Node.js/Express است و می‌تواند روی VPS، Docker، Railway، Render، Fly.io، Heroku یا هر میزبان Node.js دیگری اجرا شود.

چک‌لیست استقرار:

1. وابستگی‌ها را با `npm install` نصب کنید.
2. دستور اجرا را روی `npm start` یا `node addon.js` بگذارید.
3. `BASE_URL` را در Environment Variables تنظیم کنید.
4. اگر افزونه آدرس عمومی دارد، `PUBLIC_URL` را برابر origin نهایی قرار دهید؛ مثال:

   ```env
   PUBLIC_URL=https://stremio.example.com
   ```

5. آدرس نصب بعد از استقرار:

   ```text
   stremio://YOUR_DOMAIN/manifest.json
   ```

> اگر پشت reverse proxy اجرا می‌کنید، مطمئن شوید مسیرهای `/manifest.json`، `/stream/...` و `/assets/icons/logo.png` قابل دسترسی هستند.

---

## 🎯 نحوه استفاده

بعد از نصب افزونه در Stremio:

1. یک فیلم یا سریال دارای شناسه IMDb را باز کنید.
2. Stremio درخواست stream را به افزونه می‌فرستد.
3. افزونه با شناسه IMDb در منبع پیکربندی‌شده جستجو می‌کند.
4. برای فیلم‌ها، لینک‌های دانلود/پخش صفحه فیلم استخراج می‌شود.
5. برای سریال‌ها، فصل و قسمت انتخاب‌شده پیدا شده و لینک همان اپیزود برگردانده می‌شود.
6. لینک‌ها با نام کیفیت و در صورت تشخیص، برچسب `• دوبله` در لیست استریم‌ها نمایش داده می‌شوند.

---

## 🔌 مسیرها و API

| مسیر | توضیح |
|------|-------|
| `GET /` | صفحه ساده معرفی افزونه و لینک نصب محلی |
| `GET /manifest.json` | manifest افزونه با URL مطلق لوگو |
| `GET /assets/icons/logo.png` | لوگوی افزونه |
| `GET /stream/movie/{imdbId}.json` | دریافت streamهای فیلم؛ مثال: `/stream/movie/tt1234567.json` |
| `GET /stream/series/{imdbId}:{season}:{episode}.json` | دریافت stream یک قسمت سریال؛ مثال: `/stream/series/tt1234567:1:3.json` |

> در نسخه فعلی route جداگانه‌ای به نام `/health` در کد وجود ندارد.

---

## ⚙️ خلاصه عملکرد فنی

جریان اصلی در `addon.js` به این شکل است:

```text
Stremio request
   ↓
defineStreamHandler(args)
   ↓
getStreams(type, imdbId, season, episode)
   ↓
resolveViaQuickSearch(imdbId)
   ↓
fetchPage(contentUrl)
   ↓
extractMovieStreams($) یا extractSeriesStreams($, season, episode)
   ↓
{ streams: [...] }
```

جزئیات مهم:

- تنها راه تطبیق محتوا در نسخه فعلی، `quick-search` مبتنی بر IMDb است.
- افزونه catalog یا meta ارائه نمی‌کند؛ فقط resource نوع `stream` دارد.
- منبع باید خروجی quick-search را به صورت آرایه JSON با فیلدهای `imdb_id` و `url` برگرداند.
- لینک‌های فیلم از `.download-list`، `.download-box` و `.dl-box` خوانده می‌شوند.
- لینک‌های سریال از `.download-season` و `.series-downloaditems .d-flex` خوانده می‌شوند.
- کیفیت با بررسی URL decode‌شده و متن دکمه/باکس تشخیص داده می‌شود.
- در صورت خطا یا پیدا نشدن محتوا، پاسخ افزونه به صورت `{ "streams": [] }` خواهد بود.

برای توضیحات دقیق‌تر تابع‌ها و ساختار داخلی، فایل [docs/DOCUMENTATION.md](docs/DOCUMENTATION.md) را ببینید.

---

## 🐛 عیب‌یابی

### برنامه اجرا نمی‌شود و پیام `BASE_URL is not set` می‌بینم

فایل `.env` وجود ندارد یا `BASE_URL` در آن تعریف نشده است. مقدار را اضافه کنید و دوباره برنامه را اجرا کنید.

### استریمی نمایش داده نمی‌شود

- محتوا ممکن است در منبع پیکربندی‌شده وجود نداشته باشد.
- خروجی `/quick-search` ممکن است شامل `imdb_id` مطابق نباشد.
- ساختار HTML صفحه منبع ممکن است تغییر کرده باشد.
- لاگ‌های سرور را بررسی کنید؛ مراحل `Quick-search`، `Resolved`، `Fetch` و تعداد streamها چاپ می‌شود.

### لوگو در Stremio نمایش داده نمی‌شود

- مطمئن شوید مسیر `/assets/icons/logo.png` از بیرون قابل دسترسی است.
- در استقرار عمومی، `PUBLIC_URL` را تنظیم کنید تا URL لوگو مطلق و درست باشد.

### لینک نصب روی صفحه اصلی هنوز localhost است

صفحه `/` فقط یک صفحه ساده کمکی است و لینک نصب آن در کد به `localhost` اشاره می‌کند. برای نصب نسخه Deploy شده، مستقیماً از آدرس عمومی خودتان استفاده کنید:

```text
stremio://YOUR_DOMAIN/manifest.json
```

---

## 🤝 مشارکت

Pull Requestها و Issueها برای بهبود استخراج لینک، سازگاری با ساختارهای HTML جدید، افزودن تست و بهبود مستندات خوشحال‌کننده است. قبل از تغییر منطق استخراج، ساختار فعلی در [docs/DOCUMENTATION.md](docs/DOCUMENTATION.md) را مطالعه کنید.

---

## 📄 مجوز

مجوز پروژه در `package.json` برابر `MIT` اعلام شده است. اگر این پروژه را منتشر یا fork می‌کنید، بهتر است متن کامل مجوز MIT را نیز در فایل `LICENSE` نگه دارید.

---

<p align="center">
  ساخته شده با ❤️ برای جامعه فارسی‌زبان Stremio<br />
  حمایت از ادامه مسیر: <a href="https://alirostami.com/support">alirostami.com/support</a>
</p>
