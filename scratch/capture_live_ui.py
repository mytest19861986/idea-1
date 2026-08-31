import json
import urllib.request
import websockets
import asyncio
import base64
import sys

sys.stdout.reconfigure(encoding='utf-8')

async def main():
    tabs = json.loads(urllib.request.urlopen('http://127.0.0.1:9222/json').read().decode())
    target = next((t for t in tabs if '8080' in t.get('url', '') or 'index.html' in t.get('url', '')), None)
    
    if not target:
        # Create a new tab or use existing
        target = tabs[0]
        urllib.request.urlopen(f"http://127.0.0.1:9222/json/activate/{target['id']}")
        
    ws_url = target['webSocketDebuggerUrl']
    async with websockets.connect(ws_url, max_size=50*1024*1024) as ws:
        await ws.send(json.dumps({"id": 1, "method": "Page.navigate", "params": {"url": "http://localhost:8080"}}))
        await ws.recv()
        await asyncio.sleep(2.0)
        
        # Take FA screenshot
        await ws.send(json.dumps({"id": 2, "method": "Page.captureScreenshot", "params": {"format": "png"}}))
        res = await ws.recv()
        png_data = json.loads(res).get('result', {}).get('data')
        if png_data:
            with open("g:/project/IDEA/scratch/dashboard_fa.png", "wb") as f:
                f.write(base64.b64decode(png_data))
            print("CAPTURED dashboard_fa.png")
            
        # Switch to EN
        await ws.send(json.dumps({"id": 3, "method": "Runtime.evaluate", "params": {"expression": "window.switchLanguage('en')", "returnByValue": True}}))
        await ws.recv()
        await asyncio.sleep(1.0)
        
        # Take EN screenshot
        await ws.send(json.dumps({"id": 4, "method": "Page.captureScreenshot", "params": {"format": "png"}}))
        res_en = await ws.recv()
        png_en = json.loads(res_en).get('result', {}).get('data')
        if png_en:
            with open("g:/project/IDEA/scratch/dashboard_en.png", "wb") as f:
                f.write(base64.b64decode(png_en))
            print("CAPTURED dashboard_en.png")

if __name__ == '__main__':
    asyncio.run(main())
