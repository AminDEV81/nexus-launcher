# Nexus Launcher — وضعیت فنی پروژه (نسخه `0.6.0`)

_آخرین به‌روزرسانی: ۲۰۲۶-۱۰-۱۵_

## بازبینی جامع عملکرد، رابط کاربری، امنیت، رفع باگ و تست‌نویسی (دور دوم)

در این مرحله بازبینی عمیق‌تری روی عملکرد فرانت‌اند/بک‌اند، انیمیشن‌ها، هم‌زمانی، امنیت و تست‌ها انجام شد و موارد زیر پیاده‌سازی گردید:

1. **رفع باگ بحرانی تکرار Listenerها و طوفان رندر در Soundtrack Player (`use-soundtrack-player.ts`، `app-shell.tsx`، `track-row.tsx`، `album-card.tsx`):**
   - هوک `useSoundtrackPlayer` قبلاً در بیش از ۵۰ کامپوننت (از جمله هر `TrackRow`، هر `AlbumCard`، `MiniPlayer` و `ExpandedPlayer`) فراخوانی می‌شد و در هر نمونه یک `window.addEventListener('keydown', ...)` و دو درخواست IPC (`loadFavorites` و `loadHistory`) ثبت می‌کرد؛ در نتیجه فشردن کلید `Space` یا `Ctrl+Arrow` هم‌زمان چندین بار اجرا می‌شد و با هر تغییر `currentTime` تمام ردیف‌ها دوباره رندر و Listenerها بازسازی می‌شدند.
   - ثبت میانبرهای صفحه‌کلید و بارگذاری اولیه به هوک سراسری `useSoundtrackGlobalShortcuts` (فقط یک‌بار در `AppShell` با خواندن مستقیم `useSoundtrackStore.getState()`) منتقل شد و کامپوننت‌های `TrackRow` و `AlbumCard` با `React.memo` و سلکتورهای دقیق Zustand بهینه‌سازی شدند.
2. **بهینه‌سازی رندرینگ گرید و لیست کتابخانه بازی‌ها (`game-card.tsx`، `game-grid.tsx`، `game-list.tsx`، `use-downloads.ts`):**
   - افزودن هوک انتخابی `useActiveDownloadForGame` مبتنی بر `select` در TanStack Query تا در زمان دانلود فعال، تیک‌های پیشرفت (هر ۴۰۰ میلی‌ثانیه) باعث رندر مجدد تمام کارت‌های کتابخانه نشوند و فقط کارتِ در حال دانلود به‌روز شود.
   - بسته‌بندی `GameCard` و `GameListRow` در `React.memo`، تثبیت رفرنس `onSelect` در `GameGrid` و `GameList`، و رفع باگ عدم فراخوانی `event.stopPropagation()` روی دکمه منوی سه‌نقطه در `GameListRow`.
3. **رفع باگ زمان‌بند دانلود و حالت گیمینگ (`use-download-scheduler.ts` و `use-gaming-mode.ts`):**
   - رفع باگی که در آن تغییر آرایه `downloads` در وابستگی‌های `useEffect` باعث می‌شد زمان‌بند بلافاصله پس از توقف دستی (Pause) توسط کاربر، دانلود را دوباره Resume کند.
   - بررسی لیست دانلودهای در صف (`queuedDownloads.length === 0`) پیش از اجرای خاموشی خودکار سیستم (`shutdown_system`) تا در دانلودهای چندبخشی نوبتی، سیستم پیش از اتمام پارت‌های در صف خاموش نشود.
4. **رفع باگ از دست رفتن پیشرفت دانلودهای در صف و بهبود استخراج آرشیو (`commands/download.rs`):**
   - توابع `start_next_global_queued_download` و `start_next_sequential_part` اکنون ستون `chunk_state` را از دیتابیس می‌خوانند و به `begin_download` می‌دهند تا دانلودهای نیمه‌کاره در صف از صفر شروع نشوند.
   - اصلاح کوئری `start_next_sequential_part` به `status = 'queued'` (عدم اجرای اجباری پارت‌هایی که کاربر دستی متوقف کرده) و فراخوانی `start_next_global_queued_download` پس از `pause_download`، `cancel_download` و `delete_download`.
   - پشتیبانی از لغو فوری (`CancellationToken`) در حین استخراج فایل‌های `.zip` و `.rar` و استفاده از `entry.enclosed_name()` در `extract_zip` برای محافظت صریح در برابر Zip-Slip.
5. **محافظت در برابر SSRF، محدودیت حجم در دانلود آواتار و کاورها (`commands/profiles.rs`، `metadata/artwork.rs`، `commands/download.rs`):**
   - افزودن اعتبارسنجی کامل URL و مسدودسازی IPهای خصوصی/لوپ‌بک (`is_blocked_host_or_ip`) در `download_avatar_data_url`، `download_artwork` و `validate_download_url` همراه با سقف استریم ۱۰ مگابایت و پاکسازی نوع MIME در دانلود آواتار.
6. **رفع باگ محاسبه مصرف CPU، حذف مسدودسازی ترد اصلی و رفع نشت تایمر ۱ میلی‌ثانیه‌ای ویندوز (`system.rs`، `booster.rs`، `launch.rs`، `import.rs`، `overlay/commands.rs`):**
   - نگهداری نمونه پایدار `System` در `system.rs` برای محاسبه دقیق دلتای مصرف CPU در `get_live_metrics` و انتقال `get_system_specs`، `get_live_metrics`، `scan_folder_for_executables`، `compute_path_size` و `soundtrack_scan_library` به `tokio::task::spawn_blocking`.
   - فراخوانی `timeEndPeriod(1)` در `booster::restore_power_plan` هنگام بسته شدن بازی، حذف فراخوانی غیرضروری `ProcessesToUpdate::All` در `launch.rs` هنگام فعال بودن `ProcessJobTracker`، و افزودن کش ۵ ثانیه‌ای بازی‌های نصب‌شده در `OverlayState` برای حذف کوئری‌های مکرر SQLite در هر تیک اورلی.
7. **انطباق کامل انیمیشن‌ها با `useAnimationSpeed()` و جلوگیری از انباشت درخواست‌های اورلی (`mini-player.tsx`، `expanded-player.tsx`، `queue-drawer.tsx`، `album-detail-modal.tsx`، `update-modal.tsx`، `download-card.tsx`، `grouped-download-card.tsx`، `overlay-window-page.tsx`).**

## خلاصه معماری فعلی (`v0.6.0`)

- **Frontend**: React 19 + TypeScript 6 + Vite 8 + Tailwind CSS 4 + Framer Motion 13 + React Router (Hash) + Zustand + TanStack Query v5
- **Backend**: Tauri v2 (Rust 2021) + rusqlite (SQLite, WAL + busy_timeout) + reqwest + tokio + sysinfo + windows-sys (Win32, ETW, PDH, Power) + steamlocate + winreg + zip / sevenz-rust / unrar
- **Migrations**: ۲۱ مایگریشن نسخه‌دار (`0002` تا `0021`)
- **Cloud Gateway**: Cloudflare Edge Worker (`worker/`) با Single-Flight Deduplication، Edge Cache و Fallback خودکار بین IGDB، SteamGridDB و Steam Store
