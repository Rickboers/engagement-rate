# AGENTS.md

Instructions for AI coding agents (Claude Code, Cursor, Codex, Copilot and others) working in this repository. Humans are welcome to read it too.

## What this is

A Manifest V3 Chrome extension that draws an engagement-rate badge on Instagram, X and YouTube posts. It reads the numbers the site has already loaded for the page and never estimates a missing one. Plain JavaScript, no build step, no dependencies: the repository root is the unpacked extension.

The person you're helping may not be a programmer. Explain what you're doing in plain words, avoid jargon, and tell them exactly what to click when something has to happen in their browser.

## Installing it for someone

You can't click inside Chrome for them, so do the parts you can and walk them through the rest.

1. Get the code onto their computer: `git clone https://github.com/Rickboers/engagement-rate.git` into a folder they'll keep (for example `~/Documents/engagement-rate`). Chrome runs the extension from that folder, so it must not be deleted or moved afterwards. Without git, have them use **Code → Download ZIP** on GitHub and unzip it.
2. Tell them the full path of the folder, then these steps:
   1. Open `chrome://extensions` in the address bar.
   2. Turn on **Developer mode** (top right).
   3. Click **Load unpacked** and choose the folder that contains `manifest.json`.
   4. Reload any open Instagram, X or YouTube tab.
3. Optional: pin the extension from the puzzle-piece menu so its settings are one click away.

Edge, Brave, Arc, Opera and Vivaldi work the same way (`edge://extensions`, `brave://extensions` and so on). Firefox and Safari are not supported.

After any code change, the person must press the reload arrow on the extension's card in `chrome://extensions` and then reload the site's tab. Remind them every time.

## Rules

These are what make the extension trustworthy. Keep them unless the person explicitly asks otherwise, and if they do, tell them what changes for their privacy.

1. **No data leaves the browser.** No analytics, telemetry, remote config, servers or third-party scripts. The only network request the extension makes itself is the opt-in Instagram follower lookup in `content.js` (`pump()`), and it must stay off by default and rate-limited.
2. **Measured numbers only.** Show a number only when the site gave it. A missing count stays `null` and is left out; never guess, interpolate or fill in. If a count is rounded by the site (such as "1.2M"), say so in the tooltip.
3. **Minimal permissions.** The manifest asks for `storage` only. Don't add permissions or host matches without a clear reason, and tell the person if you do: Chrome shows new permissions as a warning.
4. **Don't change the site.** Add badges next to the site's elements; never move, restyle or remove the site's own elements. Draw with DOM nodes (`render()`), never `innerHTML`, because YouTube's Trusted Types policy blocks HTML strings.
5. **No build step, no dependencies.** Plain JS that Chrome loads as is. Node is only used for tests.
6. **Never commit personal data:** account names, emails, file paths from your own machine, cookies, real API responses with private data. Test fixtures use made-up handles like `exampledev`.

## Files

| File | Runs in | Job |
| --- | --- | --- |
| `manifest.json` | | Declares the extension. Two content-script entries: one in the page's MAIN world at `document_start`, one in the isolated world at `document_idle`. |
| `extract.js` | both worlds | Pure functions that walk JSON for post and user objects: `instagram()`, `x()`, `parseBody()`, `parseCount()`. Exposed as `globalThis.__erExtract`. The only file with unit tests against real response shapes. |
| `hook.js` | MAIN world | Wraps `fetch` and `XMLHttpRequest` to read copies of the site's JSON responses, then `postMessage`s the extracted numbers to `content.js`. Queues messages until `content.js` says it's ready. For YouTube it reads the player's exact view count instead. |
| `defaults.js` | isolated world, popup | `globalThis.__erDefaults`, every setting and its default. The single source of truth for settings. |
| `content.js` | isolated world | Stores the numbers, computes rates (`compute()`), builds badges (`badgeParts()`, `render()`), places them per site (`scanIG()`, `scanX()`, `scanYT()`), and reschedules on DOM changes and scroll. |
| `popup.html`, `popup.js` | popup | Settings UI. Each control's `id` is a key in `defaults.js`; values are saved to `chrome.storage.sync`. |
| `badge.css` | page | Badge styles, all prefixed `er-`. Colour tiers are `.er-t1` to `.er-t4`. |
| `test/` | Node | `extract.test.mjs` tests the extractors; `manifest.test.mjs` checks the manifest, popup and defaults agree and that no personal data slipped in. |

Data flow: site fetches JSON → `hook.js` reads a copy → `extract.js` pulls numbers → `postMessage` → `content.js` stores them → a scan finds posts on screen → badge drawn.

## Common changes

- **Formula or which counts are included:** `compute()` in `content.js`, then update the tooltip in `tooltip()`, the README's "What the numbers mean" and the popup's footer text.
- **Colour thresholds:** `tier()` in `content.js` and `.er-t1` to `.er-t4` in `badge.css`. Update the README too.
- **A new setting:** add it to `defaults.js`, add a control with the same `id` to `popup.html`, read it as `S.<key>` in `content.js`, and document it in the README's settings table. `npm test` fails if the popup and defaults disagree.
- **Badge position or look:** the `scan*()` function for that site, and `badge.css`.
- **A site changed and badges vanished:** first check whether the data still arrives (see Debugging), then whether the selectors still match. Selectors live in `scanIG()` (`a[href*="/p/"]`, `time`), `scanX()` (`article[data-testid="tweet"]`, `[role="group"]`) and `scanYT()` (`ytd-watch-metadata`, `like-button-view-model`, `#owner-sub-count`, `ytd-comments-header-renderer #count`). If a response shape changed, add a fixture to `test/extract.test.mjs` first, then fix `extract.js`.
- **A new site:** add host matches to both manifest entries, a platform check in `hook.js` and `content.js`, an extractor in `extract.js` with tests, a `scan*()` function, and a toggle in `defaults.js` and the popup. Keep rule 1.

## Checking your work

1. `npm test` (Node 20 or newer, nothing to install). It must pass.
2. `npm run check` also syntax-checks every script.
3. By hand, for any site you touched: reload the extension, reload the tab, and confirm the badge appears, the tooltip numbers match what the site shows, and nothing on the site moved or broke. Check a light and a dark theme if you changed styles.
4. Keep the README accurate. If behaviour or a setting changed, the README and `CHANGELOG.md` change in the same commit.

## Debugging

- Errors from the scan loop go to the page console as `console.debug('[engagement-rate]', …)`. Turn on **Verbose** in DevTools to see them.
- In DevTools, pick the extension's context from the console's context menu (top left of the console) to inspect `content.js`; the default "top" context is where `hook.js` runs.
- To see whether numbers arrive, set a breakpoint in the `message` listener in `content.js`, or log `posts.size`.

## Releasing

Bump `version` in both `manifest.json` and `package.json` (semantic versioning), add a dated entry to `CHANGELOG.md`, run `npm test`, then commit. For the Chrome Web Store, zip the extension files (everything except `.git`, `.github`, `test`, `node_modules` and the Markdown files) and upload the zip.
