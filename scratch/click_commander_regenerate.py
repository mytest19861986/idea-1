import json
import urllib.request
import websockets
import asyncio
import sys

sys.stdout.reconfigure(encoding='utf-8')

async def main():
    target_id = "BF3B275FE0A800433E75AB97F3B9F405"
    tabs = json.loads(urllib.request.urlopen('http://127.0.0.1:9222/json').read().decode())
    target = next((t for t in tabs if t.get('id') == target_id), None)
    if not target: return

    ws_url = target['webSocketDebuggerUrl']
    async with websockets.connect(ws_url, max_size=50*1024*1024) as ws:
        click = """
        (() => {
            const btn = document.querySelector('button[aria-label*="Regenerate" i], button.btn-secondary, button[data-testid="regenerate-button"]') ||
                        Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Regenerate') || b.innerText.includes('Retry') || b.innerText.includes('تلاش مجدد'));
            if (btn) {
                btn.click();
                return { clicked: true, text: btn.innerText };
            }
            return { clicked: false };
        })()
        """
        await ws.send(json.dumps({"id": 1, "method": "Runtime.evaluate", "params": {"expression": click, "returnByValue": True}}))
        raw = await ws.recv()
        print("REGENERATE CLICK:", json.loads(raw).get('result', {}).get('result', {}).get('value', {}))

if __name__ == '__main__':
    asyncio.run(main())
