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
        await ws.send(json.dumps({"id": 1, "method": "Runtime.enable"}))
        
        # Paste text using Clipboard API or direct execCommand with full multi-line support
        js = f"""
        (() => {{
            const el = document.querySelector('div.ql-editor') ||
                       document.querySelector('rich-textarea p') ||
                       document.querySelector('div[contenteditable="true"]');
            if (el) {{
                el.focus();
                document.execCommand('selectAll', false, null);
                document.execCommand('delete', false, null);
                
                // Using DataTransfer paste simulation for robust multi-line insertion
                const dt = new DataTransfer();
                dt.setData('text/plain', {json.dumps(PROMPT_GEMINI_COMPLETE)});
                const pasteEvent = new ClipboardEvent('paste', {{
                    clipboardData: dt,
                    bubbles: true,
                    cancelable: true
                }});
                el.dispatchEvent(pasteEvent);
                
                if (!el.innerText.trim()) {{
                    document.execCommand('insertText', false, {json.dumps(PROMPT_GEMINI_COMPLETE)});
                }}
                
                el.dispatchEvent(new Event('input', {{ bubbles: true }}));
                return {{ ok: true, len: el.innerText.length }};
            }}
            return {{ ok: false }};
        }})()
        """
        await ws.send(json.dumps({"id": 2, "method": "Runtime.evaluate", "params": {"expression": js, "returnByValue": True}}))
        raw2 = await ws.recv()
        print("GEMINI PASTE:", json.loads(raw2).get('result', {}).get('result', {}).get('value', {}))

        await asyncio.sleep(1.0)

        # Click send button
        click = """
        (() => {
            const btn = document.querySelector('button[aria-label*="Send" i], button.send-button, .send-button-container button, button.mat-mdc-icon-button') ||
                        Array.from(document.querySelectorAll('button')).find(b => (b.innerHTML.includes('svg') || b.getAttribute('aria-label')?.includes('Send')) && !b.disabled && b.offsetWidth > 0);
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

if __name__ == '__main__':
    asyncio.run(main())
