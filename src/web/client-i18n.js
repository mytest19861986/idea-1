const FA_TRANSLATIONS = {
  // Brand & Header
  "app.title": "سامانه تحلیل و پایش فرصت‌های نوآوری",
  "app.version": "نسخه ۱.۰.۰ - زنده",
  "header.dataSource": "منبع داده:",
  "header.livePilot": "🟢 داده‌های پایلوت زنده (پستگرس‌کیوال)",
  "header.referenceFixture": "🔵 حالت داده‌های مرجع آزمایشی",
  "header.language": "🌐 زبان:",
  "header.langFa": "🇮🇷 فارسی (پیش‌فرض)",
  "header.langEn": "🇬🇧 English",
  "header.liveConnected": "سرویس خواندن زنده: متصل",
  "header.durableStore": "ذخیره‌ساز پایدار:",
  "header.totalOpportunities": "مجموع فرصت‌ها:",

  // Sidebar Filters
  "filter.searchLabel": "۱. جستجوی کلیدواژه",
  "filter.searchPlaceholder": "کلیدواژه‌ها، فناوری، نیازمندی...",
  "filter.catLabel": "۲. دسته‌بندی موضوعی",
  "filter.allCategories": "همه دسته‌بندی‌ها",
  "filter.marketLabel": "۳. بازار / منطقه جغرافیایی",
  "filter.allMarkets": "همه بازارهای بین‌المللی",
  "filter.minScoreLabel": "۴. حداقل امتیاز فرصت",
  "filter.anyScore": "هر امتیازی (۰+)",
  "filter.minConfLabel": "۵. حداقل اطمینان شواهد",
  "filter.anyConf": "هر میزان اطمینان (۰٪+)",
  "filter.evLabel": "۶. طبقه‌بندی شواهد",
  "filter.allEv": "همه ۶ طبقه شواهد",
  "filter.sourceLabel": "۷. هویت منبع",
  "filter.allSources": "همه منابع مجاز",
  "filter.freshLabel": "۸. تازگی زمانی",
  "filter.anyTime": "همه زمان‌ها",
  "filter.last24h": "۲۴ ساعت گذشته",
  "filter.last7d": "۷ روز گذشته",

  // Queue & Portfolio Bars
  "queue.title": "🚨 صف بررسی و اقدام عملیاتی (سیاست عملیات نسخه ۱):",
  "queue.toggle": "⚡ تغییر نمای صف",
  "portfolio.title": "عملیات پرتفوی:",
  "portfolio.all": "همه",
  "portfolio.shortlist": "★ فهرست نهایی",
  "portfolio.watch": "👁 تحت نظر",
  "portfolio.investigate": "🔍 نیازمند بررسی",
  "portfolio.hold": "⏸ تعلیق",
  "toolbar.showing": "نمایش",
  "toolbar.validated": "فرصت اعتبارسنجی‌شده",
  "toolbar.sortBy": "مرتب‌سازی بر اساس:",
  "toolbar.sortScore": "امتیاز فرصت (بیشترین به کمترین)",
  "toolbar.sortConf": "اطمینان شواهد (بیشترین به کمترین)",
  "toolbar.sortFresh": "جدیدترین زمان کشف",

  // Cards
  "card.category": "دسته‌بندی:",
  "card.market": "بازار:",
  "card.source": "منبع:",
  "card.addToCompare": "+ افزودن به مقایسه",
  "card.inCompare": "✓ در ماتریس مقایسه",
  "card.scoreLabel": "امتیاز فرصت",
  "card.confLabel": "اطمینان شواهد",
  "card.dimMarket": "شکاف بازار:",
  "card.dimTraction": "شتاب رشد:",
  "card.dimMonetization": "ظرفیت درآمدزایی:",
  "card.dimBuild": "پیچیدگی ساخت:",
  "card.dimRisk": "ریسک مقرراتی:",
  "card.openDetail": "مشاهده جزئیات و پرونده تصمیم‌گیری ▾",
  "card.closeDetail": "بستن جزئیات پرونده ▴",

  // Detail Drawer & Modals
  "drawer.whyNow": "چرا اکنون؟",
  "drawer.provenElsewhere": "اثبات‌شده در سایر بازارها:",
  "drawer.evidenceBreakdown": "تفکیک ۶ گانه شواهد:",
  "drawer.monetization": "مدل درآمدزایی:",
  "drawer.localization": "بومی‌سازی و دامنه کاربرد:",
  "drawer.mvp": "مشخصات نسخه کمینه (MVP):",
  "drawer.setDecision": "ثبت تصمیم پرتفوی:",
  "drawer.resolveInv": "ثبت نتیجه بررسی ↗",
  "drawer.markReviewed": "✓ علامت‌گذاری به عنوان بازبینی‌شده",
  "modal.close": "✕ بستن",
  "modal.resolveTitle": "ثبت نتیجه بررسی عملیاتی",
  "modal.resolveSubtitle": "ثبت کد نتیجه و یادداشت حسابرسی بدون دستکاری امتیازات تحلیلی",
  "modal.selectOutcome": "انتخاب نتیجه بررسی:",
  "modal.auditNote": "یادداشت حسابرسی بررسی (حداکثر ۴۰۰۰ کاراکتر):",
  "modal.markAck": "👁 ثبت دریافت و مشاهده",
  "modal.completeResolve": "✓ تکمیل و مختومه‌سازی",

  // Compare Sticky Bar & Modal
  "compare.selected": "انتخاب‌شده جهت مقایسه:",
  "compare.clear": "پاکسازی انتخاب‌ها",
  "compare.launch": "اجرای ماتریس مقایسه",
  "compare.modalTitle": "ماتریس مقایسه راهبردی فرصت‌ها و پرتفوی سرمایه‌گذاری",
  "compare.modalSubtitle": "ارزیابی چندبعدی بده‌بستان‌ها جهت تخصیص بهینه منابع سازمانی",
  "compare.close": "✕ بستن ماتریس"
};

