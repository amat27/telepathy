// CDP eval utility - evaluates JS in Electron renderer via Chrome DevTools Protocol
import http from 'node:http';
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
  const { default: WebSocket } = await import('ws');
  return new WebSocket(url);
}

async function main() {
  const expr = process.argv[2];
  if (!expr) {
    console.error('Usage: node cdp-eval.mjs "<expression>"');
    process.exit(1);
  }

  const pages = await getPages();
  const page = pages.find(p => p.type === 'page' && p.url.includes('localhost'));
  if (!page) {
    console.error('No renderer page found.');
    process.exit(1);
  }

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

  const result = await send('Runtime.evaluate', {
    expression: expr,
    returnByValue: true,
    awaitPromise: true,
  });

  if (result.exceptionDetails) {
    console.error('Error:', result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  } else {
    console.log(JSON.stringify(result.result?.value, null, 2));
  }

  ws.close();
}

main().catch(e => { console.error(e); process.exit(1); });
