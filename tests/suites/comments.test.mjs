// Kaynak: geçici /tmp/claude-0/pkg/comments.mjs — v4.12.0 güvenlik ağı olarak kalıcılaştırıldı.
import { chromium, fs, ROOT, APP, NM, OUT, U1, U2, now, iso, db, writes, uploads, IMG, DB0, resetDb, cursorOr, filterRows, seq, orderRows, withEmbeds, handleRest, libs, HOSTINGER_BASE_CSS, hostPage, errors, realtimeMock, postSeq, makePost, setup, frameOf, check, DEFAULT_CHROMIUM, LAUNCH } from '../helpers/harness.mjs';

const browser = await chromium.launch(LAUNCH);
const P5 = 'bbbbbbbb-0000-4000-8000-000000000005', P6 = 'bbbbbbbb-0000-4000-8000-000000000006';
for (const vp of [{ name: 'desktop', width: 1366, height: 900 }, { name: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true }]) {
  resetDb();
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch });
  await setup(ctx, true);
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`yorum ${vp.name}: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push(`yorum ${vp.name} console: ${m.text()}`); });
  await page.goto('https://isgcalisanplatformu.com/'); await page.waitForTimeout(1000);
  const f = frameOf(page);
  await f.waitForSelector(`[data-view="works"] [data-post-id="${P5}"]`);
  await page.waitForTimeout(500);
  check(await f.locator(`[data-view="works"] [data-post-id="${P5}"] .cp`).count() === 1 && (await f.textContent(`[data-view="works"] [data-post-id="${P5}"] .cp-text`)) === 'Teşekkürler, çok faydalı oldu.' && (await f.textContent(`[data-view="works"] [data-post-id="${P5}"] .cp-all`)).startsWith('3 yorumun tümünü gör'), `${vp.name} yorum: akışta en güncel yorum önizlemesi + doğru toplam (sayaç dizisi boş olsa da)`);
  const mark = await page.evaluate(() => window.__bootMark);
  await f.evaluate(id => document.querySelector(`[data-view="works"] [data-post-id="${id}"] a.kw-post-detail`).click(), P5);
  await f.waitForSelector(`[data-view="work"] [data-post-id="${P5}"]`);
  await page.waitForTimeout(700);
  const texts = await f.locator('[data-view="work"] .cm-text').allTextContents();
  check(texts.length === 3 && texts.includes('Tatbikat planını paylaşır mısınız?') && !texts.includes('Silinmiş yorum'), `${vp.name} yorum: detayda mevcut 3 aktif yorum görünüyor, silinen yok (${texts.length})`);
  check(await f.locator('[data-view="work"] .cm-item').first().isVisible(), `${vp.name} yorum: yorumlar görünür`);
  // yeni yorum
  writes.length = 0;
  await f.fill('[data-view="work"] .cm-compose textarea', 'Detay testi yorumu');
  await f.click('[data-view="work"] .cm-send'); await page.waitForTimeout(500);
  check(writes.some(w => w.table === 'professional_post_comments' && w.body?.content === 'Detay testi yorumu' && w.body?.post_id === P5 && w.body?.status === 'active'), `${vp.name} yorum: yeni yorum yazıldı`);
  check((await f.locator('[data-view="work"] .cm-text').allTextContents()).includes('Detay testi yorumu'), `${vp.name} yorum: yeni yorum listede`);
  // yorum beğenisi (bigint kimlik)
  writes.length = 0;
  await f.click('[data-view="work"] [data-comment-like="12"]'); await page.waitForTimeout(500);
  check(writes.some(w => w.table === 'professional_comment_likes' && w.body?.comment_id === 12 && w.body?.user_id === U1), `${vp.name} yorum: bigint kimlikli yoruma beğeni yazıldı`);
  check(await f.getAttribute('[data-view="work"] [data-comment-like="12"]', 'aria-pressed') === 'true', `${vp.name} yorum: beğeni durumu işaretli`);
  // geri → tekrar detay
  await page.goBack(); await page.waitForTimeout(500);
  check(page.url().endsWith('isgcalisanplatformu.com/'), `${vp.name} yorum: geri → akış`);
  await f.evaluate(id => document.querySelector(`[data-view="works"] [data-post-id="${id}"] a.kw-post-detail`).click(), P5);
  await f.waitForSelector(`[data-view="work"] [data-post-id="${P5}"] .cm-item`); await page.waitForTimeout(700);
  const again = await f.locator('[data-view="work"] .cm-text').allTextContents();
  check(again.length === 4 && again.includes('Detay testi yorumu'), `${vp.name} yorum: tekrar detayda 4 yorum (yeni dahil)`);
  check(await f.getAttribute('[data-view="work"] [data-comment-like="12"]', 'aria-pressed') === 'true', `${vp.name} yorum: tekrar detayda beğeni korunuyor`);
  check(await page.evaluate(() => window.__bootMark) === mark, `${vp.name} yorum: akış boyunca reload yok`);
  // sayaç bayat 0 olan Çalışma
  await page.goto(`https://isgcalisanplatformu.com/calisma-detay?id=${P6}`); await page.waitForTimeout(1200);
  const g = frameOf(page);
  await g.waitForSelector(`[data-view="work"] [data-post-id="${P6}"]`); await page.waitForTimeout(500);
  check((await g.locator('[data-view="work"] .cm-text').allTextContents()).includes('Sayaçta görünmeyen mevcut yorum.'), `${vp.name} yorum: sayaç 0 dönse de mevcut yorum görünüyor`);
  // refresh
  await page.goto(`https://isgcalisanplatformu.com/calisma-detay?id=${P5}`); await page.waitForTimeout(600); await page.reload(); await page.waitForTimeout(1200);
  const h = frameOf(page);
  await h.waitForSelector(`[data-view="work"] [data-post-id="${P5}"]`); await page.waitForTimeout(600);
  check((await h.locator('[data-view="work"] .cm-text').allTextContents()).length === 4, `${vp.name} yorum: refresh sonrası 4 yorum`);
  await ctx.close();
}
await browser.close();
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO PAGE ERRORS');
