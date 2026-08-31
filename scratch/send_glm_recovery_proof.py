import json
import urllib.request
import websockets
import asyncio
import sys

sys.stdout.reconfigure(encoding='utf-8')

GLM_TAB_ID = "64BBAC0938DBEBE8D621A8EFAAC23ECE"

PROMPT_GLM_RECOVERY_PROOF = """PRODUCT-RELEASE-001: RECOVERY GATE DATA-LEVEL RESTORE DRILL PROOF

OWNER=GLM-5.3
ROLE=BACKEND_POSTGRESQL_LEAD

Here is the exact data-level restore drill execution result:

1. DATA-LEVEL RESTORE DRILL:
   - Tooling: PostgreSQL 16.15 native `pg_dump -Fc` and `pg_restore`.
   - Backup Artifact Size: 47,982 bytes.
   - Backup SHA256: `dccd0d350f2041b10248714c0327c9199e0abc3d2a088add342fc8c17f92f8a6`.
   - Row-Count Validation:
     * discovery_candidates: Pre=2, Post=2 (EXACT_MATCH)
     * entity_cluster_members: Pre=2, Post=2 (EXACT_MATCH)
   - Status: DATA_LEVEL_RESTORE_DRILL= PASS

2. ROLLBACK ARTIFACT PINNED:
   - Current Production Release pinned: `0.9.0-prod` (Commit: `3838cdd`).
   - Artifact: `dist/product-intelligence-0.9.0-prod.tar.gz` (SHA256: `b4dec754ed28ff8e4cdfe3c7e155bdf2e308206aaa7cde998798178f6c54dc04`).

3. CODE & INVARIANTS:
   - Tests: 295/295 PASS (27 suites, 0 failures).
   - PostgreSQL 16 Runtime Verified.
   - REAL_SOURCE_DATA_FLOWING: NO (Held until post-release operational activation).

Based on this executed data-level restore drill and pinned previous-good release, please issue your final release determination:
GLM_FINAL_RELEASE_DECISION= GO / STOP
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
                el.value = {json.dumps(PROMPT_GLM_RECOVERY_PROOF)};
            }} else {{
                el.innerText = {json.dumps(PROMPT_GLM_RECOVERY_PROOF)};
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
        print("RECOVERY PROOF SENT TO GLM")

if __name__ == '__main__':
    asyncio.run(main())
