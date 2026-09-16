# Nexus Launcher — وضعیت فنی پروژه

_آخرین به‌روزرسانی: ۲۰۲۶-۰۸-۳۱_

## بازبینی و سخت‌سازی Download Manager + Game Booster (این جلسه)

دو فیچر جدید (پایین‌تر ثبت شده‌اند) که بعد از آخرین سند ساخته شده بودند، پاسِ کامل باگ‌هانتینگ/امنیت/پرفورمنس گرفتند — همان الگوی جلسات قبلی. ۹ رفع:

**رفع‌های درجه‌یک (خرابی داده / race):**

1. **Race در pause→resume** — `pause_download` ورودی map را همان اول حذف می‌کرد؛ اگر کاربر سریع Resume می‌زد، موتور دوم روی همان فایل با نویسندگان chunkِ در حال تخلیه‌ی موتور اول شروع می‌شد = فایل خراب. حالا ورودی با `Arc` در map می‌ماند تا خود تسک با `cleanup_active` حذفش کند؛ pause/cancel هندل را با `Mutex<Option<JoinHandle>>` take می‌کنند و exit واقعی را await می‌کنند. resume تا خروج کامل، «already running» می‌گیرد.
2. **دو موتور روی یک فایل** — `reject_duplicate_file`: شروع دانلود جدید به file_path ای که ردیف active دارد خطای دوستانه می‌دهد (قبلاً: دو دانلود هم‌نام هم‌زمان = خرابی).
3. **`mark_completed` بدون گارد** — تنها ترنزیشن بدون `WHERE status IN (...)` بود؛ complete دیرهنگام می‌توانست روی ردیف paused/failed بنشیند. حالا گارد دارد + emit فقط وقتی واقعاً تغییر داد.

**امنیت:**

