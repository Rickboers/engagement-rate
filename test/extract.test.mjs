// npm test (or: node --test) — checks the extractors against response shapes the sites use.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = vm.createContext({});
vm.runInContext(readFileSync(new URL('../extract.js', import.meta.url), 'utf8'), ctx);
const E = ctx.__erExtract;
const plain = (o) => JSON.parse(JSON.stringify(o));

test('X HomeTimeline (2026 shape: relationship_counts, core.screen_name)', () => {
  const user = { __typename: 'User', rest_id: '1000000001', core: { screen_name: 'ExampleDev' }, relationship_counts: { followers: 112770, following: 402 } };
  const quoted = { __typename: 'Tweet', rest_id: '2000000000000000002', core: { user_results: { result: user } }, legacy: { bookmark_count: 16, favorite_count: 260, quote_count: 4, reply_count: 30, retweet_count: 5 }, views: { count: '18886', state: 'EnabledWithCount' } };
  const json = { data: { home: { home_timeline_urt: { instructions: [{ entries: [{ content: { itemContent: { tweet_results: { result: { __typename: 'Tweet', rest_id: '2000000000000000001', core: { user_results: { result: user } }, legacy: { bookmark_count: 0, favorite_count: 2, quote_count: 0, reply_count: 1, retweet_count: 0 }, quoted_status_result: { result: quoted }, views: { count: '213' } } } } } }] }] } } } };
  const out = plain(E.x(json));
  assert.deepEqual(out.users, { exampledev: 112770 });
  assert.deepEqual(out.posts['2000000000000000002'], { likes: 260, reposts: 5, replies: 30, quotes: 4, bookmarks: 16, views: 18886, owner: 'exampledev' });
  assert.equal(out.posts['2000000000000000001'].views, 213);
});

test('X older shape: legacy.followers_count, TweetWithVisibilityResults', () => {
  const json = { data: { user: { result: { __typename: 'User', rest_id: '1', legacy: { screen_name: 'ExampleLab', followers_count: 4000000 } } }, x: { __typename: 'TweetWithVisibilityResults', tweet: { rest_id: '99', core: { user_results: { result: { legacy: { screen_name: 'ExampleLab' } } } }, legacy: { favorite_count: 1000, retweet_count: 100, reply_count: 50, quote_count: 10, bookmark_count: 40 }, views: { count: '200000' } } } } };
  const out = plain(E.x(json));
  assert.equal(out.users.examplelab, 4000000);
  assert.equal(out.posts['99'].likes, 1000);
  assert.equal(out.posts['99'].owner, 'examplelab');
});

test('Instagram profile timeline, reels tab and profile header', () => {
  const json = { data: {
    user: { username: 'example.studio', follower_count: 6736533, pk: '1' },
    xdt_api__v1__feed__user_timeline_graphql_connection: { edges: [
      { node: { code: 'Dd2NMjkj91i', like_count: 12000, comment_count: 340, media_type: 8, user: { username: 'example.studio' } } },
      { node: { code: 'Dc1ldDJyZDj', like_count: 50000, comment_count: 900, play_count: 2100000, media_type: 2, product_type: 'clips', owner: { username: 'Example.Reels' } } },
    ] },
    xdt_api__v1__clips__user__connection_v2: { edges: [{ node: { media: { code: 'DalMyY0t0lp', like_count: null, comment_count: 12, ig_play_count: 40000, like_and_view_counts_disabled: true } } }] },
    config: { code: 'en_US' },
  } };
  const out = plain(E.instagram(json));
  assert.deepEqual(out.users, { 'example.studio': 6736533 });
  assert.equal(out.posts.Dd2NMjkj91i.likes, 12000);
  assert.equal(out.posts.Dd2NMjkj91i.views, null);
  assert.equal(out.posts.Dc1ldDJyZDj.views, 2100000);
  assert.equal(out.posts.Dc1ldDJyZDj.owner, 'example.reels');
  assert.equal(out.posts.DalMyY0t0lp.hidden, true);
  assert.equal(out.posts.DalMyY0t0lp.views, 40000);
  assert.equal(out.posts.en_US, undefined);
});

test('Instagram older web_profile_info shape', () => {
  const json = { data: { user: { username: 'example_creator', edge_followed_by: { count: 1500 }, edge_owner_to_timeline_media: { edges: [{ node: { shortcode: 'ABCDE12345', edge_liked_by: { count: 90 }, edge_media_to_comment: { count: 5 }, video_view_count: 3000 } }] } } } };
  const out = plain(E.instagram(json));
  assert.equal(out.users.example_creator, 1500);
  assert.deepEqual(out.posts.ABCDE12345, { likes: 90, comments: 5, views: 3000, shares: null, saves: null, owner: null });
});

test('parseBody handles multi-line and for(;;) bodies', () => {
  assert.equal(E.parseBody('{"a":1}\n{"b":2}').length, 2);
  assert.equal(E.parseBody('for (;;);{"a":1}').length, 1);
  assert.equal(E.parseBody('<html>').length, 0);
});

test('parseCount', () => {
  assert.deepEqual(plain(E.parseCount('like this video along with 12,345 other people')), { value: 12345, exact: true });
  assert.deepEqual(plain(E.parseCount('1.2M subscribers')), { value: 1200000, exact: false });
  assert.deepEqual(plain(E.parseCount('987K')), { value: 987000, exact: false });
  assert.deepEqual(plain(E.parseCount('1,234 Comments')), { value: 1234, exact: true });
  assert.equal(E.parseCount('Like'), null);
});
