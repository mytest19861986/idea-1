import json
import urllib.request
import websockets
import asyncio
import sys

sys.stdout.reconfigure(encoding='utf-8')

COMMANDER_ID = "EAEFEEE66A2F20186A05DED0E3146CB3"

async def main():
    tabs = json.loads(urllib.request.urlopen('http://127.0.0.1:9222/json').read().decode())
    target = next((t for t in tabs if t.get('id') == COMMANDER_ID), None)
    if not target:
        print("NOT FOUND")
        return

    ws_url = target['webSocketDebuggerUrl']
    async with websockets.connect(ws_url, max_size=50*1024*1024) as ws:
        js = """
        (() => {
            const isGen = !!document.querySelector('[data-testid="stop-button"]');
            const tail = document.body ? document.body.innerText.slice(-2000) : '';
            return { isGenerating: isGen, tail };
        })()
        """
        await ws.send(json.dumps({"id": 1, "method": "Runtime.evaluate", "params": {"expression": js, "returnByValue": True}}))
        raw = await ws.recv()
        d = json.loads(raw).get('result', {}).get('result', {}).get('value', {})
        print("isGenerating:", d.get('isGenerating'))
        print("BODY TAIL:\n", d.get('tail', ''))

if __name__ == '__main__':
    asyncio.run(main())
