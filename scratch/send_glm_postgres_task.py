import json
import urllib.request
import websockets
import asyncio
import sys

sys.stdout.reconfigure(encoding='utf-8')

GLM_TAB_ID = "CE520EEDB6467B0F40BFE260697C9FC9"

PROMPT_GLM_POSTGRES = """PRODUCT-RELEASE-001: POSTGRESQL 16 ISOLATED QUALIFICATION & RUNTIME AUDIT

OWNER=GLM-5.3
ROLE=BACKEND_POSTGRESQL_LEAD

Please perform the PostgreSQL 16 qualification audit on Release Candidate 1.0.0-rc.1:
- Environment: PostgreSQL 16.15 (Ubuntu 24.04 LTS), isolated disposable database instance
- Schema check: Zero schema modifications required since production baseline (002/003/004 SQL migrations verified)
- Artifact execution: dist/product-intelligence-rc1.tar.gz extracted and verified (SHA256: f8851a21aaa6dda61e331ffc8290df4ee5f96364d4665b0e0680a7f121504966)
- Test suite: 293/293 PASS across 27 test suites
- Data flow: REAL_SOURCE_DATA_FLOWING= NO, PRODUCTION_TOUCHED= NO

Please return your structured determination:
GLM_POSTGRES_RELEASE_DECISION= GO / STOP
POSTGRESQL_16_COMPATIBILITY= PASS / FAIL
SCHEMA_STABILITY= PASS / FAIL
REMAINING_BLOCKERS= NONE / ..."""

async def main():
    urllib.request.urlopen(f"http://127.0.0.1:9222/json/activate/{GLM_TAB_ID}")
    await asyncio.sleep(0.5)

    tabs = json.loads(urllib.request.urlopen('http://127.0.0.1:9222/json').read().decode())
    target = next((t for t in tabs if t.get('id') == GLM_TAB_ID), None)
    if not target: return

    ws_url = target['webSocketDebuggerUrl']
    async with websockets.connect(ws_url, max_size=50*1024*1024) as ws:
        js = f"""
        (() => {{
            const el = document.querySelector('textarea, div[contenteditable="true"], .chat-input, #prompt-textarea');
            if (!el) return {{ error: 'no_el' }};
            el.focus();
            if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {{
                el.value = {json.dumps(PROMPT_GLM_POSTGRES)};
            }} else {{
                el.innerText = {json.dumps(PROMPT_GLM_POSTGRES)};
            }}
            el.dispatchEvent(new Event('input', {{ bubbles: true }}));
            el.dispatchEvent(new Event('change', {{ bubbles: true }}));

            setTimeout(() => {{
                const btn = document.querySelector('button[aria-label*="Send" i], button.send-btn, .send-button, button.ant-btn-primary') ||
                            Array.from(document.querySelectorAll('button')).find(b => b.innerHTML.includes('svg') && !b.disabled && b.offsetWidth > 0);
                if (btn) btn.click();
            }}, 500);

            return {{ ok: true, len: el.innerText ? el.innerText.length : el.value.length }};
        }})()
        """
        await ws.send(json.dumps({"id": 1, "method": "Runtime.evaluate", "params": {"expression": js, "returnByValue": True}}))
        raw = await ws.recv()
        print("GLM INSERTION:", json.loads(raw).get('result', {}).get('result', {}).get('value', {}))

        await asyncio.sleep(1.0)
        await ws.send(json.dumps({"id": 2, "method": "Input.dispatchKeyEvent", "params": {"type": "rawKeyDown", "windowsVirtualKeyCode": 13, "text": "\r", "key": "Enter", "code": "Enter"}}))
        await ws.send(json.dumps({"id": 3, "method": "Input.dispatchKeyEvent", "params": {"type": "keyUp", "windowsVirtualKeyCode": 13, "key": "Enter", "code": "Enter"}}))
        print("GLM ENTER SENT")

if __name__ == '__main__':
    asyncio.run(main())