const EN_TRANSLATIONS = {
  // Brand & Header
  "app.title": "OPPORTUNITY INTEL",
  "app.version": "v1.0.0-LIVE",
  "header.dataSource": "DATA_SOURCE:",
  "header.livePilot": "🟢 LIVE PILOT DATA (POSTGRESQL)",
  "header.referenceFixture": "🔵 REFERENCE FIXTURE MODE",
  "header.language": "🌐 LANGUAGE:",
  "header.langFa": "🇮🇷 فارسی (پیش‌فرض)",
  "header.langEn": "🇬🇧 English",
  "header.liveConnected": "LIVE READ SERVICE: CONNECTED",
  "header.durableStore": "DURABLE STORE:",
  "header.totalOpportunities": "TOTAL OPPORTUNITIES:",

  // Sidebar Filters
  "filter.searchLabel": "1. Search Keyword",
  "filter.searchPlaceholder": "Keywords, tech stack...",
  "filter.catLabel": "2. Category",
  "filter.allCategories": "All Categories",
  "filter.marketLabel": "3. Country / Market",
  "filter.allMarkets": "Global / All Markets",
  "filter.minScoreLabel": "4. Min Opportunity Score",
  "filter.anyScore": "Any Score (0+)",
  "filter.minConfLabel": "5. Min Evidence Confidence",
  "filter.anyConf": "Any Confidence (0%+)",
  "filter.evLabel": "6. Evidence Classification",
  "filter.allEv": "All 6 Classifications",
  "filter.sourceLabel": "7. Source Identity",
  "filter.allSources": "All Authorized Sources",
  "filter.freshLabel": "8. Freshness",
  "filter.anyTime": "Any Time",
  "filter.last24h": "Last 24 Hours",
  "filter.last7d": "Last 7 Days",

  // Queue & Portfolio Bars
  "queue.title": "🚨 INVESTIGATION_QUEUE (operations-policy-v1):",
  "queue.toggle": "⚡ Toggle Queue View",
  "portfolio.title": "PORTFOLIO_OPS:",
  "portfolio.all": "ALL",
  "portfolio.shortlist": "★ SHORTLIST",
  "portfolio.watch": "👁 WATCH",
  "portfolio.investigate": "🔍 INVESTIGATE",
  "portfolio.hold": "⏸ HOLD",
  "toolbar.showing": "Showing",
  "toolbar.validated": "Validated Opportunities",
  "toolbar.sortBy": "Sort By:",
  "toolbar.sortScore": "Opportunity Score (High -> Low)",
  "toolbar.sortConf": "Evidence Confidence (High -> Low)",
  "toolbar.sortFresh": "Latest Discovered",

  // Cards
  "card.category": "Category:",
  "card.market": "Market:",
  "card.source": "Source:",
  "card.addToCompare": "+ Add to Compare",
  "card.inCompare": "✓ In Compare Matrix",
  "card.scoreLabel": "Opportunity Score",
  "card.confLabel": "Evidence Confidence",
  "card.dimMarket": "Market Gap:",
  "card.dimTraction": "Traction Velocity:",
  "card.dimMonetization": "Monetization Potential:",
  "card.dimBuild": "Build Complexity:",
  "card.dimRisk": "Regulatory Risk:",
  "card.openDetail": "View Strategic Breakdown & Decision Dossier ▾",
  "card.closeDetail": "Close Strategic Breakdown ▴",

  // Detail Drawer & Modals
  "drawer.whyNow": "Why Now Catalyst:",
  "drawer.provenElsewhere": "Proven Elsewhere:",
  "drawer.evidenceBreakdown": "Evidence Breakdown (6-Classification Taxonomy):",
  "drawer.monetization": "Monetization Strategy:",
  "drawer.localization": "Market Localization:",
  "drawer.mvp": "MVP Definition:",
  "drawer.setDecision": "Set Portfolio Decision:",
  "drawer.resolveInv": "Resolve Investigation ↗",
  "drawer.markReviewed": "✓ Mark Reviewed",
  "modal.close": "✕ Close",
  "modal.resolveTitle": "Resolve Operational Investigation",
  "modal.resolveSubtitle": "Record resolution code and audit note without mutating analytical scores",
  "modal.selectOutcome": "Select Resolution Outcome:",
  "modal.auditNote": "Resolution Audit Note (Max 4000 chars):",
  "modal.markAck": "👁 Mark Acknowledged",
  "modal.completeResolve": "✓ Complete & Resolve",

  // Compare Sticky Bar & Modal
  "compare.selected": "Selected for Comparison:",
  "compare.clear": "Clear Selection",
  "compare.launch": "Launch Comparison Matrix",
  "compare.modalTitle": "Executive Opportunity Comparison & Portfolio Matrix",
  "compare.modalSubtitle": "Side-by-side trade-off evaluation for strategic resource allocation",
  "compare.close": "✕ Close Matrix"
};

let currentAppLocale = localStorage.getItem("app_user_locale") || "fa-IR";

function t(key) {
  const dict = currentAppLocale === "en" ? EN_TRANSLATIONS : FA_TRANSLATIONS;
  return dict[key] || key;
}

function updateStaticTranslations() {
  document.documentElement.lang = currentAppLocale === "en" ? "en" : "fa";
  document.documentElement.dir = currentAppLocale === "en" ? "ltr" : "rtl";

  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    if (key) el.innerText = t(key);
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (key) el.placeholder = t(key);
  });
}

window.switchLanguage = function(locale) {
  currentAppLocale = locale;
  localStorage.setItem("app_user_locale", locale);
  const langSelect = document.getElementById("langSelect");
  if (langSelect) langSelect.value = locale;
  updateStaticTranslations();
  if (typeof applyAllFilters === "function") applyAllFilters();
  if (typeof updateCompareBar === "function") updateCompareBar();
};
