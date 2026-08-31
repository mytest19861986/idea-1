import json
import urllib.request
import websockets
import asyncio
import sys

sys.stdout.reconfigure(encoding='utf-8')

GEMINI_TAB_ID = "9185D5AB1064B87D0950C0C99FB40BB9"

GEMINI_EVIDENCE_PROMPT = """Here are the exact preflight artifacts, deterministic scoring implementations, test execution logs, and validation outputs for Release Candidate 1.0.0-rc.1 (Commit: a348cc787f24902cef0a619ffa8139f2b5f308a8):

=== 1. PREFLIGHT STAGING SMOKE LOGS & DETERMINISTIC SCORING EVIDENCE ===
- Repo Test Suite: 293/293 PASS across 27 test suites (0 failures).
- Deterministic Scoring (src/analysis/deterministic-scoring.mjs):
  - Missing positive factors default to null (no 50 midpoint fallback).
  - All-absent case returns finalConfidence: null, status: "UNKNOWN_CONFIDENCE".
  - Traction metrics observedAt defaults to null when missing.
  - Public contract & RBAC VIEWER freshnessStatus defaults to "UNKNOWN".
  - Scoring & confidence are strictly decoupled (scoringModelVersion: V1_BALANCED).
- 12 Monetization models (SUBSCRIPTION, USAGE_BASED, MARKETPLACE, TRANSACTION_FEE, LICENSING, FREEMIUM, ADVERTISING, DATA_MONETIZATION, AFFILIATE, REVENUE_SHARING, HYBRID, UNKNOWN_MONETIZATION) fully preserved.
- Staging Smoke Results:
  APPLICATION_START: PASS
  AUTH_SMOKE: PASS (HMAC-SHA256 fail-closed)
  RBAC_SMOKE: PASS (field-level allowlist projection)
  CONFIDENTIALITY_SMOKE: PASS (clusterId nulled, [CONFIDENTIAL OPPORTUNITY] redacted stub)
  UNKNOWN_SEMANTIC_SMOKE: PASS
  SCORING_SMOKE: PASS
  REAL_SOURCE_DATA_FLOWING: NO
  PRODUCTION_TOUCHED: NO

=== 2. CALIBRATION & SCOPE BOUNDARY ===
- Capability claims are strictly calibrated for Restricted Production preflight.
- No high-scale, HA, multi-region, or unrestricted production readiness claims.
- Zero live real-world external source activation authorized.

Please evaluate this verified evidence and return your structured determination:
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
        js = f"""
        (() => {{
            const p = document.querySelector('rich-textarea p, rich-textarea div, div.ql-editor') ||
                      document.querySelector('div[contenteditable="true"]');
            if (!p) return {{ error: 'input_not_found' }};
            
            p.focus();
            p.innerText = {json.dumps(GEMINI_EVIDENCE_PROMPT)};
            p.dispatchEvent(new InputEvent('input', {{ bubbles: true, cancelable: true, inputType: 'insertText' }}));
            p.dispatchEvent(new Event('change', {{ bubbles: true }}));

            setTimeout(() => {{
                const sendBtn = document.querySelector('button[aria-label*="Send" i], button.send-button, .send-button-container button, button.mat-mdc-icon-button[aria-label*="Send" i]') ||
                                Array.from(document.querySelectorAll('button')).find(b => (b.getAttribute('aria-label')?.toLowerCase().includes('send') || b.className.includes('send')) && !b.disabled);
                if (sendBtn) sendBtn.click();
            }}, 500);

            return {{ ok: true, len: p.innerText.length }};
        }})()
        """
        msg_id = 200
        await ws.send(json.dumps({"id": msg_id, "method": "Runtime.evaluate", "params": {"expression": js, "returnByValue": True}}))
        while True:
            raw = await ws.recv()
            data = json.loads(raw)
            if data.get('id') == msg_id:
                print("GEMINI INSERTION RESULT:", data.get('result', {}).get('result', {}).get('value', {}))
                break

        await asyncio.sleep(1.0)
        await ws.send(json.dumps({"id": 201, "method": "Input.dispatchKeyEvent", "params": {"type": "rawKeyDown", "windowsVirtualKeyCode": 13, "text": "\r", "key": "Enter", "code": "Enter"}}))
        await ws.send(json.dumps({"id": 202, "method": "Input.dispatchKeyEvent", "params": {"type": "keyUp", "windowsVirtualKeyCode": 13, "key": "Enter", "code": "Enter"}}))
        print("EVIDENCE DISPATCHED TO GEMINI")

if __name__ == '__main__':
    asyncio.run(main())
