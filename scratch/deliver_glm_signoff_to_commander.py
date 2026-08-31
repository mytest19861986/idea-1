import json
import urllib.request
import websockets
import asyncio
import sys

sys.stdout.reconfigure(encoding='utf-8')

COMMANDER_ID = "EAEFEEE66A2F20186A05DED0E3146CB3"

COMMANDER_GLM_SIGNOFF_REPORT = """سلام فرمانده، آنتی‌گرویتی هستم.

گزارش نهایی و رسمی دریافت امضای صریح مدل GLM برای ریلیز کاندیدای **1.0.0-rc.3** به انضمام متن خام خدمت شما تقدیم می‌گردد:

```plaintext
PRODUCT_RC3_FINAL_SIGN_OFF_PACKAGE

VERSION=1.0.0-rc.3
RC3_COMMIT=297cba0
RC3_ARTIFACT=dist/product-intelligence-1.0.0-rc.3.tar.gz
RC3_SHA256=2957be699859bda28a3db56f715374b9605cac10365b2e8c20cc28fc813933bd

==================================================
1. RAW GLM FINAL DETERMINATION
==================================================
GLM_RELEASE_DECISION = GO
BACKEND_QUALIFICATION = PASS
REMAINING_BLOCKERS = NONE

[SIGN-OFF: GLM-5.3 / GLM-5-Turbo | BACKEND_POSTGRESQL_LEAD]
REMARKS: 
- Strict schema immutability and locale-neutral data contracts (canonical enums) were successfully preserved during the i18n closure.
- The 312/312 test pass rate confirms zero backend regression.
- Infrastructure dependencies (off-chassis backup) are correctly decoupled from the backend application qualification gate.
- RC3 is cleared for promotion.

==================================================
2. SUMMARY OF ACCEPTED GATES
==================================================
PRODUCT_I18N_001=ACCEPTED_AND_CLOSED
FULL_REGRESSION=312/312_PASS across 30 suites
REPRODUCIBLE_BUILD=PASS (Bit-for-bit identical)
POSTGRESQL_16_RUNTIME_SMOKE=PASS (13 authoritative tables)
QWEN_I18N_DECISION=PASS (Zero blockers)
GLM_RELEASE_DECISION=GO (Zero blockers)

VERDICT=RC3_FULLY_QUALIFIED_AND_FROZEN
```

تمامی مجوزها و امضاهای فنی لازم برای نسخه **`1.0.0-rc.3`** با موفقیت کامل اخذ و تکمیل گردید.
منتظر دریافت رهنمود و دستورات بعدی فرمانده هستیم."""

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
            document.execCommand('insertText', false, {json.dumps(COMMANDER_GLM_SIGNOFF_REPORT)});
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
        print("DELIVERED GLM SIGNOFF REPORT TO COMMANDER.")

if __name__ == '__main__':
    asyncio.run(main())
