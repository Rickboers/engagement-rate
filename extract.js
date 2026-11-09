// Pulls post and follower numbers out of the JSON that Instagram and X already
// load for the page. Shared by the page hook (MAIN world) and the content script.
// Every number is copied from the response as it is; a missing one stays null.
(() => {
  if (globalThis.__erExtract) return;

  const num = (v) => {
    if (v == null || v === '' || typeof v === 'boolean') return null;
    const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  };
  const first = (...vals) => {
    for (const v of vals) {
      const n = num(v);
      if (n != null) return n;
    }
    return null;
  };

  // Visits every object in a JSON tree once, without recursion.
  function walk(root, visit) {
    const stack = [root];
    const seen = new Set();
    let budget = 400000;
    while (stack.length && budget-- > 0) {
      const o = stack.pop();
      if (!o || typeof o !== 'object' || seen.has(o)) continue;
      seen.add(o);
      if (!Array.isArray(o)) visit(o);
      for (const k in o) {
        const v = o[k];
        if (v && typeof v === 'object') stack.push(v);
      }
    }
  }

  const CODE = /^[A-Za-z0-9_-]{5,40}$/;

  function instagram(json) {
    const posts = {};
    const users = {};
    walk(json, (o) => {
      if (typeof o.username === 'string') {
        const f = first(o.follower_count, o.edge_followed_by?.count);
        if (f != null) users[o.username.toLowerCase()] = f;
      }
      const code = typeof o.code === 'string' ? o.code : typeof o.shortcode === 'string' ? o.shortcode : null;
      if (!code || !CODE.test(code)) return;
      const likes = first(o.like_count, o.edge_liked_by?.count, o.edge_media_preview_like?.count);
      const comments = first(o.comment_count, o.edge_media_to_comment?.count, o.edge_media_preview_comment?.count);
      if (likes == null && comments == null) return;
      const owner = o.user?.username ?? o.owner?.username ?? null;
      posts[code] = {
        likes,
        comments,
        views: first(o.play_count, o.ig_play_count, o.view_count, o.video_play_count, o.video_view_count),
        shares: first(o.share_count, o.reshare_count),
        saves: first(o.save_count),
        hidden: o.like_and_view_counts_disabled === true || undefined,
        owner: owner ? owner.toLowerCase() : null,
      };
    });
    return { posts, users };
  }

  function x(json) {
    const posts = {};
    const users = {};
    walk(json, (o) => {
      // Users: the newer shape keeps the handle in core and followers in
      // relationship_counts; the older one keeps both in legacy.
      const sn = o.core?.screen_name ?? o.legacy?.screen_name ?? (typeof o.screen_name === 'string' ? o.screen_name : null);
      if (typeof sn === 'string' && (o.__typename === 'User' || o.rest_id || o.id_str || o.followers_count != null)) {
        const f = first(o.relationship_counts?.followers, o.legacy?.followers_count, o.followers_count);
        if (f != null) users[sn.toLowerCase()] = f;
      }
      const L = o.legacy;
      if (!o.rest_id || !L || typeof L.favorite_count !== 'number') return;
      const author = o.core?.user_results?.result;
      const handle = author?.core?.screen_name ?? author?.legacy?.screen_name ?? null;
      posts[o.rest_id] = {
        likes: num(L.favorite_count),
        reposts: num(L.retweet_count),
        replies: num(L.reply_count),
        quotes: num(L.quote_count),
        bookmarks: num(L.bookmark_count),
        views: num(o.views?.count),
        owner: handle ? handle.toLowerCase() : null,
      };
    });
    return { posts, users };
  }

  // Parses one response body. Instagram sometimes sends several JSON objects
  // on separate lines, and some endpoints prefix "for (;;);".
  function parseBody(text) {
    if (!text || text.length < 2) return [];
    const t = text.replace(/^for \(;;\);/, '').trim();
    if (t[0] !== '{' && t[0] !== '[') return [];
    try {
      return [JSON.parse(t)];
    } catch {
      const out = [];
      for (const line of t.split('\n')) {
        try {
          out.push(JSON.parse(line));
        } catch {}
      }
      return out;
    }
  }

  // "12,345", "1.2K", "3,4 mln" style counts. Returns { value, exact }.
  function parseCount(text) {
    if (!text) return null;
    const m = String(text).replace(/ | /g, ' ').match(/(\d[\d.,' ]*)\s*([KkMmBb]|mln|mio|tys|mil)?/);
    if (!m) return null;
    const raw = m[1].trim();
    const unit = (m[2] || '').toLowerCase();
    if (!unit) {
      const digits = raw.replace(/\D/g, '');
      return digits ? { value: Number(digits), exact: true } : null;
    }
    const mult = unit === 'k' || unit === 'tys' || unit === 'mil' ? 1e3 : unit === 'b' ? 1e9 : 1e6;
    const n = Number(raw.replace(/[ ']/g, '').replace(',', '.'));
    return Number.isFinite(n) ? { value: Math.round(n * mult), exact: false } : null;
  }

  globalThis.__erExtract = { instagram, x, parseBody, parseCount, walk, num };
})();
