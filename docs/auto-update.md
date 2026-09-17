# راهنمای جامع مهندسی سیستم به‌روزرسانی خودکار Nexus (Auto-Update System)

این مستند تشریح‌کننده معماری، پیکربندی امنیتی، و فرآیند انتشار نسخه‌های جدید برای لانچر Nexus است.

---

## ۱. معماری و جریان داده (Architecture Overview)

سیستم به‌روزرسانی Nexus از قابلیت‌های بومی **Tauri 2 Updater Plugin** بر بستر **GitHub Releases** بدون نیاز به هیچ سرور اختصاصی یا پایگاه داده ابری واسط استفاده می‌کند:

```
[توسعه‌دهنده]
      │  git push origin v0.2.0
      ▼
[GitHub Actions (release.yml)]
      │  1. اعتبارسنجی نسخه و اجرای تست‌ها (Clippy, Vitest, TSC, Lint, Build)
      │  2. کامپایل باینری با tauri-action
      │  3. امضای دیجیتال پکیج‌ها با کلید Minisign (Ed25519)
      │  4. تولید خودکار latest.json مطابق با استانداردهای رسمی توری
      ▼
[GitHub Releases]
      │  انتشار installer.exe, update.nsis.zip, .sig و latest.json
      ▼
[کلاینت کاربر (Nexus Launcher)]
      │  1. استعلام از HTTPS: https://github.com/AminDEV81/nexus-launcher/releases/latest/download/latest.json
      │  2. مقایسه نگارش با استاندارد SemVer
      │  3. دانلود پکیج با نمایش درصد، حجم مگابایت، میانگین متحرک سرعت (MB/s) و ETA
      │  4. اعتبارسنجی سخت‌گیرانه امضای دیجیتال پکیج قبل از هرگونه اجرا
      │  5. اجرای اینستالر در حالت Passive و خروج طبیعی جهت جایگزینی فایل باینری
      ▼
[سیستم‌عامل ویندوز]
         جایگزینی فایل اجرایی و راه‌اندازی مجدد برنامه با نسخه جدید
```

---

## ۲. تنظیم کلیدهای امنیتی در GitHub Repository Secrets

برای آنکه پایپ‌لاین CI/CD گیت‌هاب بتواند پکیج‌های آپدیت را امضا کند، باید کلید خصوصی Minisign را در تنظیمات مخزن گیت‌هاب ثبت کنید:

1. به مخزن خود در گیت‌هاب بروید:
   `https://github.com/AminDEV81/nexus-launcher/settings/secrets/actions`
2. بر روی **New repository secret** کلیک کنید.
3. یک سکرت با نام و مقدار زیر بسازید:
   - **Name:** `TAURI_SIGNING_PRIVATE_KEY`
   - **Secret:**
     ```
     dW50cnVzdGVkIGNvbW1lbnQ6IHJzaWduIGVuY3J5cHRlZCBzZWNyZXQga2V5ClJXUlRZMEl5d1ZOVExTTjBLM0o0dmxDMEY3aWUzS3lVTitnRGdSV3ZqMFZ2bm40dktWa0FBQkFBQUFBQUFBQUFBQUlBQUFBQXNOKzZMQUpRWjQydTRnWk45d1lqZXdnZVRWRklUMWlycjBnZkd4Qjd6VkMrUHZMUzAxOWY5RHFZRWl3a0lLU0lBN2JGS1hUVTVhbE4vclBSVlBBK0prcFJZVGxtQ1puaTUyUHdsVE5zeksxdk95QWpoMFNyMFhJaVovQkVPbmN6WHI4YnZmL2V6YVU9Cg==
     ```

> **نکته امنیتی:** کلید عمومی متناظر در فایل `src-tauri/tauri.conf.json` در فیلد `plugins.updater.pubkey` تعبیه شده است:
> `dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDEyMUVCRDcxQzY0QjlEOApSV1RZdVdRYzErc2hBYzNhRWVoZXJZR0tPcjZ3REo5ek94VHZTKy9DcXdhZ2c5ZkdCc3ptVVljUQo=`

### سکرت‌های اختیاری کدسایمینگ ویندوز (Authenticode)

در صورت تهیه گواهی رسمی کدسایمینگ ویندوز (`.pfx`) برای رفع پیام SmartScreen ویندوز:

- سکرت `WINDOWS_CERTIFICATE`: فایل `.pfx` تبدیل‌شده به رشته Base64
- سکرت `WINDOWS_CERTIFICATE_PASSWORD`: رمز عبور فایل گواهی

---

## ۳. فرآیند انتشار نسخه جدید توسط توسعه‌دهنده (Release Workflow)

برای انتشار یک نسخه جدید از Nexus، تنها کافی است ۴ مرحله ساده زیر را انجام دهید:

```bash
# ۱. همگام‌سازی شماره نسخه در package.json و src-tauri/tauri.conf.json (مثلاً 0.2.0)

# ۲. ثبت تغییرات
git add package.json src-tauri/tauri.conf.json
git commit -m "chore(release): bump version to 0.2.0"

# ۳. ایجاد تگ نسخه
git tag v0.2.0

# ۴. ارسال به گیت‌هاب همراه با تگ
git push origin main
git push origin v0.2.0
```

بلافاصله پایپ‌لاین گیت‌هاب اجرا شده و پس از اعتبارسنجی و ساخت، ریلیز رسمی به همراه فایل `latest.json` در بخش Releases منتشر خواهد شد.

---

## ۴. تضمین حفظ داده‌های کاربر (Data Safety Guarantee)

سیستم آپدیتر طوری پیکربندی شده است که:

- اینستالر اولیه با حالت `currentUser` فایل‌ها را در پوشه Local App نصب می‌کند و نیازی به دسترسی ادمین ندارد.
- آپدیتر با حالت `passive` اجرا می‌شود که بدون دخالت کاربر و بدون پرسش‌های اضافه، فقط باینری‌های برنامه را جایگزین می‌نماید.
- دایرکتوری ذخیره‌سازی داده‌های کاربر (`%APPDATA%/com.nexus.launcher/`) شامل پایگاه داده SQLite (`nexus.db`)، کاورها و تصاویر کش‌شده (`artwork/`)، لاگ‌های زمان بازی، تنظیمات و سیوها کاملاً مستقل بوده و توسط اینستالر یا آپدیتر دستکاری نمی‌شود.

---

## ۵. سیستم محافظت از کرش و مسیر بازیابی (Crash Guard & Recovery)

اگر نسخه جدیدی نصب شود ولی به دلیل ناهماهنگی سخت‌افزاری، نقص درایور یا خطای پیش‌بینی‌نشده، برنامه ۳ بار متوالی بلافاصله پس از اجرا دچار کرش شود:

- مکانیزم **Crash Guard** در فایل `src/services/health-guard.ts` فعال می‌شود.
- در اجرای بعدی، نوار اختصاصی **Recovery Guard** در بالای صفحه ظاهر می‌شود.
- این نوار نسخه سالم قبلی (`last_known_good_version`) را به کاربر اطلاع داده و دکمه دانلود مستقیم نسخه پایدار قبلی را از GitHub Releases در اختیار وی قرار می‌دهد.
