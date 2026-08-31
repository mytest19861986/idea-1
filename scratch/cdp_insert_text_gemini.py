import json
import urllib.request
import websockets
import asyncio
import sys

sys.stdout.reconfigure(encoding='utf-8')

GEMINI_TAB_ID = "9185D5AB1064B87D0950C0C99FB40BB9"

PROMPT_GEMINI_COMPLETE = """TASK_ID=PRODUCT-RELEASE-001
ROLE=INDEPENDENT_DOMAIN_AUDITOR
AUDITOR=GEMINI_CLOUD

Please conduct the independent release calibration and domain integrity audit for Release Candidate 1.0.0-rc.1 (Commit: a348cc787f24902cef0a619ffa8139f2b5f308a8):

1. Domain & Semantic Invariants Verification:
   - Preservation of UNKNOWN semantics (no fabricated midpoints or fake timestamps)
   - Confidence separation from scoring (scoringModelVersion: V1_BALANCED)
   - Verification of 12 Monetization models and market gap structures
   - Verification of zero real-world data source leaks in staging preflight

2. Calibration Statement:
   - Confirm zero overstated capability claims (restricted production preflight only, no high-scale/unrestricted claims)

Please return your structured determination:
GEMINI_RELEASE_DECISION= GO / STOP
CLAIM_CALIBRATION= PASS / FAIL
DOMAIN_SEMANTICS= PASS / FAIL
OVERSTATED_CLAIMS= NONE / ...
REMAINING_BLOCKERS= NONE / ..."""

async def main():
    tabs = json.loads(urllib.request.urlopen('http://127.0.0.1:9222/json').read().decode())
    target = next((t for t in tabs if t.get('id') == GEMINI_TAB_ID), None)
    if not target: return

    urllib.request.urlopen(f"http://127.0.0.1:9222/json/activate/{GEMINI_TAB_ID}")
    await asyncio.sleep(0.5)

    ws_url = target['webSocketDebuggerUrl']
    async with websockets.connect(ws_url, max_size=50*1024*1024) as ws:
        await ws.send(json.dumps({"id": 1, "method": "Runtime.enable"}))
        
        # 1. Click input box
        js_focus = """
        (() => {
            const el = document.querySelector('rich-textarea p, rich-textarea div, div.ql-editor, div[contenteditable="true"]');
            if (el) {
                el.focus();
                el.click();
                return { ok: true, tag: el.tagName };
            }
            return { ok: false };
        })()
        """
        await ws.send(json.dumps({"id": 2, "method": "Runtime.evaluate", "params": {"expression": js_focus, "returnByValue": True}}))
        print("FOCUS:", (await ws.recv()))

        # 2. Insert text using Input.insertText API
        await ws.send(json.dumps({"id": 3, "method": "Input.insertText", "params": {"text": PROMPT_GEMINI_COMPLETE}}))
        print("INSERT TEXT RES:", (await ws.recv()))

        await asyncio.sleep(1.0)

        # 3. Press Enter with shiftKey=false or click send button
        click_send = """
        (() => {
            const btn = document.querySelector('button[aria-label*="Send" i], button.send-button, .send-button-container button');
            if (btn && !btn.disabled) {
                btn.click();
                return { clicked: true };
            }
            return { clicked: false };
        })()
        """
        await ws.send(json.dumps({"id": 4, "method": "Runtime.evaluate", "params": {"expression": click_send, "returnByValue": True}}))
        print("CLICK RES:", (await ws.recv()))

        # Also dispatch Enter
        await ws.send(json.dumps({"id": 5, "method": "Input.dispatchKeyEvent", "params": {"type": "rawKeyDown", "windowsVirtualKeyCode": 13, "text": "\r", "key": "Enter", "code": "Enter"}}))
        await ws.send(json.dumps({"id": 6, "method": "Input.dispatchKeyEvent", "params": {"type": "keyUp", "windowsVirtualKeyCode": 13, "key": "Enter", "code": "Enter"}}))
        await ws.recv()
        await ws.recv()

if __name__ == '__main__':
    asyncio.run(main())