4. **ضدعفونی نام فایل از URL** — `file_name_from_url` حالا `\` (path traversal ویندوزی)، کاراکترهای غیرمجاز FS، نام‌های رزرو (CON/NUL/COM1…)، و کنترل‌کاراکترها را خنثی می‌کند + طول ۱۲۰.
5. **اعتبارسنجی scheme** — `validate_download_url` فقط http(s) را عبور می‌دهد (دفاع در عمق، همتای `trailer_url`).

**پایداری/پرفورمنس:**

6. پاسخ non-206 روی Range GET حالا مثل خطای شبکه retry می‌خورد (پروکسی‌های موقت ۲۰۰ می‌دهند) — قبلاً کل دانلود فوراً fail می‌شد.
7. `link_game_install` (walkdir روی کل درخت بازی) به `spawn_blocking` رفت — بلاک‌کردن runtime اشتباه بود.
8. `scan_boostable_apps` و `run_game_boost` async شدند (رفرش لیست پروسه‌ها صدها ms بلاک بود)؛ RAM trim از پروسه‌ی خودِ اپ می‌پرد.
9. فرانت: `plugin-dialog` در مودال دانلود static شد (dynamic بی‌فایده بود، وارنینگ build می‌ساخت).

صحت‌سنجی: clippy صفر وارنینگ، tsc/oxlint/prettier/build همه سبز، اجرای dev تمیز.

## Game Booster (جلسه قبل — ثبت نشده بود)

Settings → Game Booster. شش ماژول مستقل با کلید در `booster_enabled_modules` (KV settings، پیش‌فرض همه روشن): close_apps (بستن ۲۱ اپ پس‌زمینه شناخته‌شده؛ لانچرها عمداً مستثنا)، cpu (SystemProfile/GameBar در HKCU)، ram (EmptyWorkingSet همه پروسه‌های مجاز + ProcessIdleTasks)، temp (فقط فایل‌های loose سطح temp، بدون بازگشت)، power_plan (powercfg به High performance + بازیابی موقع خروج بازی از `launch.rs`)، game_mode (AutoGameMode). `perform_boost` هم از دکمه‌ی Boost و هم از Auto-Boost موقع launch خوانده می‌شود. UI: دیال شش‌ضلعی با arc پیشرفت و report گام‌به‌گام.

## Download Manager (جلسه قبل — ثبت نشده بود)

مرورگر بازی‌ها → دانلود: جستجوی IGDB (موتادیتا + کاور خودکار) یا لینک خام؛ دانلود با تا ۶ اتصال موازی Range (~۸MB هر chunk)، probe اولیه برای پشتیبانی سرور از Range، retry با ادامه از offset، idle-timeout ۳۰s، progress tick هر ۴۰۰ms با event `download-updated` (فرانت بدون polling)، **pause/resume با ذخیره‌ی وضعیت هر chunk در `chunk_state` JSON** (migration ۹)، ریکاوری ردیف‌های یتیم موقع بوت → paused، استخراج خودکار zip + تشخیص exe بازی (امتیازدهی: عمق/سایز/نام) + علامت‌گذاری installed، صفحه `/downloads` با سه بخش Active/Paused/Completed و سرچ.

## تایتل‌بار سفارشی + هاور کانتکست‌منو

- **برگشت به پنجره‌ی chromeless**: قاب نیتیو ویندوز (`decorations: true`) به درخواست کاربر حذف شد — تایتل‌بار سفارشی شیشه‌ای اپ (لوگو + Nexus + دکمه‌های مینیمایز/ماکزیمایز/کلوز) و دستگیره‌های ریسایز نامرئی و کارت شناور با گوشه‌های گرد برگشتند (`decorations: false` + `transparent: true` + شل گرد در حالت شناور، مربع در maximize). موارد خوب کامیت «native feel» (بلاک کردن منوی راست‌کلیک مرورگر، شورتکات‌های F5/F12/Ctrl+R، غیرقابل‌انتخاب‌شدن متن) دست‌نخورده ماندند. پلاگین window-state از قبل DECORATIONS را بازیابی نمی‌کند، پس تداخلی نیست.
- **رفع هاور نامرئی کانتکست‌منو**: هاور آیتم‌ها از `bg-surface-raised` به **تینت accent (`bg-accent/15` + آیکن accent در hover)** تغییر کرد — ریشه‌ی باگ: `surface-raised` در دارک تقریباً همرنگ پس‌زمینه‌ی `solid-panel` بود و در لایت **دقیقاً همان #ffffff**؛ حالا در هر دو تم و با هر پالت رنگی کاملاً دیده می‌شود. آیتم‌های danger همان تینت قرمز را دارند. دکمه‌های تایتل‌بار هم `bg-text/10` گرفتند (در لایت/دارک مرئی).
- رفع وارنینگ `unused_mut` در `lib.rs` (فقط در پروفایل release ظاهر می‌شد — بلاک `debug_assertions` با shadowing جایگزین شد).

## بازبینی امنیتی + رفع باگ (جلسه قبل)

**سخت‌افزاری (Security hardening):**

- **CSP فعال شد** (`tauri.conf.json`) — قبلاً `csp: null` بود؛ الان `default-src 'self'` + اسکیمپ‌های لازم (asset protocol، CDN های https، blob برای کراپ) + `devCsp` جداگانه با ws برای HMR
- **حذف `tauri-plugin-http`** به‌طور کامل (Cargo.toml، lib.rs، capabilities، package.json) — فرانت‌اند هیچ‌وقت ازش استفاده نمی‌کرد؛ بک‌اند reqwest مستقیم دارد
- **Capabilities محدودتر شد**: حذف `opener:allow-open-url` بدون اسکوپ (هر scheme ای را باز می‌کرد؛ `opener:default` از قبل mailto/tel/http/https را پوشش می‌دهد)، حذف `fs:allow-exists` بلااستفاده
- **اعتبارسنجی `trailer_url`** قبل از `openUrl` — فقط http(s) به opener می‌رسد (دفاع در عمق در برابر scheme های دلخواه از دیتابیس)

**رفع باگهای فرانت‌اند:**

- `formatReleaseDate` یک روز عقب نمی‌افتد (فرمت UTC با `formatDateKey` — قبلاً برای timezone های منفی شیفت داشت)
- هیت‌مپ Stats روی دادهی خالی کرش نمی‌کرد → گارد `weeks.length > 0` (نبود Error Boundary یعنی کرش = پرش کل اپ)
- مرتب‌سازی Recently Played/Added زمانی شد نه لغت‌نامه‌ای (`parseStoredUtcDate` به‌جای `localeCompare` روی دو فرمت متفاوت timestamp)
- گارد `isPending` برای Play/Stop در کانتکست‌منو (دابل‌کلیک = دوبار launch)
- رفع همهی unhandled rejection ها: Measure در installation-editor، picker های add-game-modal، Save کالکشن‌ها، copyGamePath، title-bar، pickAndCrop (به‌همراه رفع نشتی blob URL در Browse مکرر)

**چیزهایی که بررسی و صحیح پیدا شدند** (نیازی به تغییر نداشتند): همهی کوئری‌های SQL پارامتری؛ `artwork_dir` با UUID validation ضد path traversal؛ `sanitize_query_value` ضد IGDB injection؛ سقف ۲۵MB دانلود آرتورک؛ اعتبارسنجی `steam_app_id` عددی؛ scope درست asset protocol؛ XSS صفر (هیچ dangerouslySetInnerHTML وجود ندارد).

## معماری کلی

- **Frontend**: React 19 + TypeScript + Vite 8 + Tailwind CSS 4 + Framer Motion 13 + React Router (hash) + Zustand + TanStack Query v5
- **Backend**: Tauri v2 (Rust 2021) + rusqlite (SQLite, WAL) + reqwest + tokio + sysinfo + chrono + uuid + image + steamlocate + winreg + lnks
- **کتابخانه‌های کلیدی فرانت**: @tanstack/react-virtual (گرید مجازی)، recharts 3 (فقط در chunk جداگانهی lazy)، cmdk (Command Palette)، sonner (toast)، react-easy-crop
- **حجم تقریبی بک‌اند**: ~۴٬۵۰۰ خط Rust در `src-tauri/src/commands/` + DB layer با migration های نسخه‌دار
- **تعداد کامندهای Tauri ثبت‌شده**: ۵۹ (games 14, launch 3, collections 8, settings 3, stats 5, hub 8, import 3, scan 2, metadata 13, paths/system 2)
- **Migrations**: ۷ فایل (0002 تا 0007) — runner با جدول `schema_migrations`

## دیتابیس (SQLite)

جدول‌ها: `games` (با `igdb_id`, `is_wishlist`, launch hooks, آرتورک، متادیتا، playtime)، `collections`، `collection_games`، `tags` + `game_tags` (**هنوز بدون UI — زیرساخت آماده**)، `playtime_sessions`، `artwork_cache`، `settings` (KV).

Migration های این جلسه:

- **0006_game_hub**: ستون `igdb_id` + ایندکس unique جزیی (`WHERE igdb_id IS NOT NULL`) برای دی‌دوپلیکیت هاب
- **0007_wishlist**: ستون `is_wishlist` + ایندکس — بازی‌های ویش‌لیست از لایبرری اصلی جدان؛ با نصب محلی یا Move to Library خودکار پاک می‌شود

## اپیک‌ها

| اپیک                              | وضعیت                                                                    |
| --------------------------------- | ------------------------------------------------------------------------ |
| ۰-۸ (Foundation تا Details Panel) | ✅ کامل                                                                  |
| ۹ (Live Cover)                    | ✅ gating با inView/hover/window-focus                                   |
| ۱۰ (Artwork Editor)               | ✅ کراپ، ریست، picker های کاور/بنر/لوگو                                  |
| ۱۱ (Launch/Playtime)              | ✅ sysinfo، PID مستقیم + polling نام exe برای Steam، Stop واقعی          |
| ۱۲ (Collections/Palette/Filters)  | ✅                                                                       |
| ۱۳ (Theming)                      | ✅ بلور/سرعت/Compact/Reduce-motion + پنل تنظیمات بازطراحی‌شده            |
| ۱۴ (Stats Dashboard)              | ✅ **بازطراحی کامل این جلسه** (پایین)                                    |
| ۱۵ (Backup)                       | ❌ حذف‌شده توسط کاربر                                                    |
| **Game Hub + Wishlist**           | ✅ ساخته‌شده + فیلترهای کاتالوگ                                          |
| **Game Booster**                  | ✅ ۶ ماژول + Auto-Boost + دیال UI                                        |
| **Download Manager**              | ✅ موازی chunk-based + resume + استخراج — بازبینی امنیتی کامل (این جلسه) |
| ۱۶ (Polish)                       | ✅ Error Boundaries سه‌لایه، لاگ release (Warn به LogDir)، ۲۵ تست واحد   |

## آمار (Stats) — بازطراحی این جلسه

- **ریشهی «عدم دقت تاریخ»**: کوئری هفتگی بک‌اند درست بود (با تست تجربی روی دیتابیس واقعی ثابت شد)؛ مشکل فقط برچسب دوشنبه‌ها و نبود نمای روزانه بود
- کامندهای جدید: `get_daily_activity` (۹۱ روز zero-filled با recursive CTE + localtime)، `get_recent_sessions` (۱۲ سشن اخیر join با games)
- UI: نمودار **Daily(30d)/Weekly(12w)** با toggle، **هیت‌مپ GitHub-سبک** (۱۳ هفته × ۷ روز، شدت ۴-مرحله‌ای accent، tooltip تاریخ کامل)، **لیست سشن‌های اخیر** با تاریخ/ساعت دقیق محلی و نشان Live، متریک **Day streak**، امروز در هدر
- الگوریتم هیت‌مپ با شبیه‌سازی روی دادهی واقعی صحت‌سنجی شد (۹۱ روز، بدون جابه‌جایی)

## Game Hub (تسک ۲ — پیاده‌سازی کامل این جلسه)

**بک‌اند (`commands/hub.rs`)**: فیدهای `new-releases` (۹۰ روز اخیر مرتب بر اساس hypes)، `coming-soon`، `top-rated` (۳ سال اخیر)، `recommended` (شخصی‌سازی با ۲ ژانر پربازیِ کاربر → resolve به id ایجی DB) — همه از طریق هلپر مشترک `feed_where_clause`؛ `search_hub_games` و `get_hub_feed` هر دو **صفح‌بندی ۲۴تایی با offset**؛ `get_hub_game_details`؛ `add_game_from_hub` (insert + متادیتای فوری + آرتورک پس‌زمینه با پایپلاین SGDB-first و fallback کاور IGDB)؛ `add_game_to_wishlist` (insert مشترک) + پروموشن خودکار ویش‌لیست→لایبرری.

**دانش مهم IGDB**:

- فیلد `category` **حذف شده** — معادل فعلی `games.game_type = 0` و در `external_games` هم معادل `external_game_source` است (۱ = استیم؛ تست زنده با Cyberpunk: uid=1091500)
- `limit` و `offset` **باید جمله‌های جدان** باشند وگرنه 400 Syntax Error
- سایز تصویر `1080p` برای hero (۱۹۲۰px)؛ `screenshot_huge` فقط برای گالری؛ `cover_big` برای کارت‌ها

**فرانت‌اند**: بخش Discover در سایدبار؛ بنر carousel (خودکار ۷ ثانیه، توقف با hover/فوکس‌نداشتن/reduce-motion، scrim مشکی سینمایی + متن سفیت — حل مشکل لایت مود)؛ سه قفسه + کارت **More** انتهای هر ردیف → صفحه Browse فید با Load more؛ **سرچ کامل کاتالوگ** با debounce ۳۵۰ms و infinite pagination و **حفظ وضعیت سرچ** (zustand store) موقع رفت‌وبرگشت + دکمه Back هوشمند (history-aware)؛ صفحهی بازی با hero، جزئیات، گالری، **کول‌داون زنده انتشار** (روز/ساعت/دقیقه/ثانیه، فقط با فوکوس تیک می‌خورد)؛ تشخیص «توی لایبرری» با `igdb_id` **یا نام نرمال‌شده** (حذف ™®© — بازی‌های دستی هم match می‌شوند)؛ پنل راهنمای گام‌به‌گام برای نبودن کلیدها + تشخیص 401/403.

**Wishlist**: نمای `/wishlist` (reuse از LibraryPage با scope جدید)، دکمه‌های دوگانه در صفحهی بازی (منتشرنشده → Wishlist اصلی)، کانتکست منیوی **Move to Library** و **Remove from Wishlist**.

## باگ‌های حیاتی این جلسه (پیدا + رفع)

1. **`update_launch_arguments` UPDATE نداشت** — فیلد Launch Options هیچ‌وقت ذخیره نمی‌شد (جاافتاده از حذف اپیک ۱۵)
2. **صفحهی خالی هاب با کلیدهای پاک‌شده** — دو لایه: رشتهی خادی مثل «کلید موجود» عبور می‌کرد از چک Some/None (حالا trim می‌شود، هم در hub هم metadata) + توکن کش‌شده پیام درست را دور می‌زد و 401 بی‌توضیح می‌داد (تشخیص گسترش یافت) + پنل خطای عمومی «Couldn't reach IGDB» با Try again
3. **400 خطای سینتکس سرچ** — فرم ترکیبی `limit 24 offset 0` → جداسازی جمله‌ها
4. **لایت باکس اسکرین‌شات‌ها خالی** — تبدیل دوبارهی `assetUrl` (مسیرها باید خام به lightbox بروند)
5. **گوشهی شکستهی مودال Add Game** — کانتینر مودال `overflow-hidden` نداشت (فیکس سراسری برای هر ۱۵ مودال)
6. **دکمهی Play پرویده به بالای پنل جزئیات** — ترفند `-mt-52 h-0` جای خود را به ساختار relative با لایه‌های absolute داد
7. **ظاهر عوض‌شدهی دکمهی Play کارت‌ها** — گلو جدید با `overflow-hidden` کلیپ می‌شد → کلاس `glow-hover-pulse` (انیمیشن اصلی، فقط هنگام hover فعال)

## بهینه‌سازی GPU (مصرف ۴۰-۵۰٪ → نرمال)

- `glow-pulse`: از انیمیشن box-shadow (repaint هر فریم) به pseudo-element با انیمیشن **opacity** (compositor-only)
- بلاب‌های ambient: سرعت drift پنج‌برابر کندتر (~۱ گام/ثانیه) — هر گام، backdrop-filter های شیشه‌ای را باطل می‌کند
- پارالکس موس: کوانتیزه به ۰.۱ (~۱۰ برابر آپدیت کمتر)
- حذف `saturate(150%)` از `.glass-panel` (پاس شیدر per-pixel)
- کول‌داون و carousel ها فقط با فوکوس پنجره فعال

## سایر بهبودهای UI این جلسه

اسکرولبارهای شناور سفارشی (سراسری، theme-aware)؛ حذف max-width هاب (full-width)؛ **گوشه‌های گرد فقط در پنجرهی شناور** (هوک `useWindowFillsScreen` — maximize/fullscreen مربع)؛ بازطراحی پنل جزئیات (هیرو h-52 با زوم لایت‌باکسی، چیپ ژانر روی هیرو، دکمه‌های گوشه)؛ **ضربدر سراسری مودال‌ها** (`hideCloseButton` برای استثنا).

## سیستم تگ (ساخته‌شده در همین جلسه)

جدول‌ها از قبل بودند (migration ۲: `tags` با رنگ + `game_tags` many-to-many با CASCADE) — این جلسه فقط پیاده‌سازی شد، **بدون migration جدید**:

- **بک‌اند**: `commands/tags.rs` با ۵ کامند — `list_tags`, `create_tag`, `update_tag` (نام+رنگ با هم), `delete_tag` (لینک‌ها CASCADE می‌شوند), `set_game_tags` (جایگزینی تراکنشی کل مجموعه؛ FK روی id ناشناخته خطای دوستانه می‌دهد). اعتبارسنجی: نام غیرخالی ≤۳۲ کاراکتر، رنگ دقیقاً `#rrggbb`. مدل `Game` حالا `tag_ids: Vec<String>` دارد که با subquery از `json_group_array` در `SELECT_COLUMNS` می‌آید (بدون N+1) — کوئری `games.*` در collections.rs هم دستخور شد.
- **فرانت**: `TagEditorModal` — عضویت بافر‌شده با Save (همان قرارداد Add-to-Collections) + CRUD فوری تگ (ساخت با پالت ۸ رنگ، ویرایش inline، حذف دو-کلیکی)؛ چیپ‌های رنگی در پنل جزئیات + نقاط رنگی روی کاور کارت‌ها (overlay تا ارتفاع ردیف‌های گرید مجازی ثابت بماند)؛ آیتم «Tags…» در کانتکست‌منو (با شمارنده + پراپ جدید `hint` در ContextMenuItem)؛ بخش Tags در Advanced Filters (فقط تگ‌های استفاده‌شده، انتخاب بر اساس id تا rename فیلتر فعال را نشکند)؛ `matchesFilters`/`isFiltersEmpty` به‌روز شدند.
- صحت‌سنجی تجربی روی کپی DB واقعی: subquery درست، CASCADE حذف تگ فقط لینک‌ها را می‌برد، FK رد می‌کند، حذف بازی تگ را نگه می‌دارد.

