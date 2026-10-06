// Kaydedilenler V1 (v4.38.0) — Post/Hizmet kartında Kaydet, hesap menüsünde Kaydedilenler, /?sayfa=kaydedilenler
// (Postlar | Hizmetler), yayından kalkan içerik, misafir, migration öncesi.
import { chromium, db, writes, check, LAUNCH, setup, frameOf, resetDb, U1 } from '../helpers/harness.mjs';

const SITE = 'https://isgcalisanplatformu.com';
const SVC = 'aaaaaaaa-0000-4000-8000-000000000001';
const settle = (page, ms = 700) => page.waitForTimeout(ms);
const until = async (fn, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await new Promise(r => setTimeout(r, 80)); } return false; };
const H = { 'access-control-allow-origin': '*' };
const nav = (page, sel) => page.evaluate(s => { const r = document.getElementById('kisg-pro-nav').shadowRoot; r.querySelector('.ka-account-toggle').click(); r.querySelector(s).click(); }, sel);
const savedWrites = () => writes.filter(w => w.table === 'professional_saved_items');

const browser = await chromium.launch(LAUNCH);
try {
  // ---------- giriş yapmış kullanıcı ----------
  for (const vp of [{ name: 'desktop', width: 1366, height: 900 }, { name: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true }]) {
    const N = vp.name;
    resetDb(); db.professional_saved_items = [];
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch });
    await setup(ctx, true);
    const reads = []; ctx.on('request', r => { if (r.method() === 'GET' && r.url().includes('/professional_saved_items')) reads.push(decodeURIComponent(r.url())); });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.goto(`${SITE}/`); await settle(page, 1500);
    const f = frameOf(page);
    await f.waitForSelector('[data-view="works"] [data-post-id] [data-save]');
    const PID = await f.evaluate(() => document.querySelector('[data-view="works"] [data-post-id] [data-save]').closest('[data-post-id]').dataset.postId);
    const btn = `[data-view="works"] [data-post-id="${PID}"] [data-save]`;
    const st0 = await f.evaluate(s => { const b = document.querySelector(s), r = b.getBoundingClientRect(), row = b.closest('.kw-post-actions'); return { pressed: b.getAttribute('aria-pressed'), label: b.getAttribute('aria-label'), vis: r.width > 0, fits: row.scrollWidth <= row.clientWidth + 1, count: /\d/.test(b.textContent) }; }, btn);
    check(st0.pressed === 'false' && st0.label === 'Kaydet' && st0.vis && st0.fits && !st0.count, `${N} Post kartında Kaydet (sayı yok, satıra sığıyor) ${JSON.stringify(st0)}`);
    check(reads.some(u => u.includes(`user_id=eq.${U1}`)), `${N} kayıtlar yalnız kendi kullanıcı kimliğiyle okunur`);
    const url0 = page.url(); writes.length = 0;
    await f.click(btn);
    check(await until(() => f.evaluate(s => document.querySelector(s).getAttribute('aria-pressed') === 'true', btn)) && page.url() === url0, `${N} Post kaydedildi, kart detaya gitmedi`);
    const w = savedWrites()[0];
    check(w && w.body.user_id === U1 && w.body.target_type === 'post' && w.body.target_id === PID && Object.keys(w.body).length === 3, `${N} yazım: user_id + post + kimlik ${JSON.stringify(w?.body)}`);
    check(await until(() => f.evaluate(() => /Kaydedildi/.test(document.querySelector('[data-toast]')?.textContent || ''))), `${N} "Kaydedildi" bildirimi`);

    // Hizmet Bul kartı
    await page.goto(`${SITE}/hizmetler`); await settle(page, 1500);
    const g = frameOf(page);
    const sbtn = `[data-view="services"] [data-service-id="${SVC}"] [data-save]`;
    await g.waitForSelector(sbtn);
    const url1 = page.url();
    await g.click(sbtn);
    check(await until(() => g.evaluate(s => document.querySelector(s).getAttribute('aria-pressed') === 'true', sbtn)) && page.url() === url1 && savedWrites().some(x => x.body?.target_type === 'service' && x.body.target_id === SVC), `${N} Hizmet kartında kaydet: kaydedildi, detaya gitmedi`);
    // Hizmet Detay'da da aynı durum
    await g.click(`[data-view="services"] [data-service-id="${SVC}"] h2`); await settle(page, 1200);
    check(await until(() => g.evaluate(() => document.querySelector('[data-view="service"] .kh-actions [data-save]')?.getAttribute('aria-pressed') === 'true')), `${N} Hizmet Detay'da "Kaydedildi" durumu`);

    // Hesap menüsü → Kaydedilenler
    const menu = await page.evaluate(() => [...document.getElementById('kisg-pro-nav').shadowRoot.querySelectorAll('#kaAccountMenu a, #kaAccountMenu button')].map(x => x.textContent.trim()));
    check(menu.indexOf('Kaydedilenler') === menu.indexOf('Hizmetlerim') + 1, `${N} hesap menüsünde "Hizmetlerim" altında "Kaydedilenler" (${menu.join(' | ')})`);
    const mark = await page.evaluate(() => (window.__bootMark = Math.random()));
    await nav(page, '#kaAccountMenu [data-view-link="saved"]');
    check(await until(() => page.evaluate(() => location.search === '?sayfa=kaydedilenler')) && await page.evaluate(() => window.__bootMark) === mark, `${N} Kaydedilenler shell içinde açıldı (yeniden yükleme yok)`);
    await g.waitForSelector('[data-view="saved"]:not([hidden]) [data-saved-posts] [data-post-id]');
    const sv = await g.evaluate(() => { const el = document.querySelector('[data-view="saved"]'); return { tabs: [...el.querySelectorAll('[data-saved-tab]')].map(b => b.textContent), posts: [...el.querySelectorAll('[data-saved-posts] [data-post-id]')].map(x => x.dataset.postId), like: !!el.querySelector('[data-saved-posts] [data-post-action="like"], [data-saved-posts] [data-like-static]'), pressed: el.querySelector('[data-saved-posts] [data-save]')?.getAttribute('aria-pressed') }; });
    check(JSON.stringify(sv.tabs) === '["Postlar1","Hizmetler1"]' && sv.posts.join() === PID && sv.like && sv.pressed === 'true', `${N} Kaydedilenler: Postlar | Hizmetler, aynı Post kartı (beğeni, kaydet) ${JSON.stringify(sv)}`);
    await g.click('[data-saved-tab="services"]');
    check(await until(() => g.evaluate(id => !!document.querySelector(`[data-saved-services] [data-service-id="${id}"]`) && document.querySelector('[data-saved-panel="posts"]').hidden, SVC)), `${N} Hizmetler sekmesi: aynı Hizmet kartı`);
    // sayfa içinde kayıttan çıkar → listeden düşer
    writes.length = 0;
    await g.click(`[data-saved-services] [data-service-id="${SVC}"] [data-save]`);
    check(await until(() => g.evaluate(() => !document.querySelector('[data-saved-services] [data-service-id]') && !document.querySelector('[data-saved-empty]').hidden)) && savedWrites().some(x => x.del && x.del.includes('target_type=eq.service') && x.del.includes(`user_id=eq.${U1}`)), `${N} kayıttan çıkarılan hizmet listeden düştü, boş durum`);
    check(/Henüz kaydettiğin hizmet yok/.test(await g.textContent('[data-saved-empty]')), `${N} boş durum metni`);

    // yayından kalkan Post
    db.professional_posts.find(p => p.id === PID).status = 'hidden';
    await page.goto(`${SITE}/?sayfa=kaydedilenler`); await settle(page, 1800);
    const k = frameOf(page);
    const gone = await k.evaluate(() => ({ vis: !document.querySelector('[data-saved-gone]').hidden, text: document.querySelector('[data-saved-gone]').textContent, posts: document.querySelectorAll('[data-saved-posts] [data-post-id]').length }));
    check(gone.vis && /1 kayıt artık yayında değil/.test(gone.text) && gone.posts === 0, `${N} yayından kalkan Post gösterilmez, "1 kayıt artık yayında değil" ${JSON.stringify(gone)}`);
    writes.length = 0;
    await k.click('[data-saved-clean]');
    check(await until(() => k.evaluate(() => document.querySelector('[data-saved-gone]').hidden)) && savedWrites().some(x => x.del && x.del.includes(PID)) && db.professional_saved_items.length === 0, `${N} "Listeden kaldır" yayında olmayan kaydı sildi`);
    db.professional_posts.find(p => p.id === PID).status = 'active';

    // yenileme: kayıt kalıcı
    db.professional_saved_items.push({ user_id: U1, target_type: 'post', target_id: PID });
    await page.goto(`${SITE}/`); await settle(page, 1800);
    const m = frameOf(page);
    check(await until(() => m.evaluate(s => document.querySelector(s)?.getAttribute('aria-pressed') === 'true', btn)), `${N} sayfa yenilenince kayıt durumu korunur`);
    if (vp.isMobile) {
      await page.setViewportSize({ width: 320, height: 700 }); await settle(page, 500);
      const fit = await m.evaluate(() => [...document.querySelectorAll('[data-view="works"] .kw-post-actions')].every(r => r.scrollWidth <= r.clientWidth + 1) && document.documentElement.scrollWidth <= innerWidth);
      check(fit, `${N} 320px: eylem satırı (Beğen · Yorum · Kaydet · Paylaş) taşmıyor`);
    }
    check(errs.length === 0, `${N} sayfa hatası yok ${errs.join(' ')}`);
    await ctx.close();
  }

  // ---------- misafir ----------
  {
    resetDb(); db.professional_saved_items = [];
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await setup(ctx, false);
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.goto(`${SITE}/`); await settle(page, 1500);
    const f = frameOf(page);
    await f.waitForSelector('[data-view="works"] [data-post-id] [data-save]');
    writes.length = 0;
    await f.click('[data-view="works"] [data-post-id] [data-save]');
    check(await until(() => f.evaluate(() => document.getElementById('kaLoginDialog').open)) && !savedWrites().length, 'misafir: Kaydet giriş penceresini açar, yazım yok');
    await f.evaluate(() => document.getElementById('kaLoginDialog').close());
    await page.goto(`${SITE}/?sayfa=kaydedilenler`); await settle(page, 1500);
    const g = frameOf(page);
    check(/giriş yap/i.test(await g.textContent('[data-saved-empty]')) && await g.isVisible('[data-saved-empty] [data-action="login"]'), 'misafir: Kaydedilenler giriş ister');
    check(errs.length === 0, `misafir: sayfa hatası yok ${errs.join(' ')}`);
    await ctx.close();
  }

  // ---------- migration öncesi: tablo yok ----------
  {
    resetDb();
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await setup(ctx, true);
    await ctx.route('https://twaptpofhbnnfciowoig.supabase.co/rest/v1/professional_saved_items*', r => r.fulfill({ status: 404, headers: H, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST205', message: "Could not find the table 'public.professional_saved_items' in the schema cache" }) }));
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.goto(`${SITE}/`); await settle(page, 1800);
    const f = frameOf(page);
    check(await until(() => f.evaluate(() => { const b = [...document.querySelectorAll('[data-view="works"] [data-save]')]; return b.length > 0 && b.every(x => x.hidden); })) && errs.length === 0, 'tablo yoksa Kaydet düğmeleri gizli, akış çalışır, hata yok');
    await ctx.close();
  }
} finally {
  await browser.close();
}
