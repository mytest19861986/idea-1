import json
import urllib.request
import websockets
import asyncio
import sys

sys.stdout.reconfigure(encoding='utf-8')

GEMINI_TAB_ID = "9185D5AB1064B87D0950C0C99FB40BB9"

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

async def main():
    tabs = json.loads(urllib.request.urlopen('http://127.0.0.1:9222/json').read().decode())
    target = next((t for t in tabs if t.get('id') == GEMINI_TAB_ID), None)
    if not target: return

    urllib.request.urlopen(f"http://127.0.0.1:9222/json/activate/{GEMINI_TAB_ID}")
    await asyncio.sleep(0.5)

    ws_url = target['webSocketDebuggerUrl']
    async with websockets.connect(ws_url, max_size=50*1024*1024) as ws:
        await ws.send(json.dumps({"id": 1, "method": "Runtime.enable"}))
        await asyncio.sleep(0.2)

        insert = f"""
        (() => {{
            const el = document.querySelector('div[contenteditable="true"], .rich-textarea, textarea');
            if (!el) return {{ error: 'no el' }};
            el.focus();
            document.execCommand('selectAll', false, null);
            document.execCommand('delete', false, null);
            document.execCommand('insertText', false, {json.dumps(PROMPT_GEMINI)});
            el.dispatchEvent(new Event('input', {{ bubbles: true }}));
            return {{ ok: true }};
        }})()
        """
        await ws.send(json.dumps({"id": 2, "method": "Runtime.evaluate", "params": {"expression": insert, "returnByValue": True}}))
        raw2 = await ws.recv()
        print("GEMINI INSERT:", json.loads(raw2).get('result', {}).get('result', {}).get('value', {}))

        await asyncio.sleep(1.0)

        click = """
        (() => {
            const btn = document.querySelector('button[aria-label*="Send" i], button.send-button, button.mat-mdc-icon-button') ||
                        Array.from(document.querySelectorAll('button')).find(b => b.innerHTML.includes('svg') && !b.disabled && b.offsetWidth > 0);
            if (btn) {
                btn.click();
                return { clicked: true };
            }
            return { clicked: false };
        })()
        """
        await ws.send(json.dumps({"id": 3, "method": "Runtime.evaluate", "params": {"expression": click, "returnByValue": True}}))
        raw3 = await ws.recv()
        print("GEMINI CLICK:", json.loads(raw3).get('result', {}).get('result', {}).get('value', {}))

        await asyncio.sleep(1.0)
        await ws.send(json.dumps({"id": 4, "method": "Input.dispatchKeyEvent", "params": {"type": "rawKeyDown", "windowsVirtualKeyCode": 13, "text": "\r", "key": "Enter", "code": "Enter"}}))
        await ws.send(json.dumps({"id": 5, "method": "Input.dispatchKeyEvent", "params": {"type": "keyUp", "windowsVirtualKeyCode": 13, "key": "Enter", "code": "Enter"}}))
        await ws.recv()
        await ws.recv()

if __name__ == '__main__':
    asyncio.run(main())