## هاب: فیلترهای کاتالوگ + کارت‌های بزرگ‌تر (همین جلسه)

- **فیلترها زیر سرچ‌بار**: چیپ‌های ژانر (۲۳ تا، IGDB) + سه دراپ‌داون — **Platform** (لیست curated مدرن: PC/PS5/PS4/Series X|S/Xbox One/Switch/Switch 2 id=508/macOS/Linux)، **Release** (پریست‌های upcoming/90d/12m/3y + سال‌های ۷ سال اخیر)، **Rating** (60+ تا 90+) + دکمه‌ی Clear filters. همه‌ی فیلترها بدون سرچ‌ترم هم کار می‌کنند (browse mode) و همه در `hub-search-store` ذخیره می‌شوند (رفت‌وبرگشت حفظ می‌شود).
- **دانش IGDB جدید (تست زنده با کلید واقعی)**: `search` با `where` قابل ترکیب نیست → با هر فیلترِ فعال، کوئری به wildcard (`name ~ *"term"*`) + `sort total_rating_count desc` سوییچ می‌کند؛ سال‌ها به بازه‌ی timestamp اول ژانوس تبدیل می‌شوند (whitelist سمت Rust، 1980-2100).
- **بک‌اند**: `search_hub_games` حالا `filters: HubSearchFilters` (camelCase struct، یک payload واحد) می‌گیرد؛ کامندهای جدید `list_hub_genres` و `list_hub_platforms` (id های curated در `HUB_PLATFORM_IDS`). کل کامندهای هاب: ۱۱.
- **کارت‌های بزرگ‌تر**: قفسه‌ها `w-36`→`w-48` (۱۹۲px)؛ گرید سرچ/Browse از حداکثر ۸ ستون به ۶ (الگوی ۲/۳/۴/۵/۶) — هر کارت تقریباً ۲ برابر.

## صحت‌سنجی (روش این پروژه)

- هر تغییر: `cargo clippy` (صفر وارنینگ) + `npx tsc -b` + `oxlint` + `prettier` + `npm run build`
- تست تجربی روی **کپی دیتابیس واقعی** برای migration ها (ستون + ایندکس + unique + داده‌های موجود)
- تست زندهی کوئری‌های IGDB با کلیدهای واقعی (ذخیره‌شده در settings) قبل از پیاده‌سازی
- شبیه‌سازی الگوریتم‌های فرانت (هیت‌مپ) روی دادهی واقعی
- اجرای اپ بعد از هر تسک (`npm run tauri dev` پس‌زمینه + مانیتور لاگ) — قاعده در `AGENTS.md` ثبت شده

## باقی‌مانده

**هیچ تسک رسمی‌ای باقی نمانده — نقشه‌ی اصلی پروژه ۱۰۰٪ کامل است.** ✅

فقط ایده‌های آینده: ردیابی قیمت ویش‌لیست (CheapShark)، نمای‌های هوشمند، بازی‌های مشابه در هاب، گزارش ماهانه، تری + هاتکی، شورتکات دسکتاپ، Auto-Updater، CI، i18n فارسی/انگلیسی
