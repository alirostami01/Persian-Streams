<p align="center">
  <img src="assets/icons/logo.png" alt="Iranian Provider Media" width="220" />
</p>

<h1 align="center">Persian Streams</h1>

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
  <img src="https://img.shields.io/badge/Cloudflare-Workers-orange?style=flat-square" alt="Cloudflare Workers" />
  <img src="https://img.shields.io/badge/Manifest-v1.2.0-purple?style=flat-square" alt="Manifest Version" />
  <img src="https://img.shields.io/badge/License-Apache--2.0-yellow?style=flat-square" alt="License" />
</p>

---

## 📖 معرفی

**Persian Streams** یک افزونه غیررسمی برای Stremio است که با دریافت شناسه IMDb از استرمیو، صفحه محتوای متناظر را در منبع ایرانیِ تنظیم‌شده پیدا می‌کند و لینک‌های مستقیم پخش/دانلود را به Stremio برمی‌گرداند.

جریان کار نسخه فعلی:

1. Stremio شناسه `tt...` را به افزونه می‌فرستد.
2. افزونه آن را به اندپوینت `quick-search` منبع می‌فرستد و نتیجه‌ای را انتخاب می‌کند که `imdb_id` آن **دقیقاً** با درخواست برابر باشد.
3. صفحه محتوا با Cheerio خوانده می‌شود.
4. لینک‌های قابل پخش برای فیلم یا قسمت سریال استخراج و همراه با برچسب کیفیت، انکودر و دوبله برگردانده می‌شوند.

> ⚠️ این پروژه هیچ فایل ویدیویی، زیرنویس یا محتوای رسانه‌ای را میزبانی نمی‌کند. افزونه فقط لینک‌هایی را که منبع پیکربندی‌شده در اختیار می‌گذارد پردازش می‌کند. مسئولیت رعایت قوانین کپی‌رایت و قوانین محلی بر عهده کاربر است.

---

## ✨ قابلیت‌ها

- 🎬 **پشتیبانی از فیلم و سریال** از طریق resource نوع `stream`
- 🔎 **تطبیق مستقیم با IMDb** با استفاده از `/quick-search?q={imdbId}&sort=modified_at%3Adesc`
- 📺 **استخراج فصل و قسمت** از شناسه‌های استاندارد استرمیو مثل `tt1234567:1:3`
- 🏷️ **نمایش برچسب کیفیت واقعی منبع** (مثل `WEB-DL 4K 2160p 10bit HDR`) به‌جای کاهش آن به یک `1080p` ساده
- 🧑‍💻 **تشخیص انکودر** از روی برچسب‌هایی مثل `انکودر : PSA` و نمایش آن در توضیح استریم
- 💬 **تشخیص وضعیت زیرنویس فارسی** (دارد / ندارد) با الگوهای فارسی و انگلیسی
- 🔊 **تشخیص نسخه دوبله** با کلمات کلیدی `Dubbed`، `Dooble`، `دوبله`، `Farsi Dub` و `Persian Dub`
- 🔢 **پشتیبانی از اعداد فارسی و عربی-هندی** در تشخیص فصل و قسمت
- 🗂️ **fallback دایرکتوری باز فصل**: اگر صفحه ساختار باکس دانلود نداشته باشد، لینک پوشه فصل (`/S02/`) دنبال و فایل قسمت از روی نام فایل (`S02E05`، `2x05`، `E05`) پیدا می‌شود
- 🎞️ **تشخیص heuristic کیفیت** از URL و متن پیرامونی: `4K`، `1080p`، `720p`، `480p`، `360p` یا `Unknown`
- 🧩 **استخراج لینک از ساختارهای رایج صفحه دانلود** شامل `handleDownloadClick(...)`، لینک مستقیم و `iframe`
- 🖼️ **لوگوی مطلق در manifest** که به‌صورت خودکار از میزبان درخواست ساخته می‌شود
- 📦 **دو runtime**: اجرای Node.js/Express (`server.js`) و Cloudflare Workers (`worker.js`) با هسته مشترک `addon.js`
- ⚡ **بیلدر سبک** (`stremio-builder.js`) جایگزین SDK رسمی برای جلوگیری از باندل Express در Workers

---

## 🗂️ ساختار پروژه

ساختار واقعی و به‌روز پروژه (خروجی `ls -R`):

