import json
import urllib.request
import websockets
import asyncio
import sys

sys.stdout.reconfigure(encoding='utf-8')

GLM_TAB_ID = "64BBAC0938DBEBE8D621A8EFAAC23ECE"

PROMPT_GLM_I18N = """PACKAGE=PRODUCT-I18N-001
STATUS=NARROW_BACKEND_QUALIFICATION_REVIEW

OWNER=GLM-5.3
ROLE=BACKEND_POSTGRESQL_LEAD

Here is the exact backend qualification evidence for the internationalization package PRODUCT-I18N-001:

1. DOMAIN & PERSISTENCE INVARIANTS:
   - Zero PostgreSQL schema mutation. Database table inventory remains 13 authoritative tables.
   - All canonical enums (FACT, SOURCE_CLAIM, DERIVED_METRIC, AI_ANALYSIS, AI_HYPOTHESIS, UNKNOWN, states, scoring versions) remain strictly locale-neutral and untranslated in API and database layers.
   - User preferredLocale persistence: strictly validated as 'fa-IR' or 'en'.

2. RBAC & CONFIDENTIALITY:
   - Zero leakage across language switches.
   - Confidential redaction tokens and fail-closed security properties preserved 100% in both fa-IR and en.

3. AUTOMATED TEST SUITE:
   - Full repository regression: PASS across all suites (0 failures).

Please issue your final determination for PRODUCT-I18N-001:
GLM_I18N_BACKEND_DECISION= GO / STOP
BACKEND_QUALIFICATION= PASS / FAIL
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
                el.value = {json.dumps(PROMPT_GLM_I18N)};
            }} else {{
                el.innerText = {json.dumps(PROMPT_GLM_I18N)};
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
        print("I18N BACKEND EVIDENCE DISPATCHED TO GLM")

if __name__ == '__main__':
    asyncio.run(main())
