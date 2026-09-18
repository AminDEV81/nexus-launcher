/**
 * Nexus Launcher Landing Website - Client Controller
 * Dynamic GitHub Release Fetcher & Bilingual i18n
 */

const CONFIG = {
  defaultVersion: 'v0.2.0',
  defaultDownloadUrl:
    'https://github.com/AminDEV81/nexus-launcher/releases/latest/download/Nexus_0.2.0_x64-setup.exe',
  defaultMsiUrl:
    'https://github.com/AminDEV81/nexus-launcher/releases/latest/download/Nexus_0.2.0_x64_en-US.msi',
  githubApiUrl: 'https://api.github.com/repos/AminDEV81/nexus-launcher/releases/latest',
  githubRepoUrl: 'https://github.com/AminDEV81/nexus-launcher',
}

const TRANSLATIONS = {
  en: {
    nav_features: 'Features',
    nav_comparison: 'Why Nexus?',
    nav_specs: 'Requirements',
    nav_faq: 'FAQ',
    nav_github: 'GitHub',
    nav_download: 'Download',

    hero_badge: '✨ v{version} Released — Blazing Fast & Native',
    hero_title_1: 'The Next-Gen Native',
    hero_title_2: 'PC Game Launcher',
    hero_subtitle:
      'A high-performance personal game library powered by Tauri 2, Rust, and React 19. Integrated Game Booster, real-time Audio Visualizer, and ACID Save Guardian in an ultra-light ~60MB RAM footprint.',
    hero_download_btn: 'Download for Windows',
    hero_download_subtext: 'Windows 10 / 11 (64-bit) • {size} • 100% Free & Open Source',
    hero_source_btn: 'View Source on GitHub',
    hero_other_downloads: 'Other versions & .msi package',

    mockup_now_playing: 'PLAYING NOW',
    mockup_game_title: 'Cyberpunk 2077',
    mockup_booster_active: 'Booster Active',
    mockup_fps_boost: '+18% FPS Boost',
    mockup_ram_freed: '1.4 GB RAM Freed',
    mockup_cloud_synced: 'ACID Save Protected',

    feat_section_badge: 'CUTTING-EDGE CAPABILITIES',
    feat_section_title: 'Engineered for Real Gamers',
    feat_section_subtitle:
      'No telemetry. No forced stores. No bloatware. Just pure native performance and total control over your library.',

    feat_booster_title: 'Game Booster Pro',
    feat_booster_desc:
      'Dynamic OS power plan overdrive, RAM cache trimming, and zero-load background process suspension before every game launch.',

    feat_library_title: 'Smart Library & Edge Hub',
    feat_library_desc:
      'Automated high-res posters, banners, and logos via IGDB and SteamGridDB through our global Cloudflare Edge proxy — no API keys required.',

    feat_soundtrack_title: 'Soundtrack Center & Visualizer',
    feat_soundtrack_desc:
      'Stream original game soundtracks with a cinematic 60 FPS Canvas spectrum analyzer reacting to audio beats, or download for offline play.',

    feat_save_title: 'ACID Save Game Guardian',
    feat_save_desc:
      'Auto-detects save paths for 19,000+ games. Multi-profile isolation with atomic journal snapshots prevents data loss from crashes or power cuts.',

    feat_update_title: 'Seamless In-App Updates',
    feat_update_desc:
      'Silent passive background updates verified with Ed25519 Minisign cryptography. Preserves 100% of your data and settings without re-installation.',

    feat_analytics_title: 'Gamer Passport & Analytics',
    feat_analytics_desc:
      'GitHub-style 91-day activity heatmaps, hourly gaming habit radar charts, playtime tracking, and leveling up as you conquer games.',

    comp_badge: 'BENCHMARK COMPARISON',
    comp_title: 'Nexus vs Traditional Launchers',
    comp_subtitle:
      'See how native Rust and lightweight architecture demolish conventional Chromium-wrapped game managers.',
    comp_metric: 'Metric',
    comp_nexus: 'Nexus Launcher',
    comp_others: 'Steam / GOG / Epic',
    comp_ram: 'Idle RAM Usage',
    comp_ram_nexus: '~60 MB',
    comp_ram_others: '600 MB - 1.2 GB',
    comp_boot: 'Cold Startup Time',
    comp_boot_nexus: '< 0.8 seconds',
    comp_boot_others: '4 - 10 seconds',
    comp_telemetry: 'Telemetry & Trackers',
    comp_telemetry_nexus: 'Zero (0%)',
    comp_telemetry_others: 'Continuous background telemetry',
    comp_offline: 'Offline Capability',
    comp_offline_nexus: '100% Offline-First',
    comp_offline_others: 'Requires recurring online auth',

    specs_badge: 'SYSTEM SPECIFICATIONS',
    specs_title: 'Lightweight & Compatible',
    specs_os: 'Operating System',
    specs_os_val: 'Windows 10 / 11 (64-bit)',
    specs_cpu: 'Processor',
    specs_cpu_val: 'Any 64-bit x86 Dual-Core CPU',
    specs_ram: 'RAM',
    specs_ram_val: '512 MB available (App uses ~60MB)',
    specs_disk: 'Disk Space',
    specs_disk_val: '100 MB free space',

    faq_badge: 'FREQUENTLY ASKED QUESTIONS',
    faq_title: 'Got Questions?',
    faq_q1: 'Is Nexus Launcher completely free?',
    faq_a1:
      'Yes, Nexus Launcher is 100% free and open-source software licensed under MIT. There are no paywalls, subscriptions, or forced advertisements.',
    faq_q2: 'Does it launch games from Steam, Epic, or local folders?',
    faq_a2:
      'Absolutely. Nexus acts as your unified master dashboard. You can add games from Steam, Epic Games, GOG, or any local standalone executable with automatic artwork fetching.',
    faq_q3: 'How does the in-app auto updater work?',
    faq_a3:
      'Nexus automatically checks GitHub Releases using a secure Minisign Ed25519 signature. When an update is found, it downloads in the background and upgrades cleanly without touching your database or game saves.',
    faq_q4: 'Do I need my own IGDB or SteamGridDB API keys?',
    faq_a4:
      'No! Nexus includes a zero-config Cloudflare Edge worker that serves game artwork and metadata immediately out of the box with zero setup.',

    cta_title: 'Ready to Upgrade Your Gaming Experience?',
    cta_subtitle:
      'Join gamers who prioritize speed, privacy, and full control over their game library.',
    cta_download_btn: 'Download Nexus Launcher',

    footer_rights: 'Released under the MIT License.',
    footer_created_by: 'Created by AminDEV81',
  },
  fa: {
    nav_features: 'ویژگی‌ها',
    nav_comparison: 'چرا نکسوس؟',
    nav_specs: 'مشخصات سیستم',
    nav_faq: 'سوالات متداول',
    nav_github: 'گیت‌هاب',
    nav_download: 'دانلود برنامه',

    hero_badge: '✨ نسخه {version} منتشر شد — فوق‌سریع و بومی',
    hero_title_1: 'لانچر بازی بومی نسل جدید',
    hero_title_2: 'برای ویندوز',
    hero_subtitle:
      'کتابخانه بازی‌های شخصی فوق‌سریع و آفلاین‌محور با قدرت Tauri 2، زبان Rust و React 19. مجهز به بوستر هوشمند، ویژوالایزر زنده موسیقی متن و نگهبان فایل‌های سیو با مصرف تنها ۶۰ مگابایت رم.',
    hero_download_btn: 'دانلود مستقیم برای ویندوز',
    hero_download_subtext: 'ویندوز ۱۰ و ۱۱ (۶۴ بیتی) • {size} • ۱۰۰٪ رایگان و متن‌باز',
    hero_source_btn: 'مشاهده سورس در گیت‌هاب',
    hero_other_downloads: 'سایر نسخه‌ها و فایل نصبی .msi',

    mockup_now_playing: 'در حال اجرا',
    mockup_game_title: 'سایبرپانک ۲۰۷۷',
    mockup_booster_active: 'بوستر فعال است',
    mockup_fps_boost: '+۱۸٪ فریم‌ریت بیشتر',
    mockup_ram_freed: '۱.۴ گیگابایت آزادسازی رم',
    mockup_cloud_synced: 'محافظت فایل سیو فعال',

    feat_section_badge: 'قابلیت‌های پیشرفته',
    feat_section_title: 'طراحی‌شده برای گیمرهای واقعی',
    feat_section_subtitle:
      'بدون ردیابی و تبلیغات. بدون فروشگاه‌های اجباری. فقط عملکرد ناب بومی سیستم و کنترل ۱۰۰٪ بر روی بازی‌های شما.',

    feat_booster_title: 'تقویت‌کننده هوشمند بازی (Game Booster)',
    feat_booster_desc:
      'بهینه‌سازی دینامیک مصرف برق ویندوز (Ultra Performance)، تخلیه حافظه کش رم و متوقف‌سازی فرآیندهای سنگین پس‌زمینه قبل از اجرای بازی.',

    feat_library_title: 'کتابخانه هوشمند و گیت‌وی لبه',
    feat_library_desc:
      'دریافت خودکار پوسترها و بنرهای باکیفیت از IGDB و SteamGridDB بدون نیاز به کلید اختصاصی API و بدون قطعی از طریق کلودفلر.',

    feat_soundtrack_title: 'مرکز موسیقی متن و ویژوالایزر',
    feat_soundtrack_desc:
      'پخش و استریم موسیقی متن بازی‌ها همراه با ویژوالایزر سینماتیک ۶۰ فریم و قابلیت ذخیره‌سازی آفلاین آهنگ‌ها.',

    feat_save_title: 'نگهبان امن فایل‌های سیو (Save Guardian)',
    feat_save_desc:
      'شناسایی خودکار پوشه ذخیره بیش از ۱۹,۰۰۰ بازی با سیستم ژورنال اتمیک جهت جلوگیری از خرابی سیوها هنگام قطعی برق یا کرش.',

    feat_update_title: 'به‌روزرسانی خودکار درون‌برنامه‌ای',
    feat_update_desc:
      'دریافت و ارتقای نسخه بدون وقفه با اعتبارسنجی رمزنگاری Ed25519 Minisign بدون نیاز به نصب دستی و با حفظ تمام اطلاعات.',

    feat_analytics_title: 'پاسپورت و آمار اختصاصی گیمر',
    feat_analytics_desc:
      'نقشه حرارتی ۹۱ روزه فعالیت گیمینگ، رادار بررسی ساعات بازی در طول روز، محاسبه دقیق زمان بازی و لول‌آپ گیمر.',

    comp_badge: 'مقایسه عملکرد و بنچمارک',
    comp_title: 'نکسوس در برابر لانچرهای سنتی',
    comp_subtitle:
      'ببینید چگونه معماری بومی Rust و مهندسی دقیق، لانچرهای سنگین کرومیومی را کنار می‌زند.',
    comp_metric: 'معیار بررسی',
    comp_nexus: 'لانچر نکسوس',
    comp_others: 'استیم / اپیک / GOG',
    comp_ram: 'مصرف حافظه رم در حالت بیکار',
    comp_ram_nexus: 'حدود ۶۰ مگابایت',
    comp_ram_others: '۶۰۰ الی ۱۲۰۰ مگابایت',
    comp_boot: 'سرعت راه‌اندازی اولیه (Cold Boot)',
    comp_boot_nexus: 'زیر ۰.۸ ثانیه',
    comp_boot_others: '۴ تا ۱۰ ثانیه',
    comp_telemetry: 'ارسال آمار و ردیابی (Telemetry)',
    comp_telemetry_nexus: 'کاملاً صفر (۰٪)',
    comp_telemetry_others: 'ارسال دائمی لاگ و داده‌ها',
    comp_offline: 'پشتیبانی آفلاین',
    comp_offline_nexus: '۱۰۰٪ آفلاین‌محور',
    comp_offline_others: 'نیاز مکرر به لاگین اینترنتی',

    specs_badge: 'مشخصات سخت‌افزاری مورد نیاز',
    specs_title: 'سبک، بهینه و همه‌جانبه',
    specs_os: 'سیستم عامل',
    specs_os_val: 'ویندوز ۱۰ یا ۱۱ (نسخه ۶۴ بیتی)',
    specs_cpu: 'پردازنده',
    specs_cpu_val: 'هر پردازنده دو هسته‌ای ۶۴ بیتی',
    specs_ram: 'حافظه رم',
    specs_ram_val: '۵۱۲ مگابایت رم آزاد (مصرف خود برنامه ~۶۰MB)',
    specs_disk: 'فضای هارد',
    specs_disk_val: '۱۰۰ مگابایت فضای خالی',

    faq_badge: 'پرسش‌های متداول',
    faq_title: 'سوالات رایج',
    faq_q1: 'آیا لانچر نکسوس کاملاً رایگان است؟',
    faq_a1:
      'بله، نکسوس یک نرم‌افزار ۱۰۰٪ رایگان و متن‌باز (Open Source) تحت لایسنس بین‌المللی MIT است و هیچ تبلیغ یا هزینه مخفی ندارد.',
    faq_q2: 'آیا امکان اجرای بازی‌های استیم، اپیک یا فایل‌های مستقل وجود دارد؟',
    faq_a2:
      'بله. نکسوس به عنوان لانچر مرکزی شما عمل کرده و تمام بازی‌های استیم، اپیک، GOG و حتی فایل‌های اجرایی exe روی هارد را شناسایی و پوسترگذاری می‌کند.',
    faq_q3: 'به‌روزرسانی خودکار درون‌برنامه‌ای چگونه کار می‌کند؟',
    faq_a3:
      'برنامه به صورت خودکار سرور رسمی گیت‌هاب را بررسی کرده و در صورت وجود نسخه جدیدتر، آن را دانلود و پس از تایید امضای دیجیتال جایگزین می‌کند بدون این‌که سیوها یا دیتابیس شما دست بخورد.',
    faq_q4: 'آیا برای دیدن اطلاعات بازی‌ها به کلید API اختصاصی نیاز دارم؟',
    faq_a4:
      'خیر! نکسوس دارای پروکسی ابری کلودفلر لبه است که پوسترها و اطلاعات دیتابیس بازی‌ها را بدون نیاز به هیچ تنظیماتی فورا نمایش می‌دهد.',

    cta_title: 'آماده ارتقای تجربه گیمینگ خود هستید؟',
    cta_subtitle:
      'همین حالا به جمع گیمرهایی بپیوندید که سرعت، حریم خصوصی و سبکی را انتخاب کرده‌اند.',
    cta_download_btn: 'دانلود رایگان لانچر نکسوس',

    footer_rights: 'منتشر شده تحت لایسنس MIT.',
    footer_created_by: 'طراحی و توسعه توسط AminDEV81',
  },
}

