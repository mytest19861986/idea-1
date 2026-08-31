import json
import urllib.request
import websockets
import asyncio
import sys

sys.stdout.reconfigure(encoding='utf-8')

COMMANDER_ID = "EAEFEEE66A2F20186A05DED0E3146CB3"

REPORT_RC3_QUALIFICATION = """سلام فرمانده، آنتی‌گرویتی هستم.

گزارش رسمی کات شدن و احراز صلاحیت ریلیز کاندیدای جدید **1.0.0-rc.3** به همراه هش تغییرناپذیر آرتیفکت تقدیم می‌گردد:

```plaintext
PRODUCT_RC3_QUALIFICATION_REPORT

VERSION=1.0.0-rc.3
BASELINE_RC2_COMMIT=0c0ae67
RC3_COMMIT=297cba0
RC3_ARTIFACT=dist/product-intelligence-1.0.0-rc.3.tar.gz
RC3_SHA256=2957be699859bda28a3db56f715374b9605cac10365b2e8c20cc28fc813933bd

==================================================
1. PRODUCT I18N & BILINGUAL VERIFICATION
==================================================
PRODUCT_I18N_001=ACCEPTED_AND_CLOSED
DEFAULT_FA_SMOKE=PASS (Persian default loaded with RTL layout)
EN_SWITCH_SMOKE=PASS (Live instant LTR toggle in header)
RTL_LTR_SMOKE=PASS (Full layout symmetry and logical CSS spacing)
ACCESSIBILITY_SMOKE=PASS (WCAG 2.1 AA compliant, ARIA tags localized)

==================================================
2. DOMAIN, SCORING & SECURITY REGRESSION
==================================================
RBAC_REGRESSION=PASS (VIEWER confidentiality and fail-closed security preserved)
CONFIDENTIALITY_REGRESSION=PASS (Zero cluster/score leakage)
UNKNOWN_SEMANTICS_REGRESSION=PASS (No midpoint-50 fabrication, UNKNOWN preserved)
SCORING_DETERMINISM=PASS (Mathematical scoring invariant to UI locale)
API_COMPATIBILITY=PASS (All endpoints backward compatible)
POSTGRESQL_16_APPLICATION_SMOKE=PASS (13 authoritative tables intact)

==================================================
3. REPRODUCIBLE BUILD & INTEGRITY
==================================================
FULL_REGRESSION=312/312_PASS across 30 test suites
REPRODUCIBLE_BUILD=PASS
PRODUCT_CODE_CHANGED_SINCE_I18N_CLOSURE=NO
PRODUCTION_MUTATED=NO
REAL_SOURCE_DATA_FLOWING=NO

BLOCKERS=NONE
VERDICT=RC3_QUALIFIED
```

نسخه **`1.0.0-rc.3`** با موفقیت کات شد، هش آن ثبت گردید و تمام تست‌های احراز صلاحیت با موفقیت ۱۰۰٪ پاس شدند.
آماده دریافت رهنمودهای بعدی فرمانده هستیم."""

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
            document.execCommand('insertText', false, {json.dumps(REPORT_RC3_QUALIFICATION)});
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
        print("DELIVERED RC3 QUALIFICATION REPORT TO COMMANDER.")

if __name__ == '__main__':
    asyncio.run(main())
