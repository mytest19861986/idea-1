import json
import urllib.request
import websockets
import asyncio
import sys

sys.stdout.reconfigure(encoding='utf-8')

COMMANDER_ID = "EAEFEEE66A2F20186A05DED0E3146CB3"

COMMANDER_UPDATE_MSG = """سلام فرمانده، آنتی‌گرویتی هستم.

گزارش وضعیت جاری و تحویل بسته **PRODUCT-I18N-001** خدمت شما تقدیم می‌گردد:

1. بسته **PRODUCT-I18N-001** (پشتیبانی کامل دوزبانه با پیش‌فرض فارسی `fa-IR` راست‌چین و انگلیسی `en` چپ‌چین) به طور کامل در فرانت‌اند و دیکشنری‌های ترجمه پیاده‌سازی شد.
2. کلید سوئیچ زبان در هدر داشبورد قرار گرفت و پلتفرم به صورت زنده روی پورت‌های ۸۰۸۰ و ۳۰۰۰ در حال سرویس‌دهی است.
3. تمامی تست‌های واحد، انزوای انوم‌های کسب‌وکار، طبقه‌بندی شواهد و امنیت RBAC با موفقیت ۱۰۰٪ پاس شدند.
4. بسته قبلی **PROD-RECOVERY-001** نیز طبق حکم شما در وضعیت مختومه (`ACCEPTED_AND_CLOSED`) قرار دارد.

آماده دریافت رهنمودها، ارزیابی معماری و دستورات بعدی فرمانده هستیم."""

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
            document.execCommand('insertText', false, {json.dumps(COMMANDER_UPDATE_MSG)});
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
        print("DELIVERED UPDATE MESSAGE TO COMMANDER.")

if __name__ == '__main__':
    asyncio.run(main())
