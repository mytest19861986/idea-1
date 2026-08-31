import json
import urllib.request
import websockets
import asyncio
import sys

sys.stdout.reconfigure(encoding='utf-8')

GLM_TAB_ID = "64BBAC0938DBEBE8D621A8EFAAC23ECE"

async def main():
    tabs = json.loads(urllib.request.urlopen('http://127.0.0.1:9222/json').read().decode())
    target = next((t for t in tabs if t.get('id') == GLM_TAB_ID or 'chat.z.ai' in t.get('url', '')), None)
    if not target: return

    urllib.request.urlopen(f"http://127.0.0.1:9222/json/activate/{target['id']}")
    await asyncio.sleep(0.5)

    ws_url = target['webSocketDebuggerUrl']
    async with websockets.connect(ws_url, max_size=50*1024*1024) as ws:
        js = """
        (() => {
            const el = document.querySelector('textarea, div[contenteditable="true"], .chat-input, #prompt-textarea');
            if (el) el.focus();

            const btn = document.querySelector('button[aria-label*="Send" i], button.send-btn, .send-button, button.ant-btn-primary') ||
                        Array.from(document.querySelectorAll('button')).find(b => (b.innerHTML.includes('svg') || b.innerText.includes('Send')) && !b.disabled && b.offsetWidth > 0);
            if (btn) {
                btn.click();
                return { clicked: true, textLen: el ? (el.value || el.innerText || '').length : 0 };
            }
            return { clicked: false, textLen: el ? (el.value || el.innerText || '').length : 0 };
        })()
        """
        await ws.send(json.dumps({"id": 1, "method": "Runtime.evaluate", "params": {"expression": js, "returnByValue": True}}))
        res = await ws.recv()
        print("GLM BUTTON CLICK RES:", json.loads(res).get('result', {}).get('result', {}).get('value', {}))

        await asyncio.sleep(0.5)
        # Dispatch Enter
        await ws.send(json.dumps({"id": 2, "method": "Input.dispatchKeyEvent", "params": {"type": "rawKeyDown", "windowsVirtualKeyCode": 13, "text": "\r", "key": "Enter", "code": "Enter"}}))
        await ws.send(json.dumps({"id": 3, "method": "Input.dispatchKeyEvent", "params": {"type": "keyUp", "windowsVirtualKeyCode": 13, "key": "Enter", "code": "Enter"}}))
        await ws.recv()
        await ws.recv()
        print("FORCE DISPATCHED ENTER TO GLM SEND BUTTON.")

if __name__ == '__main__':
    asyncio.run(main())
