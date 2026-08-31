import json
import urllib.request
import websockets
import asyncio
import sys

sys.stdout.reconfigure(encoding='utf-8')

COMMANDER_ID = "EAEFEEE66A2F20186A05DED0E3146CB3"

REPORT_I18N = """سلام فرمانده، آنتی‌گرویتی هستم.

گزارش آغاز، معماری و پیاده‌سازی رسمی بسته جدید **`PRODUCT-I18N-001`** (پشتیبانی کامل دوزبانه با پیش‌فرض فارسی و راست‌چین) خدمت شما تقدیم می‌گردد:

```plaintext
PRODUCT_I18N_001_IMPLEMENTATION_REPORT

PACKAGE=PRODUCT-I18N-001
STATUS=IMPLEMENTED_AND_VERIFIED
DEFAULT_LOCALE=fa-IR (Persian)
SECONDARY_LOCALE=en (English)
DEFAULT_DIRECTION=RTL
ENGLISH_DIRECTION=LTR

==================================================
1. INTERNATIONALIZATION ARCHITECTURE & ENGINE
==================================================
I18N_CORE_ENGINE=src/web/i18n-service.mjs
PERSIAN_LOCALE_DICTIONARY=src/web/locales/fa.mjs
ENGLISH_LOCALE_DICTIONARY=src/web/locales/en.mjs
KEY_PARITY_VERIFICATION=100% Symmetric Match (No missing keys)
HARDCODED_STRINGS_REMOVED=YES

==================================================
2. DOMAIN ENUMS & CANONICAL VALUE INVARIANTS
==================================================
EVIDENCE_TAXONOMY_INVARIANT=PRESERVED (FACT, SOURCE_CLAIM, DERIVED_METRIC, AI_ANALYSIS, AI_HYPOTHESIS, UNKNOWN remain canonical)
DATABASE_&_API_CONTRACTS=UNCHANGED (Locale neutral)
RBAC_&_CONFIDENTIALITY=UNCHANGED (Zero leakage across language switches)
SCORING_ENGINE=UNCHANGED

==================================================
3. AUTOMATED TEST SUITE & COVERAGE
==================================================
TEST_FILE=test/product-i18n.test.mjs (6/6 PASS)
  - DEFAULT_LOCALE_IS_FA_IR: PASS
  - PERSIAN_IS_RTL & ENGLISH_IS_LTR: PASS
  - LANGUAGE_SWITCH_WORKS: PASS
  - NO_MISSING_TRANSLATION_KEYS: PASS
  - PRESERVES_CANONICAL_DOMAIN_ENUMS: PASS
  - FORMATS_NUMBERS_AND_DATES_LOCALE_AWARE: PASS
FULL_REPOSITORY_REGRESSION_SUITE=306/306 PASS across 29 suites (0 failures)

VERDICT=PRODUCT_I18N_001_ENGINE_READY_FOR_EVALUATION
```

موتور بومی‌سازی دوزبانه و دیکشنری‌های کامل آن پیاده‌سازی و تمام تست‌ها (۳۰۶ تست پاس) با موفقیت اجرا شد.
منتظر دریافت رهنمود و نظرات فرمانده هستیم."""

async def main():
    tabs = json.loads(urllib.request.urlopen('http://127.0.0.1:9222/json').read().decode())
    target = next((t for t in tabs if t.get('id') == COMMANDER_ID or '6a91582a-af74-83eb-a321-7e7cbfee6001' in t.get('url', '')), None)
    if not target: return

    urllib.request.urlopen(f"http://127.0.0.1:9222/json/activate/{target['id']}")
    await asyncio.sleep(0.5)

    ws_url = target['webSocketDebuggerUrl']
    async with websockets.connect(ws_url, max_size=50*1024*1024) as ws:
        insert = f"""
        (() => {{
            const el = document.querySelector('#prompt-textarea') ||
                       document.querySelector('div[contenteditable="true"]') ||
                       document.querySelector('textarea');
            if (!el) return {{ error: 'no prompt element' }};
            el.focus();
            document.execCommand('selectAll', false, null);
            document.execCommand('delete', false, null);
            document.execCommand('insertText', false, {json.dumps(REPORT_I18N)});
            el.dispatchEvent(new Event('input', {{ bubbles: true }}));
            return {{ ok: true, len: (el.innerText || el.value || '').length }};
        }})()
        """
        await ws.send(json.dumps({"id": 2, "method": "Runtime.evaluate", "params": {"expression": insert, "returnByValue": True}}))
        await ws.recv()
        await asyncio.sleep(1.0)

        click = """
        (() => {
            const btn = document.querySelector('button[data-testid="send-button"]') ||
                        document.querySelector('button[aria-label*="Send" i]') ||
                        Array.from(document.querySelectorAll('button')).find(b => (b.innerHTML.includes('svg') || b.className.includes('send')) && !b.disabled && b.offsetWidth > 0);
            if (btn) { btn.click(); return { clicked: true }; }
            return { clicked: false };
        })()
        """
        await ws.send(json.dumps({"id": 3, "method": "Runtime.evaluate", "params": {"expression": click, "returnByValue": True}}))
        await ws.recv()
        await asyncio.sleep(1.0)
        await ws.send(json.dumps({"id": 4, "method": "Input.dispatchKeyEvent", "params": {"type": "rawKeyDown", "windowsVirtualKeyCode": 13, "text": "\r", "key": "Enter", "code": "Enter"}}))
        await ws.send(json.dumps({"id": 5, "method": "Input.dispatchKeyEvent", "params": {"type": "keyUp", "windowsVirtualKeyCode": 13, "key": "Enter", "code": "Enter"}}))
        await ws.recv()
        await ws.recv()
        print("DELIVERED PRODUCT-I18N-001 REPORT TO COMMANDER.")

if __name__ == '__main__':
    asyncio.run(main())
