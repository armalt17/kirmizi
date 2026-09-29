// Kaynak: geçici /tmp/claude-0/pkg/rail.mjs — v4.12.0 güvenlik ağı olarak kalıcılaştırıldı.
import { chromium, fs, ROOT, APP, NM, OUT, U1, U2, now, iso, db, writes, uploads, IMG, DB0, resetDb, cursorOr, filterRows, seq, orderRows, withEmbeds, handleRest, libs, HOSTINGER_BASE_CSS, hostPage, errors, realtimeMock, postSeq, makePost, setup, frameOf, check, DEFAULT_CHROMIUM, LAUNCH } from '../helpers/harness.mjs';
import { b64, tokenFor, uidOf, uidSeq, authMock, boot, acct, paneOf, errOf, navLogin, go, submitPane, fillSignup, visibleView, navClick, settle, flag, noProfileInsert } from '../helpers/auth.mjs';

// ===== Akış sol panel: son aktif Post paylaşan uzmanlar =====
const P = n => `ffffffff-0000-4000-8000-${String(n).padStart(12, '0')}`;
const person = (n, name, disc) => ({ id: `abababab-0000-4000-8000-${String(n).padStart(12, '0')}`, full_name: name, avatar_url: null, profession: 'İş Güvenliği Uzmanı', title: null, certificate_class: 'B', city: 'Ankara', current_company: null, is_discoverable: disc, specialties: [], last_post_at: null });
const B = person(1, 'Bora Aktif', true), C = person(2, 'Gizli Cem', false), D = person(3, 'Deniz Üç', true), E = person(4, 'Postsuz Ece', true), F = person(5, 'Fatih Beş', true);
function seedRail() {
  db.profiles.find(p => p.id === U1).is_discoverable = true;
  // last_post_at bilerek yanıltıcı: E (hiç Postu yok) ve C en yeni görünüyor — sıralama buna dayanmamalı
  E.last_post_at = iso(0); C.last_post_at = iso(0); B.last_post_at = iso(1);
  db.profiles.push(B, C, D, E, F);
  const post = (id, uid, min, status = 'active') => { const a = db.profiles.find(p => p.id === uid); return { id, user_id: uid, content: `Post ${id.slice(-2)}`, image_path: null, profile_featured_order: null, created_at: iso(min), updated_at: iso(min), status, category: null, author: { id: a.id, full_name: a.full_name, avatar_url: null, profession: a.profession, title: a.title, certificate_class: a.certificate_class, current_company: a.current_company } }; };
  db.professional_posts = [
    post(P(1), B.id, 1, 'deleted'),   // B'nin silinmiş en yeni Postu — sayılmamalı
    post(P(2), C.id, 5),              // gizli profil
    post(P(3), U1, 10), post(P(4), B.id, 20), post(P(5), B.id, 25), post(P(6), D.id, 30), post(P(7), U1, 50), post(P(8), F.id, 60)
  ];
  db.professional_post_comments = [];
}
// Gömülü author canlı profiles tablosundan (is_discoverable dahil) — gerçek PostgREST gibi
async function liveAuthors(ctx) {
  await ctx.route('https://twaptpofhbnnfciowoig.supabase.co/rest/v1/professional_posts?*', async route => {
    const req = route.request(), u = new URL(req.url());
    if (req.method() !== 'GET' || !/is_discoverable/.test(u.searchParams.get('select') || '')) return route.fallback();
    let rows = db.professional_posts.filter(r => !u.searchParams.get('status') || r.status === u.searchParams.get('status').slice(3));
    const or = u.searchParams.get('or'); if (or) { const fn = cursorOr(or.replace(/^\(|\)$/g, '')); if (fn) rows = rows.filter(fn); }
    rows = rows.slice().sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : a.id < b.id ? 1 : -1)).slice(0, +u.searchParams.get('limit') || 1000);
    const body = (Array.isArray(rows) ? rows : []).map(r => { const a = db.profiles.find(p => p.id === r.user_id); return { id: r.id, user_id: r.user_id, created_at: r.created_at, author: a ? { id: a.id, full_name: a.full_name, avatar_url: a.avatar_url, profession: a.profession, title: a.title, certificate_class: a.certificate_class, current_company: a.current_company, city: a.city, is_discoverable: a.is_discoverable } : null }; });
    railReqs.push(decodeURIComponent(u.search));
    return route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  });
}
const railReqs = [];
const sideNames = page => page.evaluate(() => { const h = document.getElementById('kisg-pro-sides'); const r = h?.shadowRoot || document.querySelector('iframe').contentDocument; return [...r.querySelectorAll('[data-side-experts] .kw-person strong')].map(x => x.textContent); });
const railNames = f => f.evaluate(() => [...document.querySelectorAll('[data-view="works"] .kw-rail-experts strong, [data-view="works"] .kw-rail-experts .kw-rail-expert-name')].map(x => x.textContent.trim()));
const browser = await chromium.launch(LAUNCH);
{
  resetDb(); seedRail();
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await setup(ctx, true); await liveAuthors(ctx);
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`rail: ${e.message}`));
  await page.goto('https://isgcalisanplatformu.com/'); await settle(page, 1800);
  const f = frameOf(page); await f.waitForSelector('[data-view="works"] [data-post-id]');
  let n = await sideNames(page);
  check(JSON.stringify(n) === JSON.stringify(['Ayşe Yılmaz', 'Bora Aktif', 'Deniz Üç']), `sıralama aktif Postlara göre, en güncel 3, kendisi dahil: ${n.join(' > ')}`);
  check(!n.includes('Gizli Cem') && !n.includes('Postsuz Ece') && new Set(n).size === n.length, 'gizli profil ve Postu olmayan yok; B iki Postla bir kez');
  check(railReqs.some(q => /status=eq\.active/.test(q)) && railReqs.every(q => !/last_post_at/.test(q)), 'sorgu yalnız aktif Postlar; last_post_at kullanılmıyor');
  // Kendi en son Postunu sil → önceki aktif Postu (50 dk) esas alınır
  const del = async id => {
    await f.evaluate(pid => { const c = document.querySelector(`[data-view="works"] [data-post-id="${pid}"]`); c.scrollIntoView({ block: 'center' }); c.querySelector('[data-popover-trigger]').click(); c.querySelector('[data-post-action="delete"]').click(); }, id);
    await settle(page, 300); await f.click('#kaConfirmOk'); await settle(page, 1500);
  };
  await del(P(3));
  n = await sideNames(page);
  check(JSON.stringify(n) === JSON.stringify(['Bora Aktif', 'Deniz Üç', 'Ayşe Yılmaz']), `son Post silindi → önceki aktif Post (50 dk) esas: ${n.join(' > ')}`);
  await del(P(7));
  n = await sideNames(page);
  check(JSON.stringify(n) === JSON.stringify(['Bora Aktif', 'Deniz Üç', 'Fatih Beş']) && !n.includes('Ayşe Yılmaz'), `aktif Postu kalmayınca listeden çıktı: ${n.join(' > ')}`);
  await page.reload(); await settle(page, 1800);
  n = await sideNames(page);
  check(JSON.stringify(n) === JSON.stringify(['Bora Aktif', 'Deniz Üç', 'Fatih Beş']), `yenilemede aynı sonuç: ${n.join(' > ')}`);
  await ctx.close();
}
{
  // Mobil: akış içi şerit aynı veriyi kullanır (3 kişi)
  resetDb(); seedRail();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await setup(ctx, true); await liveAuthors(ctx);
  const page = await ctx.newPage();
  await page.goto('https://isgcalisanplatformu.com/'); await settle(page, 1800);
  const f = frameOf(page); await f.waitForSelector('[data-view="works"] [data-post-id]');
  const r = await f.evaluate(() => [...document.querySelectorAll('[data-view="works"] .kw-rail-experts a')].filter(a => !a.matches('[data-view-link]')).map(a => a.textContent));
  check(r.length === 3 && /Ayşe Yılmaz/.test(r[0]) && /Bora Aktif/.test(r[1]) && /Deniz Üç/.test(r[2]), `mobil şerit: ${r.map(x => x.slice(0, 20)).join(' | ')}`);
  await ctx.close();
}
await browser.close();
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO PAGE ERRORS');
