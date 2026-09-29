// Kaynak: geçici /tmp/claude-0/pkg/clike.mjs — v4.12.0 güvenlik ağı olarak kalıcılaştırıldı.
import { chromium, fs, ROOT, APP, NM, OUT, U1, U2, now, iso, db, writes, uploads, IMG, DB0, resetDb, cursorOr, filterRows, seq, orderRows, withEmbeds, handleRest, libs, HOSTINGER_BASE_CSS, hostPage, errors, realtimeMock, postSeq, makePost, setup, frameOf, check, DEFAULT_CHROMIUM, LAUNCH } from '../helpers/harness.mjs';
import { b64, tokenFor, uidOf, uidSeq, authMock, boot, acct, paneOf, errOf, navLogin, go, submitPane, fillSignup, visibleView, navClick, settle, flag, noProfileInsert } from '../helpers/auth.mjs';

// ===== Yorum Beğenisi V1 =====
const P1 = 'bbbbbbbb-0000-4000-8000-000000000001', P2 = 'bbbbbbbb-0000-4000-8000-000000000002';
const C2 = 'cccccccc-0000-4000-8000-000000000002';   // P1'in en güncel yorumu (U2)
const OWN = 'cccccccc-0000-4000-8000-000000000050';  // P2'de kendi yorumum (U1)
function seedCL({ preLikedByMe = false } = {}) {
  db.professional_comment_likes = [
    { comment_id: C2, user_id: 'dddddddd-0000-4000-8000-000000000001', created_at: iso(5) },
    { comment_id: C2, user_id: 'dddddddd-0000-4000-8000-000000000002', created_at: iso(4) },
    { comment_id: OWN, user_id: U2, created_at: iso(3) }
  ];
  if (preLikedByMe) db.professional_comment_likes.push({ comment_id: C2, user_id: U1, created_at: iso(2) });
  db.professional_post_comments.push(
    { id: OWN, post_id: P2, user_id: U1, content: 'Kendi yorumum.', status: 'active', created_at: iso(6), updated_at: iso(6) },
    { id: 'cccccccc-0000-4000-8000-000000000051', post_id: P2, user_id: U2, content: 'Silinmiş yorum', status: 'deleted', created_at: iso(1), updated_at: iso(1) },
    { id: 'cccccccc-0000-4000-8000-000000000052', post_id: P2, user_id: U2, content: 'Gizlenmiş yorum', status: 'hidden', created_at: iso(0.5), updated_at: iso(0.5) }
  );
}
const req = [];
const cm = (f, scope, cid) => f.evaluate(([sc, id]) => { const el = document.querySelector(`${sc} [data-comment-id="${id}"]`); if (!el) return null; const b = el.querySelector('[data-comment-like]'); const foot = el.querySelector('.cp-acts, .cm-foot'); return { btn: b ? b.textContent : null, pressed: b?.getAttribute('aria-pressed'), count: el.querySelector('.cm-lcount')?.textContent || '', foot: foot ? foot.textContent.replace(/\s+/g, ' ').trim() : '' }; }, [scope, cid]);
const FEED = '[data-view="works"]', DET = '[data-view="work"]';
const clickLike = (f, scope, cid, times = 1) => f.evaluate(([sc, id, n]) => { for (let i = 0; i < n; i++) document.querySelector(`${sc} [data-comment-id="${id}"] [data-comment-like]`)?.click(); }, [scope, cid, times]);
const likeWrites = () => req.filter(r => r.url.includes('/professional_comment_likes') && ['POST', 'DELETE'].includes(r.m));
const browser = await chromium.launch(LAUNCH);
for (const vp of [{ name: 'desktop', width: 1366, height: 900 }, { name: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true }]) {
  const N = vp.name;
  // ---------- giriş yapmış ----------
  {
    resetDb(); seedCL(); req.length = 0;
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch });
    await setup(ctx, true);
    const page = await ctx.newPage();
    page.on('request', r => { if (/\/rest\/v1\/(professional_comment_likes|professional_notifications)/.test(r.url())) req.push({ m: r.method(), url: decodeURIComponent(r.url()), body: r.postData() }); });
    page.on('pageerror', e => errors.push(`clike ${N}: ${e.message}`));
    await page.goto('https://isgcalisanplatformu.com/'); await settle(page, 1800);
    const f = frameOf(page); await f.waitForSelector(`${FEED} [data-post-id]`); await settle(page, 600);
    // toplu yükleme: tek sorgu, yalnız gösterilen yorumlar
    const gets = req.filter(r => r.m === 'GET' && r.url.includes('/professional_comment_likes'));
    const ids = (gets[0]?.url.match(/comment_id=in\.\(([^)]*)\)/) || [])[1]?.split(',') || [];
    check(gets.length === 1 && ids.includes(C2) && !ids.includes('cccccccc-0000-4000-8000-000000000001') && ids.includes(OWN), `${N} Akış: beğeni verisi tek toplu sorgu, yalnız gösterilen yorumlar (${gets.length} sorgu, ${ids.length} id)`);
    let s = await cm(f, FEED, C2);
    check(s && s.btn === 'Beğen' && s.pressed === 'false' && s.count === '2 beğeni' && /^Beğen\s*·\s*2 beğeni$/.test(s.foot), `${N} Akış: "${s?.foot}"`);
    const own = await cm(f, FEED, OWN);
    check(own && own.btn === null && own.count === '1 beğeni', `${N} kendi yorumunda Beğen yok, yalnız "${own?.count}"`);
    check(await f.locator(`${FEED} [data-comment-id="cccccccc-0000-4000-8000-000000000051"], ${FEED} [data-comment-id="cccccccc-0000-4000-8000-000000000052"]`).count() === 0, `${N} silinmiş/gizlenmiş yorum ve aksiyonu yok`);
    await f.locator(`${FEED} [data-post-id="${P1}"]`).scrollIntoViewIfNeeded(); await settle(page, 200);
    await f.locator(`${FEED} [data-post-id="${P1}"] .kw-thread`).screenshot({ path: `${OUT}/clike-feed-${N}.png` });
    // beğen (hızlı çift tık → tek istek)
    req.length = 0;
    await clickLike(f, FEED, C2, 2); await settle(page, 700);
    s = await cm(f, FEED, C2);
    const w1 = likeWrites();
    check(w1.length === 1 && w1[0].m === 'POST' && JSON.stringify(JSON.parse(w1[0].body)) === JSON.stringify({ comment_id: C2, user_id: U1 }), `${N} hızlı çift tık → tek INSERT (${w1.map(x => x.m).join(',')})`);
    check(s.btn === 'Beğenildi' && s.pressed === 'true' && s.count === '3 beğeni', `${N} beğen → "${s.foot}"`);
    check(!req.some(r => r.url.includes('professional_notifications') && r.m !== 'GET' && r.m !== 'HEAD'), `${N} frontend bildirim INSERT/DELETE etmiyor`);
    // Akış → Post Detay tutarlılığı
    await f.evaluate(id => document.querySelector(`[data-view="works"] [data-post-id="${id}"] .kw-post-tags`).click(), P1);
    await f.waitForSelector(`${DET} [data-comment-id="${C2}"]`); await settle(page, 700);
    s = await cm(f, DET, C2);
    check(s.btn === 'Beğenildi' && s.count === '3 beğeni' && /·\s*Beğenildi\s*·\s*3 beğeni$/.test(s.foot), `${N} Post Detay aynı durum: "${s.foot}"`);
    await f.locator(`${DET} [data-comment-id="${C2}"]`).screenshot({ path: `${OUT}/clike-detail-${N}.png` });
    // detayda geri al → Akış'a yansır
    req.length = 0;
    await clickLike(f, DET, C2); await settle(page, 700);
    s = await cm(f, DET, C2);
    const w2 = likeWrites();
    check(w2.length === 1 && w2[0].m === 'DELETE' && w2[0].url.includes(`comment_id=eq.${C2}`) && w2[0].url.includes(`user_id=eq.${U1}`) && s.btn === 'Beğen' && s.count === '2 beğeni', `${N} unlike (detay) → DELETE, "${s.foot}"`);
    await page.goBack(); await settle(page, 700);
    s = await cm(f, FEED, C2);
    check(s.btn === 'Beğen' && s.count === '2 beğeni', `${N} geri → Akış güncel: "${s.foot}"`);
    // DB hatası → geri alma
    await ctx.route(/\/rest\/v1\/professional_comment_likes/, r => (r.request().method() === 'POST' ? r.fulfill({ status: 500, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ code: 'XX000', message: 'db error' }) }) : r.fallback()));
    await clickLike(f, FEED, C2); await settle(page, 800);
    s = await cm(f, FEED, C2);
    const toastTxt = await f.evaluate(() => document.querySelector('[data-toast]')?.textContent || '');
    check(s.btn === 'Beğen' && s.pressed === 'false' && s.count === '2 beğeni' && toastTxt.length > 0, `${N} DB hatası → geri alındı ("${s.foot}", toast: ${toastTxt})`);
    await ctx.unroute(/\/rest\/v1\/professional_comment_likes/);
    // mevcut davranışlar: yorum yaz + post like hâlâ çalışıyor
    writes.length = 0;
    await f.evaluate(id => document.querySelector(`[data-view="works"] [data-post-id="${id}"] [data-post-action="like"]`)?.click(), 'bbbbbbbb-0000-4000-8000-000000000003'); await settle(page, 600);
    check(writes.some(w => w.table === 'professional_post_likes'), `${N} Post beğenisi etkilenmedi`);
    await ctx.close();
  }
  // ---------- misafir → giriş → bekleyen beğeni ----------
  for (const pre of [false, true]) {
    resetDb(); seedCL({ preLikedByMe: pre }); req.length = 0;
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch });
    await setup(ctx, false); const auth = authMock(ctx); await auth.ready;
    const page = await ctx.newPage();
    page.on('request', r => { if (/\/rest\/v1\/professional_comment_likes/.test(r.url())) req.push({ m: r.method(), url: decodeURIComponent(r.url()), body: r.postData() }); });
    await page.goto('https://isgcalisanplatformu.com/'); await settle(page, 1800);
    const f = frameOf(page); await f.waitForSelector(`${FEED} [data-post-id]`); await settle(page, 600);
    let s = await cm(f, FEED, C2);
    const ownG = await cm(f, FEED, OWN);
    check(s.btn === 'Beğen' && ownG.btn === 'Beğen', `${N} misafir: tüm yorumlarda "Beğen" görünür`);
    await clickLike(f, FEED, C2); await settle(page, 500);
    check(await f.evaluate(() => document.getElementById('kaLoginDialog').open) && !likeWrites().length, `${N} misafir Beğen → giriş penceresi, istek yok`);
    await f.fill('#kaLoginEmail', 'a@b.c'); await f.fill('#kaLoginPassword', 'dogru-sifre'); await submitPane(f, 'login'); await settle(page, 1800);
    s = await cm(f, FEED, C2);
    const w = likeWrites();
    if (!pre) check(w.length === 1 && w[0].m === 'POST' && s.btn === 'Beğenildi' && s.count === '3 beğeni', `${N} giriş sonrası bekleyen beğeni tamamlandı ("${s.foot}")`);
    else check(w.length === 0 && s.btn === 'Beğenildi' && s.count === '3 beğeni', `${N} zaten beğenilmişse girişten sonra tekrar/geri alma yok ("${s.foot}")`);
    const own2 = await cm(f, FEED, OWN);
    check(own2.btn === null, `${N} girişten sonra kendi yorumunda Beğen kalktı`);
    await ctx.close();
  }
}
await browser.close();
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO PAGE ERRORS');
