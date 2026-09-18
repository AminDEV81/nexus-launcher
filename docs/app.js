/**
 * Nexus Launcher Landing Website - Application Controller & Engine
 * Official Brand Gem Identity & Interactive Obsidian Mockup
 */

const CONFIG = {
  defaultVersion: 'v0.2.0',
  defaultDownloadUrl:
    'https://github.com/AminDEV81/nexus-launcher/releases/latest/download/Nexus_0.2.0_x64-setup.exe',
  githubApiUrl: 'https://api.github.com/repos/AminDEV81/nexus-launcher/releases/latest',
  githubRepoUrl: 'https://github.com/AminDEV81/nexus-launcher',
}

const TRANSLATIONS = {
  fa: {
    top_bar_msg: 'نسخه ۰.۲.۰ لانچر نکسوس منتشر شد — مجهز به پلیر موسیقی متن و محافظت اتمیک سیوها!',
    top_bar_cta: 'دانلود مستقیم رایگان ←',
    nav_showcase: 'نمای زنده برنامه',
    nav_features: 'ویژگی‌های کلیدی',
    nav_booster: 'بوستر رم',
    nav_comparison: 'چرا نکسوس؟',
    nav_specs: 'مشخصات فنی',
    nav_faq: 'سوالات',
    nav_download_btn: 'دانلود رایگان',

    hero_title_1: 'لانچر بومی، رعدآسا و هوشمند',
    hero_title_2: 'برای تمام بازی‌های شما در ویندوز',
    hero_subtitle:
      'توسعه یافته بر پایه معماری بومی Rust و Tauri 2. فقط ۶۰ مگابایت مصرف رم، همراه با بوستر خودکار، پلیر موسیقی بازی‌ها و گاوصندوق اتمیک سیوها بدون ذره‌ای تبلیغات یا جاسوس‌افزار.',
    hero_download_btn: 'دانلود مستقیم نسخه رسمی v0.2.0',
    hero_source_btn: 'مشاهده پروژه در گیت‌هاب',

    badge_free: '۱۰۰٪ رایگان و بدون پرداخت',
    badge_offline: 'کاملاً آفلاین بدون نیاز به لاگین',
    badge_win: 'سازگار با ویندوز ۱۰ و ۱۱ (x64)',

    stat_ram_num: '~۶۰ MB',
    stat_ram_lbl: 'مصرف رم در حالت بیکار',
    stat_boot_num: '< ۰.۴ ثانیه',
    stat_boot_lbl: 'زمان باز شدن اولیه (Cold Start)',
    stat_games_num: '۱۹,۰۰۰+',
    stat_games_lbl: 'پشتیبانی خودکار از سیو بازی‌ها',
    stat_zero_num: '۰٪ تبلیغات',
    stat_zero_lbl: 'بدون ردیابی و بدون فروشگاه اجباری',

    mockup_pill: 'شبیه‌ساز تعاملی رابط کاربری برنامه',
    mockup_heading: 'یک شاهکار واقعی روی دسکتاپ شما',
    mockup_subheading:
      'روی ماژول‌ها و تب‌های سایدبار کلیک کنید تا قابلیت‌های قدرتمند نکسوس لانچر را مستقیماً همین‌جا لمس کنید:',
    badge_floating_ram: '⚡ رم فعال: ۵۸ مگابایت',
    badge_floating_turbo: '🚀 بوستر سخت‌افزاری آماده به کار',
    mockup_search_placeholder: 'جستجو در بازی‌ها و امکانات...',

    tab_library: 'کتابخانه بازی‌ها',
    tab_booster: 'بوستر سیستم',
    tab_soundtrack: 'مرکز موسیقی',
    tab_saves: 'نگهبان سیو',
    tab_stats: 'پاسپورت گیمر',

    mockup_modules_title: 'ماژول‌های هوشمند و پیشرفته لانچر',
    mockup_modules_desc: 'روی هر قابلیت کلیک کنید تا عملکرد بلادرنگ آن را تجربه نمایید',
    mod_card_lib_title: 'کتابخانه هوشمند بازی‌ها',
    mod_card_lib_desc: 'شناسایی خودکار بیش از ۱۹,۰۰۰ بازی نصب شده از استیم، اپیک، GOG و دستی',
    btn_mod_lib: 'مدیریت کتابخانه',

    mod_card_boost_title: 'بوستر و تقویت سخت‌افزار',
    mod_card_boost_desc: 'پاکسازی رم با EmptyWorkingSet و ارتقای اولویت CPU به حالت Realtime',
    btn_mod_boost: 'فعال‌سازی بوست',

    mod_card_sound_title: 'استودیو موسیقی متن',
    mod_card_sound_desc: 'استریم آنلاین و دانلود نامحدود قطعات اورجینال با اکولایزر صوتی سینماتیک',
    btn_mod_sound: 'پخش موسیقی متن',

    mod_card_save_title: 'گاوصندوق اتمیک سیوها',
    mod_card_save_desc: 'تهیه اسنپ‌شات خودکار قبل از اجرای بازی و پیشگیری قطعی از سوختن سیو',
    btn_mod_save: 'مشاهده اسنپ‌شات‌ها',

    mockup_boost_title: 'وضعیت سخت‌افزاری و بوستر',
    mockup_boost_desc: 'بهینه‌سازی دینامیک هسته‌ها و آزادسازی حافظه کاری ویندوز',
    mockup_sound_title: 'استودیو موسیقی متن بازی‌ها',
    mockup_sound_desc: 'استریم و دانلود نامحدود قطعات اورجینال بازی‌ها',
    mockup_save_title: 'نگهبان اتمیک فایل‌های سیو',
    mockup_save_desc: 'شناسایی خودکار پوشه ذخیره با تضمین سلامت ACID',
    mockup_stats_title: 'پاسپورت اختصاصی و تحلیل گیمینگ',
    mockup_stats_desc: 'هیت‌مپ فعالیت و مدت زمان بازی‌های شما',

    bento_pill: 'معماری و قابلیت‌های اختصاصی',
    bento_heading: 'طراحی شده با نهایت وسواس مهندسی',
    bento_subheading:
      'هیچ وب‌ویو کند یا فریم‌ورک‌های سنگین در کار نیست. هر خط کد نکسوس برای اوج سرعت و حداکثر بهره‌وری پردازنده نوشته شده است.',
    bento_rust_title: 'معماری اصیل Rust و Tauri 2 بدون کرومیوم',
    bento_rust_desc:
      'برخلاف نرم‌افزارهای مبتنی بر الکترون که صدها مگابایت رم را صرف یک مرورگر مخفی می‌کنند، نکسوس لانچر مستقیماً به کتابخانه‌های محلی و بومی ویندوز کامپایل شده است. سرعت باز شدن زیر ۰.۴ ثانیه و مصرف رم تنها ۶۰ مگابایت!',
    bento_booster_title: 'بوستر خودکار و آزادسازی رم',
    bento_booster_desc:
      'استفاده از API سیستمی EmptyWorkingSet برای پاکسازی کش‌های هرز رم قبل از اجرای هر بازی.',
    btn_flush_ram: '🚀 تست زنده پاکسازی رم',
    bento_save_title: 'نگهبان اتمیک فایل‌های سیو',
    bento_save_desc:
      'پشتیبانی از بیش از ۱۹,۰۰۰ بازی با ژورنال اتمیک ACID. حتی اگر کامپیوتر وسط بازی خاموش شود، سیوهای قبلی دست‌نخورده باقی می‌مانند.',
    bento_sound_title: 'استودیو موسیقی متن بازی‌ها',
    bento_sound_desc:
      'استریم و دانلود قطعات موسیقی متن هزاران بازی ویدیویی بدون نیاز به یوتیوب با اکولایزر صوتی سینماتیک زنده.',
    bento_passport_title: 'پاسپورت اختصاصی و حریم خصوصی',
    bento_passport_desc:
      'محاسبه ساعات بازی، نمودار عادات شبانه‌روز و دستاوردهای شخصی. بدون ارسال حتی ۱ بایت تلمتری یا اطلاعات هویتی به سرورها.',

    calc_heading: 'چقدر منابع با Nexus Launcher صرفه‌جویی می‌کنید؟',
    calc_subheading:
      'تعداد بازی‌های خود را انتخاب کنید تا ببینید سیستم شما چقدر سبک‌تر نفس خواهد کشید:',
    calc_lbl_ram: 'صرفه‌جویی رم در هر لحظه',
    calc_lbl_fps: 'افزایش پایداری فریم‌ریت',
    calc_lbl_battery: 'بهبود مصرف باتری لپ‌تاپ',

    comp_pill: 'مقایسه شفاف و بدون اغراق',
    comp_heading: 'چرا نکسوس لانچر انتخاب اول گیمرهاست؟',
    comp_subheading: 'نگاهی به تفاوت فاحش نکسوس با لانچرهای غول‌پیکر تجاری در پارامترهای حیاتی:',
    th_feature: 'ویژگی / سنجه',
    row_ram: 'مصرف رم در حالت بیکار',
    row_boot: 'سرعت بالا آمدن (Cold Boot)',
    row_size: 'حجم فایل نصبی دانلودی',
    row_ads: 'تبلیغات و فروشگاه اجباری',
    row_offline: 'حالت آفلاین و عدم نیاز به لاگین',
    row_save: 'نگهبان اتمیک سیو ۱۹,۰۰۰ بازی',

    specs_heading: 'مشخصات مورد نیاز سیستم',
    specs_subheading:
      'نکسوس به قدری سبک است که حتی روی لپ‌تاپ‌های قدیمی بدون کمترین افت سرعتی کار می‌کند:',
    specs_os_lbl: 'سیستم‌عامل',
    specs_os_val: 'ویندوز ۱۰ یا ۱۱ (۶۴ بیتی)',
    specs_cpu_lbl: 'پردازنده (CPU)',
    specs_cpu_val: 'هر پردازنده ۲ هسته‌ای x64',
    specs_ram_lbl: 'حافظه رم',
    specs_ram_val: '۱۲۸ مگابایت رم آزاد',
    specs_disk_lbl: 'فضای خالی دیسک',
    specs_disk_val: 'کمتر از ۲۵ مگابایت',

    faq_heading: 'پرسش‌های متداول',
    faq_subheading: 'پاسخ شفاف به سوالاتی که ممکن است در ذهن داشته باشید:',
    faq_q1: 'آیا نکسوس لانچر کاملاً رایگان است؟',
    faq_a1:
      'بله، صد در صد رایگان و متن‌باز تحت لایسنس MIT. هیچ‌گونه نسخه پولی، اشتراک یا تبلیغات پنهانی در برنامه وجود ندارد.',
    faq_q2: 'آیا بازی‌های کرک‌شده و دستی را هم پشتیبانی می‌کند؟',
    faq_a2:
      'بله! علاوه بر تشخیص خودکار بازی‌های استیم، اپیک گیمز و GOG، می‌توانید هر فایل اجرایی .exe یا پوشه بازی را تنها با کشیدن و رها کردن اضافه کنید. نکسوس کاورها، ژانرها و متادیتا را خودکار دریافت می‌کند.',
    faq_q3: 'به‌روزرسانی‌ها چگونه انجام می‌شوند؟',
    faq_a3:
      'برنامه مجهز به سیستم خودکار Tauri Updater است. به محض انتشار نسخه جدید در گیت‌هاب، اعلان داخل برنامه نشان داده شده و با یک کلیک بدون نیاز به دانلود دوباره سایت آپدیت می‌شود.',
    faq_q4: 'آیا اکانت یا اطلاعات من برای کسی ارسال می‌شود؟',
    faq_a4:
      'خیر! تمام داده‌ها، آمارها و سیوها به صورت محلی در دیتابیس رمزگذاری‌شده SQLite روی کامپیوتر خودتان ذخیره می‌شوند. نکسوس به هیچ سرور مرکزی متصل نیست.',

    cta_heading: 'همین حالا Nexus Launcher را تجربه کنید',
    cta_subheading:
      'لذت مدیریت یکپارچه بازی‌ها با نهایت سرعت، بدون کرومیوم و با کمترین مصرف رم در تاریخ لانچرهای ویندوز.',
    cta_btn_download: 'دانلود رایگان (فایل نصبی x64)',
    cta_btn_all_releases: 'سایر نسخه‌ها در گیت‌هاب',
    footer_license: 'منتشر شده تحت مجوز رسمی و آزاد MIT',
    footer_author: 'طراحی و توسعه توسط',
  },
  en: {
    top_bar_msg:
      'Nexus Launcher v0.2.0 released — featuring Game Soundtrack Studio & Atomic Save Guardian!',
    top_bar_cta: 'Download Free Direct &rarr;',
    nav_showcase: 'Live Showcase',
    nav_features: 'Features',
    nav_booster: 'RAM Booster',
    nav_comparison: 'Why Nexus?',
    nav_specs: 'Specs',
    nav_faq: 'FAQ',
    nav_download_btn: 'Download Free',

    hero_title_1: 'The Native, Blazing Fast',
    hero_title_2: 'Game Launcher for Windows',
    hero_subtitle:
      'Built natively with Rust and Tauri 2. Ultra-light ~60MB RAM footprint, automated hardware Game Booster, original soundtrack player, and atomic ACID save backups with zero ads or telemetry.',
    hero_download_btn: 'Download Official Setup v0.2.0',
    hero_source_btn: 'View Project on GitHub',

    badge_free: '100% Free & Open Source',
    badge_offline: 'Fully Offline (No Login Required)',
    badge_win: 'Windows 10 & 11 (64-bit)',

    stat_ram_num: '~60 MB',
    stat_ram_lbl: 'Idle RAM Footprint',
    stat_boot_num: '< 0.4s',
    stat_boot_lbl: 'Instant Cold Boot Time',
    stat_games_num: '19,000+',
    stat_games_lbl: 'Games with Auto-Save Guard',
    stat_zero_num: '0% Ads',
    stat_zero_lbl: 'No Telemetry or Forced Stores',

    mockup_pill: 'INTERACTIVE APP INTERFACE SIMULATOR',
    mockup_heading: 'A True Masterpiece on Your Desktop',
    mockup_subheading:
      'Click through the capability modules and sidebar tabs to experience Nexus Launcher live right here:',
    badge_floating_ram: '⚡ Active RAM: 58 MB',
    badge_floating_turbo: '🚀 Hardware Booster Armed',
    mockup_search_placeholder: 'Search games and features...',

    tab_library: 'Game Library',
    tab_booster: 'System Booster',
    tab_soundtrack: 'Soundtrack Studio',
    tab_saves: 'Save Guardian',
    tab_stats: 'Gamer Passport',

    mockup_modules_title: 'Smart Launcher Modules',
    mockup_modules_desc:
      'Click each capability to experience real-time performance inside the simulator',
    mod_card_lib_title: 'Smart Game Library',
    mod_card_lib_desc:
      'Auto-detecting 19,000+ installed games across Steam, Epic, GOG and custom folders',
    btn_mod_lib: 'Manage Library',

    mod_card_boost_title: 'Turbo Hardware Booster',
    mod_card_boost_desc: 'Instant RAM working set trimming and Realtime CPU scheduling',
    btn_mod_boost: 'Engage Booster',

    mod_card_sound_title: 'Soundtrack Studio',
    mod_card_sound_desc:
      'Streaming high-fidelity game soundtracks with real-time 60 FPS spectrum visualizer',
    btn_mod_sound: 'Play Soundtrack',

    mod_card_save_title: 'Atomic Save Guardian',
    mod_card_save_desc:
      'Pre-launch snapshots ensuring zero save loss from crashes or power failures',
    btn_mod_save: 'Inspect Snapshots',

    mockup_boost_title: 'Hardware Telemetry & Booster',
    mockup_boost_desc: 'Dynamic CPU thread priority & Win32 working set memory trimming',
    mockup_sound_title: 'Original Game Soundtrack Studio',
    mockup_sound_desc:
      'Unlimited streaming & downloading of original game tracks with real-time visualizer',
    mockup_save_title: 'Atomic Save Protection Journal',
    mockup_save_desc: 'Automated ACID pre-launch snapshotting with zero corruption risk',
    mockup_stats_title: 'Gamer Passport & Analytics',
    mockup_stats_desc: 'Comprehensive playtime heatmaps and local XP level tracking',

    bento_pill: 'ARCHITECTURE & ADVANCED FEATURES',
    bento_heading: 'Engineered with Absolute Obsession',
    bento_subheading:
      'Zero slow webviews. Zero bloated Electron wrappers. Every single line of Nexus is tuned for maximum CPU efficiency.',
    bento_rust_title: 'Pure Rust & Tauri 2 Architecture (No Chromium)',
    bento_rust_desc:
      'Unlike Electron clients that run a hidden browser consuming 600MB+ RAM, Nexus compiles straight to native Win32 APIs. Sub-0.4s boot time and ~60MB RAM footprint!',
    bento_booster_title: 'Automated RAM & Hardware Booster',
    bento_booster_desc:
      'Uses native Win32 EmptyWorkingSet APIs to clear system memory caches before game launch.',
    btn_flush_ram: '🚀 Test Live RAM Flush',
    bento_save_title: 'Atomic ACID Save Guardian',
    bento_save_desc:
      'Detects save directories across 19,000+ games. Snapshots protect your progress against power outages or game crashes.',
    bento_sound_title: 'Game Soundtrack Studio',
    bento_sound_desc:
      'Stream high-res audio tracks directly inside the launcher with real-time Canvas frequency spectrum.',
    bento_passport_title: 'Gamer Passport & 100% Privacy',
    bento_passport_desc:
      'Tracks playtime patterns and achievements strictly in local encrypted SQLite. Not a single byte of personal data is sent to external servers.',

    calc_heading: 'How Much System Resources Do You Save?',
    calc_subheading:
      'Select your installed game count to calculate your exact memory and battery savings:',
    calc_lbl_ram: 'Instant RAM Saved',
    calc_lbl_fps: 'FPS Stability Gain',
    calc_lbl_battery: 'Laptop Battery Extension',

    comp_pill: 'TRANSPARENT BENCHMARKS',
    comp_heading: 'Why Gamers Prefer Nexus Launcher',
    comp_subheading: 'A side-by-side performance breakdown against commercial corporate launchers:',
    th_feature: 'Metric / Capability',
    row_ram: 'Idle RAM Consumption',
    row_boot: 'Cold Boot Latency',
    row_size: 'Installer Package Size',
    row_ads: 'Ads & Forced Stores',
    row_offline: 'Offline Mode & Privacy',
    row_save: '19,000+ Game Save Guardian',

    specs_heading: 'System Requirements',
    specs_subheading: 'Nexus runs effortlessly even on older budget laptops with zero slowdowns:',
    specs_os_lbl: 'Operating System',
    specs_os_val: 'Windows 10 or 11 (64-bit)',
    specs_cpu_lbl: 'Processor (CPU)',
    specs_cpu_val: 'Any Dual-Core x64 CPU',
    specs_ram_lbl: 'Memory (RAM)',
    specs_ram_val: '128 MB Free RAM',
    specs_disk_lbl: 'Disk Storage',
    specs_disk_val: 'Less than 25 MB',

    faq_heading: 'Frequently Asked Questions',
    faq_subheading: 'Clear answers to common questions:',
    faq_q1: 'Is Nexus Launcher completely free?',
    faq_a1:
      'Yes, 100% free and open-source under the MIT license. No subscriptions, paywalls, or hidden ads.',
    faq_q2: 'Does it support manual / standalone games?',
    faq_a2:
      'Absolutely! Beyond Steam and Epic Games auto-detection, you can drag and drop any .exe file. Covers and metadata are fetched automatically.',
    faq_q3: 'How do in-app updates work?',
    faq_a3:
      'Equipped with Tauri Updater. When a new release drops on GitHub, you can upgrade with 1 click without losing saves or configuration.',
    faq_q4: 'Is my data or account sent to any server?',
    faq_a4:
      'Never. All data and game stats reside strictly inside your local SQLite database on your machine.',

    cta_heading: 'Experience Nexus Launcher Today',
    cta_subheading:
      'Take control of your gaming library with unprecedented speed and native Rust efficiency.',
    cta_btn_download: 'Download Free (x64 Setup)',
    cta_btn_all_releases: 'All Releases on GitHub',
    footer_license: 'Released under the official MIT License',
    footer_author: 'Designed & developed by',
  },
}

