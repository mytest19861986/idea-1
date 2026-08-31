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
            const isThinking = !!document.querySelector('.loading, .streaming, [aria-label*="Thinking" i], .thinking');
            const msgs = Array.from(document.querySelectorAll('div.chat-message, div.markdown-body, div.prose, .message-content'));
            const lastText = msgs.length > 0 ? msgs[msgs.length - 1].innerText : (document.body ? document.body.innerText : '');
            return { isThinking, len: lastText.length, tail: lastText.slice(-1500) };
        })()
        """
        await ws.send(json.dumps({"id": 1, "method": "Runtime.evaluate", "params": {"expression": script, "returnByValue": True}}))
        raw = await ws.recv()
        d = json.loads(raw).get('result', {}).get('result', {}).get('value', {})
        print("GLM EXTRACT STATUS:", d.get('isThinking'))
        print("GLM EXTRACT LEN:", d.get('len'))
        print("GLM EXTRACT TAIL:\n", d.get('tail'))
        if d.get('tail'):
            with open('g:/project/IDEA/scratch/raw_verbatim_glm_post_remediation.txt', 'w', encoding='utf-8') as f:
                f.write(d.get('tail'))

if __name__ == '__main__':
    asyncio.run(main())
