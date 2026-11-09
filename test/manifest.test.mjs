// npm test — checks that the extension Chrome loads is complete and consistent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = (f) => readFileSync(new URL(f, root), 'utf8');
const manifest = JSON.parse(read('manifest.json'));

test('manifest is Manifest V3 with a valid version', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.ok(manifest.description.length <= 132, 'Chrome limits the description to 132 characters');
});

test('every file the manifest names exists', () => {
  const files = [
    ...Object.values(manifest.icons),
    ...Object.values(manifest.action.default_icon),
    manifest.action.default_popup,
    ...manifest.content_scripts.flatMap((c) => [...(c.js || []), ...(c.css || [])]),
  ];
  for (const f of files) assert.ok(existsSync(new URL(f, root)), `missing ${f}`);
});

test('the popup loads every script it uses', () => {
  const html = read('popup.html');
  for (const src of ['defaults.js', 'popup.js']) assert.ok(html.includes(`src="${src}"`), `popup.html does not load ${src}`);
  assert.ok(html.indexOf('defaults.js') < html.indexOf('popup.js'), 'defaults.js must load before popup.js');
});

test('every default setting has a control in the popup, and back', () => {
  const ctx = vm.createContext({});
  vm.runInContext(read('defaults.js'), ctx);
  const keys = Object.keys(ctx.__erDefaults).sort();
  const html = read('popup.html');
  const ids = [...html.matchAll(/<(?:input|select)[^>]*\bid="([^"]+)"/g)].map((m) => m[1]).sort();
  assert.deepEqual(ids, keys);
  const basis = [...html.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(basis.includes(ctx.__erDefaults.basis), 'the default basis must be one of the options');
});

test('no stray personal paths or secrets in the shipped files', () => {
  const shipped = readdirSync(root).filter((f) => /\.(js|css|html|json)$/.test(f));
  for (const f of shipped) {
    const text = read(f);
    assert.doesNotMatch(text, /\/Users\/[a-z]|\/home\/[a-z]|C:\\Users\\/, `${f} holds a personal file path`);
    assert.doesNotMatch(text, /[\w.+-]+@[\w-]+\.[a-z]{2,}/i, `${f} holds an email address`);
    assert.doesNotMatch(text, /(api[_-]?key|secret|token|password)\s*[:=]\s*['"][^'"]{8,}/i, `${f} looks like it holds a key`);
  }
});
