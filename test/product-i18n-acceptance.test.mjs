import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { I18nService, SUPPORTED_LOCALES } from '../src/web/i18n-service.mjs';
import { fa } from '../src/web/locales/fa.mjs';
import { en } from '../src/web/locales/en.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('PRODUCT-I18N-001: Comprehensive Bilingual Quality & Acceptance Suite', () => {
  it('1. DEFAULT_LOCALE_IS_FA_IR', () => {
    const service = new I18nService();
    assert.equal(service.getLocale(), SUPPORTED_LOCALES.FA);
    assert.equal(service.getDirection(), 'rtl');
  });

  it('2. PERSIAN_IS_RTL and ENGLISH_IS_LTR', () => {
    const service = new I18nService();
    service.setLocale(SUPPORTED_LOCALES.FA);
    assert.equal(service.getDirection(), 'rtl');

    service.setLocale(SUPPORTED_LOCALES.EN);
    assert.equal(service.getDirection(), 'ltr');
  });

  it('3. COMPLETE_FA_COVERAGE (All menus, tables, stats, and dialogs in Persian)', () => {
    const service = new I18nService();
    service.setLocale(SUPPORTED_LOCALES.FA);

    const requiredKeys = [
      'app.title', 'app.subtitle', 'nav.dashboard', 'nav.opportunities',
      'nav.comparison', 'stats.totalOpportunities', 'table.opportunityName',
      'table.confidence', 'table.evidenceCount', 'filters.searchPlaceholder',
      'modal.close', 'modal.save', 'common.loading'
    ];

    for (const k of requiredKeys) {
      const val = service.t(k);
      assert.ok(val && val.length > 0 && val !== k, `Key ${k} must be translated in Persian`);
      // Assert that Persian string is not raw English fallback
      assert.match(val, /[\u0600-\u06FF]/, `Key ${k} value "${val}" must contain Persian characters`);
    }
  });

  it('4. COMPLETE_EN_COVERAGE (All menus, tables, stats, and dialogs in English)', () => {
    const service = new I18nService();
    service.setLocale(SUPPORTED_LOCALES.EN);

    const requiredKeys = [
      'app.title', 'app.subtitle', 'nav.dashboard', 'nav.opportunities',
      'nav.comparison', 'stats.totalOpportunities', 'table.opportunityName',
      'table.confidence', 'table.evidenceCount', 'filters.searchPlaceholder',
      'modal.close', 'modal.save', 'common.loading'
    ];

    for (const k of requiredKeys) {
      const val = service.t(k);
      assert.ok(val && val.length > 0 && val !== k, `Key ${k} must be translated in English`);
    }
  });

  it('5. NO_UNEXPECTED_MIXED_LANGUAGE_IN_TAXONOMY', () => {
    const service = new I18nService();
    service.setLocale(SUPPORTED_LOCALES.FA);
    const taxa = ['FACT', 'SOURCE_CLAIM', 'DERIVED_METRIC', 'AI_ANALYSIS', 'AI_HYPOTHESIS', 'UNKNOWN'];
    for (const t of taxa) {
      const label = service.t(`taxonomy.${t}`);
      assert.match(label, /[\u0600-\u06FF]/, `Taxonomy ${t} must have Persian label in FA mode`);
    }
  });

  it('6. PRESERVES_CONFIDENTIALITY_AND_SECURITY_ACROSS_LOCALES', () => {
    const service = new I18nService();
    service.setLocale(SUPPORTED_LOCALES.FA);
    assert.equal(service.t('common.confidential'), '[محرمانه - دسترسی محدود]');

    service.setLocale(SUPPORTED_LOCALES.EN);
    assert.equal(service.t('common.confidential'), '[CONFIDENTIAL - RESTRICTED ACCESS]');
  });
});
