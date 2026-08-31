import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { I18nService, SUPPORTED_LOCALES, LOCALE_CONFIG } from '../src/web/i18n-service.mjs';
import { fa } from '../src/web/locales/fa.mjs';
import { en } from '../src/web/locales/en.mjs';

describe('PRODUCT-I18N-001: Internationalization & Persian Localization Suite', () => {
  it('DEFAULT_LOCALE_IS_FA_IR', () => {
    const service = new I18nService();
    assert.equal(service.getLocale(), SUPPORTED_LOCALES.FA);
  });

  it('PERSIAN_IS_RTL and ENGLISH_IS_LTR', () => {
    const service = new I18nService();
    service.setLocale(SUPPORTED_LOCALES.FA);
    assert.equal(service.getDirection(), 'rtl');

    service.setLocale(SUPPORTED_LOCALES.EN);
    assert.equal(service.getDirection(), 'ltr');
  });

  it('LANGUAGE_SWITCH_WORKS and live updates translations', () => {
    const service = new I18nService();
    service.setLocale(SUPPORTED_LOCALES.FA);
    assert.equal(service.t('nav.dashboard'), 'داشبورد تحلیلی');

    service.setLocale(SUPPORTED_LOCALES.EN);
    assert.equal(service.t('nav.dashboard'), 'Analytics Dashboard');
  });

  it('NO_MISSING_TRANSLATION_KEYS (symmetric key coverage between fa and en)', () => {
    function getAllKeys(obj, prefix = '') {
      let keys = [];
      for (const [k, v] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${k}` : k;
        if (typeof v === 'object' && v !== null) {
          keys = keys.concat(getAllKeys(v, fullKey));
        } else {
          keys.push(fullKey);
        }
      }
      return keys.sort();
    }

    const faKeys = getAllKeys(fa);
    const enKeys = getAllKeys(en);

    assert.deepEqual(faKeys, enKeys, 'Fa and En translation dictionaries must have 100% key parity');
  });

  it('PRESERVES_CANONICAL_DOMAIN_ENUMS (taxonomies map correctly without corrupting underlying keys)', () => {
    const service = new I18nService();
    const domainEnums = ['FACT', 'SOURCE_CLAIM', 'DERIVED_METRIC', 'AI_ANALYSIS', 'AI_HYPOTHESIS', 'UNKNOWN'];

    service.setLocale(SUPPORTED_LOCALES.FA);
    for (const e of domainEnums) {
      const translated = service.t(`taxonomy.${e}`);
      assert.ok(translated && translated !== e, `Enum ${e} must have Persian label`);
    }

    service.setLocale(SUPPORTED_LOCALES.EN);
    for (const e of domainEnums) {
      const translated = service.t(`taxonomy.${e}`);
      assert.ok(translated && translated !== e, `Enum ${e} must have English label`);
    }
  });

  it('FORMATS_NUMBERS_AND_DATES_LOCALE_AWARE', () => {
    const service = new I18nService();
    service.setLocale(SUPPORTED_LOCALES.FA);
    const numFa = service.formatNumber(1250);
    assert.ok(numFa.length > 0);

    service.setLocale(SUPPORTED_LOCALES.EN);
    const numEn = service.formatNumber(1250);
    assert.equal(numEn, '1,250');
  });
});