class NexusWebsite {
  constructor() {
    this.currentLang = this.getInitialLanguage()
    this.releaseData = {
      version: CONFIG.defaultVersion,
      downloadUrl: CONFIG.defaultDownloadUrl,
      msiUrl: CONFIG.defaultMsiUrl,
      sizeFormatted: '~7.2 MB',
      dateFormatted: 'Latest',
    }

    this.init()
  }

  getInitialLanguage() {
    const saved = localStorage.getItem('nexus_lang')
    if (saved && (saved === 'fa' || saved === 'en')) {
      return saved
    }
    const navLang = (navigator.language || navigator.userLanguage || '').toLowerCase()
    return navLang.startsWith('fa') ? 'fa' : 'en'
  }

  async init() {
    this.setupLanguageToggle()
    this.applyTranslations()
    await this.fetchLatestRelease()
  }

  setupLanguageToggle() {
    const toggleBtn = document.getElementById('lang-toggle-btn')
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const nextLang = this.currentLang === 'fa' ? 'en' : 'fa'
        this.setLanguage(nextLang)
      })
    }
  }

  setLanguage(lang) {
    this.currentLang = lang
    localStorage.setItem('nexus_lang', lang)
    this.applyTranslations()
  }

  applyTranslations() {
    const lang = this.currentLang
    const isRtl = lang === 'fa'
    const t = TRANSLATIONS[lang] || TRANSLATIONS.en

    document.documentElement.lang = lang
    document.documentElement.dir = isRtl ? 'rtl' : 'ltr'

    // Update Language Toggle Button Label
    const toggleBtn = document.getElementById('lang-toggle-btn')
    if (toggleBtn) {
      toggleBtn.textContent = lang === 'fa' ? 'English (EN)' : 'فارسی (FA)'
    }

    // Apply data-i18n elements
    const elements = document.querySelectorAll('[data-i18n]')
    elements.forEach((el) => {
      const key = el.getAttribute('data-i18n')
      if (t[key]) {
        let text = t[key]
        text = text.replace('{version}', this.releaseData.version)
        text = text.replace('{size}', this.releaseData.sizeFormatted)
        el.textContent = text
      }
    })

    // Update dynamic download buttons
    this.updateDownloadLinks()
  }

  async fetchLatestRelease() {
    try {
      const res = await fetch(CONFIG.githubApiUrl, {
        headers: { Accept: 'application/vnd.github.v3+json' },
      })

      if (!res.ok) {
        throw new Error(`GitHub API responded with status ${res.status}`)
      }

      const release = await res.json()
      const tagName = release.tag_name || CONFIG.defaultVersion
      this.releaseData.version = tagName

      // Find Setup.exe asset
      const assets = release.assets || []
      const setupAsset = assets.find(
        (a) => a.name && (a.name.endsWith('-setup.exe') || a.name.endsWith('.exe')),
      )
      const msiAsset = assets.find((a) => a.name && a.name.endsWith('.msi'))

      if (setupAsset && setupAsset.browser_download_url) {
        this.releaseData.downloadUrl = setupAsset.browser_download_url
        if (setupAsset.size) {
          this.releaseData.sizeFormatted = `${(setupAsset.size / (1024 * 1024)).toFixed(1)} MB`
        }
      }

      if (msiAsset && msiAsset.browser_download_url) {
        this.releaseData.msiUrl = msiAsset.browser_download_url
      }

      // Re-apply translations to refresh dynamic tokens
      this.applyTranslations()
    } catch (error) {
      console.warn('[Nexus] Could not fetch live GitHub release, using safe defaults:', error)
      this.applyTranslations()
    }
  }

  updateDownloadLinks() {
    const downloadBtns = document.querySelectorAll('[data-role="download-btn"]')
    downloadBtns.forEach((btn) => {
      btn.href = this.releaseData.downloadUrl
    })

    const msiBtns = document.querySelectorAll('[data-role="msi-btn"]')
    msiBtns.forEach((btn) => {
      btn.href = this.releaseData.msiUrl
    })

    const versionElements = document.querySelectorAll('[data-role="version-tag"]')
    versionElements.forEach((el) => {
      el.textContent = this.releaseData.version
    })
  }
}

// Instantiate on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.nexusWebsite = new NexusWebsite()
})
