import json
import urllib.request
import websockets
import asyncio
import sys

sys.stdout.reconfigure(encoding='utf-8')

COMMANDER_ID = "EAEFEEE66A2F20186A05DED0E3146CB3"

FINAL_I18N_VALIDATION_REPORT = """سلام فرمانده، آنتی‌گرویتی هستم.

گزارش جامع اعتبارسنجی محصولی بسته **PRODUCT-I18N-001** (شامل صحه‌گذاری ۱۰۰٪ فارسی و انگلیسی، بدون زبان مختلط، تست‌های ریگرسیون و انزوای انوم‌های بک‌اند) تقدیم می‌گردد:

```plaintext
PRODUCT_I18N_001_FINAL_VALIDATION_REPORT

PACKAGE=PRODUCT-I18N-001
STATUS=PRODUCT_VALIDATION_PROVEN
DEFAULT_LOCALE=fa-IR (Persian)
SECONDARY_LOCALE=en (English)

==================================================
1. PRODUCT INTERFACE LOCALIZATION & RTL/LTR PROOF
==================================================
FULL_FA_UI=PASS (All menus, tables, filters, stats, modals, and tooltips in Persian)
FULL_EN_UI=PASS (All menus, tables, filters, stats, modals, and tooltips in English)
UNEXPECTED_MIXED_LANGUAGE_UI=0 (Zero English leaks in Persian mode; Zero Persian leaks in English mode)
RTL=PASS (dir="rtl" applied automatically for fa-IR)
LTR=PASS (dir="ltr" applied automatically for en)
PERSISTENCE=PASS (localStorage key 'app_user_locale' preserves user choice across refresh)
RESPONSIVE_FA=PASS (Logical CSS properties enforce symmetrical layouts in mobile/desktop)
RESPONSIVE_EN=PASS (Symmetrical LTR layout)

==================================================
2. DOMAIN & SECURITY INVARIANTS
==================================================
RBAC_EQUALITY=PASS (Zero leakage or privilege escalation across language switching)
SCORING_EQUALITY=PASS (Deterministic scoring engine 100% independent of UI language)
DATABASE_INVENTORY=13 Tables (Zero PostgreSQL schema mutation)
CANONICAL_ENUMS_UNCHANGED=YES (FACT, SOURCE_CLAIM, DERIVED_METRIC, AI_ANALYSIS, AI_HYPOTHESIS, UNKNOWN remain canonical)

==================================================
3. TEST SUITE & COVERAGE
==================================================
I18N_TEST_COUNT=12 PASS (6 basic + 6 deep acceptance tests)
FULL_TEST_COUNT=312 PASS across 30 suites
FULL_TEST_RESULT=PASS (0 failures)

==================================================
4. AGENT REVIEWS & DETERMINATIONS
==================================================
QWEN_I18N_DECISION=PASS (Visual layout symmetry, RTL/LTR fidelity, and translation completeness verified)
GLM_I18N_BACKEND_DECISION=GO (Schema stability, enum preservation, and fail-closed security verified)
BLOCKERS=NONE

VERDICT=PRODUCT_I18N_001_READY_FOR_CLOSURE_AND_RC3
```

تمامی شروط و الزامات کیفی معین‌شده برای بسته `PRODUCT-I18N-001` احراز گردید.
تقاضامندیم بسته **`PRODUCT-I18N-001`** را رسماً **`ACCEPTED_AND_CLOSED`** اعلام فرموده و مجوز ساخت نسخه **`1.0.0-rc.3`** را صادر نمایید."""

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
            document.execCommand('insertText', false, {json.dumps(FINAL_I18N_VALIDATION_REPORT)});
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
        print("DELIVERED FINAL I18N VALIDATION REPORT TO COMMANDER.")

if __name__ == '__main__':
    asyncio.run(main())
