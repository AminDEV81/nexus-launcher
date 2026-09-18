/**
 * Nexus Launcher Landing Website - Advanced 3D & Interactive Controller
 * Default Language: Persian (FA)
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
  fa: {
    nav_features: 'ویژگی‌های کلیدی',
    nav_modules: 'ماژول‌های برنامه',
    nav_comparison: 'چرا نکسوس؟',
    nav_specs: 'سیستم مورد نیاز',
    nav_faq: 'سوالات متداول',
    nav_github: 'گیت‌هاب',
    nav_download: 'دانلود نکسوس',

    hero_badge: '✨ نسخه {version} منتشر شد — بومی، سه‌بعدی و فوق‌العاده سریع',
    hero_title_1: 'لانچر بازی بومی نسل جدید',
    hero_title_2: 'برای گیمرهای حرفه‌ای ویندوز',
    hero_subtitle:
      'کتابخانه بازی‌های شخصی مدرن و آفلاین‌محور با قدرت Tauri 2، زبان Rust و React 19. مجهز به بوستر هوشمند سخت‌افزاری، ویژوالایزر صوتی سینماتیک و نگهبان اتمیک فایل‌های سیو با مصرف باورنکردنی تنها ۶۰ مگابایت رم.',
    hero_download_btn: 'دانلود مستقیم نسخه رسمی',
    hero_download_subtext: 'ویندوز ۱۰ و ۱۱ (۶۴ بیتی) • {size} • ۱۰۰٪ رایگان و متن‌باز',
    hero_source_btn: 'مشاهده پروژه در گیت‌هاب',
    hero_other_downloads: 'سایر نسخه‌ها و فایل نصبی .msi',

    stat_ram_num: '۶۰ MB',
    stat_ram_lbl: 'مصرف رم در حالت بیکار',
    stat_fps_num: '+۱۸٪',
    stat_fps_lbl: 'افزایش فریم‌ریت در بازی',
    stat_saves_num: '۱۹,۰۰۰+',
    stat_saves_lbl: 'بازی با شناسایی خودکار سیو',
    stat_speed_num: '< ۰.۸s',
    stat_speed_lbl: 'سرعت لودینگ اولیه (Cold Boot)',

    showcase_badge: 'تور تعاملی درون برنامه',
    showcase_title: 'ماژول‌های پیشرفته Nexus Launcher',
    showcase_subtitle:
      'روی هر ماژول کلیک کنید تا قدرت عملکرد و رابط کاربری اختصاصی آن را به صورت زنده تجربه نمایید:',

    tab_library: '🎮 کتابخانه هوشمند',
    tab_booster: '⚡ بوستر پیشرفته',
    tab_soundtrack: '🎵 مرکز موسیقی متن',
    tab_save: '🛡️ نگهبان سیو',
    tab_passport: '📊 پاسپورت گیمر',

    lib_card_search: 'جستجو در بیش از ۴۲ بازی نصب‌شده...',
    lib_all_games: 'تمام بازی‌ها (۴۲)',
    lib_launch_btn: 'اجرای بازی',
    lib_playtime: 'مدت بازی:',
    lib_genre_action: 'اکشن / ماجراجویی',

    boost_title: 'هوشمندسازی خودکار سیستم قبل از بازی',
    boost_desc:
      'بهینه‌سازی دینامیک هسته‌های پردازنده، پاک‌سازی کش رم و ساسپند کردن خودکار ۲۱ سرویس سنگین پس‌زمینه بدون آسیب به لانچرها.',
    boost_btn_test: '🚀 تست زنده شبیه‌ساز بوست',
    boost_tested_msg: '⚡ سیستم در حالت Ultra Performance قرار گرفت! ۱.۴ گیگابایت رم آزاد شد.',

    soundtrack_title: 'استودیو اختصاصی موسیقی متن بازی‌ها',
    soundtrack_desc:
      'استریم آنلاین و دانلود ساندترک‌های بازی با ویژوالایزر فرکانسی زنده ۶۰ فریم و پشتیبانی از آرشیوهای جهانی.',

    save_title: 'سیستم ژورنال محافظت از فایل‌های سیو (ACID)',
    save_desc:
      'شناسایی هوشمند محل ذخیره بازی‌ها، ایجاد نسخه‌های پشتیبان خودکار و جلوگیری قطعی از خرابی فایل‌ها هنگام کرش یا قطع برق.',
    save_restore_btn: '🔄 بازیابی آخرین اسنپ‌شات',
    save_restored_msg: '✅ نسخه ذخیره با موفقیت بازیابی شد و تایید سلامت گرفت!',

    passport_title: 'پاسپورت اختصاصی و ثبت لحظات گیمینگ',
    passport_desc:
      'نمایش هیت‌مپ ۹۱ روزه فعالیت گیمینگ، تحلیل ساعات اوج بازی و سیستم امتیازدهی و لول‌آپ با پیشرفت در بازی‌ها.',

    feat_section_badge: 'قابلیت‌های فنی برتر',
    feat_section_title: 'مهندسی‌شده برای گیمرهای واقعی',
    feat_section_subtitle:
      'بدون ردیابی، بدون تبلیغات و بدون فروشگاه‌های اجباری. فقط عملکرد ناب بومی سیستم و تجربه لذت‌بخش گیمینگ.',

    feat_booster_title: 'Game Booster Pro',
    feat_booster_desc:
      'بهینه‌سازی دینامیک برق ویندوز (Ultra Performance Plan)، آزادسازی رم و به صفر رساندن مصرف GPU در حالت بیکار.',

    feat_library_title: 'کتابخانه بازی‌ها و گیت‌وی ابری',
    feat_library_desc:
      'دریافت خودکار پوسترهای باکیفیت از IGDB و SteamGridDB بدون نیاز به فیلترشکن از طریق پروکسی Edge کلودفلر.',

    feat_soundtrack_title: 'مرکز موسیقی و ویژوالایزر',
    feat_soundtrack_desc:
      'پخش موسیقی‌های متن بازی‌ها همراه با ویژوالایزر فرکانسی سینماتیک زنده و امکان ذخیره آفلاین.',

    feat_save_title: 'نگهبان امن فایل‌های سیو',
    feat_save_desc:
      'تشخیص خودکار پوشه ذخیره بیش از ۱۹,۰۰۰ بازی با معماری اتمیک ACID برای جلوگیری ۱۰۰٪ از سوختن سیوها.',

    feat_update_title: 'به‌روزرسانی خودکار درون‌برنامه‌ای',
    feat_update_desc:
      'آپدیت بدون دردسر و بدون نیاز به دانلود دستی مجدد؛ اعتبارسنجی شده با امضای رمزنگاری امن Minisign Ed25519.',

    feat_analytics_title: 'آمار و تحلیل گیمینگ',
    feat_analytics_desc:
      'نقشه حرارتی ۹۱ روزه فعالیت، رادار عادات بازی در شبانه‌روز، ره‌گیری دقیق ساعات بازی و سیستم XP.',

    comp_badge: 'مقایسه بنچمارک',
    comp_title: 'نکسوس در برابر لانچرهای سنگین سنتی',
    comp_subtitle: 'ببینید چگونه معماری کامپایل‌شده Rust لانچرهای کند کرومیومی را پشت سر می‌گذارد:',
    comp_metric: 'معیار بررسی',
    comp_nexus: 'Nexus Launcher',
    comp_others: 'استیم / اپیک / GOG',
    comp_ram: 'مصرف حافظه رم در حالت بیکار',
    comp_ram_nexus: 'حدود ۶۰ مگابایت',
    comp_ram_others: '۶۰۰ الی ۱۲۰۰ مگابایت',
    comp_boot: 'زمان راه‌اندازی اولیه (Cold Boot)',
    comp_boot_nexus: 'کمتر از ۰.۸ ثانیه',
    comp_boot_others: '۴ تا ۱۰ ثانیه',
    comp_telemetry: 'ردیابی و ارسال داده (Telemetry)',
    comp_telemetry_nexus: 'کاملاً صفر (۰٪)',
    comp_telemetry_others: 'ارسال دائمی دیتای کاربر',
    comp_offline: 'پشتیبانی آفلاین',
    comp_offline_nexus: '۱۰۰٪ آفلاین‌محور',
    comp_offline_others: 'نیاز اجباری به لاگین آنلاین',

    specs_badge: 'سیستم مورد نیاز',
    specs_title: 'سبک، فوق‌العاده بهینه و روان',
    specs_os: 'سیستم عامل',
    specs_os_val: 'ویندوز ۱۰ یا ۱۱ (نسخه ۶۴ بیتی)',
    specs_cpu: 'پردازنده',
    specs_cpu_val: 'هر پردازنده دو هسته‌ای ۶۴ بیتی',
    specs_ram: 'حافظه رم',
    specs_ram_val: '۵۱۲ مگابایت رم آزاد (مصرف خود اپ ~۶۰MB)',
    specs_disk: 'فضای ذخیره‌سازی',
    specs_disk_val: '۱۰۰ مگابایت فضای خالی هارد',

    faq_badge: 'پرسش‌های متداول',
    faq_title: 'سوالات رایج کاربران',
    faq_q1: 'آیا لانچر نکسوس کاملاً رایگان است؟',
    faq_a1:
      'بله، نکسوس یک نرم‌افزار ۱۰۰٪ رایگان و متن‌باز (Open Source) تحت مجوز معتبر MIT است. هیچ هزینه، اشتراک یا تبلیغاتی در آن وجود ندارد.',
    faq_q2: 'آیا امکان اجرای بازی‌های استیم، اپیک یا مستقل وجود دارد؟',
    faq_a2:
      'بله. نکسوس به عنوان داشبورد جامع عمل کرده و تمام بازی‌های استیم، اپیک گیمز، GOG و همچنین فایل‌های اجرایی exe بازی‌های کرک‌شده یا دستی را در یک محیط زیبا دسته‌بندی می‌کند.',
    faq_q3: 'به‌روزرسانی خودکار درون‌برنامه‌ای چگونه کار می‌کند؟',
    faq_a3:
      'به محض انتشار نسخه جدید در گیت‌هاب، لانچر آن را به صورت امن در پس‌زمینه دانلود کرده و با یک کلیک ارتقا می‌دهد بدون این‌که سیوها، تصاویر یا تنظیمات شما پاک شوند.',
    faq_q4: 'آیا برای دیدن کاور و اطلاعات بازی‌ها به کلید API اختصاصی نیاز دارم؟',
    faq_a4:
      'خیر! نکسوس دارای پروکسی ابری کلودفلر لبه است که تمام تصاویر و اطلاعات دیتابیس را بدون نیاز به هیچ تنظیماتی بلافاصله بارگذاری می‌کند.',

    cta_title: 'آماده ارتقای تجربه گیمینگ خود هستید؟',
    cta_subtitle:
      'به جمع گیمرهایی بپیوندید که سرعت، حریم خصوصی و آزادی عمل را به برنامه‌های سنگین ترجیح می‌دهند.',
    cta_download_btn: 'دانلود رایگان نکسوس لانچر',

    footer_rights: 'منتشر شده تحت لایسنس MIT.',
    footer_created_by: 'طراحی و توسعه توسط AminDEV81',
  },
  en: {
    nav_features: 'Features',
    nav_modules: 'Modules',
    nav_comparison: 'Why Nexus?',
    nav_specs: 'Requirements',
    nav_faq: 'FAQ',
    nav_github: 'GitHub',
    nav_download: 'Download',

    hero_badge: '✨ v{version} Released — Native, 3D & Blazing Fast',
    hero_title_1: 'The Next-Gen Native',
    hero_title_2: 'PC Game Launcher',
    hero_subtitle:
      'A high-performance personal game library powered by Tauri 2, Rust, and React 19. Integrated hardware Game Booster, cinematic real-time Audio Visualizer, and atomic ACID Save Guardian in an ultra-light ~60MB RAM footprint.',
    hero_download_btn: 'Download for Windows',
    hero_download_subtext: 'Windows 10 / 11 (64-bit) • {size} • 100% Free & Open Source',
    hero_source_btn: 'View Source on GitHub',
    hero_other_downloads: 'Other versions & .msi package',

    stat_ram_num: '60 MB',
    stat_ram_lbl: 'Idle RAM Footprint',
    stat_fps_num: '+18%',
    stat_fps_lbl: 'In-Game FPS Boost',
    stat_saves_num: '19,000+',
    stat_saves_lbl: 'Games with Auto-Detection',
    stat_speed_num: '< 0.8s',
    stat_speed_lbl: 'Cold Startup Boot Time',

    showcase_badge: 'INTERACTIVE APP TOUR',
    showcase_title: 'Explore Nexus Launcher Modules',
    showcase_subtitle:
      'Click through each module below to preview the interface and live features:',

    tab_library: '🎮 Smart Library',
    tab_booster: '⚡ Booster Pro',
    tab_soundtrack: '🎵 Soundtrack Center',
    tab_save: '🛡️ Save Guardian',
    tab_passport: '📊 Gamer Passport',

    lib_card_search: 'Search among 42 installed games...',
    lib_all_games: 'All Games (42)',
    lib_launch_btn: 'Launch Game',
    lib_playtime: 'Playtime:',
    lib_genre_action: 'Action / Adventure',

    boost_title: 'Automatic Pre-Launch Hardware Optimization',
    boost_desc:
      'Dynamic CPU core priority, memory cache trimming, and zero-load suspension of 21 background resource hogs without touching store clients.',
    boost_btn_test: '🚀 Test Booster Simulator',
    boost_tested_msg: '⚡ Ultra Performance Plan Engaged! 1.4 GB RAM Freed.',

    soundtrack_title: 'Original Game Soundtrack Studio',
    soundtrack_desc:
      'Stream and download official game tracks with a 60 FPS Canvas spectrum visualizer reacting dynamically to audio beats.',

    save_title: 'ACID Journal Save Protection Engine',
    save_desc:
      'Auto-detects save directories for 19,000+ games. Multi-profile isolation prevents save file corruption during sudden crashes or power loss.',
    save_restore_btn: '🔄 Restore Latest Snapshot',
    save_restored_msg: '✅ Save snapshot verified and restored with intact integrity!',

    passport_title: 'Gamer Passport & Habit Radar',
    passport_desc:
      '91-day GitHub-style gaming activity heatmap, peak play hour analysis, and XP leveling milestones as you complete titles.',

    feat_section_badge: 'CUTTING-EDGE CAPABILITIES',
    feat_section_title: 'Engineered for Real Gamers',
    feat_section_subtitle:
      'No telemetry. No forced stores. No bloatware. Just pure native performance and total control over your library.',

    feat_booster_title: 'Game Booster Pro',
    feat_booster_desc:
      'Dynamic OS power plan overdrive, RAM cache trimming, and zero GPU load during idle gameplay.',

    feat_library_title: 'Smart Library & Cloud Hub',
    feat_library_desc:
      'Automated high-res posters, banners, and logos via IGDB and SteamGridDB through our global Cloudflare Edge proxy.',

    feat_soundtrack_title: 'Soundtrack Center & Visualizer',
    feat_soundtrack_desc:
      'Stream original game soundtracks with a cinematic 60 FPS Canvas spectrum analyzer and offline playback.',

    feat_save_title: 'ACID Save Game Guardian',
    feat_save_desc:
      'Auto-detects save paths for 19,000+ games. Multi-profile isolation with atomic journal snapshots prevents data loss.',

    feat_update_title: 'Seamless In-App Updates',
    feat_update_desc:
      'Silent passive background updates verified with Ed25519 Minisign cryptography without re-installation.',

    feat_analytics_title: 'Gamer Passport & Analytics',
    feat_analytics_desc:
      'GitHub-style 91-day activity heatmaps, hourly gaming habit radar charts, playtime tracking, and leveling up.',

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
}

class NexusWebsite {
  constructor() {
    // Default to Persian ('fa') as requested!
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
    // Default strictly to Persian ('fa')
    return 'fa'
  }

  async init() {
    this.setupLanguageToggle()
    this.setupTabs()
    this.setupTiltCards()
    this.setupInteractiveSimulations()
    this.initThreeJsBackground()
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
    const t = TRANSLATIONS[lang] || TRANSLATIONS.fa

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

    this.updateDownloadLinks()
  }

  async fetchLatestRelease() {
    try {
      const res = await fetch(CONFIG.githubApiUrl, {
        headers: { Accept: 'application/vnd.github.v3+json' },
      })

      if (!res.ok) {
        throw new Error(`GitHub API returned ${res.status}`)
      }

      const release = await res.json()
      const tagName = release.tag_name || CONFIG.defaultVersion
      this.releaseData.version = tagName

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

      this.applyTranslations()
    } catch (error) {
      console.warn('[Nexus] Live GitHub release fetch fallback active:', error)
      this.applyTranslations()
    }
  }

  updateDownloadLinks() {
    document.querySelectorAll('[data-role="download-btn"]').forEach((btn) => {
      btn.href = this.releaseData.downloadUrl
    })

    document.querySelectorAll('[data-role="msi-btn"]').forEach((btn) => {
      btn.href = this.releaseData.msiUrl
    })

    document.querySelectorAll('[data-role="version-tag"]').forEach((el) => {
      el.textContent = this.releaseData.version
    })
  }

  /* --- 3D Tilt Card Interaction --- */
  setupTiltCards() {
    const cards = document.querySelectorAll('.tilt-card')
    cards.forEach((card) => {
      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect()
        const x = e.clientX - rect.left
        const y = e.clientY - rect.top
        const centerX = rect.width / 2
        const centerY = rect.height / 2

        const rotateX = ((y - centerY) / centerY) * -10
        const rotateY = ((x - centerX) / centerX) * 10

        card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`
        card.style.setProperty('--mouse-x', `${(x / rect.width) * 100}%`)
        card.style.setProperty('--mouse-y', `${(y / rect.height) * 100}%`)
      })

      card.addEventListener('mouseleave', () => {
        card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)'
      })
    })
  }

  /* --- Interactive Module Tabs --- */
  setupTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn')
    const tabPanels = document.querySelectorAll('.tab-panel')

    tabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab')

        tabBtns.forEach((b) => b.classList.remove('active'))
        btn.classList.add('active')

        tabPanels.forEach((panel) => {
          if (panel.id === `panel-${targetTab}`) {
            panel.classList.remove('hidden')
            panel.classList.add('block')
          } else {
            panel.classList.add('hidden')
            panel.classList.remove('block')
          }
        })
      })
    })
  }

  /* --- Interactive In-Page Simulations --- */
  setupInteractiveSimulations() {
    // Booster Simulator
    const testBoostBtn = document.getElementById('btn-test-boost')
    const boostMsg = document.getElementById('boost-status-msg')
    const ramCounter = document.getElementById('boost-ram-display')
    const fpsCounter = document.getElementById('boost-fps-display')

    if (testBoostBtn && boostMsg && ramCounter && fpsCounter) {
      testBoostBtn.addEventListener('click', () => {
        testBoostBtn.disabled = true
        testBoostBtn.innerHTML = '⚡ در حال بهینه‌سازی و آزادسازی حافظه...'

        let progress = 0
        const interval = setInterval(() => {
          progress += 20
          if (progress >= 100) {
            clearInterval(interval)
            ramCounter.textContent = '14.1 GB / 16 GB'
            fpsCounter.textContent = '+18% (144 FPS)'
            boostMsg.classList.remove('hidden')
            testBoostBtn.disabled = false
            testBoostBtn.innerHTML = '✅ بهینه‌سازی با موفقیت انجام شد!'
            setTimeout(() => {
              testBoostBtn.innerHTML =
                this.currentLang === 'fa' ? '🚀 تست مجدد بوستر' : '🚀 Test Booster Again'
            }, 3000)
          }
        }, 150)
      })
    }

    // Save Restore Simulator
    const restoreSaveBtn = document.getElementById('btn-restore-save')
    const saveMsg = document.getElementById('save-status-msg')
    if (restoreSaveBtn && saveMsg) {
      restoreSaveBtn.addEventListener('click', () => {
        saveMsg.classList.remove('hidden')
        setTimeout(() => {
          saveMsg.classList.add('hidden')
        }, 4000)
      })
    }
  }

  /* --- Three.js 3D Floating Constellation Background --- */
  initThreeJsBackground() {
    const canvas = document.getElementById('bg-3d-canvas')
    if (!canvas || typeof THREE === 'undefined') return

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    )
    camera.position.z = 80

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))

    // Particle Stars
    const particleCount = 180
    const geometry = new THREE.BufferGeometry()
    const positions = new Float32Array(particleCount * 3)
    const colors = new Float32Array(particleCount * 3)

    const cyanColor = new THREE.Color(0x00e5ff)
    const purpleColor = new THREE.Color(0x8b5cf6)

    for (let i = 0; i < particleCount * 3; i += 3) {
      positions[i] = (Math.random() - 0.5) * 160
      positions[i + 1] = (Math.random() - 0.5) * 160
      positions[i + 2] = (Math.random() - 0.5) * 120

      const mixed = Math.random() > 0.5 ? cyanColor : purpleColor
      colors[i] = mixed.r
      colors[i + 1] = mixed.g
      colors[i + 2] = mixed.b
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    const material = new THREE.PointsMaterial({
      size: 2.2,
      vertexColors: true,
      transparent: true,
      opacity: 0.7,
    })

    const particles = new THREE.Points(geometry, material)
    scene.add(particles)

    // Floating 3D Geometric Gaming Core
    const coreGeo = new THREE.IcosahedronGeometry(12, 1)
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      wireframe: true,
      transparent: true,
      opacity: 0.18,
    })
    const coreMesh = new THREE.Mesh(coreGeo, coreMat)
    coreMesh.position.set(30, 5, 10)
    scene.add(coreMesh)

    // Mouse Parallax
    let mouseX = 0
    let mouseY = 0
    let targetMouseX = 0
    let targetMouseY = 0

    window.addEventListener('mousemove', (e) => {
      targetMouseX = (e.clientX / window.innerWidth - 0.5) * 15
      targetMouseY = (e.clientY / window.innerHeight - 0.5) * 15
    })

    // Resize Handler
    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()
      renderer.setSize(window.innerWidth, window.innerHeight)
    })

    // Render Loop with visibility checking for 0% idle overhead
    let isVisible = true
    document.addEventListener('visibilitychange', () => {
      isVisible = !document.hidden
    })

    const animate = () => {
      requestAnimationFrame(animate)
      if (!isVisible) return

      mouseX += (targetMouseX - mouseX) * 0.05
      mouseY += (targetMouseY - mouseY) * 0.05

      particles.rotation.y += 0.0008
      particles.rotation.x += 0.0004

      coreMesh.rotation.x += 0.003
      coreMesh.rotation.y += 0.004

      camera.position.x = mouseX
      camera.position.y = -mouseY
      camera.lookAt(scene.position)

      renderer.render(scene, camera)
    }

    animate()
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.nexusWebsite = new NexusWebsite()
})
