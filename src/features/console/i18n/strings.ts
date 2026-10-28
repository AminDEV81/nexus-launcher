import type { ConsoleLanguage } from '../theme/tokens'

export interface ConsoleDictionary {
  tabs: {
    home: string
    library: string
    store: string
    downloads: string
    music: string
    passport: string
    booster: string
    settings: string
    power: string
  }
  actions: {
    select: string
    back: string
    options: string
    search: string
    play: string
    resume: string
    stopGame: string
    switchProfile: string
    exitConsole: string
    quickSettings: string
    filter: string
    favorite: string
    unfavorite: string
    ost: string
    saves: string
    cancel: string
    confirm: string
  }
  home: {
    whoIsPlaying: string
    chooseProfileSub: string
    continuePlaying: string
    runningNow: string
    recentlyPlayed: string
    favorites: string
    quickPlay: string
    backInTheDay: string
    becauseYouPlayed: string
    newInLibrary: string
    downloadingNow: string
    comingSoon: string
    wishlistDeals: string
    emptyLibraryTitle: string
    emptyLibraryDesc: string
    scanGamesNow: string
  }
  power: {
    title: string
    sleep: string
    restart: string
    shutdown: string
    lock: string
    exitToDesktop: string
    quitNexus: string
    switchProfile: string
    confirmTitle: string
    confirmDesc: string
  }
  quickMenu: {
    title: string
    resumeGame: string
    switchToNexus: string
    toggleHud: string
    toggleBoost: string
    masterVolume: string
    closeGame: string
    gameBarHint: string
  }
}

