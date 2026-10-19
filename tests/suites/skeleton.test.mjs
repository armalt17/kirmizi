// v4.26.0 yükleme iskeletleri — hedefli test: şekiller gerçek içeriğe uygun, parıltı çalışıyor, iskelet gecikmeyle belirir.
import { chromium, OUT, U1, check, LAUNCH, setup, frameOf, resetDb } from '../helpers/harness.mjs';
import path from 'node:path';

const SITE = 'https://isgcalisanplatformu.com';
const browser = await chromium.launch(LAUNCH);
try {
  for (const vp of [{ name: 'desktop', width: 1366, height: 900 }, { name: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true }]) {
    const N = vp.name;
    for (const p of ['/', '/uzmanlar', `/profil?id=${U1}`]) {
      resetDb();
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch }); await setup(ctx, true);
      // Liste verisi gecikir: iskelet ekranda kalır
      await ctx.route(/rest\/v1\/(professional_posts|profiles|professional_services)\?/, async r => { if (r.request().method() === 'GET' && !/avatar_url,is_discoverable&id=eq/.test(decodeURIComponent(r.request().url()))) await new Promise(x => setTimeout(x, 6000)); return r.fallback(); });
      const page = await ctx.newPage(); await page.goto(SITE + p);
      const f = await (async () => { for (let i = 0; i < 100; i++) { const x = frameOf(page); if (x) return x; await page.waitForTimeout(50); } })();
      await f.waitForSelector('.k-sk', { state: 'attached' });
      await page.waitForTimeout(1500);
      const r = await f.evaluate(() => {
        const box = e => e && e.getBoundingClientRect(), sk = document.querySelector('.ka-view:not([hidden]) .k-sk');
        const cs = sk && getComputedStyle(sk);
        const ke = document.querySelector('.ka-view:not([hidden]) .ke-sk .k-sk-circle'), kw = document.querySelector('.ka-view:not([hidden]) .kw-sk'), media = kw?.querySelector('.k-sk-media');
        const shorts = [...document.querySelectorAll('.ka-view:not([hidden]) .ke-sk .k-sk:not(.k-sk-circle)')].slice(0, 3).map(e => Math.round(box(e).width));
        return { anim: cs?.animationName, ke: ke && [Math.round(box(ke).width), Math.round(box(ke).height)], cols: kw && getComputedStyle(kw).gridTemplateColumns.split(' ').length,
          media: media && kw && Math.round(box(media).width / (box(kw).width - parseFloat(getComputedStyle(kw).paddingLeft) * 2) * 100), shorts,
          opacity: kw ? getComputedStyle(kw).opacity : document.querySelector('.ka-view:not([hidden]) .kc-sk') && getComputedStyle(document.querySelector('.ka-view:not([hidden]) .kc-sk')).opacity };
      });
      const where = `${N} ${p.split('?')[0]}`;
      check(r.anim === 'k-shine', `${where}: iskelet parıltısı çalışıyor (${r.anim})`);
      check(r.opacity === '1', `${where}: iskelet gecikmeden sonra tam görünür (${r.opacity})`);
      if (p === '/uzmanlar') check(r.ke && r.ke[0] === r.ke[1] && r.ke[0] >= 44 && r.shorts[0] > r.shorts[1], `${where}: avatar yuvarlak ${r.ke?.join('×')}, satırlar kademeli ${r.shorts}`);
      else check(r.cols === 1 && (r.media == null || r.media >= 95), `${where}: gönderi iskeleti tek sütun, görsel alanı tam genişlik (${r.cols} sütun, görsel %${r.media})`);
      await page.screenshot({ path: path.join(OUT, `skeleton-${N}-${p.replace(/\W+/g, '_')}.png`) });
      await ctx.close();
    }
  }
  // Hızlı yüklemede iskelet ilk anda görünmez (0,2 sn gecikme)
  {
    resetDb();
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } }); await setup(ctx, true);
    await ctx.route(/rest\/v1\/professional_posts\?/, async r => { await new Promise(x => setTimeout(x, 3000)); return r.fallback(); });
    const page = await ctx.newPage(); await page.goto(SITE + '/');
    const f = await (async () => { for (let i = 0; i < 100; i++) { const x = frameOf(page); if (x) return x; await page.waitForTimeout(20); } })();
    await f.waitForSelector('[data-view="works"]:not([hidden]) .kw-sk', { timeout: 5000 });
    const early = await f.evaluate(() => { const c = getComputedStyle(document.querySelector('[data-view="works"] .kw-sk')); return { name: c.animationName, delay: parseFloat(c.animationDelay) * 1000, fill: c.animationFillMode }; });
    check(early.name === 'k-skin' && early.delay >= 150 && early.fill === 'both', `iskelet belirme gecikmesi ${early.delay} ms, başlangıçta görünmez (fill ${early.fill}) — hızlı yüklemede titreme yok`);
    await ctx.close();
  }
} finally {
  await browser.close();
}