```text
.
├── .gitignore
├── .github/
│   └── workflows/
│       └── deploy-streams.yml   # دیپلوی خودکار Worker به Cloudflare
├── LICENSE                      # Apache License 2.0
├── README.md                    # همین فایل — راهنمای کاربر و راه‌اندازی
├── addon.js                     # هسته: manifest، استخراج stream، getStreams
├── stremio-builder.js           # بیلدر سبک Stremio (جایگزین SDK رسمی در Workers)
├── server.js                    # سرور Node.js / Express (main در package.json)
├── worker.js                    # آداپتور Cloudflare Workers (main در wrangler.jsonc)
├── wrangler.jsonc               # پیکربندی Worker: alias، assets، vars.BASE_URL
├── package.json                 # اسکریپت‌ها و وابستگی‌های Node.js
├── package-lock.json            # نسخه‌های قفل‌شده وابستگی‌ها
├── assets/
│   └── icons/
│       ├── logo.png             # لوگوی استفاده‌شده در manifest
│       └── player-fa.png        # فایل استاتیک اضافی
└── docs/
    └── DOCUMENTATION.md         # مستندات فنی کامل مطابق ساختار فعلی کد
```

| مسیر | نقش |
|------|-----|
| `addon.js` | هسته استخراج؛ تمام تابع‌های `fetch*`، `extract*`، `detect*`، manifest و `defineStreamHandler`. Export: `{ ...addonInterface, getStreams }` |
| `stremio-builder.js` | کلاس `AddonBuilder` سبک با `defineStreamHandler` و `getInterface()`؛ در `wrangler.jsonc` با alias جایگزین `stremio-addon-sdk` می‌شود |
| `server.js` | سرور Node؛ `dotenv`، `express`, `getRouter(addonInterface)` از SDK رسمی، ساخت لوگوی مطلق با `x-forwarded-proto`، سرو `assets/icons` |
| `worker.js` | Worker؛ پارسر مسیرهای `/streams/...`، تولید JSON با CORS، سرو asset از `env.ASSETS`، فراخوانی مستقیم `getStreams` |
| `wrangler.jsonc` | نام Worker، `alias`, `assets.directory`, `vars.BASE_URL`, `compatibility_date` |
| `.github/workflows/deploy-streams.yml` | دیپلوی خودکار Worker هنگام push به `main` |

> پروژه در حال حاضر فایل تست، پیکربندی lint، `Dockerfile` یا `.env.example` ندارد.

---

## 🚀 نصب و راه‌اندازی محلی

### پیش‌نیازها

