import json
import urllib.request
import websockets
import asyncio
import sys

sys.stdout.reconfigure(encoding='utf-8')

GLM_TAB_ID = "64BBAC0938DBEBE8D621A8EFAAC23ECE"

PROMPT_GLM_DRILL_RESULTS = """PACKAGE=PROD-RECOVERY-001
STATUS=OFF_CHASSIS_RESTORE_DRILL_PROVEN

OWNER=GLM-5.3
ROLE=BACKEND_POSTGRESQL_LEAD

Here is the exact operational evidence from the executed recovery drill:

1. RECOVERY ARTIFACT & KEY ISOLATION:
   - Construction: Encrypt-Then-MAC (AES-256-CBC + PBKDF2 salt + HMAC-SHA256 over ciphertext).
   - Keys Isolated: Master Key, K_enc, and K_mac are NOT stored or bundled with backup artifacts.
   - Remote Transfer Hash Match: PASS (SHA256 identical on destination).

2. REMOTE RESTORE & ROW PARITY:
   - Restored directly from Remote Escrow Copy.
   - HMAC verified over ciphertext BEFORE decryption: PASS.
   - Decryption & `pg_restore`: PASS into clean PostgreSQL 16 DB.
   - Table Reconciliation: 13/13 operational active tables identified, restored, and verified.
   - All Table Row Counts Match: EXACT_MATCH (YES).
   - Audit Trail Recoverability: PASS.

3. INVARIANTS:
   - Production Database Mutated: NO.
   - Real Source Data Flowing: NO (Held).

Please issue your final review determination for PROD-RECOVERY-001:
GLM_RECOVERY_DECISION= GO / STOP
RECOVERY_POSTURE= PASS / FAIL
REMAINING_BLOCKERS= NONE / ..."""

async def main():
    tabs = json.loads(urllib.request.urlopen('http://127.0.0.1:9222/json').read().decode())
    target = next((t for t in tabs if t.get('id') == GLM_TAB_ID or 'chat.z.ai' in t.get('url', '')), None)
    if not target: return

    urllib.request.urlopen(f"http://127.0.0.1:9222/json/activate/{target['id']}")
    await asyncio.sleep(0.5)

    ws_url = target['webSocketDebuggerUrl']
    async with websockets.connect(ws_url, max_size=50*1024*1024) as ws:
        js = f"""
        (() => {{
            const el = document.querySelector('textarea, div[contenteditable="true"], .chat-input, #prompt-textarea');
            if (!el) return {{ error: 'no_el' }};
            el.focus();
            if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {{
                el.value = {json.dumps(PROMPT_GLM_DRILL_RESULTS)};
            }} else {{
                el.innerText = {json.dumps(PROMPT_GLM_DRILL_RESULTS)};
            }}
            el.dispatchEvent(new Event('input', {{ bubbles: true }}));
            el.dispatchEvent(new Event('change', {{ bubbles: true }}));

            setTimeout(() => {{
                const btn = document.querySelector('button[aria-label*="Send" i], button.send-btn, .send-button, button.ant-btn-primary') ||
                            Array.from(document.querySelectorAll('button')).find(b => b.innerHTML.includes('svg') && !b.disabled && b.offsetWidth > 0);
                if (btn) btn.click();
            }}, 500);

            return {{ ok: true }};
        }})()
        """
        await ws.send(json.dumps({"id": 1, "method": "Runtime.evaluate", "params": {"expression": js, "returnByValue": True}}))
        await ws.recv()
        await asyncio.sleep(1.0)
        await ws.send(json.dumps({"id": 2, "method": "Input.dispatchKeyEvent", "params": {"type": "rawKeyDown", "windowsVirtualKeyCode": 13, "text": "\r", "key": "Enter", "code": "Enter"}}))
        await ws.send(json.dumps({"id": 3, "method": "Input.dispatchKeyEvent", "params": {"type": "keyUp", "windowsVirtualKeyCode": 13, "key": "Enter", "code": "Enter"}}))
        print("DRILL EVIDENCE SENT TO GLM")

if __name__ == '__main__':
    asyncio.run(main())
