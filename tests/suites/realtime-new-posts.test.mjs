// v4.10.0 (Çalışma → Post) ve v4.11.0 (ayrı bildirim kanalı) sonrası beklentiler güncellendi.
// Kaynak: geçici /tmp/claude-0/pkg/realtime.mjs — v4.12.0 güvenlik ağı olarak kalıcılaştırıldı.
import { chromium, fs, ROOT, APP, NM, OUT, U1, U2, now, iso, db, writes, uploads, IMG, DB0, resetDb, cursorOr, filterRows, seq, orderRows, withEmbeds, handleRest, libs, HOSTINGER_BASE_CSS, hostPage, errors, realtimeMock, postSeq, makePost, setup, frameOf, check, DEFAULT_CHROMIUM, LAUNCH } from '../helpers/harness.mjs';

const browser = await chromium.launch(LAUNCH);
const pillState = f => f.evaluate(() => { const b = document.querySelector('[data-new-posts]'); return b.hidden ? '' : b.textContent.trim(); });
const cardIds = f => f.evaluate(() => [...document.querySelectorAll('[data-view="works"] [data-post-id]')].map(n => n.dataset.postId));
const navClick = (page, name) => page.evaluate(n => document.getElementById('kisg-pro-nav').shadowRoot.querySelector(`[data-view-link="${n}"]`).click(), name);
for (const vp of [{ name: 'desktop', width: 1366, height: 900 }, { name: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true }]) {
  resetDb();
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch });
  await setup(ctx, true);            // A = U1 (Ayşe)
  const rt = ctx._rt;
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`rt ${vp.name}: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push(`rt ${vp.name} console: ${m.text()}`); });
  await page.goto('https://isgcalisanplatformu.com/'); await page.waitForTimeout(1200);
  const f = frameOf(page);
  await f.waitForSelector('[data-view="works"] [data-post-id]');
  await page.waitForTimeout(500);
  check(rt.channelsFor('professional_posts') === 1, `${vp.name} RT: tek kanal (${rt.channelsFor('professional_posts')})`);
  await page.evaluate(() => scrollTo(0, 800)); await page.waitForTimeout(200);
  const y0 = await page.evaluate(() => scrollY), ids0 = await cardIds(f);
  // B yayınlıyor
  const p1 = makePost(U2); rt.insert(p1); await page.waitForTimeout(400);
  check(await pillState(f) === 'Yeni Post', `${vp.name} RT: B yayınladı → gösterge "${await pillState(f)}"`);
  check(Math.abs(await page.evaluate(() => scrollY) - y0) < 2 && JSON.stringify(await cardIds(f)) === JSON.stringify(ids0), `${vp.name} RT: akış ve scroll kendiliğinden değişmedi`);
  const pos = await page.evaluate(() => { const fr = document.querySelector('iframe').getBoundingClientRect(), b = document.querySelector('iframe').contentDocument.querySelector('[data-new-posts]').getBoundingClientRect(), nav = document.getElementById('kisg-pro-nav').getBoundingClientRect(); return { top: fr.top + b.top, navBottom: nav.bottom, vh: innerHeight }; });
  check(pos.top >= pos.navBottom && pos.top < pos.navBottom + 40, `${vp.name} RT: gösterge görünen alanın üstünde ${JSON.stringify(pos)}`);
  if (vp.name === 'desktop') await page.screenshot({ path: `${OUT}/desktop-newposts.png`, clip: { x: 300, y: 0, width: 760, height: 300 } });
  else await page.screenshot({ path: `${OUT}/mobile-newposts.png`, clip: { x: 0, y: 0, width: 390, height: 260 } });
  // duplicate event
  rt.insert(p1); db.professional_posts.pop(); await page.waitForTimeout(300);
  check(await pillState(f) === 'Yeni Post', `${vp.name} RT: aynı event tekrar → sayaç değişmedi`);
  // ikinci Çalışma
  const p2 = makePost(U2); rt.insert(p2); await page.waitForTimeout(400);
  check(await pillState(f) === '2 yeni Post', `${vp.name} RT: ikinci Çalışma → "${await pillState(f)}"`);
  // kendi Çalışması (A başka cihazdan) ve pasif kayıt
  const ownOther = makePost(U1); rt.insert(ownOther); rt.insert(makePost(U2, { status: 'deleted' })); await page.waitForTimeout(400);
  check(await pillState(f) === '2 yeni Post', `${vp.name} RT: kendi Çalışması ve aktif olmayan kayıt sayılmadı`);
  // tıkla → bir kez eklenir, en üste gider
  await f.click('[data-new-posts]'); await page.waitForTimeout(1200);
  const ids1 = await cardIds(f);
  console.log('INFO top', ids1.slice(0, 4).join(' '), '| p1', p1.id, 'p2', p2.id, 'own', ownOther.id);
  // Sayaç yalnız B'nin 2 Çalışmasını sayar; tıklanınca sunucudan 'daha yeni' tüm aktif kayıtlar gelir (A'nın başka cihazdan yayınladığı dahil) — hepsi bir kez, en yeni başta.
  check(ids1.slice(0, 3).sort().join() === [p1.id, p2.id, ownOther.id].sort().join() && ids1[0] === ownOther.id && new Set(ids1).size === ids1.length && !ids1.some(id => db.professional_posts.find(x => x.id === id)?.status === 'deleted'), `${vp.name} RT: yeni Çalışmalar başa bir kez, en yeni başta; pasif kayıt yok`);
  check(await pillState(f) === '' && await page.evaluate(() => scrollY) < y0, `${vp.name} RT: gösterge kapandı, akış başına gidildi`);
  await f.click('[data-new-posts]', { force: true, timeout: 500 }).catch(() => {});
  check(new Set(await cardIds(f)).size === (await cardIds(f)).length, `${vp.name} RT: tekrar tık duplicate üretmedi`);
  // tekrar event → sistem çalışıyor
  const p3 = makePost(U2); rt.insert(p3); await page.waitForTimeout(400);
  check(await pillState(f) === 'Yeni Post', `${vp.name} RT: sonraki event yine sayılıyor`);
  await f.click('[data-new-posts]'); await page.waitForTimeout(1000);
  check((await cardIds(f))[0] === p3.id && (await cardIds(f)).filter(x => x === p3.id).length === 1, `${vp.name} RT: ikinci tur ekleme doğru`);
  // A kendi Çalışmasını yayınlıyor (composer) → gösterge yok, feed'e bir kez
  writes.length = 0;
  await f.evaluate(() => document.querySelector('[data-view="works"] [data-composer]').click()); await f.waitForSelector('#kaPostDialog[open]');
  await f.fill('#kaPostContent', 'A kendi Çalışması'); await f.evaluate(() => document.getElementById('kaPostSubmit').click()); await page.waitForTimeout(900);
  const own = db.professional_posts.find(x => x.content === 'A kendi Çalışması');
  if (own) rt.insert({ ...own }), db.professional_posts.pop();
  await page.waitForTimeout(400);
  check(await pillState(f) === '' && (await cardIds(f)).filter(x => x === own?.id).length === 1, `${vp.name} RT: kendi yayınladığı Çalışma sayılmadı, akışta bir kez`);
  // route değişimi: kanal kapanır; uzaktayken gelen Çalışma dönüşte doğrulanır; kanal tek
  await navClick(page, 'experts'); await page.waitForTimeout(500);
  check(rt.channelsFor('professional_posts') === 0, `${vp.name} RT: Uzmanlar'a geçince kanal kapandı`);
  const p4 = makePost(U2); rt.insert(p4); await page.waitForTimeout(300);
  check(await pillState(f) === '', `${vp.name} RT: başka görünümde gösterge yok`);
  await page.goBack(); await page.waitForTimeout(1000);
  check(page.url().endsWith('isgcalisanplatformu.com/') && await pillState(f) === 'Yeni Post' && rt.channelsFor('professional_posts') === 1, `${vp.name} RT: geri → kaçırılan Çalışma doğrulandı, tek kanal (${rt.channelsFor('professional_posts')})`);
  // back/forward + detay
  await f.evaluate(() => document.querySelector('[data-view="works"] a.kw-post-detail').click()); await f.waitForSelector('#kaMediaDialog', { state: 'attached' });
  await page.waitForTimeout(500);
  await page.goBack(); await page.waitForTimeout(800);
  await page.goForward(); await page.waitForTimeout(500); await page.goBack(); await page.waitForTimeout(800);
  check(rt.channelsFor('professional_posts') === 1 && await pillState(f) === 'Yeni Post', `${vp.name} RT: detay ↔ geri/ileri sonrası tek kanal, sayaç korunuyor (${rt.channelsFor('professional_posts')})`);
  // reconnect: bağlantı düşüyor, bu arada kayıt geliyor (event yok), yeniden bağlanınca yakalanıyor
  rt.dropAll();
  await page.waitForTimeout(200);
  const p5 = makePost(U2); db.professional_posts.push(p5);            // yalnız DB'ye; event gitmiyor
  await page.waitForTimeout(4500);
  check(await pillState(f) === '2 yeni Post' && rt.channelsFor('professional_posts') === 1, `${vp.name} RT: reconnect sonrası kaçırılan kayıt created_at/id ile yakalandı ("${await pillState(f)}", kanal ${rt.channelsFor('professional_posts')})`);
  await f.click('[data-new-posts]'); await page.waitForTimeout(1000);
  const ids2 = await cardIds(f);
  check(ids2.slice(0, 2).sort().join() === [p4.id, p5.id].sort().join() && new Set(ids2).size === ids2.length, `${vp.name} RT: reconnect sonrası ekleme doğru`);
  await ctx.close();
}
{
  // Realtime hiç çalışmıyor: akış normal, hata yok
  resetDb();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await setup(ctx, true);
  ctx._rt.down = true;
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`rt down: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/404|WebSocket/.test(m.text())) errors.push(`rt down console: ${m.text()}`); });
  await page.goto('https://isgcalisanplatformu.com/'); await page.waitForTimeout(1500);
  const f = frameOf(page);
  check(await f.locator('[data-view="works"] [data-post-id]').count() >= 10 && await pillState(f) === '' && !(await f.isVisible('[data-view="works"] [data-notice]')), 'RT kapalı: akış normal, gösterge/hata yok');
  await f.click('[data-view="works"] [data-more]'); await page.waitForTimeout(800);
  check(await f.locator('[data-view="works"] [data-post-id]').count() > 10, 'RT kapalı: sayfalama çalışıyor');
  await ctx.close();
}
{
  // v4.8.0: legacy /calisma girişi → / üzerinde Realtime; Uzmanlar/Hizmet Bul/detay dönüşünde kaçırılan kayıt
  for (const vp of [{ name: 'desktop', width: 1366, height: 900 }, { name: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true }]) {
    resetDb();
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch });
    await setup(ctx, true);
    const rt = ctx._rt;
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(`rt legacy ${vp.name}: ${e.message}`));
    await page.goto('https://isgcalisanplatformu.com/calisma'); await page.waitForTimeout(1200);
    const f = frameOf(page);
    await f.waitForSelector('[data-view="works"] [data-post-id]'); await page.waitForTimeout(400);
    check(page.url() === 'https://isgcalisanplatformu.com/' && rt.channelsFor('professional_posts') === 1, `${vp.name} RT legacy: /calisma → /, tek kanal (${rt.channelsFor('professional_posts')})`);
    const p1 = makePost(U2); rt.insert(p1); await page.waitForTimeout(400);
    check(await pillState(f) === 'Yeni Post', `${vp.name} RT /: gösterge "${await pillState(f)}"`);
    await navClick(page, 'experts'); await page.waitForTimeout(400);
    await navClick(page, 'services'); await page.waitForTimeout(400);
    check(rt.channelsFor('professional_posts') === 0, `${vp.name} RT /: Hizmet Bul'da kanal kapalı`);
    const p2 = makePost(U2); db.professional_posts.push(p2);
    await page.goBack(); await page.waitForTimeout(300); await page.goBack(); await page.waitForTimeout(900);
    check(page.url() === 'https://isgcalisanplatformu.com/' && await pillState(f) === '2 yeni Post' && rt.channelsFor('professional_posts') === 1, `${vp.name} RT /: geri → kaçırılan kayıt sayıldı ("${await pillState(f)}", kanal ${rt.channelsFor('professional_posts')})`);
    await f.evaluate(() => document.querySelector('[data-view="works"] a.kw-post-detail').click());
    await f.waitForSelector('[data-view="work"] [data-post-id]');
    await page.goBack(); await page.waitForTimeout(800);
    check(await pillState(f) === '2 yeni Post' && rt.channelsFor('professional_posts') === 1, `${vp.name} RT /: detay → geri, gösterge ve tek kanal korundu ("${await pillState(f)}", ${rt.channelsFor('professional_posts')}, ${page.url()})`);
    for (let k = 0; k < 6; k++) { await navClick(page, k % 2 ? 'works' : 'experts'); await page.waitForTimeout(k * 20); }
    await page.waitForTimeout(1200);
    const p3 = makePost(U2); rt.insert(p3); await page.waitForTimeout(400);
    check(rt.channelsFor('professional_posts') === 1 && await pillState(f) === '3 yeni Post', `${vp.name} RT /: hızlı sekme geçişleri sonrası tek kanal, event alınıyor (${rt.channelsFor('professional_posts')}, "${await pillState(f)}")`);
    await f.click('[data-new-posts]'); await page.waitForTimeout(900);
    const ids = await cardIds(f);
    check(ids.slice(0, 3).sort().join() === [p1.id, p2.id, p3.id].sort().join() && new Set(ids).size === ids.length, `${vp.name} RT /: gösterge tık → yeni Çalışmalar başta`);
    await ctx.close();
  }
}
await browser.close();
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO PAGE ERRORS');