class WebsiteEngine {
  constructor() {
    this.currentLang = this.getInitialLanguage()
    this.releaseData = {
      version: CONFIG.defaultVersion,
      downloadUrl: CONFIG.defaultDownloadUrl,
      sizeFormatted: '~7.2 MB',
    }

    this.init()
  }

  getInitialLanguage() {
    const saved = localStorage.getItem('nexus_lang')
    if (saved && (saved === 'fa' || saved === 'en')) {
      return saved
    }
    return 'fa' // Persian default
  }

  init() {
    this.setupCursorSpotlight()
    this.setupThreeBackground()
    this.setupLanguage()
    this.setupMockupInteractions()
    this.setupTiltCards()
    this.fetchLatestRelease()
  }

  setupCursorSpotlight() {
    const spotlight = document.getElementById('cursor-spotlight')
    if (!spotlight) return

    window.addEventListener(
      'mousemove',
      (e) => {
        spotlight.style.setProperty('--spot-x', `${e.clientX}px`)
        spotlight.style.setProperty('--spot-y', `${e.clientY}px`)
      },
      { passive: true },
    )
  }

  setupLanguage() {
    this.applyTranslations()

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
    const t = TRANSLATIONS[lang] || TRANSLATIONS.fa

    document.documentElement.lang = lang
    document.documentElement.dir = isRtl ? 'rtl' : 'ltr'

    const toggleBtn = document.getElementById('lang-toggle-btn')
    if (toggleBtn) {
      toggleBtn.textContent = lang === 'fa' ? 'English (EN)' : 'فارسی (FA)'
    }

    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n')
      if (t[key]) {
        el.textContent = t[key]
      }
    })

    this.updateDownloadLinks()
  }

  async fetchLatestRelease() {
    try {
      const res = await fetch(CONFIG.githubApiUrl, {
        headers: { Accept: 'application/vnd.github.v3+json' },
      })
      if (!res.ok) throw new Error(`GitHub API HTTP ${res.status}`)

      const release = await res.json()
      this.releaseData.version = release.tag_name || CONFIG.defaultVersion

      const assets = release.assets || []
      const exeAsset = assets.find((a) => a.name && a.name.endsWith('.exe'))
      if (exeAsset) {
        this.releaseData.downloadUrl = exeAsset.browser_download_url
        if (exeAsset.size) {
          this.releaseData.sizeFormatted = `${(exeAsset.size / (1024 * 1024)).toFixed(1)} MB`
        }
      }

      this.updateDownloadLinks()
    } catch (err) {
      console.warn('[Nexus] Fallback release used:', err)
      this.updateDownloadLinks()
    }
  }

  updateDownloadLinks() {
    document.querySelectorAll('[data-role="download-btn"]').forEach((btn) => {
      btn.href = this.releaseData.downloadUrl
    })
    document.querySelectorAll('[data-role="download-size"]').forEach((el) => {
      el.textContent = this.releaseData.sizeFormatted
    })
  }

  setupMockupInteractions() {
    const tabs = document.querySelectorAll('[data-mockup-tab]')
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const target = tab.getAttribute('data-mockup-tab')
        window.switchMockupView(target)
      })
    })
  }

  setupTiltCards() {
    const cards = document.querySelectorAll('.tilt-card')
    cards.forEach((card) => {
      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect()
        const x = e.clientX - rect.left
        const y = e.clientY - rect.top
        const cx = rect.width / 2
        const cy = rect.height / 2

        const rx = ((y - cy) / cy) * -8
        const ry = ((x - cx) / cx) * 8

        card.style.transform = `perspective(1000px) rotateX(${rx}deg) rotateY(${ry}deg) scale3d(1.01, 1.01, 1.01)`
        card.style.setProperty('--mouse-x', `${(x / rect.width) * 100}%`)
        card.style.setProperty('--mouse-y', `${(y / rect.height) * 100}%`)
      })

      card.addEventListener('mouseleave', () => {
        card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)'
      })
    })
  }

  setupThreeBackground() {
    const canvas = document.getElementById('bg-3d-canvas')
    if (!canvas || typeof THREE === 'undefined') return

    let isVisible = true
    document.addEventListener('visibilitychange', () => {
      isVisible = !document.hidden
    })

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    )
    camera.position.z = 40

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: false,
      powerPreference: 'low-power',
    })
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))

    const particleCount = 140
    const geometry = new THREE.BufferGeometry()
    const positions = new Float32Array(particleCount * 3)

    for (let i = 0; i < particleCount * 3; i += 3) {
      positions[i] = (Math.random() - 0.5) * 85
      positions[i + 1] = (Math.random() - 0.5) * 85
      positions[i + 2] = (Math.random() - 0.5) * 45
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

    const material = new THREE.PointsMaterial({
      color: 0x7c5cff,
      size: 1.5,
      transparent: true,
      opacity: 0.65,
    })
    const particles = new THREE.Points(geometry, material)
    scene.add(particles)

    const coreGeo = new THREE.IcosahedronGeometry(12, 1)
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      wireframe: true,
      transparent: true,
      opacity: 0.09,
    })
    const core = new THREE.Mesh(coreGeo, coreMat)
    scene.add(core)

    let mouseX = 0,
      mouseY = 0
    window.addEventListener(
      'mousemove',
      (e) => {
        mouseX = (e.clientX / window.innerWidth - 0.5) * 2
        mouseY = (e.clientY / window.innerHeight - 0.5) * 2
      },
      { passive: true },
    )

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()
      renderer.setSize(window.innerWidth, window.innerHeight)
    })

    const animate = () => {
      requestAnimationFrame(animate)
      if (!isVisible) return

      particles.rotation.y += 0.0006
      core.rotation.x += 0.0012
      core.rotation.y += 0.0016

      camera.position.x += (mouseX * 4 - camera.position.x) * 0.04
      camera.position.y += (-mouseY * 4 - camera.position.y) * 0.04
      camera.lookAt(scene.position)

      renderer.render(scene, camera)
    }

    animate()
  }
}

