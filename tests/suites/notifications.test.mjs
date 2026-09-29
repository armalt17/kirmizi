// Kaynak: geçici /tmp/claude-0/pkg/notif.mjs — v4.12.0 güvenlik ağı olarak kalıcılaştırıldı.
import { chromium, fs, ROOT, ANON_DENIED_TABLES, APP, NM, OUT, U1, U2, now, iso, db, writes, uploads, IMG, DB0, resetDb, cursorOr, filterRows, seq, orderRows, withEmbeds, handleRest, libs, HOSTINGER_BASE_CSS, hostPage, errors, realtimeMock, postSeq, makePost, setup, frameOf, check, DEFAULT_CHROMIUM, LAUNCH } from '../helpers/harness.mjs';
import { b64, tokenFor, uidOf, uidSeq, authMock, boot, acct, paneOf, errOf, navLogin, go, submitPane, fillSignup, visibleView, navClick, settle, flag, noProfileInsert } from '../helpers/auth.mjs';

// ===== Web Notification Center V1 =====
const NT = 'professional_notifications', notifReqs = [];
const PID1 = 'bbbbbbbb-0000-4000-8000-000000000001', PID4 = 'bbbbbbbb-0000-4000-8000-000000000004';
let nseq = 0;
const mkNotif = (o = {}) => ({ id: `99999999-0000-4000-8000-${String(++nseq).padStart(12, '0')}`, recipient_id: U1, actor_id: U2, type: 'post_like', post_id: PID4, comment_id: null, created_at: new Date(now - (1000 - nseq) * 60000).toISOString(), read_at: null, onesignal_notification_id: null, ...o });
function seedNotifs(unread, read) {
  db[NT] = [];
  for (let i = 0; i < read; i++) db[NT].push(mkNotif({ read_at: iso(1), created_at: iso(500 + i) }));
  for (let i = 0; i < unread; i++) db[NT].push(mkNotif({ created_at: iso(100 + i) }));
  db[NT].push(mkNotif({ recipient_id: U2, actor_id: U1 }));   // başka kullanıcıya ait — asla görünmemeli
}
function nFilter(u) {
  let rows = db[NT] || [];
  for (const [k, v] of u.searchParams) {
    if (['select', 'order', 'limit'].includes(k)) continue;
    if (v.startsWith('eq.')) rows = rows.filter(r => String(r[k]) === v.slice(3));
    else if (v === 'is.null') rows = rows.filter(r => r[k] == null);
    else if (v.startsWith('in.(')) { const xs = v.slice(4, -1).split(','); rows = rows.filter(r => xs.includes(String(r[k]))); }
  }
  return rows;
}
async function notifRest(ctx) {
  await ctx.route(/\/rest\/v1\/professional_notifications/, async route => {
    const req = route.request(), u = new URL(req.url()), m = req.method(), H = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': 'content-range' };
    notifReqs.push({ m, url: decodeURIComponent(u.search), body: req.postData() });
    if (m === 'OPTIONS') return route.fulfill({ status: 200, headers: H });
    const uid = U1; // RLS: yalnız kendi kayıtları (mock oturumu U1)
    if (m === 'HEAD') { const n = nFilter(u).filter(r => r.recipient_id === uid).length; return route.fulfill({ status: 200, headers: { ...H, 'content-range': `0-0/${n}` } }); }
    if (m === 'PATCH') { const body = JSON.parse(req.postData() || '{}'); const hit = nFilter(u).filter(r => r.recipient_id === uid); hit.forEach(r => Object.assign(r, body)); return route.fulfill({ status: 204, headers: H, body: '' }); }
    if (m === 'GET') {
      let rows = nFilter(u).filter(r => r.recipient_id === uid).slice().sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : a.id < b.id ? 1 : -1));
      const lim = +u.searchParams.get('limit'); if (lim) rows = rows.slice(0, lim);
      const cols = (u.searchParams.get('select') || '').split(','); rows = rows.map(r => Object.fromEntries(cols.map(c => [c, r[c]])));
      return route.fulfill({ status: 200, headers: H, contentType: 'application/json', body: JSON.stringify(rows) });
    }
    return route.fulfill({ status: 405, headers: H, body: '' });
  });
}
// Realtime: professional_notifications INSERT olayı (filtre eşleşen kanallara)
function emitNotif(rt, row, type = 'INSERT') {
  let sent = 0;
  for (const c of rt.conns) for (const [topic, t] of c.topics) {
    const b = t.bindings.find(b => b.table === NT && (!b.filter || b.filter === `recipient_id=eq.${row.recipient_id}`)); if (!b) continue;
    c.ws.send(JSON.stringify({ topic, event: 'postgres_changes', ref: null, payload: { ids: [b.id], data: { schema: 'public', table: NT, commit_timestamp: row.created_at, type, record: row, old_record: type === 'INSERT' ? null : { id: row.id }, columns: Object.keys(row).map(k => ({ name: k, type: 'text' })), errors: null } } })); sent++;
  }
  return sent;
}
const notifChannels = rt => [...rt.conns].reduce((n, c) => n + [...c.topics.values()].filter(t => t.bindings.some(b => b.table === NT)).length, 0);
const navQ = (page, js) => page.evaluate(js);
const bellState = page => page.evaluate(() => { const r = document.getElementById('kisg-pro-nav').shadowRoot, w = r.querySelector('[data-notif]'), b = r.querySelector('[data-notif-badge]'); return { visible: !!w && !w.hidden && w.getBoundingClientRect().width > 0, badge: b && !b.hidden ? b.textContent : '', label: r.querySelector('[data-notif-toggle]')?.getAttribute('aria-label') }; });
const clickBell = page => page.evaluate(() => document.getElementById('kisg-pro-nav').shadowRoot.querySelector('[data-notif-toggle]').click());
const panelItems = (page, mobile, f) => mobile
  ? f.evaluate(() => [...document.querySelectorAll('#kaNotifDialog .kn-item')].map(x => ({ id: x.dataset.notifId, unread: x.classList.contains('is-unread'), text: x.querySelector('.kn-text').textContent, snip: x.querySelector('.kn-snippet')?.textContent || '' })))
  : page.evaluate(() => [...document.getElementById('kisg-pro-nav').shadowRoot.querySelectorAll('[data-notif-panel] .kn-item')].map(x => ({ id: x.dataset.notifId, unread: x.classList.contains('is-unread'), text: x.querySelector('.kn-text').textContent, snip: x.querySelector('.kn-snippet')?.textContent || '' })));
