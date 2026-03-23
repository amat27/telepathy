// CDP screenshot utility - connects to Electron renderer via Chrome DevTools Protocol
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';

const CDP_PORT = 9222;

async function getPages() {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${CDP_PORT}/json`, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

async function connectWs(url) {
  const { default: WebSocket } = await import('ws').catch(() => {
    // Fallback: use raw WebSocket if ws not available
    throw new Error('ws package not found. Install with: npm i -D ws');
  });
  return new WebSocket(url);
}

async function main() {
  const pages = await getPages();
  const page = pages.find(p => p.type === 'page' && p.url.includes('localhost'));
  if (!page) {
    console.error('No renderer page found. Pages:', pages.map(p => `${p.type}: ${p.url}`));
    process.exit(1);
  }
  console.log(`Connecting to: ${page.title} (${page.url})`);

  const ws = await connectWs(page.webSocketDebuggerUrl);
  let msgId = 1;

  function send(method, params = {}) {
    const id = msgId++;
    return new Promise((resolve, reject) => {
      const handler = (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.id === id) {
          ws.off('message', handler);
          if (msg.error) reject(new Error(msg.error.message));
          else resolve(msg.result);
        }
      };
      ws.on('message', handler);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await new Promise(r => ws.on('open', r));

  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  const outPath = process.argv[2] || 'screenshot.png';
  fs.writeFileSync(outPath, Buffer.from(data, 'base64'));
  console.log(`Screenshot saved to ${outPath}`);
  ws.close();
}

main().catch(e => { console.error(e); process.exit(1); });
