import json
import urllib.request
import websockets
import asyncio
import sys

sys.stdout.reconfigure(encoding='utf-8')

GEMINI_TAB_ID = "9185D5AB1064B87D0950C0C99FB40BB9"

async def main():
    tabs = json.loads(urllib.request.urlopen('http://127.0.0.1:9222/json').read().decode())
    target = next((t for t in tabs if t.get('id') == GEMINI_TAB_ID), None)
    if not target: return

    ws_url = target['webSocketDebuggerUrl']
    async with websockets.connect(ws_url, max_size=50*1024*1024) as ws:
        js = """
        (() => {
            const msgs = Array.from(document.querySelectorAll('message-content, .model-response-text, div.markdown, p'));
            return msgs.map(m => m.innerText).filter(t => t && t.length > 5).slice(-5).join('\\n---\\n');
        })()
        """
        await ws.send(json.dumps({"id": 1, "method": "Runtime.evaluate", "params": {"expression": js, "returnByValue": True}}))
        raw = await ws.recv()
        text = json.loads(raw).get('result', {}).get('result', {}).get('value', '')
        print("GEMINI ALL LAST TEXTS:\n", text)

if __name__ == '__main__':
    asyncio.run(main())