/* Global Interactive Simulator Functions */
window.switchMockupView = function (target) {
  const tabs = document.querySelectorAll('[data-mockup-tab]')
  const views = {
    library: document.getElementById('mockup-view-library'),
    booster: document.getElementById('mockup-view-booster'),
    soundtrack: document.getElementById('mockup-view-soundtrack'),
    saves: document.getElementById('mockup-view-saves'),
    stats: document.getElementById('mockup-view-stats'),
  }

  tabs.forEach((t) => {
    if (t.getAttribute('data-mockup-tab') === target) {
      t.classList.add('active')
    } else {
      t.classList.remove('active')
    }
  })

  Object.keys(views).forEach((k) => {
    if (views[k]) {
      if (k === target) {
        views[k].classList.remove('hidden')
      } else {
        views[k].classList.add('hidden')
      }
    }
  })
}

window.openMockupTab = function (target, toastMsg) {
  window.switchMockupView(target)

  const toast = document.getElementById('mockup-launch-toast')
  const toastText = document.getElementById('mockup-launch-text')
  if (toast && toastText && toastMsg) {
    toastText.textContent = toastMsg
    toast.classList.remove('hidden')
    setTimeout(() => toast.classList.add('hidden'), 3500)
  }
}

let isAudioPlaying = true
window.toggleMockupAudio = function () {
  const btn = document.getElementById('mockup-play-toggle')
  const bars = document.querySelectorAll('#mockup-view-soundtrack .wave-bar')
  const disc = document.querySelector('#mockup-view-soundtrack .spin-disc')
  isAudioPlaying = !isAudioPlaying

  if (btn) btn.textContent = isAudioPlaying ? '⏸' : '▶'
  if (disc) {
    if (isAudioPlaying) disc.classList.remove('spin-disc-paused')
    else disc.classList.add('spin-disc-paused')
  }
  bars.forEach((bar) => {
    bar.style.animationPlayState = isAudioPlaying ? 'running' : 'paused'
  })
}

