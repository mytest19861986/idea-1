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
    urllib.request.urlopen(f"http://127.0.0.1:9222/json/activate/{GEMINI_TAB_ID}")
    await asyncio.sleep(0.5)

    tabs = json.loads(urllib.request.urlopen('http://127.0.0.1:9222/json').read().decode())
    target = next((t for t in tabs if t.get('id') == GEMINI_TAB_ID), None)
    if not target: return

    ws_url = target['webSocketDebuggerUrl']
    async with websockets.connect(ws_url, max_size=50*1024*1024) as ws:
        # Evaluate injection directly inside main frame
        js = f"""
        (() => {{
            const p = document.querySelector('rich-textarea p, rich-textarea div, div.ql-editor') ||
                      document.querySelector('div[contenteditable="true"]');
            if (!p) return {{ error: 'input_not_found' }};
            
            p.focus();
            p.innerHTML = '';
            
            // Insert text paragraph
            const lines = {json.dumps(PROMPT_GEMINI_COMPLETE)}.split('\\n');
            p.innerText = {json.dumps(PROMPT_GEMINI_COMPLETE)};
            
            p.dispatchEvent(new InputEvent('input', {{ bubbles: true, cancelable: true, inputType: 'insertText' }}));
            p.dispatchEvent(new Event('change', {{ bubbles: true }}));

            setTimeout(() => {{
                const sendBtn = document.querySelector('button[aria-label*="Send" i], button.send-button, .send-button-container button, button.mat-mdc-icon-button[aria-label*="Send" i]') ||
                                Array.from(document.querySelectorAll('button')).find(b => (b.getAttribute('aria-label')?.toLowerCase().includes('send') || b.className.includes('send')) && !b.disabled);
                if (sendBtn) {{
                    sendBtn.click();
                }}
            }}, 500);

            return {{ ok: true, len: p.innerText.length }};
        }})()
        """
        msg_id = 100
        await ws.send(json.dumps({"id": msg_id, "method": "Runtime.evaluate", "params": {"expression": js, "returnByValue": True}}))
        while True:
            raw = await ws.recv()
            data = json.loads(raw)
            if data.get('id') == msg_id:
                print("GEMINI INSERTION RESULT:", data.get('result', {}).get('result', {}).get('value', {}))
                break

        await asyncio.sleep(1.0)
        
        # Also trigger Enter key
        await ws.send(json.dumps({"id": 101, "method": "Input.dispatchKeyEvent", "params": {"type": "rawKeyDown", "windowsVirtualKeyCode": 13, "text": "\r", "key": "Enter", "code": "Enter"}}))
        await ws.send(json.dumps({"id": 102, "method": "Input.dispatchKeyEvent", "params": {"type": "keyUp", "windowsVirtualKeyCode": 13, "key": "Enter", "code": "Enter"}}))
        print("ENTER DISPATCHED TO GEMINI")

if __name__ == '__main__':
    asyncio.run(main())