- [Node.js](https://nodejs.org/) نسخه `20.18.1` یا بالاتر
  - دلیل: نسخه قفل‌شده `cheerio` در `package-lock.json` مقدار `engines.node >= 20.18.1` دارد.
- npm
- برای حالت Worker: [Wrangler](https://developers.cloudflare.com/workers/wrangler/) (`npx wrangler`)
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

### ۳. ساخت فایل `.env` (برای Node)

در ریشه پروژه یک فایل `.env` بسازید:

```env
PORT=8000
BASE_URL=https://www.example.com
```

| متغیر | وضعیت | پیش‌فرض | محل مصرف | توضیح |
|-------|-------|---------|----------|-------|
| `BASE_URL` | **اجباری** | — | `addon.js` | آدرس پایه منبع ایرانی. اگر تنظیم نشود، برنامه با پیام خطا متوقف می‌شود. |
| `PORT` | اختیاری | `8000` | `server.js` | پورت سرور HTTP. |

> ℹ️ در Node **فقط همین دو متغیر** خوانده می‌شوند. URL مطلق لوگو به‌صورت خودکار از `x-forwarded-proto` + `Host` درخواست ساخته می‌شود.

برای Cloudflare Workers مقدار `BASE_URL` در `wrangler.jsonc` بخش `vars` قرار دارد و در داشبورد Cloudflare قابل override است:

```jsonc
"vars": { "BASE_URL": "https://f2my.top" }
```

می‌توانید بدون فایل `.env` هم اجرا کنید:

```bash
BASE_URL=https://www.example.com PORT=8000 node server.js
```

### ۴. اجرای برنامه

#### حالت Node.js (پیشنهادی برای توسعه محلی)

```bash
npm start        # اجرای معمولی: node server.js
npm run dev      # اجرای توسعه با watch mode: node --watch server.js
```

خروجی موفق:

```text
Persian Streams running on port 8000
Manifest: http://localhost:8000/manifest.json
```

اگر پورت اشغال باشد:

```text
Port 8000 is already in use.
```

راه‌حل:

```bash
PORT=8001 npm start
```

#### حالت Cloudflare Workers (Edge)

```bash
npx wrangler dev
# Manifest: http://localhost:8787/streams/manifest.json
```

### ۵. نصب در Stremio

**Node:**

```text
stremio://localhost:8000/manifest.json
```

**Workers (لوکال):**

```text
stremio://localhost:8787/streams/manifest.json
```

یا ابتدا manifest را در مرورگر بررسی کنید:

```text
http://localhost:8000/manifest.json
http://localhost:8787/streams/manifest.json
```

---

## ☁️ استقرار (Deployment)

### گزینه A: Node.js hosting (VPS, Railway, Render, Fly.io, Heroku)

1. Node.js نسخه `20.18.1+` روی محیط اجرا فعال باشد.
2. وابستگی‌ها را با `npm install` نصب کنید.
3. دستور اجرا را روی `npm start` (یعنی `node server.js`) بگذارید. `main` در `package.json` همین است.
4. `BASE_URL` را در Environment Variables تنظیم کنید (بدون آن سرویس بالا نمی‌آید).
5. `PORT` معمولاً توسط خود میزبان تزریق می‌شود؛ کد آن را می‌خواند.
6. آدرس نصب بعد از استقرار:

   ```text
   stremio://YOUR_DOMAIN/manifest.json
   ```

> مسیرهای ضروری: `/manifest.json`, `/stream/...`, `/assets/icons/logo.png`

### گزینه B: Cloudflare Workers (پیشنهادی برای Edge, رایگان)

1. `wrangler.jsonc` مقدار `vars.BASE_URL` را دارد؛ می‌توان در داشبورد override کرد.
2. `npm install`
3. دیپلوی دستی:

   ```bash
   npx wrangler deploy
   ```

   یا خودکار via GitHub Actions (push به `main` با تغییرات `worker.js`, `addon.js`, `stremio-builder.js`, `wrangler.jsonc`, `assets/**`).

4. آدرس نصب بعد از استقرار:

   ```text
   stremio://<worker>.workers.dev/streams/manifest.json
   ```

> مسیرهای ضروری Worker: `/streams/manifest.json`, `/streams/stream/...`, `/streams/assets/icons/logo.png`
> تمام پاسخ‌های JSON هدر `access-control-allow-origin: *` دارند.

### نکات HTTPS و Proxy

- **Node:** سرور `x-forwarded-proto` را می‌خواند تا پشت TLS proxy لوگو `https` شود. اگر پراکسی شما این هدر را ست نمی‌کند، `app.set('trust proxy', true)` را اضافه کنید یا مطمئن شوید مقدار `logo` در `/manifest.json` درست است.
- **Workers:** `url.origin` همیشه scheme درست را دارد؛ نیازی به تنظیم اضافی نیست.

---

## 🎯 نحوه استفاده

بعد از نصب افزونه در Stremio:

1. یک فیلم یا سریال دارای شناسه IMDb را باز کنید.
2. Stremio درخواست stream را به افزونه می‌فرستد.
3. افزونه با شناسه IMDb در منبع پیکربندی‌شده جستجو می‌کند.
4. برای فیلم‌ها، لینک‌های دانلود/پخش صفحه فیلم استخراج می‌شود.
5. برای سریال‌ها، فصل و قسمت انتخاب‌شده پیدا و لینک همان اپیزود برگردانده می‌شود. اگر ساختار باکس دانلود پیدا نشود، دایرکتوری فصل به‌عنوان fallback بررسی می‌شود.
6. لینک‌ها با برچسب کیفیت، و در صورت تشخیص `• دوبله` و `• encoder: ...` در لیست استریم‌ها نمایش داده می‌شوند.

نمونه خروجی در لیست استریم‌ها:

```text
WEB-DL 1080p x265          →  S1E3 - WEB-DL 1080p x265 • encoder: PSA
720p • دوبله               →  720p
1080p NF WEB-DL x265 10bit →  S2E5 - 1080p NF WEB-DL x265 10bit
```

---

## 🔌 مسیرها و API

### Node.js (server.js)

| مسیر | توضیح |
|------|-------|
| `GET /` | صفحه ساده معرفی افزونه و لینک نصب محلی |
| `GET /manifest.json` | manifest افزونه با URL مطلق لوگو |
| `GET /assets/icons/logo.png` | لوگوی افزونه |
| `GET /stream/movie/{imdbId}.json` | streamهای فیلم؛ مثال: `/stream/movie/tt1234567.json` |
| `GET /stream/series/{imdbId}:{season}:{episode}.json` | stream یک قسمت سریال؛ مثال: `/stream/series/tt1234567:1:3.json` |

### Cloudflare Workers (worker.js)

| مسیر | توضیح |
|------|-------|
| `GET /` | JSON وضعیت: `{ name, status:'ok', manifest:'/streams/manifest.json' }` |
| `GET /streams` یا `/streams/` | Redirect 302 به `/streams/manifest.json` |
| `GET /streams/manifest.json` | manifest با لوگوی مطلق `https://<origin>/streams/assets/icons/logo.png` |
| `GET /streams/assets/icons/logo.png` | لوگوی افزونه (از `env.ASSETS`) |
| `GET /streams/stream/movie/{imdbId}.json` | stream فیلم در Worker |
| `GET /streams/stream/series/{imdbId}:{season}:{episode}.json` | stream سریال در Worker |

> route جداگانه‌ای به نام `/health` در کد وجود ندارد و `404` برمی‌گرداند؛ برای health check از `/manifest.json` یا `/streams/manifest.json` استفاده کنید.

بررسی سریع با curl:

```bash
# Node
curl http://localhost:8000/manifest.json
curl http://localhost:8000/stream/movie/tt1234567.json
curl http://localhost:8000/stream/series/tt1234567:1:3.json

# Workers
curl http://localhost:8787/streams/manifest.json
curl http://localhost:8787/streams/stream/movie/tt1234567.json
curl http://localhost:8787/streams/stream/series/tt1234567:1:3.json
```

---

## ⚙️ خلاصه عملکرد فنی

### معماری ماژولار

```text
                    stremio-builder.js (بیلدر سبک)
                           │
         wrangler.jsonc ───┼─── addon.js (هسته: manifest + getStreams + extract*)
         alias SDK → builder   │         │
                               │         ├── server.js (Express + getRouter)
                               │         └── worker.js (Cloudflare adapter)
                               │
Stremio → /stream/... یا /streams/stream/... → getStreams()
```

### جریان هسته (addon.js)

```text
Stremio request
   ↓
builder.defineStreamHandler(args)  ← از stremio-builder.js در Worker، یا SDK رسمی در Node via getRouter
   ↓
getStreams(type, imdbId, season, episode)
   ├─ fetchTitleFromMeta(...)        ← Cinemeta (نتیجه فعلاً استفاده نمی‌شود)
   ├─ resolveViaQuickSearch(imdbId)  ← GET {BASE_URL}/quick-search?q={imdbId}
   ├─ fetchPage(contentUrl)          ← HTML + cheerio.load
   └─ extractMovieStreams($)
      یا extractSeriesStreams($, S, E)
             └─ fallback: extractLegacySeriesStreams → extractStreamsFromSeasonDirectory
   ↓
{ streams: [...] }
```

جزئیات مهم:

- تنها راه تطبیق محتوا در نسخه فعلی، `quick-search` مبتنی بر IMDb است؛ fallback مبتنی بر عنوان یا slug وجود ندارد.
- افزونه catalog، meta یا subtitle ارائه نمی‌کند؛ فقط resource نوع `stream` دارد.
- منبع باید خروجی quick-search را به‌صورت آرایه JSON با فیلدهای `imdb_id` و `url` برگرداند.
- لینک‌های فیلم از `.download-list`، `.download-box` و `.dl-box` خوانده می‌شوند.
- لینک‌های سریال از `.download-season` و `.series-downloaditems .d-flex` خوانده می‌شوند.
- کیفیت ابتدا از برچسب متنی صفحه (`کیفیت : ...`) و در نبود آن با heuristic از URL/متن تشخیص داده می‌شود.
- در صورت خطا یا پیدا نشدن محتوا، پاسخ افزونه `{ "streams": [] }` است.
- `addon.js` دیگر سرور ندارد؛ `server.js` نقطه ورود Node و `worker.js` نقطه ورود Edge است.
- `wrangler.jsonc` با `alias: { "stremio-addon-sdk": "./stremio-builder.js" }` از باندل شدن Express در Workers جلوگیری می‌کند.

برای توضیح دقیق تک‌تک تابع‌ها، selectorها و مسائل شناخته‌شده، فایل [docs/DOCUMENTATION.md](docs/DOCUMENTATION.md) را ببینید.

---

## 🐛 عیب‌یابی

### پیام `BASE_URL is not set` می‌بینم

**Node:** فایل `.env` وجود ندارد یا `BASE_URL` در آن تعریف نشده است. مقدار را اضافه کنید و دوباره اجرا کنید. توجه کنید این بررسی حتی هنگام import کردن `addon.js` هم اجرا می‌شود.

**Workers:** مقدار `vars.BASE_URL` در `wrangler.jsonc` یا داشبورد Cloudflare را بررسی کنید.

### پیام `Port 8000 is already in use`

پورت دیگری انتخاب کنید:

```bash
PORT=8001 npm start
```

### استریمی نمایش داده نمی‌شود

- محتوا ممکن است در منبع پیکربندی‌شده وجود نداشته باشد.
- خروجی `/quick-search` ممکن است `imdb_id` مطابق نداشته باشد.
- ساختار HTML صفحه منبع ممکن است تغییر کرده باشد.
- لاگ‌های سرور را بررسی کنید؛ مراحل `Quick-search`، `Resolved`، `Fetch` و تعداد streamها چاپ می‌شود.

### در لاگ خطای `TypeError: $ is not a function` می‌بینم

یعنی quick-search محتوایی پیدا نکرده و صفحه‌ای برای parse وجود نداشته است. پاسخ HTTP همچنان `{"streams":[]}` است و کاربر خطایی نمی‌بیند؛ این مورد در بخش «مسائل شناخته‌شده» مستندات فنی توضیح داده شده است.

### برچسب زیرنویس فارسی نمایش داده نمی‌شود

وضعیت زیرنویس تشخیص داده می‌شود، اما تابع `formatSubtitleLabel` در نسخه فعلی عمداً رشته خالی برمی‌گرداند و برچسبی به خروجی اضافه نمی‌کند.

### لوگو در Stremio نمایش داده نمی‌شود

- **Node:** مطمئن شوید `/assets/icons/logo.png` از بیرون قابل دسترسی است. در استقرار پشت HTTPS، مقدار `logo` در `/manifest.json` را بررسی کنید؛ اگر `http://` بود باید `x-forwarded-proto` درست ست شود.
- **Workers:** `https://<worker>/streams/assets/icons/logo.png` را بررسی کنید.

### لینک نصب روی صفحه اصلی هنوز localhost است

صفحه `/` فقط یک صفحه کمکی است و لینک نصب آن در کد به `localhost` اشاره می‌کند. برای نسخه Deploy شده مستقیماً از آدرس عمومی خودتان استفاده کنید:

```text
# Node
stremio://YOUR_DOMAIN/manifest.json

# Workers
stremio://YOUR_DOMAIN/streams/manifest.json
```

### Worker دیپلوی نمی‌شود

- `CLOUDFLARE_API_TOKEN` و `CLOUDFLARE_ACCOUNT_ID` در secrets گیت‌هاب ست شده‌اند؟
- نسخه Wrangler در workflow پین شده `4.128.0` است؛ لاگ Action را چک کنید.

---

## 🤝 مشارکت

Pull Requestها و Issueها برای بهبود استخراج لینک، سازگاری با ساختارهای HTML جدید، افزودن تست و بهبود مستندات خوشحال‌کننده است.

قبل از تغییر منطق استخراج، بخش‌های «نقشه ماژول‌ها» و «مسائل شناخته‌شده و بدهی فنی» در [docs/DOCUMENTATION.md](docs/DOCUMENTATION.md) را مطالعه کنید؛ چند مورد کوچک و آماده برای شروع مشارکت آنجا فهرست شده‌اند.

---

## 📄 مجوز

فایل [`LICENSE`](LICENSE) این مخزن **Apache License 2.0** است.

> ⚠️ توجه: فیلد `license` در `package.json` هنوز مقدار `MIT` دارد و با فایل `LICENSE` هماهنگ نیست. هنگام fork یا انتشار، این دو را با هم هم‌راستا کنید.

---

<p align="center">
  ساخته شده با ❤️ برای جامعه فارسی‌زبان Stremio<br />
  حمایت از ادامه مسیر: <a href="https://alirostami.com/support">alirostami.com/support</a>
</p>
