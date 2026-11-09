# Engagement Rate

A small Chrome extension that shows the **engagement rate** of posts on **Instagram, X and YouTube**, right where you scroll. No clicking into posts, no copying numbers into a spreadsheet, no account to sign up for.

```
● 4.8% views  3.2× fol
```

That badge says: likes, comments, shares and saves add up to 4.8% of the views, and the post got 3.2 times more views than the creator has followers.

- **Free and open source** (MIT license).
- **Private.** It only reads numbers the site already loaded for the page you're on. Nothing is sent anywhere. See [PRIVACY.md](PRIVACY.md).
- **No setup.** No API keys, no logins, no build step. Works in Chrome, Edge, Brave, Arc and other Chromium browsers.

---

## Install it (about 2 minutes, no coding)

1. **Download** this project: click the green **Code** button at the top of this page, then **Download ZIP**.
2. **Unzip** it. You get a folder called something like `engagement-rate-main`. Put it somewhere you won't delete it, like your Documents folder. Chrome runs the extension from this folder.
3. Open Chrome and go to **`chrome://extensions`** (type it in the address bar).
4. Turn on **Developer mode** (the switch in the top right corner).
5. Click **Load unpacked** and choose the folder from step 2 (the one that has `manifest.json` inside).
6. Reload any Instagram, X or YouTube tab you already had open.

Tip: click the puzzle piece in Chrome's toolbar and pin **Engagement Rate** so its settings are one click away.

### Or let your AI install it

If you use an AI coding tool (Claude Code, Cursor, Codex, Windsurf, Copilot and the like), you can skip the steps above. Paste this:

> Clone https://github.com/Rickboers/engagement-rate, read its AGENTS.md, and help me install the extension in my browser.

The [AGENTS.md](AGENTS.md) file tells the AI how the project works, how to install it for you and how to change it safely. You can then ask for changes in plain words, for example:

> Make the badge on X a bit bigger.
>
> Change the colours so anything over 10% is gold.
>
> Only show the badge on posts with more than 10,000 views.

---

## What it shows

| Site | Where the badge appears | Rated against |
| --- | --- | --- |
| **X** | in the action bar of every post (timeline, profiles, search, threads) | views (followers in the tooltip) |
| **Instagram Reels tab** | top left of each thumbnail | plays |
| **Instagram feed, post page, reel viewer** | beside the post date, or a small pill bottom left | plays, where Instagram gives them |
| **YouTube** (watch page) | one line under the video title | likes ÷ views, comments ÷ views, views ÷ subscribers |

**Hover any badge** to see every number behind it.

### What the numbers mean

- **Engagement** is likes + comments + shares + saves on Instagram (whichever the site gives), and likes + reposts + replies + quotes + bookmarks on X.
- **Engagement rate** is engagement divided by views. You can switch to followers in the settings.
- **Reach chip** (`3.2× fol`) shows up when a post got at least 1.5 times more views than the creator has followers: a sign it travelled beyond its usual audience.
- **Dot colour:** grey under 1%, blue 1–3%, green 3–6%, bright green 6% and up.
- **Nothing is estimated.** A number the site doesn't give stays out. Instagram photos and the main profile grid carry no view count, so by default they show no badge.

## Settings

Click the extension's icon in the toolbar.

| Setting | What it does | Default |
| --- | --- | --- |
| Instagram / X / YouTube | turn the badges on or off per site | on |
| Rate against | **Views** (only where the site gives views), **Views, else followers**, or **Followers** | Views |
| Reach chip | show the `3.2× fol` chip | on |
| Look up Instagram followers | see below | off |

### Instagram follower lookups (optional, off by default)

Instagram's home feed doesn't include follower counts. If you turn this on, the extension asks Instagram for a post author's profile, the same request Instagram makes when you hover over a name. To stay gentle it only does this for posts on your screen, at most once every 8 seconds and 30 times an hour across all tabs, keeps each count for a week, and pauses for 30 minutes if Instagram says no.

With it off, the extension makes **no requests of its own** at all. Follower counts still show up for profiles you've visited in the last two weeks.

## Troubleshooting

- **No badges at all.** Reload the tab. Check the extension is switched on in `chrome://extensions` and the site is on in its settings.
- **No badge on an Instagram photo.** Photos have no view count. Pick **Views, else followers** or **Followers** in the settings.
- **No badge on some X posts.** The extension reads X's own data as it loads. Scroll a little or reload; posts that came in before the extension started can be missed.
- **It stopped working after a site update.** Sites change their pages now and then. Please [open an issue](../../issues) and say which site and page, or ask your AI to fix it using AGENTS.md.
- **Chrome warns about developer mode extensions.** That's normal for anything installed with Load unpacked. You can dismiss it.

## Updating

Download the ZIP again and replace the old folder's contents (or `git pull` if you cloned it), then press the reload arrow on the extension's card in `chrome://extensions`. Your settings stay.

## How it works

No build step and no dependencies: the files in this folder are exactly what Chrome runs.

| File | Job |
| --- | --- |
| `manifest.json` | tells Chrome what the extension is and where it runs |
| `hook.js` | runs inside the page before the site's own code and reads copies of the data the site fetches. It sends nothing. |
| `extract.js` | finds post and follower numbers inside that data |
| `content.js` | keeps the numbers and draws the badges as you scroll |
| `defaults.js` | the settings and their starting values |
| `popup.html`, `popup.js` | the settings window |
| `badge.css` | how the badges look |
| `test/` | automated checks, run with `npm test` (needs [Node.js](https://nodejs.org) 20 or newer) |

The only permission it asks for is `storage`, to remember your settings and cached follower counts.

## Contributing

Bug reports and improvements are welcome. Open an issue first for anything big. Before a pull request, run `npm test` and check the change by hand on the site it touches. [AGENTS.md](AGENTS.md) has the project's rules, which apply to people too.

## License

[MIT](LICENSE). Use it, change it, share it.

Not affiliated with or endorsed by Instagram, Meta, X or YouTube. All trademarks belong to their owners.
