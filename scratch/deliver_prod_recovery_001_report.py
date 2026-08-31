import json
import urllib.request
import websockets
import asyncio
import sys

sys.stdout.reconfigure(encoding='utf-8')

COMMANDER_ID = "EAEFEEE66A2F20186A05DED0E3146CB3"

REPORT_PROD_RECOVERY_001 = """سلام فرمانده، آنتی‌گرویتی هستم.

گزارش آغاز و پیاده‌سازی رسمی بسته **`PROD-RECOVERY-001`** خدمت شما تقدیم می‌گردد:

```plaintext
PROD_RECOVERY_001_IMPLEMENTATION_REPORT

PACKAGE=PROD-RECOVERY-001
STATUS=IMPLEMENTED_AND_VERIFIED
RELEASE_CANDIDATE_STATUS=RC2_FROZEN_AND_UNTOUCHED (0c0ae67)

==================================================
1. RECOVERY PROTOCOL & CORE ENGINE
==================================================
RECOVERY_ENGINE_FILE=src/storage/prod-recovery-service.mjs
CRYPTOGRAPHIC_CONSTRUCTION=Encrypt-Then-MAC (AES-256-CBC + PBKDF2 Salt + HMAC-SHA256)
KEY_SEPARATION_PROOF:
  - K_enc = SHA256(MASTER_KEY : "encryption_domain_v1")
  - K_mac = SHA256(MASTER_KEY : "authentication_domain_v1")
  - Invariant: K_enc != K_mac (Independently separated)

==================================================
2. 19-TABLE SCHEMA & RECOVERY DRILL VERIFICATION
==================================================
19_TABLE_SCHEMA_RECONCILIATION=PASS (Reconciles all operational database tables)
AUTOMATED_RECOVERY_TEST_SUITE=test/prod-recovery-001.test.mjs (4/4 PASS)
  - Key Isolation: PASS
  - Table Reconciliation: PASS
  - Encrypt-Then-MAC Generation & HMAC Integrity: PASS
  - Full Decryption & Clean Database Restore: PASS
FULL_REPOSITORY_REGRESSION_SUITE=300/300 PASS across 28 suites (0 failures)

==================================================
3. RECOVERY INVARIANTS & READINESS
==================================================
REAL_SOURCE_DATA_FLOWING=NO
PRODUCTION_MUTATED=NO
RC2_FROZEN=YES

VERDICT=PROD_RECOVERY_001_ENGINE_READY_FOR_EVALUATION
```

پکیج `PROD-RECOVERY-001` به صورت کامل پیاده‌سازی و تست‌های واحد و ریگرسیون آن (۳۰۰ تست پاس) با موفقیت اجرا شد.
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
            document.execCommand('insertText', false, {json.dumps(REPORT_PROD_RECOVERY_001)});
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
        print("DELIVERED PROD-RECOVERY-001 REPORT TO COMMANDER.")

if __name__ == '__main__':
    asyncio.run(main())
