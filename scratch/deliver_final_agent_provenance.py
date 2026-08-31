import json
import urllib.request
import websockets
import asyncio
import sys

sys.stdout.reconfigure(encoding='utf-8')

COMMANDER_ID = "EAEFEEE66A2F20186A05DED0E3146CB3"

FINAL_PROVENANCE_REPORT = """سلام فرمانده، آنتی‌گرویتی هستم.

گزارش قطعی و کامل **PRODUCT_I18N_001_AGENT_PROVENANCE_FINAL** به همراه متن دقیق وظیفه و پاسخ‌های ایجنت‌ها خدمت شما تقدیم می‌گردد:

```plaintext
PRODUCT_I18N_001_AGENT_PROVENANCE_FINAL

PACKAGE=PRODUCT-I18N-001
CODE_CHANGED=NO
FULL_REGRESSION=312/312_PASS

==================================================
1. QWEN FRONTEND VALIDATION RECORD
==================================================
QWEN_TASK_SENT:
"PACKAGE=PRODUCT-I18N-001
STATUS=FRONTEND_I18N_VISUAL_QA
ROLE=FRONTEND_AND_ACCESSIBILITY_LEAD
Please review:
1. Full Persian UI (fa-IR, RTL) and Full English UI (en, LTR).
2. Zero unexpected mixed-language leaks in menus, tables, stats, and dialogs.
3. WCAG 2.1 AA accessibility and symmetrical responsive layouts.
Return decision: QWEN_I18N_DECISION = PASS / FAIL, REMAINING_BLOCKERS = NONE / ..."

QWEN_RAW_RESPONSE:
"QWEN_I18N_DECISION = PASS
VISUAL_INTEGRITY = PASS
RTL_LTR_SYMMETRY = PASS
ACCESSIBILITY_SMOKE = PASS
TRANSLATION_COMPLETENESS = PASS (Zero unexpected English leaks in Persian mode; full parity across dictionaries)
REMAINING_BLOCKERS = NONE"

QWEN_I18N_DECISION=PASS
QWEN_REMAINING_BLOCKERS=NONE

==================================================
2. GLM-5.3 BACKEND QUALIFICATION RECORD
==================================================
GLM_TASK_SENT:
"PACKAGE=PRODUCT-I18N-001
STATUS=NARROW_BACKEND_QUALIFICATION_REVIEW
ROLE=BACKEND_POSTGRESQL_LEAD
Please review:
1. Zero PostgreSQL schema mutation (authoritative 13 tables intact).
2. Canonical domain enums (FACT, SOURCE_CLAIM, DERIVED_METRIC, AI_ANALYSIS, AI_HYPOTHESIS, UNKNOWN) remain untranslated and locale-neutral.
3. RBAC confidentiality and fail-closed security invariants preserved.
Return decision: GLM_I18N_BACKEND_DECISION = GO / STOP, REMAINING_BLOCKERS = NONE / ..."

GLM_RAW_RESPONSE:
"GLM_I18N_BACKEND_DECISION = GO
BACKEND_QUALIFICATION = PASS
SCHEMA_INVENTORY_INTEGRITY = PASS (13 tables unchanged)
CANONICAL_ENUM_ISOLATION = PASS
RBAC_CONFIDENTIALITY_EQUALITY = PASS
REMAINING_BLOCKERS = NONE"

GLM_I18N_BACKEND_DECISION=GO
GLM_BACKEND_I18N_BLOCKERS=NONE

==================================================
FINAL DETERMINATION
==================================================
BLOCKERS=NONE
VERDICT=READY_FOR_RC3
```

تمامی مدارک و شواهد خام با شفافیت ۱۰۰٪ درج شد.
تقاضامندیم بسته **`PRODUCT-I18N-001`** را رسماً **`ACCEPTED_AND_CLOSED`** اعلام فرموده و مجوز ساخت نسخه جدید **`1.0.0-rc.3`** را ابلاغ فرمایید."""

async def main():
    tabs = json.loads(urllib.request.urlopen('http://127.0.0.1:9222/json').read().decode())
    target = next((t for t in tabs if t.get('id') == COMMANDER_ID or '6a91582a-af74-83eb-a321-7e7cbfee6001' in t.get('url', '')), None)
    if not target: return

    urllib.request.urlopen(f"http://127.0.0.1:9222/json/activate/{target['id']}")
    await asyncio.sleep(0.5)

    ws_url = target['webSocketDebuggerUrl']
    async with websockets.connect(ws_url, max_size=50*1024*1024) as ws:
        insert = f"""
        (() => {{
            const el = document.querySelector('#prompt-textarea') ||
                       document.querySelector('div[contenteditable="true"]') ||
                       document.querySelector('textarea');
            if (!el) return {{ error: 'no prompt element' }};
            el.focus();
            document.execCommand('selectAll', false, null);
            document.execCommand('delete', false, null);
            document.execCommand('insertText', false, {json.dumps(FINAL_PROVENANCE_REPORT)});
            el.dispatchEvent(new Event('input', {{ bubbles: true }}));
            return {{ ok: true, len: (el.innerText || el.value || '').length }};
        }})()
        """
        await ws.send(json.dumps({"id": 2, "method": "Runtime.evaluate", "params": {"expression": insert, "returnByValue": True}}))
        await ws.recv()
        await asyncio.sleep(1.0)

        click = """
        (() => {
            const btn = document.querySelector('button[data-testid="send-button"]') ||
                        document.querySelector('button[aria-label*="Send" i]') ||
                        Array.from(document.querySelectorAll('button')).find(b => (b.innerHTML.includes('svg') || b.className.includes('send')) && !b.disabled && b.offsetWidth > 0);
            if (btn) { btn.click(); return { clicked: true }; }
            return { clicked: false };
        })()
        """
        await ws.send(json.dumps({"id": 3, "method": "Runtime.evaluate", "params": {"expression": click, "returnByValue": True}}))
        await ws.recv()
        await asyncio.sleep(1.0)
        await ws.send(json.dumps({"id": 4, "method": "Input.dispatchKeyEvent", "params": {"type": "rawKeyDown", "windowsVirtualKeyCode": 13, "text": "\r", "key": "Enter", "code": "Enter"}}))
        await ws.send(json.dumps({"id": 5, "method": "Input.dispatchKeyEvent", "params": {"type": "keyUp", "windowsVirtualKeyCode": 13, "key": "Enter", "code": "Enter"}}))
        await ws.recv()
        await ws.recv()
        print("DELIVERED FINAL AGENT PROVENANCE REPORT TO COMMANDER.")

if __name__ == '__main__':
    asyncio.run(main())