window.triggerMockupRamFlush = function () {
  const toast = document.getElementById('mockup-launch-toast')
  const toastText = document.getElementById('mockup-launch-text')
  if (!toast || !toastText) return

  toastText.textContent = '🚀 حافظه کاری پاکسازی شد! ۱.۸ گیگابایت فضای رم آزاد گردید.'
  toast.classList.remove('hidden')
  setTimeout(() => toast.classList.add('hidden'), 3000)
}

window.runLiveRamFlush = function () {
  const ramVal = document.getElementById('live-ram-val')
  const btn = document.getElementById('btn-flush-ram')
  const status = document.getElementById('ram-flush-status')
  if (!ramVal || !btn) return

  btn.disabled = true
  btn.textContent = '⚡ در حال پاکسازی WorkingSet...'
  ramVal.textContent = '13.1 GB'

  setTimeout(() => {
    ramVal.textContent = '12.5 GB'
    btn.textContent = '✓ پاکسازی کامل شد'
    if (status) status.classList.remove('hidden')

    setTimeout(() => {
      btn.disabled = false
      btn.textContent = '🚀 تست مجدد پاکسازی رم'
    }, 3000)
  }, 800)
}

window.updateCalculator = function (gamesCount) {
  const countDisplay = document.getElementById('slider-games-count')
  const ramSaved = document.getElementById('calc-ram-saved')
  if (countDisplay) countDisplay.textContent = `${gamesCount} بازی`

  if (ramSaved) {
    const savedMb = Math.round(590 + (gamesCount - 5) * 12)
    ramSaved.textContent = `~${savedMb} MB`
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.nexusEngine = new WebsiteEngine()
})
