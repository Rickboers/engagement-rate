// The settings and their starting values. Loaded by both the content script and
// the popup, so the popup always shows what the badges are actually using.
//   ig, x, yt  show badges on Instagram, X and YouTube
//   basis      'views' (only rate against views), 'auto' (views, else
//              followers) or 'followers'
//   reach      show the "3.2× fol" chip when views are 1.5× followers or more
//   igLookup   allow Instagram follower lookups for feed posts (off by default)
globalThis.__erDefaults = Object.freeze({ ig: true, x: true, yt: true, igLookup: false, basis: 'views', reach: true });
