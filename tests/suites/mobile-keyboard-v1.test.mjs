// Mobil klavye modu (v4.43.0) — giriş, kayıt ve Post yazma pencerelerinde odaktaki alan klavyenin üstünde kalır.
// iOS (görünen alan klavyeyi bildirmez → tahmin) ve Android (görünen alan küçülür) iki durumu ayrı ayrı denenir.
import { chromium, OUT, check, LAUNCH, setup, frameOf, resetDb } from '../helpers/harness.mjs';
import path from 'node:path';

const SITE = 'https://isgcalisanplatformu.com';
const W = 390, H = 844, KB = 0.55;   // iOS tahmini: klavye ekranın alt ~%45'i
const settle = (page, ms = 500) => page.waitForTimeout(ms);
// Alanın üst dokümandaki konumu (iframe + görsel viewport)
const rectOf = (page, sel) => page.evaluate(s => {
  const fr = document.querySelector('iframe'), el = fr.contentDocument.querySelector(s); if (!el) return null;
  const a = el.getBoundingClientRect(), f = fr.getBoundingClientRect(), vv = window.visualViewport;
  return { top: f.top + a.top - (vv?.offsetTop || 0), bottom: f.top + a.bottom - (vv?.offsetTop || 0), vh: vv?.height || innerHeight };
}, sel);
const dlgState = (f, id) => f.evaluate(i => { const d = document.getElementById(i); return { open: d.open, kb: 'kb' in d.dataset, art: !!d.querySelector('.k-login-art') && getComputedStyle(d.querySelector('.k-login-art')).display !== 'none' }; }, id);

