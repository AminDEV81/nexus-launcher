# Nexus Metadata & Artwork Gateway (Cloudflare Worker)

Gateway سرویس ابری نکسوس برای پروکسی امن، کش لایه‌ای و ددوپلیکیشن درخواست‌های IGDB و SteamGridDB بدون نیاز به کلید در سمت کلاینت.

## قابلیت‌ها

- **Single-Flight Request Deduplication:** تجمیع درخواست‌های هم‌زمان در یک عملیات واحد بالادستی.
- **Edge Caching & Dynamic TTL:** کش چندلایه هوشمند بر اساس نوع داده (کاورها ۱۴ روز، متادیتا ۳ روز، تازه‌ها ۱ ساعت).
- **Graceful Fallback:** تلفیق خودکار آرت‌ورک رسمی استیم و SteamGridDB؛ در صورت بروز هرگونه اختلال در سرویس‌های شخص ثالث، استیم کاورها و بنرهای رسمی را تأمین می‌کند.
- **Strict Security:** تنها اندپوینت‌های تعریف‌شده در مسیر `/api/v1/` اجازه دسترسی دارند؛ حفاظت کامل در برابر Open Proxy و حملات برست با Rate Limiting داخلی.

---

## راه‌اندازی و استقرار (Deployment)

### ۱. نصب وابستگی‌ها

```bash
cd worker
npm install
```

### ۲. تنظیم کلیدهای سرور (Secrets)

کلیدهای امنیتی را به عنوان Cloudflare Secret ذخیره کنید (این کلیدها هرگز در سورس یا کلاینت قرار نمی‌گیرند):

```bash
npx wrangler secret put IGDB_CLIENT_ID
npx wrangler secret put IGDB_CLIENT_SECRET
npx wrangler secret put STEAMGRIDDB_API_KEY
```

### ۳. استقرار روی کلودفلر

```bash
npx wrangler deploy
```

پس از استقرار، آدرس اختصاصی ورکر شما (مثلاً `https://nexus-metadata-gateway.your-subdomain.workers.dev`) به عنوان پیش‌فرض Gateway در لانچر عمل خواهد کرد.
