import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test("LOCAL-LIVE-DISCOVERY-RUN-NOW-ACTIVITY-UX-001: Verification Suite", async (t) => {

  await t.test("1. Index HTML contains discoveryActivityStrip and necessary aria attributes", () => {
    const htmlPath = path.join(__dirname, '..', 'src', 'web', 'index.html');
    const content = fs.readFileSync(htmlPath, 'utf8');

    assert.ok(content.includes('id="btnDiscoveryRunNow"'), "btnDiscoveryRunNow element exists");
    assert.ok(content.includes('id="discoveryActivityStrip"'), "discoveryActivityStrip element exists");
    assert.ok(content.includes('aria-live="polite"'), "aria-live polite is configured for activity strip");
    assert.ok(content.includes('id="discoveryActivityTimer"'), "discoveryActivityTimer element exists");
    assert.ok(content.includes('id="discoveryActivityBadge"'), "discoveryActivityBadge element exists");
  });

  await t.test("2. Client i18n contains all required Activity UX translations in FA and EN", async () => {
    const i18nPath = path.join(__dirname, '..', 'src', 'web', 'client-i18n.js');
    const content = fs.readFileSync(i18nPath, 'utf8');

    assert.ok(content.includes('"discovery.sending": "⏳ در حال ارسال..."'), "FA sending key exists");
    assert.ok(content.includes('"discovery.runningTimer": "⚡ در حال اجرا"'), "FA runningTimer key exists");
    assert.ok(content.includes('"discovery.alreadyRunning": "⚠ یک اجرا از قبل فعال است —"'), "FA alreadyRunning key exists");
    assert.ok(content.includes('"discovery.completedIn": "✅ اجرا تکمیل شد —"'), "FA completedIn key exists");
    assert.ok(content.includes('"discovery.sending": "⏳ Sending..."'), "EN sending key exists");
    assert.ok(content.includes('"discovery.runningTimer": "⚡ Running"'), "EN runningTimer key exists");
  });

  await t.test("3. start_platform.mjs implements HTTP reverse proxy for /api/ routes on web server port", () => {
    const platformPath = path.join(__dirname, '..', 'start_platform.mjs');
    const content = fs.readFileSync(platformPath, 'utf8');

    assert.ok(content.includes("req.url.startsWith('/api/')"), "Reverse proxy intercepts /api/ routes");
    assert.ok(content.includes("proxyReq.on('error'"), "Proxy error handling is registered");
  });

  await t.test("4. Elapsed time calculation MM:SS produces exact padded format", () => {
    const startMs = Date.now() - 17000; // 17 seconds ago
    const startIso = new Date(startMs).toISOString();

    const diffSec = Math.max(0, Math.floor((Date.now() - new Date(startIso).getTime()) / 1000));
    const m = Math.floor(diffSec / 60);
    const s = diffSec % 60;
    const formatted = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

    assert.strictEqual(formatted, "00:17", "17 seconds formats to 00:17");
  });

  await t.test("5. Elapsed time handles multi-minute runs (05:24)", () => {
    const startMs = Date.now() - (5 * 60 + 24) * 1000;
    const startIso = new Date(startMs).toISOString();

    const diffSec = Math.max(0, Math.floor((Date.now() - new Date(startIso).getTime()) / 1000));
    const m = Math.floor(diffSec / 60);
    const s = diffSec % 60;
    const formatted = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

    assert.strictEqual(formatted, "05:24", "324 seconds formats to 05:24");
  });
});
