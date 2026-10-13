# Nexus Launcher — وضعیت فنی پروژه (نسخه `0.6.0`)

_آخرین به‌روزرسانی: ۲۰۲۶-۱۰-۱۴_

## بازبینی جامع باگ‌هانتینگ، امنیت و هم‌زمانی (این جلسه)

در این جلسه کل کدهای فرانت‌اند، بک‌اند Rust، کانفیگ Tauri و ورکر ابری بررسی شد و موارد زیر رفع گردید:

1. **رفع خطای بحرانی کوئری SQL در بکاپ و بازیابی سیوها (`save_manager/archive.rs` و `save_manager/mod.rs`):**
   - در توابع `get_default_save_backup_path`، `export_save_to_zip` و `restore_save_from_zip` کوئری روی ستون ناموجود `SELECT title FROM games` زده می‌شد (در حالی که نام ستون در جدول `games` برابر `name` است) و باعث خطای دائمی `Game not found` هنگام ساخت یا بازگردانی بکاپ `.zip` سیوها می‌شد. هر سه مورد به `SELECT name FROM games` اصلاح شدند.
2. **رفع نشتی حافظه (`Box::leak`) و آسیب‌پذیری Zip-Slip در بازیابی سیوها (`save_manager/archive.rs`):**
   - حذف `Box::leak(Box::new(p))` هنگام ساخت اسنپ‌شات پیش از بازیابی و جایگزینی با وکتور مالک (`owned_snapshot_paths`).
   - اضافه شدن تابع `is_safe_relative_path` که تمام کامپوننت‌های مسیر داخل آرشیو را بررسی می‌کند و هرگونه `Component::ParentDir` (`..`)، مسیر ریشه یا درایو ویندوزی را رد می‌کند (چون `Path::starts_with` در Rust مسیرهای نسبی حاوی `..` را نرمال‌سازی نمی‌کند).
3. **رفع مشکل عدم پخش فایل‌های صوتی محلی و دانلودشده در Soundtrack Center (`tauri.conf.json` و `audio-engine.ts`):**
   - گسترش اسکوپ `assetProtocol` در `tauri.conf.json` برای پوشش دادن `$AUDIO/**`، `$HOME/Music/**`، `$APPDATA/soundtracks/**`، `$EXE/Soundtracks/**` و پسوندهای صوتی استاندارد تا `convertFileSrc` در WebView مسدود نشود.
   - رفع نشتی `window.addEventListener('message', ...)` در `NexusAudioEngine` (جلوگیری از ثبت چندباره Listener) و افزودن بررسی امنیتی `event.origin` برای پیام‌های iframe یوتیوب.
4. **سخت‌سازی امنیتی `soundtrack_http_get` و دانلودر ساندترک (`commands/soundtrack/mod.rs` و `downloader.rs`):**
   - افزودن اعتبارسنجی پروتکل (`http`/`https`)، لیست سفید دامنه‌های مجاز (`ALLOWED_SOUNDTRACK_HOSTS`)، مسدودسازی کامل IPهای خصوصی/لوپ‌بک (محافظت در برابر SSRF)، سقف حجم پاسخ ۵ مگابایت (`MAX_HTTP_TEXT_BYTES`) و استفاده از `State<'_, HttpClient>` مشترک به جای ساخت کلاینت جدید در هر درخواست.
   - ثبت وضعیت `paused` در دیتابیس و حذف تسک از `active` هنگام لغو دانلود ساندترک (`downloader.rs`) به همراه اعتبارسنجی مسیر مقصد در برابر `..`.
5. **اعتبارسنجی `video_id` در پنجره‌های تریلر و پاکسازی مجوزهای Tauri (`commands/hub.rs` و `capabilities/default.json`):**
   - اضافه شدن `validate_youtube_video_id` پیش از ساخت URL در `open_trailer_window` و `mount_embedded_trailer`.
   - حذف مجوز بدون اسکوپ `"opener:allow-open-url"` از `src-tauri/capabilities/default.json` (پوشش امن از طریق `"opener:default"`).
6. **رفع گلوگاه قفل دیتابیس در زمان بوت و تنظیم `busy_timeout` (`lib.rs`، `save_manager/mod.rs` و `db/connection.rs`):**
   - انتقال تسک اسکن خودکار سیوها در استارتاپ به `tokio::task::spawn_blocking` و پیاده‌سازی `auto_configure_all_installed_games_unlocked` که قفل Mutex دیتابیس را بین هر بازی آزاد می‌کند تا کامندهای فرانت‌اند در شروع برنامه متوقف نشوند.
   - افزودن `busy_timeout(Duration::from_secs(5))` روی اتصال SQLite.
7. **بهینه‌سازی TTFB در Cloudflare Worker و تکمیل جداول بکاپ (`worker/src/`، `backup.rs`، `download.rs`):**
   - استفاده از `ctx.waitUntil(putEdgeCache(request, response.clone()))` در `worker/src/router.ts` برای ذخیره غیرمسدودکننده در کش Edge.
   - افزودن جدول `overlay_config` (مایگریشن ۲۱) به لیست `TABLES` در `backup.rs` و پویاسازی نسخه هدر `User-Agent` با `env!("CARGO_PKG_VERSION")`.

## خلاصه معماری فعلی (`v0.6.0`)

- **Frontend**: React 19 + TypeScript 6 + Vite 8 + Tailwind CSS 4 + Framer Motion 13 + React Router (Hash) + Zustand + TanStack Query v5
- **Backend**: Tauri v2 (Rust 2021) + rusqlite (SQLite, WAL + busy_timeout) + reqwest + tokio + sysinfo + windows-sys (Win32, ETW, PDH, Power) + steamlocate + winreg + zip / sevenz-rust / unrar
- **Migrations**: ۲۱ مایگریشن نسخه‌دار (`0002` تا `0021`) شامل Core Schema، Metadata، Animated Covers، Launch Hooks، Game Hub، Wishlist، Download Manager، Multi-Profile Saves، Per-Profile Stats، User Rating، Soundtracks، Metadata Cache، Memory Vault، Auto-Extract و Overlay Config
- **Cloud Gateway**: Cloudflare Edge Worker (`worker/`) با Single-Flight Deduplication، Edge Cache و Fallback خودکار بین IGDB، SteamGridDB و Steam Store
