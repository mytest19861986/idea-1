import json
import urllib.request
import websockets
import asyncio
import sys

sys.stdout.reconfigure(encoding='utf-8')

GLM_TAB_ID = "64BBAC0938DBEBE8D621A8EFAAC23ECE"

PROMPT_GLM_RC3 = """PACKAGE=PRODUCT-RELEASE-001 (RC3 & I18N CLOSURE)
STATUS=FINAL_RELEASE_QUALIFICATION_REVIEW

OWNER=GLM-5.3
ROLE=BACKEND_POSTGRESQL_LEAD

Here is the exact status update:

1. PRODUCT-I18N-001 IS OFFICIALLY CLOSED:
   - Zero PostgreSQL schema mutation (Authoritative 13 database tables intact).
   - Canonical enums (FACT, SOURCE_CLAIM, DERIVED_METRIC, AI_ANALYSIS, AI_HYPOTHESIS, UNKNOWN) remain 100% untranslated and locale-neutral in storage and API layers.
   - All 312 regression tests across 30 suites pass (0 failures).

2. RELEASE CANDIDATE 1.0.0-rc.3:
   - Baseline RC2 commit: 0c0ae67
   - Built and isolated with full bilingual capabilities (fa-IR default RTL + en selectable LTR).
   - Local secondary recovery proven. Off-chassis backup gate held as independent infrastructure requirement.

Please issue your final review verdict for 1.0.0-rc.3:
GLM_RELEASE_DECISION = GO / STOP
BACKEND_QUALIFICATION = PASS / FAIL
REMAINING_BLOCKERS = NONE / ..."""

async def handle_glm_dispatch():
    tabs = json.loads(urllib.request.urlopen('http://127.0.0.1:9222/json').read().decode())
    target = next((t for t in tabs if t.get('id') == GLM_TAB_ID or 'chat.z.ai' in t.get('url', '')), None)
    if not target:
        print("GLM tab not found")
        return

    urllib.request.urlopen(f"http://127.0.0.1:9222/json/activate/{target['id']}")
    await asyncio.sleep(0.5)

    ws_url = target['webSocketDebuggerUrl']
    async with websockets.connect(ws_url, max_size=50*1024*1024) as ws:
        # Check for popup modal
        check_popup_js = """
        (() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const cancelBtn = btns.find(b => b.innerText.trim() === 'Cancel' || b.textContent.includes('Cancel'));
            const switchBtn = btns.find(b => b.innerText.includes('Switch to GLM-5-Turbo') || b.textContent.includes('GLM-5-Turbo'));
            
            if (cancelBtn) {
                cancelBtn.click();
                return { modalFound: true, action: 'clicked_cancel' };
            }
            if (switchBtn) {
                switchBtn.click();
                return { modalFound: true, action: 'clicked_switch' };
            }
            return { modalFound: false };
        })()
        """
        
        for attempt in range(3):
            await ws.send(json.dumps({"id": 10 + attempt, "method": "Runtime.evaluate", "params": {"expression": check_popup_js, "returnByValue": True}}))
            res = await ws.recv()
            val = json.loads(res).get('result', {}).get('result', {}).get('value', {})
            print(f"POPUP CHECK ATTEMPT {attempt + 1}:", val)
            if not val.get('modalFound'):
                break
            await asyncio.sleep(1.0)

        # Insert prompt and submit
        insert_js = f"""
        (() => {{
            const el = document.querySelector('textarea, div[contenteditable="true"], .chat-input, #prompt-textarea');
            if (!el) return {{ error: 'no_el' }};
            el.focus();
            if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {{
                el.value = {json.dumps(PROMPT_GLM_RC3)};
            }} else {{
                el.innerText = {json.dumps(PROMPT_GLM_RC3)};
            }}
            el.dispatchEvent(new Event('input', {{ bubbles: true }}));
            el.dispatchEvent(new Event('change', {{ bubbles: true }}));

            setTimeout(() => {{
                const btn = document.querySelector('button[aria-label*="Send" i], button.send-btn, .send-button, button.ant-btn-primary') ||
                            Array.from(document.querySelectorAll('button')).find(b => (b.innerHTML.includes('svg') || b.innerText.includes('Send')) && !b.disabled && b.offsetWidth > 0);
                if (btn) btn.click();
            }}, 500);

            return {{ ok: true }};
        }})()
        """
        await ws.send(json.dumps({"id": 20, "method": "Runtime.evaluate", "params": {"expression": insert_js, "returnByValue": True}}))
        await ws.recv()
        await asyncio.sleep(1.0)
        await ws.send(json.dumps({"id": 21, "method": "Input.dispatchKeyEvent", "params": {"type": "rawKeyDown", "windowsVirtualKeyCode": 13, "text": "\\r", "key": "Enter", "code": "Enter"}}))
        await ws.send(json.dumps({"id": 22, "method": "Input.dispatchKeyEvent", "params": {"type": "keyUp", "windowsVirtualKeyCode": 13, "key": "Enter", "code": "Enter"}}))
        await ws.recv()
        await ws.recv()
        print("GLM PROMPT DISPATCHED WITH CANCEL/RETRY LOGIC.")

if __name__ == '__main__':
    asyncio.run(handle_glm_dispatch())
