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
        js = """
        (() => {
            const articles = Array.from(document.querySelectorAll('article'));
            if (articles.length > 0) {
                return articles[articles.length - 1].innerText;
            }
            return '';
        })()
        """
        await ws.send(json.dumps({"id": 1, "method": "Runtime.evaluate", "params": {"expression": js, "returnByValue": True}}))
        raw = await ws.recv()
        text = json.loads(raw).get('result', {}).get('result', {}).get('value', '')
        with open('g:/project/IDEA/scratch/commander_adjudication_001_full.txt', 'w', encoding='utf-8') as f:
            f.write(text)
        print("SAVED FULL ADJUDICATION. Length:", len(text))

if __name__ == '__main__':
    asyncio.run(main())
