// Kaynak: geçici /tmp/claude-0/pkg/overlay.mjs — v4.12.0 güvenlik ağı olarak kalıcılaştırıldı.
import { chromium, fs, ROOT, APP, NM, OUT, U1, U2, now, iso, db, writes, uploads, IMG, DB0, resetDb, cursorOr, filterRows, seq, orderRows, withEmbeds, handleRest, libs, HOSTINGER_BASE_CSS, hostPage, errors, realtimeMock, postSeq, makePost, setup, frameOf, check, DEFAULT_CHROMIUM, LAUNCH } from '../helpers/harness.mjs';
import { b64, tokenFor, uidOf, uidSeq, authMock, boot, acct, paneOf, errOf, navLogin, go, submitPane, fillSignup, visibleView, navClick, settle, flag, noProfileInsert } from '../helpers/auth.mjs';

// ===== Guest auth / overlay: Hostinger benzeri html,body{height:100%} =====
const HOSTINGER_CSS = 'html,body{height:100%}';
async function hostinger(ctx) { await ctx.route('https://isgcalisanplatformu.com/**', r => r.fulfill({ contentType: 'text/html', body: hostPage(new URL(r.request().url()).pathname).replace('<style>', `<style>${HOSTINGER_CSS}`) })); }
// Görünen alanın alt kısmı boyanıyor mu? (iframe dokümanı + üst doküman, ekran koordinatlarında örnek noktalar)
const coverage = page => page.evaluate(() => {
  const vh = innerHeight, fr = document.querySelector('iframe').getBoundingClientRect(), pts = [0.55, 0.75, 0.9, 0.98].map(k => Math.round(vh * k));
  return { vh, frTop: Math.round(fr.top), frBottom: Math.round(fr.bottom), bodyH: Math.round(document.body.getBoundingClientRect().height), pts: pts.map(y => { const el = document.elementFromPoint(Math.round(innerWidth / 2), y); return el?.tagName === 'IFRAME' ? 'iframe' : (el?.tagName || 'none').toLowerCase(); }) };
});
const openDialogs = f => f.evaluate(() => [...document.querySelectorAll('dialog[open]')].map(d => d.id));
const browser = await chromium.launch(LAUNCH);
for (const vp of [{ name: 'desktop', width: 1600, height: 760 }, { name: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true }]) {
  const N = vp.name;
  resetDb();
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch });
  await setup(ctx, false); await hostinger(ctx);
  const auth = authMock(ctx); await auth.ready;
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`overlay ${N}: ${e.message}`));
  await page.goto('https://isgcalisanplatformu.com/'); await settle(page, 1200);
  const f = frameOf(page); await f.waitForSelector('[data-view="works"] [data-post-id]');
  const imgPid = await f.evaluate(() => document.querySelector('[data-view="works"] [data-post-id] [data-media]')?.closest('[data-post-id]').dataset.postId);
  await f.evaluate(id => document.querySelector(`[data-view="works"] [data-post-id="${id}"]`).scrollIntoView({ block: 'center' }), imgPid); await settle(page, 300);
  const y0 = await page.evaluate(() => scrollY), url0 = page.url(), hist0 = await page.evaluate(() => history.length);
  // A) Misafir beğeni → giriş penceresi: görünen alanın tamamı kaplı (beyaz boşluk yok)
  await f.evaluate(() => { const b = [...document.querySelectorAll('[data-view="works"] [data-post-action="like"]')].find(x => { const r = x.getBoundingClientRect(); return r.top > 0; }); b.click(); }); await settle(page, 700);
  let cov = await coverage(page);
  await page.screenshot({ path: `${OUT}/overlay-login-${N}.png` });
  check(await paneOf(f) === 'login' && cov.pts.every(p => p === 'iframe'), `${N} misafir beğeni → giriş: görünen alan tamamen kaplı, beyaz boşluk yok ${JSON.stringify(cov)}`);
  const dr = await f.evaluate(() => document.getElementById('kaLoginDialog').getBoundingClientRect().toJSON()), fr0 = await page.evaluate(() => document.querySelector('iframe').getBoundingClientRect().top);
  check(fr0 + dr.top >= 0 && fr0 + dr.bottom <= vp.height + 1, `${N} giriş penceresi görünen alanın içinde (${Math.round(fr0 + dr.top)}–${Math.round(fr0 + dr.bottom)} / ${vp.height})`);
  // iptal → temiz dönüş
  await page.keyboard.press('Escape'); await settle(page, 500);
  check(await paneOf(f) === '' && Math.abs(await page.evaluate(() => scrollY) - y0) < 3 && page.url() === url0 && await page.evaluate(() => getComputedStyle(document.body).position) !== 'fixed' && (await openDialogs(f)).length === 0, `${N} giriş iptal: aynı sayfa/scroll, kilit kalktı, açık dialog yok`);
  // B) Görüntüleyici açıkken auth gerektiren aksiyon → görüntüleyici kapanır, yalnız giriş penceresi kalır, geçmiş temiz
  await f.evaluate(id => document.querySelector(`[data-view="works"] [data-post-id="${id}"] [data-media]`).click(), imgPid); await settle(page, 600);
  cov = await coverage(page);
  await page.screenshot({ path: `${OUT}/overlay-viewer-${N}.png` });
  check((await openDialogs(f)).join() === 'kaMediaDialog' && cov.pts.every(p => p === 'iframe'), `${N} görüntüleyici: tam kaplı, beyaz boşluk yok ${JSON.stringify(cov.pts)}`);
  const sidesVisible = await page.evaluate(() => { const h = document.getElementById('kisg-pro-sides'); if (!h) return 'yok'; const s = [...h.shadowRoot.querySelectorAll('.kw-side')]; return s.some(x => getComputedStyle(x).visibility !== 'hidden' && x.getBoundingClientRect().width > 0) ? 'görünür' : 'gizli'; });
  check(sidesVisible !== 'görünür', `${N} görüntüleyici açıkken yan paneller dialogun üstüne binmiyor (${sidesVisible})`);
  await f.evaluate(id => { const c = document.querySelector(`[data-view="works"] [data-post-id="${id}"] [data-post-action="like"]`); c?.click(); }, imgPid); await settle(page, 900);
  const dlgs = await openDialogs(f);
  check(dlgs.join() === 'kaLoginDialog', `${N} görüntüleyici + auth aksiyonu: yalnız giriş penceresi açık (${dlgs.join() || 'yok'})`);
  check(page.url() === url0 && await page.evaluate(() => !history.state?.kisgModal), `${N} görüntüleyici kapanınca modal geçmiş kaydı temizlendi`);
  // başarılı giriş → bekleyen aksiyon (beğeni) tamamlanır
  writes.length = 0;
  await f.fill('#kaLoginEmail', 'a@b.c'); await f.fill('#kaLoginPassword', 'dogru-sifre'); await submitPane(f, 'login'); await settle(page, 1300);
  check(await acct(page) === 'user' && (await openDialogs(f)).length === 0 && writes.some(w => w.table === 'professional_post_likes' && w.body?.post_id === imgPid), `${N} başarılı giriş: bekleyen beğeni tamamlandı, açık overlay yok`);
  check(Math.abs(await page.evaluate(() => scrollY) - y0) < 3 && await page.evaluate(() => getComputedStyle(document.body).position) !== 'fixed', `${N} giriş sonrası scroll korundu, kilit kalktı`);
  // geri tuşu: uygulama içi geçmiş temiz — Uzmanlar → Akış → geri → Uzmanlar (overlay yeniden açılmaz)
  await navClick(page, 'experts'); await settle(page, 500); await navClick(page, 'works'); await settle(page, 500);
  await page.goBack(); await settle(page, 600);
  check(page.url().endsWith('/uzmanlar') && (await openDialogs(f)).length === 0, `${N} geri tuşu: önceki görünüm, overlay yeniden açılmadı (${page.url()})`);
  await page.goForward(); await settle(page, 600);
  check(page.url() === url0 && (await openDialogs(f)).length === 0, `${N} ileri: Akış, overlay yok`);
  // C) Görüntüleyici açık → Esc → login yok; tekrar giriş penceresini nav'dan aç → X ile iptal
  await page.evaluate(() => { const n = document.getElementById('kisg-pro-nav').shadowRoot; n.querySelector('[data-popover-trigger]')?.click(); n.querySelector('[data-action="signout"]')?.click(); }); await settle(page, 800);
  await f.evaluate(id => document.querySelector(`[data-view="works"] [data-post-id="${id}"] [data-media]`).click(), imgPid); await settle(page, 500);
  await page.keyboard.press('Escape'); await settle(page, 400);
  await navLogin(page); await settle(page, 500);
  check((await openDialogs(f)).join() === 'kaLoginDialog' && (await coverage(page)).pts.every(p => p === 'iframe'), `${N} görüntüleyici kapatıldıktan sonra giriş: tek dialog, tam kaplı`);
  await f.click('#kaLoginDialog [data-close]'); await settle(page, 400);
  check((await openDialogs(f)).length === 0 && await page.evaluate(() => getComputedStyle(document.body).position) !== 'fixed', `${N} X ile iptal: temiz`);
  await ctx.close();
}
await browser.close();
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO PAGE ERRORS');