export const CONSOLE_STRINGS: Record<ConsoleLanguage, ConsoleDictionary> = {
  en: {
    tabs: {
      home: 'Home',
      library: 'Library',
      store: 'Store',
      downloads: 'Downloads',
      music: 'Music',
      passport: 'Passport',
      booster: 'Booster',
      settings: 'Settings',
      power: 'Power',
    },
    actions: {
      select: 'Select',
      back: 'Back',
      options: 'Options',
      search: 'Search',
      play: 'Play Now',
      resume: 'Resume Game',
      stopGame: 'Close Game',
      switchProfile: 'Switch Profile',
      exitConsole: 'Desktop Mode',
      quickSettings: 'Quick Menu',
      filter: 'Filters',
      favorite: 'Favorite',
      unfavorite: 'Unfavorite',
      ost: 'Soundtrack',
      saves: 'Save Guardian',
      cancel: 'Cancel',
      confirm: 'Confirm',
    },
    home: {
      whoIsPlaying: "Who's Playing?",
      chooseProfileSub: 'Select your Save Guardian profile to load isolated saves & stats',
      continuePlaying: 'Continue Playing',
      runningNow: 'Running in Background — Ready to Resume',
      recentlyPlayed: 'Recently Played',
      favorites: 'Favorites',
      quickPlay: 'Quick Play (< 1 Hour Sessions)',
      backInTheDay: 'Back in the Day (6+ Months Ago)',
      becauseYouPlayed: 'Because You Played',
      newInLibrary: 'New in Your Library',
      downloadingNow: 'Downloading Now',
      comingSoon: 'Coming Soon & Wishlisted',
      wishlistDeals: 'Wishlist & Store Deals',
      emptyLibraryTitle: 'Your Console Library is Empty',
      emptyLibraryDesc: 'Scan your PC drives to import Steam, Epic, GOG, and local games automatically.',
      scanGamesNow: 'Scan PC for Installed Games',
    },
    power: {
      title: 'System & Power',
      sleep: 'Sleep PC',
      restart: 'Restart PC',
      shutdown: 'Shut Down PC',
      lock: 'Lock Workstation',
      exitToDesktop: 'Return to Desktop Mode',
      quitNexus: 'Quit Nexus Launcher',
      switchProfile: 'Switch Active Profile',
      confirmTitle: 'Confirm Action',
      confirmDesc: 'Are you sure you want to proceed with this power action?',
    },
    quickMenu: {
      title: 'Nexus Quick Menu',
      resumeGame: 'Resume Game',
      switchToNexus: 'Switch to Nexus',
      toggleHud: 'Performance HUD',
      toggleBoost: 'RAM & CPU Boost',
      masterVolume: 'Master Volume',
      closeGame: 'Close Running Game',
      gameBarHint: 'Tip: Hold Back + Start for 1s if Windows Game Bar claims the Guide button.',
    },
  },
  fa: {
    tabs: {
      home: 'خانه',
      library: 'کتابخانه',
      store: 'فروشگاه',
      downloads: 'دانلودها',
      music: 'موسیقی',
      passport: 'پاسپورت',
      booster: 'بوستر',
      settings: 'تنظیمات',
      power: 'پاور',
    },
    actions: {
      select: 'انتخاب',
      back: 'بازگشت',
      options: 'گزینه‌ها',
      search: 'جستجو',
      play: 'اجرای بازی',
      resume: 'ادامه بازی',
      stopGame: 'بستن بازی',
      switchProfile: 'تغییر پروفایل',
      exitConsole: 'حالت دسکتاپ',
      quickSettings: 'منوی سریع',
      filter: 'فیلترها',
      favorite: 'محبوب',
      unfavorite: 'حذف از محبوب‌ها',
      ost: 'موسیقی متن',
      saves: 'مدیریت سیوها',
      cancel: 'لغو',
      confirm: 'تأیید',
    },
    home: {
      whoIsPlaying: 'چه کسی بازی می‌کند؟',
      chooseProfileSub: 'پروفایل Save Guardian خود را برای بارگذاری سیوها و آمار مجزا انتخاب کنید',
      continuePlaying: 'ادامه بازی',
      runningNow: 'در حال اجرا در پس‌زمینه — آماده بازگشت',
      recentlyPlayed: 'اخیر بازی‌شده',
      favorites: 'بازی‌های محبوب',
      quickPlay: 'تجربه سریع (نشست‌های زیر ۱ ساعت)',
      backInTheDay: 'خاطره‌بازی (بیش از ۶ ماه پیش)',
      becauseYouPlayed: 'چون بازی کردید:',
      newInLibrary: 'تازه‌های کتابخانه شما',
      downloadingNow: 'در حال دانلود',
      comingSoon: 'به‌زودی و لیست علاقه‌مندی',
      wishlistDeals: 'تخفیف‌های ویژه و علاقه‌مندی‌ها',
      emptyLibraryTitle: 'کتابخانه کنسول شما خالی است',
      emptyLibraryDesc: 'درایوهای سیستم را اسکن کنید تا بازی‌های استیم، اپیک و نصب‌شده به‌طور خودکار اضافه شوند.',
      scanGamesNow: 'اسکن خودکار بازی‌های نصب‌شده',
    },
    power: {
      title: 'مدیریت انرژی و خروج',
      sleep: 'حالت خواب (Sleep)',
      restart: 'راه‌اندازی مجدد (Restart)',
      shutdown: 'خاموش کردن سیستم (Shut Down)',
      lock: 'قفل ویندوز (Lock)',
      exitToDesktop: 'بازگشت به حالت دسکتاپ',
      quitNexus: 'خروج کامل از نکسوس',
      switchProfile: 'تغییر پروفایل فعال',
      confirmTitle: 'تأیید عملیات',
      confirmDesc: 'آیا از انجام این عملیات اطمینان دارید؟',
    },
    quickMenu: {
      title: 'منوی سریع نکسوس',
      resumeGame: 'بازگشت به بازی',
      switchToNexus: 'رفتن به محیط نکسوس',
      toggleHud: 'نشانگر عملکرد (HUD)',
      toggleBoost: 'تقویت رم و پردازنده',
      masterVolume: 'حجم صدای سیستم',
      closeGame: 'بستن بازی در حال اجرا',
      gameBarHint: 'نکته: اگر Game Bar ویندوز دکمه Guide را می‌گیرد، Back + Start را ۱ ثانیه نگه دارید.',
    },
  },
}