const browser = await chromium.launch(LAUNCH);
try {
  for (const mode of ['ios', 'android']) {
    resetDb();
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true });
    await setup(ctx, false);
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.goto(`${SITE}/`); await settle(page, 1200);
    const f = frameOf(page);
    // Android: klavye görsel viewport'u küçültür (Playwright'ta viewport küçültülerek taklit edilir)
    const keyboard = async on => { if (mode === 'android') { await page.setViewportSize({ width: W, height: on ? Math.round(H * KB) : H }); await settle(page, 300); } };
    const limit = () => (mode === 'android' ? Math.round(H * KB) : Math.round(H * KB));

    // ---- Giriş ----
    await page.evaluate(() => document.getElementById('kisg-pro-nav').shadowRoot.querySelector('[data-action="login"]').click());
    await f.waitForFunction(() => document.getElementById('kaLoginDialog').open); await settle(page, 600);
    // Pencere açılınca e-posta kendiliğinden odaklanır (mobilde klavye hemen açılır) → doğrudan klavye modu
    check(await f.evaluate(() => document.activeElement?.id) === 'kaLoginEmail' && (await dlgState(f, 'kaLoginDialog')).kb, `${mode}: giriş açılınca e-posta odakta, pencere doğrudan klavye modunda`);
    await f.focus('#kaLoginEmail'); await keyboard(true); await settle(page, 1000);
    let st = await dlgState(f, 'kaLoginDialog'), r = await rectOf(page, '#kaLoginEmail'), d = await rectOf(page, '#kaLoginDialog');
    check(st.kb && !st.art, `${mode}: e-postaya odak → klavye modu, dekoratif üst bant gizli`);
    check(r && r.top >= 0 && r.bottom <= limit(), `${mode}: e-posta alanı klavyenin üstünde (${Math.round(r?.top)}–${Math.round(r?.bottom)} / sınır ${limit()})`);
    check(d && d.top <= 80, `${mode}: pencere görünen alanın üstüne yaslı (üst ${Math.round(d?.top)}px)`);
    await page.screenshot({ path: path.join(OUT, `kb-${mode}-login.png`) });
    await f.focus('#kaLoginPassword'); await settle(page, 700);
    r = await rectOf(page, '#kaLoginPassword');
    check((await dlgState(f, 'kaLoginDialog')).kb && r.bottom <= limit() && r.top >= 0, `${mode}: şifre alanına geçince de görünür (${Math.round(r.bottom)})`);
    const sub = await rectOf(page, '#kaLoginSubmit');
    check(sub && sub.bottom <= limit() + 2, `${mode}: "Giriş Yap" düğmesi klavyenin üstünde (${Math.round(sub?.bottom)})`);

    // ---- Kayıt ----
    await f.click('[data-auth-go="signup"]'); await settle(page, 500);
    const fields = await f.$$eval('#kaSignupForm input:not([type="checkbox"]):not([type="hidden"])', els => els.filter(e => e.offsetParent).map(e => '#' + e.id));
    let okAll = true, worst = '';
    for (const sel of fields) {
      await f.focus(sel); await settle(page, 700);
      const q = await rectOf(page, sel);
      if (!(q && q.top >= 0 && q.bottom <= limit())) { okAll = false; worst = `${sel} ${Math.round(q?.top)}–${Math.round(q?.bottom)}`; }
    }
    check(fields.length >= 3 && okAll, `${mode}: kayıt formundaki ${fields.length} alanın her biri odakta klavyenin üstünde ${worst}`);
    await page.screenshot({ path: path.join(OUT, `kb-${mode}-signup.png`) });
    // Klavye kapanınca pencere eski düzenine döner
    await f.evaluate(() => document.activeElement.blur()); await keyboard(false); await settle(page, 900);
    st = await dlgState(f, 'kaLoginDialog'); const back = await rectOf(page, '#kaLoginDialog');
    check(!st.kb && back.bottom >= H - 4, `${mode}: odak çıkınca klavye modu kalkar, alt sayfa düzenine döner`);
    await f.evaluate(() => document.querySelector('#kaLoginDialog [data-close]').click()); await settle(page, 300);
    check(errs.length === 0, `${mode}: sayfa hatası yok ${errs.join(' ')}`);
    await ctx.close();
  }

  // ---- Post yazma (oturum açık) ----
  for (const mode of ['ios', 'android']) {
    resetDb();
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true });
    await setup(ctx, true);
    const page = await ctx.newPage();
    await page.goto(`${SITE}/`); await settle(page, 1200);
    const f = frameOf(page);
    await f.click('[data-view="works"] .kw-composer-main'); await f.waitForFunction(() => document.getElementById('kaPostDialog').open); await settle(page, 600);
    await f.focus('#kaPostContent');
    if (mode === 'android') await page.setViewportSize({ width: W, height: Math.round(H * KB) });
    await settle(page, 1000);
    const st = await dlgState(f, 'kaPostDialog'), t = await rectOf(page, '#kaPostContent');
    check(st.kb && t && t.top >= 0 && t.top <= Math.round(H * KB) - 60, `${mode}: Post metni alanı klavyenin üstünde başlıyor (${Math.round(t?.top)})`);
    await f.type('#kaPostContent', 'Sahada bugün iskele kontrolü yaptık.\n'.repeat(12)); await settle(page, 600);
    const caret = await page.evaluate(() => { const fr = document.querySelector('iframe'), d = fr.contentDocument.getElementById('kaPostDialog'); return fr.getBoundingClientRect().top + d.getBoundingClientRect().top; });
    check(caret >= -2 && caret <= 80, `${mode}: uzun yazıda pencere üstte kalıyor (${Math.round(caret)})`);
    await page.screenshot({ path: path.join(OUT, `kb-${mode}-post.png`) });
    await ctx.close();
  }
  // ---- Masaüstü etkilenmez ----
  {
    resetDb();
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await setup(ctx, false);
    const page = await ctx.newPage(); await page.goto(`${SITE}/`); await settle(page, 1200);
    const f = frameOf(page);
    await page.evaluate(() => document.getElementById('kisg-pro-nav').shadowRoot.querySelector('[data-action="login"]').click());
    await f.waitForFunction(() => document.getElementById('kaLoginDialog').open); await f.focus('#kaLoginEmail'); await settle(page, 600);
    check(!(await dlgState(f, 'kaLoginDialog')).kb, 'masaüstü: klavye modu devreye girmez (görünüm aynı)');
    await ctx.close();
  }
} finally {
  await browser.close();
}
