import json
import urllib.request
import websockets
import asyncio
import sys

sys.stdout.reconfigure(encoding='utf-8')

async def main():
    tabs = json.loads(urllib.request.urlopen('http://127.0.0.1:9222/json').read().decode())
    target_tab = next((t for t in tabs if 'chat.z.ai' in t.get('url', '') and t.get('type') == 'page'), None)
    if not target_tab: return

    ws_url = target_tab['webSocketDebuggerUrl']
    async with websockets.connect(ws_url, max_size=50*1024*1024) as ws:
        script = """
        (() => {
            const msgs = Array.from(document.querySelectorAll('div.chat-message, div.markdown-body, div.prose, .message-content'));
            if (msgs.length > 0) {
                return msgs[msgs.length - 1].innerText;
            }
            return document.body ? document.body.innerText : '';
        })()
        """
        await ws.send(json.dumps({"id": 1, "method": "Runtime.evaluate", "params": {"expression": script, "returnByValue": True}}))
        raw = await ws.recv()
        text = json.loads(raw).get('result', {}).get('result', {}).get('value', '')
        with open('g:/project/IDEA/scratch/raw_verbatim_glm_postgres.txt', 'w', encoding='utf-8') as f:
            f.write(text)
        print("GLM POSTGRES VERBATIM EXTRACTED. Length:", len(text))
        print("Tail:\n", text[-1200:])

if __name__ == '__main__':
    asyncio.run(main())
