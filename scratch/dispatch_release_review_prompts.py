import json
import urllib.request
import websockets
import asyncio
import sys

sys.stdout.reconfigure(encoding='utf-8')

QWEN_TAB_ID = "C70CFA9708BAF7C7E2C5413E09DEEF16"
GEMINI_TAB_ID = "9185D5AB1064B87D0950C0C99FB40BB9"
GLM_TAB_ID = "CE520EEDB6467B0F40BFE260697C9FC9"

PROMPT_QWEN = """PRODUCT-RELEASE-001: STAGING UI SMOKE & ACCESSIBILITY REGRESSION REVIEW

OWNER=Qwen-3.8-Max
ROLE=FRONTEND_LEAD

Please perform the staging UI smoke and accessibility review on the qualified Release Candidate (1.0.0-rc.1, Commit: a348cc787f24902cef0a619ffa8139f2b5f308a8):
- Comparison modal rendering & contrast
- 12 Monetization models UI & Localization
- Keyboard accessibility & ARIA
- Zero visual defects in staging

Return your structured verdict:
QWEN_RELEASE_DECISION= PASS / FAIL
STAGING_UI_SMOKE= PASS / FAIL
ACCESSIBILITY_SMOKE= PASS / FAIL
REMAINING_BLOCKERS= NONE / ..."""

PROMPT_GEMINI = """TASK_ID=PRODUCT-RELEASE-001
ROLE=INDEPENDENT_DOMAIN_AUDITOR
AUDITOR=GEMINI_CLOUD

Please conduct the independent release calibration and domain integrity audit for Release Candidate 1.0.0-rc.1 (Commit: a348cc787f24902cef0a619ffa8139f2b5f308a8):
- Unknown semantic preservation (no midpoint/synthetic fallback)
- Evidence provenance & confidence separation
- Zero overstated capability claims

Return your structured determination:
GEMINI_RELEASE_DECISION= GO / STOP
CLAIM_CALIBRATION= PASS / FAIL
DOMAIN_SEMANTICS= PASS / FAIL
OVERSTATED_CLAIMS= NONE / ..."""

PROMPT_GLM = """PRODUCT-RELEASE-001: BACKEND, API & RELEASE-RUNTIME QUALIFICATION REVIEW

OWNER=GLM-5.3
ROLE=BACKEND_POSTGRESQL_LEAD

Please review the backend qualification and staging runtime verification for Release Candidate 1.0.0-rc.1 (Commit: a348cc787f24902cef0a619ffa8139f2b5f308a8):
- Tests: 293/293 PASS across 27 test suites
- Staging smoke: AUTH, RBAC, Confidentiality, Deterministic Scoring, Latencies (<25ms)
- Operational safety: Rollback ready, Backup verified, Zero real source activation

Return your structured determination:
GLM_RELEASE_DECISION= GO / STOP
BACKEND_QUALIFICATION= PASS / FAIL
API_SMOKE= PASS / FAIL
OPERATIONAL_CONTROLS= PASS / FAIL
REMAINING_BLOCKERS= NONE / ..."""

async def dispatch(tab_id, name, text):
    tabs = json.loads(urllib.request.urlopen('http://127.0.0.1:9222/json').read().decode())
    target = next((t for t in tabs if t.get('id') == tab_id), None)
    if not target:
        print(f"[{name}] Tab not found")
        return

    urllib.request.urlopen(f"http://127.0.0.1:9222/json/activate/{tab_id}")
    await asyncio.sleep(0.5)

    ws_url = target['webSocketDebuggerUrl']
    async with websockets.connect(ws_url, max_size=50*1024*1024) as ws:
        await ws.send(json.dumps({"id": 1, "method": "Runtime.enable"}))
        await asyncio.sleep(0.2)

        # Clear and insert text
        insert = f"""
        (() => {{
            const el = document.querySelector('textarea, div[contenteditable="true"], .chat-input, #prompt-textarea, .rich-textarea');
            if (!el) return {{ error: 'no input element' }};
            el.focus();
            document.execCommand('selectAll', false, null);
            document.execCommand('delete', false, null);
            document.execCommand('insertText', false, {json.dumps(text)});
            el.dispatchEvent(new Event('input', {{ bubbles: true }}));
            return {{ ok: true }};
        }})()
        """
        await ws.send(json.dumps({"id": 2, "method": "Runtime.evaluate", "params": {"expression": insert, "returnByValue": True}}))
        await ws.recv()
        await asyncio.sleep(1.0)

        # Click send
        click = """
        (() => {
            const btn = document.querySelector('button[aria-label*="Send" i], button[data-testid="send-button"], button.send-btn, .send-button, button.ant-btn-primary') ||
                        Array.from(document.querySelectorAll('button')).find(b => b.innerHTML.includes('svg') && !b.disabled && b.offsetWidth > 0);
            if (btn) {
                btn.click();
                return { clicked: true };
            }
            return { clicked: false };
        })()
        """
        await ws.send(json.dumps({"id": 3, "method": "Runtime.evaluate", "params": {"expression": click, "returnByValue": True}}))
        await ws.recv()
        await asyncio.sleep(1.0)

        # Send Enter
        await ws.send(json.dumps({"id": 4, "method": "Input.dispatchKeyEvent", "params": {"type": "rawKeyDown", "windowsVirtualKeyCode": 13, "text": "\r", "key": "Enter", "code": "Enter"}}))
        await ws.send(json.dumps({"id": 5, "method": "Input.dispatchKeyEvent", "params": {"type": "keyUp", "windowsVirtualKeyCode": 13, "key": "Enter", "code": "Enter"}}))
        await ws.recv()
        await ws.recv()
        print(f"[{name}] Dispatched successfully.")

async def main():
    await dispatch(QWEN_TAB_ID, "Qwen", PROMPT_QWEN)
    await asyncio.sleep(2.0)
    await dispatch(GEMINI_TAB_ID, "Gemini", PROMPT_GEMINI)
    await asyncio.sleep(2.0)
    await dispatch(GLM_TAB_ID, "GLM", PROMPT_GLM)

if __name__ == '__main__':
    asyncio.run(main())