const allBtn = (page, mobile, f) => mobile ? f.evaluate(() => { const b = document.querySelector('#kaNotifDialog [data-notif-all]'); return !b.hidden; }) : page.evaluate(() => !document.getElementById('kisg-pro-nav').shadowRoot.querySelector('[data-notif-panel] [data-notif-all]').hidden);

const browser = await chromium.launch(LAUNCH);
for (const vp of [{ name: 'desktop', width: 1366, height: 900 }, { name: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true }]) {
  const N = vp.name, mobile = !!vp.isMobile;
  // --- misafir ---
  {
    resetDb(); seedNotifs(3, 0); notifReqs.length = 0;
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch });
    await setup(ctx, false); await notifRest(ctx);
    const page = await ctx.newPage();
    await page.goto('https://isgcalisanplatformu.com/'); await settle(page, 1500);
    const b = await bellState(page);
    check(!b.visible && notifChannels(ctx._rt) === 0 && !notifReqs.length, `${N} misafir: zil yok, bildirim isteği/kanalı yok`);
    await ctx.close();
  }
  // --- giriş yapmış ---
  resetDb(); seedNotifs(12, 13); notifReqs.length = 0;
  db.professional_post_comments.push({ id: 'cccccccc-0000-4000-8000-000000000077', post_id: PID1, user_id: U2, content: 'Bu uygulamayı bizim sahada da deneyeceğiz, çok faydalı.', status: 'active', created_at: iso(3), updated_at: iso(3) });
  db[NT].push(mkNotif({ type: 'post_comment', post_id: PID1, comment_id: 'cccccccc-0000-4000-8000-000000000077', created_at: iso(2) }));
  db[NT].push(mkNotif({ type: 'post_comment', post_id: PID1, comment_id: 'cccccccc-0000-4000-8000-000000000099', created_at: iso(2.5) })); // silinmiş/erişilemeyen yorum
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch });
  await setup(ctx, true); await notifRest(ctx);
  const auth = authMock(ctx); await auth.ready;
  const rt = ctx._rt;
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`notif ${N}: ${e.message}`));
  await page.goto('https://isgcalisanplatformu.com/'); await settle(page, 1800);
  const f = frameOf(page); await f.waitForSelector('[data-view="works"] [data-post-id]');
  let b = await bellState(page);
  check(b.visible && b.badge === '9+' && /14 okunmamış/.test(b.label), `${N} giriş: zil görünür, 14 okunmamış → "9+" (${b.badge}, ${b.label})`);
  check(notifChannels(rt) === 1, `${N} Realtime: tek bildirim kanalı (${notifChannels(rt)})`);
  const joinFilter = [...rt.conns].flatMap(c => [...c.topics.values()]).flatMap(t => t.bindings).find(x => x.table === NT);
  check(joinFilter?.filter === `recipient_id=eq.${U1}` && joinFilter?.schema === 'public', `${N} Realtime filtresi recipient_id=eq.{uid} (${joinFilter?.filter})`);
  // v4.12.1 regresyonu: bildirim kanalı kullanıcı JWT'siyle katılmalı (anon → "invalid column for filter recipient_id")
  const notifJoins = () => rt.joinLog.filter(j => j.bindings.some(b => b.table === NT));
  const sessToken = await page.evaluate(() => JSON.parse(localStorage.getItem('sb-twaptpofhbnnfciowoig-auth-token') || '{}').access_token);
  const nj = notifJoins();
  check(nj.length >= 1 && nj.every(j => !j.anon && j.token === sessToken) && nj[0].bindings.length === 1 && nj[0].bindings[0].schema === 'public' && nj[0].bindings[0].table === NT && nj[0].bindings[0].event === '*' && nj[0].bindings[0].filter === `recipient_id=eq.${U1}`, `${N} Realtime join: kullanıcı JWT'si + public.${NT} + recipient_id=eq.{uid} (${nj.map(j => j.anon ? 'anon' : 'jwt').join(',')})`);
  check(rt.rejects.length === 0, `${N} Realtime: "invalid column for filter" reddi yok (${JSON.stringify(rt.rejects)})`);
  // reconnect: yeniden katılma da JWT ile ve reddedilmeden
  const joinsBefore = notifJoins().length;
  rt.dropAll(); await settle(page, 3500);
  const rj = notifJoins().slice(joinsBefore);
  check(rj.length >= 1 && rj.every(j => !j.anon) && rt.rejects.length === 0 && notifChannels(rt) === 1, `${N} Realtime reconnect: yeniden katılma JWT ile, red yok, tek kanal (${rj.length} join)`);
  // panel
  await clickBell(page); await settle(page, 900);
  let items = await panelItems(page, mobile, f);
  if (mobile) {
    const geo = await f.evaluate(() => { const d = document.getElementById('kaNotifDialog'); return { open: d.open, place: d.dataset.place }; });
    const pg = await page.evaluate(() => { const fr = document.querySelector('iframe').getBoundingClientRect(); return { top: fr.top }; });
    const r = await f.evaluate(() => document.getElementById('kaNotifDialog').getBoundingClientRect().toJSON());
    check(geo.open && geo.place === 'sheet' && Math.abs(pg.top + r.bottom - vp.height) < 3 && Math.round(r.width) === vp.width, `${N} mobil: alt sayfa (bottom sheet) ${JSON.stringify({ bottom: Math.round(pg.top + r.bottom), w: Math.round(r.width) })}`);
  } else {
    const g = await page.evaluate(() => { const r = document.getElementById('kisg-pro-nav').shadowRoot; const p = r.querySelector('[data-notif-panel]'), bl = r.querySelector('[data-notif-toggle]'); const pr = p.getBoundingClientRect(), br = bl.getBoundingClientRect(); return { vis: !p.hidden, w: Math.round(pr.width), top: Math.round(pr.top), bellBottom: Math.round(br.bottom), right: Math.round(pr.right), vw: innerWidth, title: p.querySelector('.kn-head strong').textContent }; });
    check(g.vis && g.w <= 380 && g.top >= g.bellBottom && g.right <= g.vw && g.title === 'Bildirimler', `${N} masaüstü: zilin altında kompakt panel ${JSON.stringify(g)}`);
  }
  await page.screenshot({ path: `${OUT}/notif-${N}.png` });
  check(items.length === 20 && new Set(items.map(i => i.id)).size === 20, `${N} son 20 bildirim, tekrar yok (${items.length})`);
  check(items[0].text.includes('Postuna yorum yaptı') && items[0].snip.includes('sahada da deneyeceğiz') && items[1].text.includes('Postuna yorum yaptı') && items[1].snip === '' && items.some(i => /Mehmet Şahin Öztürk Postunu beğendi/.test(i.text)), `${N} metinler + yorum özeti (erişilemeyen yorumda özet yok): "${items[1].text}" ${items[1].snip.slice(0, 30)}`);
  check(items.filter(i => i.unread).length === 14 && await allBtn(page, mobile, f), `${N} okunmamış satırlar ayrışıyor (14), "Tümünü okundu işaretle" görünür`);
  check(!notifReqs.some(r => r.m === 'POST'), `${N} istemci bildirim INSERT etmiyor`);
  // tek bildirim → okundu + Post Detay + yorum vurgusu
  notifReqs.length = 0;
  const target = items[0];
  if (mobile) await f.evaluate(id => document.querySelector(`#kaNotifDialog [data-notif-id="${id}"]`).click(), target.id);
  else await page.evaluate(id => document.getElementById('kisg-pro-nav').shadowRoot.querySelector(`[data-notif-id="${id}"]`).click(), target.id);
  await settle(page, 400);
  b = await bellState(page);
  const patch = notifReqs.find(r => r.m === 'PATCH');
  check(patch && JSON.stringify(Object.keys(JSON.parse(patch.body))) === '["read_at"]' && patch.url.includes(`id=eq.${target.id}`) && patch.url.includes('read_at=is.null') && db[NT].find(r => r.id === target.id).read_at, `${N} tıklama: yalnız o kaydın read_at'i güncellendi (${patch?.url})`);
  check(b.badge === '9+' && /13 okunmamış/.test(b.label), `${N} badge anında güncellendi (13)`);
  await f.waitForSelector(`[data-view="work"] [data-post-id="${PID1}"]`);
  const flash = await f.waitForSelector('[data-view="work"] [data-comment-id="cccccccc-0000-4000-8000-000000000077"].is-flash', { timeout: 5000 }).then(() => true).catch(() => false);
  await settle(page, 900);
  const vis = await page.evaluate(() => { const fd = document.querySelector('iframe').contentDocument; const el = fd.querySelector('[data-view="work"] [data-comment-id="cccccccc-0000-4000-8000-000000000077"]'); if (!el) return false; const fr = document.querySelector('iframe').getBoundingClientRect(), r = el.getBoundingClientRect(); return fr.top + r.top > 0 && fr.top + r.bottom < innerHeight; });
  check(page.url().endsWith(`/calisma-detay?id=${PID1}`) && flash && vis, `${N} → /calisma-detay?id={post_id}, ilgili yoruma kaydırıldı ve vurgulandı (${page.url()} flash=${flash} vis=${vis})`);
  check(await bellState(page).then(x => x.visible), `${N} Post Detay'da da zil tutarlı`);
  // Realtime yeni bildirim
  const before = (await bellState(page)).label;
  const nn = mkNotif({ created_at: new Date().toISOString(), actor_id: U2, type: 'post_like', post_id: PID1 });
  db[NT].push(nn); const sent = emitNotif(rt, nn); await settle(page, 900);
  b = await bellState(page);
  check(sent === 1 && /14 okunmamış/.test(b.label), `${N} Realtime: yeni bildirim → badge güncellendi, yenileme yok (${before} → ${b.label})`);
  emitNotif(rt, nn); await settle(page, 700);
  check(/14 okunmamış/.test((await bellState(page)).label), `${N} aynı olay iki kez gelse de sayaç çift artmadı`);
  // panel açıkken Realtime
  await clickBell(page); await settle(page, 900);
  const n2 = mkNotif({ created_at: new Date(Date.now() + 1000).toISOString(), type: 'post_comment', post_id: PID1, comment_id: 'cccccccc-0000-4000-8000-000000000077' });
  db[NT].push(n2); emitNotif(rt, n2); emitNotif(rt, n2); await settle(page, 1200);
  items = await panelItems(page, mobile, f);
  check(items[0].id === n2.id && items.length === 20 && new Set(items.map(i => i.id)).size === 20 && items.filter(i => i.id === n2.id).length === 1, `${N} panel açıkken yeni bildirim başa eklendi, duplicate yok`);
  // başka kullanıcıya olay → sayaç değişmez
  const other = mkNotif({ recipient_id: U2 }); db[NT].push(other); const sentOther = emitNotif(rt, other); await settle(page, 600);
  check(sentOther === 0 && /15 okunmamış/.test((await bellState(page)).label), `${N} başka kullanıcının bildirimi bu kanala gelmez`);
  // tümünü okundu
  notifReqs.length = 0;
  if (mobile) await f.evaluate(() => document.querySelector('#kaNotifDialog [data-notif-all]').click());
  else await page.evaluate(() => document.getElementById('kisg-pro-nav').shadowRoot.querySelector('[data-notif-panel] [data-notif-all]').click());
  await settle(page, 600);
  const pa = notifReqs.filter(r => r.m === 'PATCH');
  b = await bellState(page); items = await panelItems(page, mobile, f);
  check(pa.length === 1 && JSON.stringify(Object.keys(JSON.parse(pa[0].body))) === '["read_at"]' && pa[0].url.includes(`recipient_id=eq.${U1}`) && pa[0].url.includes('read_at=is.null') && !/[?&]id=eq\./.test(pa[0].url), `${N} tümünü okundu: tek UPDATE, yalnız read_at, yalnız kendi okunmamışları`);
  check(b.badge === '' && items.every(i => !i.unread) && !(await allBtn(page, mobile, f)) && db[NT].filter(r => r.recipient_id === U1 && !r.read_at).length === 0 && db[NT].find(r => r.id === other.id).read_at === null, `${N} badge kalktı, satırlar okundu, buton gizlendi; başka kullanıcının kaydına dokunulmadı`);
  if (mobile) { await f.click('#kaNotifDialog [data-close]'); await settle(page, 300); } else { await page.mouse.click(40, 600); await settle(page, 300); }
  // diğer sayfalarda tutarlılık
  for (const path of ['/uzmanlar', '/hizmetler', `/profil?id=${U2}`]) {
    await navClick(page, path === '/uzmanlar' ? 'experts' : path === '/hizmetler' ? 'services' : 'works'); await settle(page, 500);
  }
  await page.goto(`https://isgcalisanplatformu.com/profil?id=${U2}`); await settle(page, 1500);
  check((await bellState(page)).visible && notifChannels(rt) === 1, `${N} sayfa yenilemede (profil) zil ve tek kanal`);
  // boş durum
  db[NT] = db[NT].filter(r => r.recipient_id !== U1);
  await clickBell(page); await settle(page, 900);
  const empty = mobile ? await frameOf(page).evaluate(() => document.querySelector('#kaNotifDialog .kn-empty')?.textContent) : await page.evaluate(() => document.getElementById('kisg-pro-nav').shadowRoot.querySelector('[data-notif-panel] .kn-empty')?.textContent);
  check(empty === 'Henüz bildirimin yok.', `${N} boş durum: "${empty}"`);
  if (mobile) { await frameOf(page).click('#kaNotifDialog [data-close]'); await settle(page, 300); } else { await page.mouse.click(40, 600); await settle(page, 300); }
  // çıkış → kanal temizlenir, zil kalkar
  await page.evaluate(() => { const n = document.getElementById('kisg-pro-nav').shadowRoot; n.querySelector('.ka-account-toggle').click(); n.querySelector('[data-action="signout"]').click(); }); await settle(page, 1200);
  b = await bellState(page);
  check(!b.visible && notifChannels(rt) === 0, `${N} çıkış: zil gizlendi, bildirim kanalı kapatıldı (${notifChannels(rt)})`);
  const g2 = frameOf(page);
  const x2 = mkNotif({ created_at: new Date(Date.now() + 5000).toISOString() }); db[NT].push(x2);
  check(emitNotif(rt, x2) === 0, `${N} çıkıştan sonra olay alınmıyor`);
  // tekrar giriş → tek kanal, doğru sayaç
  await navLogin(page); await settle(page, 400); await g2.fill('#kaLoginEmail', 'a@b.c'); await g2.fill('#kaLoginPassword', 'dogru-sifre'); await submitPane(g2, 'login'); await settle(page, 1500);
  b = await bellState(page);
  check(b.visible && b.badge === '1' && notifChannels(rt) === 1, `${N} yeniden giriş: tek kanal, badge "1" (${b.badge}, ${notifChannels(rt)})`);
  check(rt.rejects.length === 0 && rt.joinLog.filter(j => j.bindings.some(x => x.table === NT)).every(j => !j.anon), `${N} çıkış/giriş sonrası da tüm bildirim join'leri JWT ile, red yok`);
  await ctx.close();
}
await browser.close();
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO PAGE ERRORS');
