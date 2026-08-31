import { fa } from './locales/fa.mjs';
import { en } from './locales/en.mjs';

export const SUPPORTED_LOCALES = Object.freeze({
  FA: 'fa-IR',
  EN: 'en'
});

export const LOCALE_CONFIG = Object.freeze({
  [SUPPORTED_LOCALES.FA]: {
    lang: 'fa',
    dir: 'rtl',
    fontFamily: "'Vazirmatn', 'Plus Jakarta Sans', sans-serif",
    label: 'فارسی'
  },
  [SUPPORTED_LOCALES.EN]: {
    lang: 'en',
    dir: 'ltr',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    label: 'English'
  }
});

export class I18nService {
  constructor({ defaultLocale = SUPPORTED_LOCALES.FA, storageKey = 'app_user_locale' } = {}) {
    this.storageKey = storageKey;
    this.translations = {
      [SUPPORTED_LOCALES.FA]: fa,
      [SUPPORTED_LOCALES.EN]: en
    };
    
    // Resolve initial locale: Local storage > Default (fa-IR)
    this.currentLocale = this.getStoredLocale() || defaultLocale;
  }

  getStoredLocale() {
    try {
      if (typeof localStorage !== 'undefined') {
        const val = localStorage.getItem(this.storageKey);
        if (val === SUPPORTED_LOCALES.FA || val === SUPPORTED_LOCALES.EN) {
          return val;
        }
      }
    } catch (e) {}
    return null;
  }

  setLocale(locale) {
    if (!this.translations[locale]) {
      locale = SUPPORTED_LOCALES.FA;
    }
    this.currentLocale = locale;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(this.storageKey, locale);
      }
    } catch (e) {}

    this.applyDocumentAttributes();
    return this.currentLocale;
  }

  getLocale() {
    return this.currentLocale;
  }

  getDirection() {
    return LOCALE_CONFIG[this.currentLocale]?.dir || 'rtl';
  }

  applyDocumentAttributes() {
    if (typeof document === 'undefined') return;
    const config = LOCALE_CONFIG[this.currentLocale] || LOCALE_CONFIG[SUPPORTED_LOCALES.FA];
    document.documentElement.lang = config.lang;
    document.documentElement.dir = config.dir;
    document.body.style.fontFamily = config.fontFamily;
  }

  t(pathKey, fallback = '') {
    if (!pathKey || typeof pathKey !== 'string') return fallback;
    const segments = pathKey.split('.');
    
    // 1. Try current locale
    let val = this.translations[this.currentLocale];
    for (const seg of segments) {
      if (val && typeof val === 'object' && seg in val) {
        val = val[seg];
      } else {
        val = null;
        break;
      }
    }
    if (typeof val === 'string') return val;

    // 2. Try default locale (fa-IR)
    let defVal = this.translations[SUPPORTED_LOCALES.FA];
    for (const seg of segments) {
      if (defVal && typeof defVal === 'object' && seg in defVal) {
        defVal = defVal[seg];
      } else {
        defVal = null;
        break;
      }
    }
    if (typeof defVal === 'string') return defVal;

    return fallback || pathKey;
  }

  formatNumber(num) {
    if (typeof num !== 'number') return num;
    try {
      return new Intl.NumberFormat(this.currentLocale).format(num);
    } catch (e) {
      return String(num);
    }
  }

  formatDate(dateInput) {
    if (!dateInput) return '';
    try {
      const d = new Date(dateInput);
      return new Intl.DateTimeFormat(this.currentLocale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }).format(d);
    } catch (e) {
      return String(dateInput);
    }
  }
}

export const i18n = new I18nService();
