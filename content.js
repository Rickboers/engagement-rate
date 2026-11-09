// Draws the engagement badges. Numbers come from the page hook (responses the
// site loaded anyway), from data embedded in the page, or from the page text.
(() => {
  const E = globalThis.__erExtract;
  const host = location.hostname;
  const platform = host.endsWith('instagram.com') ? 'ig' : host === 'x.com' || host.endsWith('twitter.com') ? 'x' : host.endsWith('youtube.com') ? 'yt' : null;
  if (!platform || !E || !globalThis.__erDefaults || window.__erContent) return;
  window.__erContent = true;

  const DEFAULTS = globalThis.__erDefaults;
  let S = { ...DEFAULTS };
  const posts = new Map(); // post id or code -> numbers
  const users = new Map(); // handle -> { followers, at }
  const ytViews = new Map(); // video id -> views
  const USERS_KEY = 'followers:' + platform;
  const DAY = 864e5;
  let queued = false; // a scan is already scheduled

  // ---------- storage ----------
  const store = chrome.storage;
  store.sync.get(DEFAULTS, (v) => {
    S = { ...DEFAULTS, ...v };
    schedule();
  });
  store.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    for (const k in changes) S[k] = changes[k].newValue;
    clearBadges();
    schedule();
  });
  store.local.get(USERS_KEY, (v) => {
    const saved = v[USERS_KEY] || {};
    for (const [name, u] of Object.entries(saved)) {
      if (!users.has(name) && u && Date.now() - u.at < 14 * DAY) users.set(name, u);
    }
    schedule();
  });
  let saveTimer = 0;
  function saveUsers() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const list = [...users.entries()].sort((a, b) => b[1].at - a[1].at).slice(0, 4000);
      try {
        store.local.set({ [USERS_KEY]: Object.fromEntries(list) });
      } catch {}
    }, 1500);
  }

  // ---------- data in ----------
  function mergePost(id, p) {
    const prev = posts.get(id) || {};
    const next = { ...prev };
    for (const k in p) if (p[k] != null) next[k] = p[k];
    posts.set(id, next);
  }
  function setFollowers(name, followers) {
    if (!name || followers == null) return;
    users.set(name.toLowerCase(), { followers, at: Date.now() });
    saveUsers();
  }
  function take(data) {
    for (const [id, p] of Object.entries(data.posts || {})) mergePost(id, p);
    for (const [name, f] of Object.entries(data.users || {})) setFollowers(name, f);
    schedule();
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || e.data.__er !== 1 || e.data.platform !== platform) return;
    if (e.data.video) {
      ytViews.set(e.data.video.id, e.data.video.views);
      schedule();
      return;
    }
    take(e.data);
  });
  window.postMessage({ __erReady: 1 }, location.origin);

  // Instagram renders the first screen from JSON embedded in the page.
  function readEmbedded() {
    if (platform !== 'ig') return;
    for (const s of document.querySelectorAll('script[type="application/json"]')) {
      if (s.__erRead) continue;
      s.__erRead = true;
      const t = s.textContent;
      if (!t || (!t.includes('like_count') && !t.includes('follower_count') && !t.includes('edge_followed_by'))) continue;
      try {
        take(E.instagram(JSON.parse(t)));
      } catch {}
    }
  }

  // ---------- Instagram follower lookups ----------
  // Only for authors of posts actually on screen whose follower count isn't
  // known yet. One at a time, at least 8 seconds apart and at most 30 an hour
  // across all Instagram tabs, remembered for a week, and stopped for 30
  // minutes whenever Instagram refuses one.
  const GAP = 8000;
  const PER_HOUR = 30;
  const FRESH = 7 * DAY;
  const LOG_KEY = 'igLookupLog';
  const wanted = new Set();
  const failed = new Set();
  let lookupBusy = false;
  let retryTimer = 0;
  function needFollowers(name) {
    if (!S.igLookup || !name || failed.has(name)) return;
    const u = users.get(name);
    if (u && Date.now() - u.at < FRESH) return;
    wanted.delete(name);
    wanted.add(name);
    // Keep only the most recent few; anything scrolled past can wait.
    while (wanted.size > 6) wanted.delete(wanted.values().next().value);
    pump();
  }
  const readLog = () => new Promise((res) => store.local.get(LOG_KEY, (v) => res(v[LOG_KEY] || { times: [], pauseUntil: 0 })));
  function later(ms) {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(pump, Math.max(ms, 1000));
  }
  async function pump() {
    if (lookupBusy || !wanted.size || !S.igLookup) return;
    lookupBusy = true;
    try {
      const now = Date.now();
      const log = await readLog();
      log.times = log.times.filter((t) => now - t < 36e5);
      const last = log.times[log.times.length - 1] || 0;
      if (now < log.pauseUntil) return later(log.pauseUntil - now);
      if (now - last < GAP) return later(GAP - (now - last));
      if (log.times.length >= PER_HOUR) return later(log.times[0] + 36e5 - now);
      const name = [...wanted].pop();
      wanted.delete(name);
      const known = users.get(name);
      if (known && now - known.at < FRESH) return later(0);
      log.times.push(now);
      await new Promise((res) => store.local.set({ [LOG_KEY]: log }, res));
      try {
        const r = await fetch('/api/v1/users/web_profile_info/?username=' + encodeURIComponent(name), {
          headers: { 'x-ig-app-id': '936619743392459' },
          credentials: 'include',
        });
        if (r.status === 429 || r.status === 401 || r.status === 403) {
          log.pauseUntil = Date.now() + 30 * 6e4;
          store.local.set({ [LOG_KEY]: log });
          wanted.add(name);
        } else if (r.ok) {
          const j = await r.json();
          const f = E.num(j?.data?.user?.edge_followed_by?.count);
          if (f != null) setFollowers(name, f);
          else failed.add(name);
          schedule();
        } else failed.add(name);
      } catch {
        failed.add(name);
      }
      later(GAP);
    } finally {
      lookupBusy = false;
    }
  }

  // ---------- numbers ----------
  const fmt = (n) => {
    if (n == null) return '–';
    const a = Math.abs(n);
    if (a >= 1e9) return (n / 1e9).toFixed(a >= 1e10 ? 0 : 1).replace(/\.0$/, '') + 'B';
    if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
    if (a >= 1e4) return (n / 1e3).toFixed(a >= 1e5 ? 0 : 1).replace(/\.0$/, '') + 'K';
    return n.toLocaleString('en-US');
  };
  const pct = (r) => {
    const v = r * 100;
    return (v >= 10 ? v.toFixed(0) : v >= 0.1 ? v.toFixed(1) : v.toFixed(2)) + '%';
  };
  const sum = (...xs) => {
    const known = xs.filter((v) => v != null);
    return known.length ? known.reduce((a, b) => a + b, 0) : null;
  };
  const tier = (r) => (r == null ? 0 : r < 0.01 ? 1 : r < 0.03 ? 2 : r < 0.06 ? 3 : 4);

  function compute(p, followers) {
    const eng = platform === 'x'
      ? sum(p.likes, p.reposts, p.replies, p.quotes, p.bookmarks)
      : sum(p.likes, p.comments, p.shares, p.reposts, p.saves);
    if (eng == null) return null;
    const byViews = p.views ? eng / p.views : null;
    const byFollowers = followers ? eng / followers : null;
    // "views" (the default) only rates against views and shows nothing when the
    // site gives none; "auto" falls back to followers; "followers" is fixed.
    let basis = S.basis === 'followers' ? 'followers' : S.basis === 'auto' && byViews == null ? 'followers' : 'views';
    if (S.basis === 'followers' && byFollowers == null) basis = 'views';
    const rate = basis === 'views' ? byViews : byFollowers;
    const reach = p.views && followers ? p.views / followers : null;
    return { eng, byViews, byFollowers, rate, basis: rate == null ? null : basis, reach };
  }

  function tooltip(p, followers, c) {
    const lines = [];
    if (c.byViews != null) lines.push(`Engagement ${pct(c.byViews)} of views`);
    if (c.byFollowers != null) lines.push(`Engagement ${pct(c.byFollowers)} of followers`);
    const parts = platform === 'x'
      ? [['Likes', p.likes], ['Reposts', p.reposts], ['Replies', p.replies], ['Quotes', p.quotes], ['Bookmarks', p.bookmarks]]
      : [['Likes', p.likes], ['Comments', p.comments], ['Shares', p.shares], ['Reposts', p.reposts], ['Saves', p.saves]];
    lines.push(parts.filter(([, v]) => v != null).map(([k, v]) => `${k} ${v.toLocaleString('en-US')}`).join(' · '));
    const base = [];
    if (p.views != null) base.push(`Views ${p.views.toLocaleString('en-US')}`);
    base.push(followers != null ? `Followers ${followers.toLocaleString('en-US')}` : 'Followers unknown');
    lines.push(base.join(' · '));
    if (c.reach != null) lines.push(`Views are ${c.reach.toFixed(c.reach < 1 ? 2 : 1)}× the follower count`);
    if (p.hidden) lines.push('The creator hides the like count, so likes may be missing');
    if (p.approx) lines.push('Some counts are rounded by the site');
    return lines.join('\n');
  }

  // ---------- badges ----------
  // A badge is a short list of parts, drawn as DOM nodes rather than HTML
  // strings, which YouTube's Trusted Types policy refuses.
  const dot = (r) => ['span', 'er-dot er-t' + tier(r), ''];
  const strong = (t) => ['b', '', t];
  const label = (t) => ['i', '', t];
  const chip = (t) => ['span', 'er-reach', t];
  const sep = () => ['span', 'er-sep', ''];
  function render(el, parts) {
    const key = JSON.stringify(parts);
    if (el.__erKey === key) return;
    el.__erKey = key;
    el.replaceChildren(...parts.map(([tag, cls, text]) => {
      const n = document.createElement(tag);
      if (cls) n.className = cls;
      n.textContent = text;
      return n;
    }));
  }

  const madeBy = new WeakMap(); // anchor element -> badge
  function badgeParts(p, followers) {
    const c = compute(p, followers);
    if (!c || c.rate == null) return null;
    const parts = [dot(c.rate), strong(pct(c.rate)), label(c.basis === 'views' ? 'views' : 'followers')];
    if (S.reach && c.reach != null && c.reach >= 1.5) parts.push(chip(`${c.reach >= 10 ? c.reach.toFixed(0) : c.reach.toFixed(1)}× fol`));
    return { parts, title: tooltip(p, followers, c) };
  }
  function paint(el, b, id) {
    render(el, b.parts);
    if (el.title !== b.title) el.title = b.title;
    el.dataset.erId = id;
  }
  function attach(key, makeAndPlace, b, id) {
    let el = madeBy.get(key);
    if (!el || !el.isConnected) {
      el = document.createElement('span');
      el.className = 'er-badge';
      if (!makeAndPlace(el)) return;
      madeBy.set(key, el);
    }
    paint(el, b, id);
  }
  function clearBadges() {
    document.querySelectorAll('.er-badge, .er-float, .er-yt').forEach((n) => n.remove());
    if (platform === 'ig') tiles.clear();
  }
  const enabled = () => S[platform] !== false;

  // ---------- Instagram ----------
  const RESERVED = new Set(['p', 'reel', 'reels', 'tv', 'explore', 'direct', 'accounts', 'stories', 'about', 'legal', 'developer', 'web']);
  // Matches a post or reel link and nothing under it, so comment permalinks
  // like /p/CODE/c/123/ are left alone.
  function igLink(href) {
    const m = href && href.match(/^(?:https:\/\/www\.instagram\.com)?\/(?:([A-Za-z0-9._]+)\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]{5,})\/?(?:[?#]|$)/);
    if (!m) return null;
    const owner = m[1] && !RESERVED.has(m[1].toLowerCase()) ? m[1].toLowerCase() : null;
    return { owner, code: m[2] };
  }
  function profileOnPage() {
    const seg = location.pathname.split('/').filter(Boolean)[0];
    return seg && !RESERVED.has(seg.toLowerCase()) ? seg.toLowerCase() : null;
  }
  const inView = (el) => {
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < innerHeight;
  };
  const nearScreen = (el) => {
    const r = el.getBoundingClientRect();
    return r.bottom > -800 && r.top < innerHeight + 800;
  };

  // Grid badges live in a layer of their own laid over the page, so
  // Instagram's tiles are never changed: the tile links are inline elements,
  // and positioning them broke the grid's images.
  const tiles = new Map(); // tile link -> badge
  let layer = null;
  function tileLayer() {
    if (!layer || !layer.isConnected) {
      layer = document.createElement('div');
      layer.className = 'er-layer';
      document.documentElement.appendChild(layer);
    }
    return layer;
  }
  function tileBox(a) {
    for (const el of [a.firstElementChild, a.querySelector('img, video'), a]) {
      const r = el?.getBoundingClientRect();
      if (r && r.width > 80 && r.height > 80) return r;
    }
    return null;
  }
  function placeTile(a, b, code) {
    let el = tiles.get(a);
    if (!el || !el.isConnected) {
      el = document.createElement('span');
      el.className = 'er-badge er-tile';
      el.addEventListener('click', () => a.click());
      tileLayer().appendChild(el);
      tiles.set(a, el);
    }
    paint(el, b, code);
    el.__erSeen = true;
  }
  // True when something else (an open post, a menu) sits where the badge goes.
  function covered(a, r) {
    const x = r.left + 12;
    const y = r.top + 12;
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return false;
    const top = document.elementsFromPoint(x, y).find((el) => !el.closest('.er-layer'));
    return !!top && !a.contains(top);
  }
  function positionTiles() {
    for (const [a, el] of tiles) {
      const r = a.isConnected && nearScreen(a) ? tileBox(a) : null;
      if (!r || !el.__erSeen || covered(a, r)) {
        el.remove();
        tiles.delete(a);
        continue;
      }
      el.__erSeen = false;
      const x = Math.round(r.left + scrollX + 6);
      const y = Math.round(r.top + scrollY + 6);
      const t = `translate(${x}px, ${y}px)`;
      if (el.style.transform !== t) el.style.transform = t;
    }
  }

  function scanIG() {
    readEmbedded();
    const profile = profileOnPage();
    const current = igLink(location.pathname);
    let currentShown = false;
    for (const a of document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"], a[href*="/tv/"]')) {
      const link = igLink(a.getAttribute('href'));
      if (!link) continue;
      const p = posts.get(link.code);
      if (!p) continue;
      const owner = p.owner || link.owner || (current ? null : profile);
      if (owner && !p.owner) p.owner = owner;
      // Grid tiles are big boxes (the Reels tab draws them with background
      // images, not <img>); the feed's date link holds a <time>.
      const hasTime = !!a.querySelector('time');
      const isTile = !hasTime && !!tileBox(a);
      if (!isTile && !hasTime) continue;
      if (!nearScreen(a)) continue;
      const followers = owner ? users.get(owner)?.followers : null;
      if (followers == null && owner && inView(a)) needFollowers(owner);
      const b = badgeParts(p, followers);
      if (!b) continue;
      if (current && link.code === current.code) currentShown = true;
      if (isTile) {
        placeTile(a, b, link.code);
      } else {
        attach(a, (el) => {
          el.classList.add('er-inline');
          a.insertAdjacentElement('afterend', el);
          return true;
        }, b, link.code);
      }
    }
    positionTiles();
    // A single post or a reel in the full-screen viewer: a small pill in the corner.
    floating(current && !currentShown ? current : null);
  }

  function floating(link) {
    let el = document.querySelector('.er-float');
    const p = link && posts.get(link.code);
    const owner = p && (p.owner || link.owner);
    const followers = owner ? users.get(owner)?.followers : null;
    if (owner && followers == null) needFollowers(owner);
    const b = p && badgeParts(p, followers);
    if (!b) {
      if (el) el.remove();
      return;
    }
    if (!el) {
      el = document.createElement('div');
      el.className = 'er-badge er-float';
      document.body.appendChild(el);
    }
    paint(el, b, link.code);
  }

  // ---------- X ----------
  // Fallback when the response was missed: the action bar's label, e.g.
  // "12 replies, 4 reposts, 300 likes, 9 bookmarks, 25012 views" (English only).
  function fromLabel(group) {
    const label = group?.getAttribute('aria-label');
    if (!label) return null;
    const get = (word) => {
      const m = label.match(new RegExp('([\\d,.]+)\\s+' + word));
      return m ? E.num(m[1]) : null;
    };
    const p = { replies: get('repl'), reposts: get('repost'), likes: get('like'), bookmarks: get('bookmark'), views: get('view') };
    return p.likes != null || p.replies != null ? p : null;
  }

  function scanX() {
    for (const art of document.querySelectorAll('article[data-testid="tweet"]')) {
      if (!nearScreen(art)) continue;
      const a = art.querySelector('a[href*="/status/"] time')?.closest('a');
      const m = a?.getAttribute('href')?.match(/^\/([A-Za-z0-9_]+)\/status\/(\d+)/);
      if (!m) continue;
      const id = m[2];
      const groups = [...art.querySelectorAll('[role="group"]')].filter((g) => g.closest('article') === art);
      const bar = groups[groups.length - 1];
      if (!bar) continue;
      const p = posts.get(id) || fromLabel(bar);
      if (!p) continue;
      const owner = (p.owner || m[1]).toLowerCase();
      const followers = users.get(owner)?.followers;
      const b = badgeParts(p, followers);
      if (!b) continue;
      attach(bar, (el) => {
        el.classList.add('er-inline', 'er-x');
        bar.appendChild(el);
        return true;
      }, b, id);
    }
  }

  // ---------- YouTube (watch page only) ----------
  function textCount(sel) {
    const el = document.querySelector(sel);
    return el ? E.parseCount(el.textContent) : null;
  }
  function scanYT() {
    let el = document.querySelector('.er-yt');
    const id = location.pathname === '/watch' ? new URLSearchParams(location.search).get('v') : null;
    const title = id && document.querySelector('ytd-watch-metadata #title');
    if (!title) {
      if (el) el.remove();
      return;
    }
    const views = ytViews.get(id) ?? null;
    // The like button's label carries the exact count; its text is rounded.
    const likeBtn = document.querySelector('ytd-watch-metadata like-button-view-model button, ytd-watch-metadata #segmented-like-button button');
    let likes = E.parseCount(likeBtn?.getAttribute('aria-label'));
    if (!likes) likes = E.parseCount(likeBtn?.textContent);
    const comments = textCount('ytd-comments-header-renderer #count');
    const subs = textCount('ytd-watch-metadata #owner-sub-count');
    const parts = [];
    const tips = [];
    if (views && likes) {
      parts.push(dot(likes.value / views), strong(pct(likes.value / views)), label('likes/views'));
      tips.push(`Likes ${likes.exact ? '' : '≈'}${likes.value.toLocaleString('en-US')} of ${views.toLocaleString('en-US')} views`);
    }
    if (views && comments) {
      if (parts.length) parts.push(sep());
      parts.push(strong(pct(comments.value / views)), label('comments'));
      tips.push(`Comments ${comments.value.toLocaleString('en-US')}`);
    }
    if (S.reach && views && subs) {
      const r = views / subs.value;
      parts.push(chip(`${r >= 10 ? r.toFixed(0) : r.toFixed(1)}× subs`));
      tips.push(`Views are ${r.toFixed(2)}× the subscriber count (≈${fmt(subs.value)}, rounded by YouTube)`);
    }
    if (!parts.length) {
      if (el) el.remove();
      return;
    }
    if (!el || el.previousElementSibling !== title) {
      if (el) el.remove();
      el = document.createElement('div');
      el.className = 'er-badge er-yt';
      title.insertAdjacentElement('afterend', el);
    }
    render(el, parts);
    el.title = tips.join('\n');
  }

  // ---------- loop ----------
  function schedule() {
    if (queued) return;
    queued = true;
    setTimeout(() => {
      queued = false;
      if (!enabled()) return;
      try {
        if (platform === 'ig') scanIG();
        else if (platform === 'x') scanX();
        else scanYT();
      } catch (err) {
        console.debug('[engagement-rate]', err);
      }
    }, 250);
  }
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', schedule, { passive: true });
  schedule();
})();
