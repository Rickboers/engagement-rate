// Runs in the page itself, before the site's own code. It reads copies of the
// JSON responses Instagram and X load anyway and hands the numbers to the
// content script. It never sends a request of its own and changes nothing.
(() => {
  if (window.__erHooked) return;
  window.__erHooked = true;
  const E = globalThis.__erExtract;
  const host = location.hostname;
  const platform = host.endsWith('instagram.com') ? 'ig' : host === 'x.com' || host.endsWith('twitter.com') ? 'x' : host.endsWith('youtube.com') ? 'yt' : null;
  if (!platform || !E) return;

  // The content script starts later than this hook, so keep what arrives
  // before it says it is listening and hand it over then.
  let listening = false;
  let early = [];
  const post = (msg) => {
    if (!listening) {
      early.push(msg);
      if (early.length > 300) early.shift();
      return;
    }
    window.postMessage({ __er: 1, platform, ...msg }, location.origin);
  };
  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || e.data.__erReady !== 1) return;
    listening = true;
    const queued = early;
    early = [];
    for (const msg of queued) post(msg);
  });

  if (platform === 'yt') {
    // The player already has the exact view count for the open video.
    let last = '';
    const send = () => {
      try {
        if (location.pathname !== '/watch') return;
        const d = document.getElementById('movie_player')?.getPlayerResponse?.()?.videoDetails;
        if (!d?.videoId) return;
        const key = d.videoId + ':' + d.viewCount;
        if (key === last) return;
        last = key;
        post({ video: { id: d.videoId, views: E.num(d.viewCount) } });
      } catch {}
    };
    document.addEventListener('yt-navigate-finish', () => setTimeout(send, 400));
    document.addEventListener('yt-page-data-updated', send);
    setInterval(send, 2500);
    return;
  }

  const wanted = platform === 'ig'
    ? (u) => /\/(api\/graphql|graphql\/query|api\/v1\/)/.test(u)
    : (u) => /\/i\/api\/(graphql|2|1\.1)\//.test(u);

  const handleJson = (json) => {
    const out = platform === 'ig' ? E.instagram(json) : E.x(json);
    if (Object.keys(out.posts).length || Object.keys(out.users).length) post(out);
  };
  const handleText = (text) => {
    try {
      for (const json of E.parseBody(text)) handleJson(json);
    } catch {}
  };

  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    const p = origFetch.apply(this, arguments);
    try {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url || '';
      if (wanted(url)) {
        p.then((r) => {
          if (r.ok) r.clone().text().then(handleText, () => {});
        }, () => {});
      }
    } catch {}
    return p;
  };

  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    try {
      if (wanted(String(url))) {
        this.addEventListener('load', function () {
          try {
            if (this.responseType === 'json') handleJson(this.response);
            else if (this.responseType === '' || this.responseType === 'text') handleText(this.responseText);
          } catch {}
        });
      }
    } catch {}
    return origOpen.apply(this, arguments);
  };

  // X puts the signed-in page's first users in a global at load.
  if (platform === 'x') {
    const readInitial = () => {
      try {
        const s = window.__INITIAL_STATE__;
        if (s) handleJson(s.entities || s);
      } catch {}
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', readInitial, { once: true });
    else readInitial();
  }
})();
