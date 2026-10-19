// Onaylı hesap V1 (v4.41.0) — kırmızı rozet (Akış, Hizmetler, Profil), Hizmetler "Onaylı hesaplar" filtresi,
// profilde başvuru penceresi (Pro değil → uygulama; Pro → belge yükle → inceleniyor), migration öncesi görünmezlik.
import { chromium, db, rpcCalls, uploads, check, LAUNCH, setup, frameOf, resetDb, U1, U2, IMG } from '../helpers/harness.mjs';

const SITE = 'https://isgcalisanplatformu.com';
const settle = (page, ms = 700) => page.waitForTimeout(ms);
const until = async (fn, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await new Promise(r => setTimeout(r, 80)); } return false; };
// rozet: ::after görünür ve arka planı rozet görseli
const badge = (f, sel) => f.evaluate(s => [...document.querySelectorAll(s)].map(e => { const c = getComputedStyle(e, '::after'); return c.display !== 'none' && c.backgroundImage.includes('d1121e'); }), sel);
const prof = id => db.profiles.find(p => p.id === id);

const browser = await chromium.launch(LAUNCH);
try {
  for (const vp of [{ name: 'desktop', width: 1366, height: 900 }, { name: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true }]) {
    const N = vp.name;
    resetDb(); db._verified = [U2]; db.professional_verifications = [];
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch });
    await setup(ctx, true);
    const reqs = []; ctx.on('request', r => { if (r.url().includes('/professional_services')) reqs.push(decodeURIComponent(r.url())); });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e)));

    // ---- Akış ----
    await page.goto(`${SITE}/`); await settle(page, 1500);
    const f = frameOf(page);
    await f.waitForSelector('[data-view="works"] .kw-post-author-link');
    check(await until(async () => (await badge(f, `[data-view="works"] .kw-post-author-link[data-vu="${U2}"]`)).every(Boolean)), `${N} Akış: onaylı (U2) Post sahibinin adında kırmızı rozet`);
    check((await badge(f, `[data-view="works"] .kw-post-author-link[data-vu="${U1}"]`)).every(x => !x), `${N} Akış: onaysız (U1) adda rozet yok`);

    // ---- Hizmetler ----
    await page.goto(`${SITE}/hizmetler`); await settle(page, 1500);
    const g = frameOf(page);
    await g.waitForSelector('[data-view="services"] [data-service-id]');
    check(await until(async () => (await badge(g, `[data-view="services"] .ks-meta [data-vu="${U2}"]`)).every(Boolean) && (await badge(g, `[data-view="services"] .ks-meta [data-vu="${U1}"]`)).every(x => !x)), `${N} Hizmet kartı: yalnız onaylı sağlayıcıda rozet`);
    check(await until(() => g.evaluate(() => !!document.querySelector('[data-vchip]'))), `${N} Hizmetler: "Onaylı hesaplar" seçeneği`);
    const all = await g.evaluate(() => document.querySelectorAll('[data-view="services"] [data-results] [data-service-id]').length);
    reqs.length = 0;
    await g.click('[data-vchip]');
    check(await until(() => g.evaluate(u2 => { const c = [...document.querySelectorAll('[data-view="services"] [data-results] [data-service-id]')]; return c.length > 0 && c.every(x => x.querySelector(`[data-vu="${u2}"]`)); }, U2)), `${N} filtre açık: yalnız onaylı hesapların hizmetleri`);
    check(reqs.some(u => u.includes(`user_id=in.(${U2})`)) && await g.evaluate(() => document.querySelector('[data-vchip]').getAttribute('aria-pressed')) === 'true', `${N} sorgu user_id=in.(onaylılar), seçenek basılı`);
    await g.click('[data-vchip]');
    check(await until(() => g.evaluate(n => document.querySelectorAll('[data-view="services"] [data-results] [data-service-id]').length === n, all)), `${N} filtre kapanınca tüm hizmetler`);

    // ---- başka kullanıcının profili ----
    await page.goto(`${SITE}/profil?id=${U2}`); await settle(page, 1500);
    const h = frameOf(page);
    await h.waitForSelector('#kpName');
    check(await until(async () => (await badge(h, '#kpName')).every(Boolean) && await h.evaluate(() => getComputedStyle(document.querySelector('.kp-vchip')).display === 'flex')), `${N} onaylı profil: adda rozet + "Onaylı hesap" etiketi`);
    check(!await h.evaluate(() => !!document.querySelector('[data-profile-action="verify"]')), `${N} başkasının profilinde başvuru satırı yok`);

    // ---- kendi profili: Pro değil ----
    await page.goto(`${SITE}/profil?id=${U1}`); await settle(page, 1500);
    let k = frameOf(page);
    await k.waitForSelector('#kpName');
    check(await k.evaluate(() => getComputedStyle(document.querySelector('.kp-vchip')).display === 'none') && (await badge(k, '#kpName')).every(x => !x), `${N} onaysız kendi profili: rozet/etiket yok`);
    await k.waitForSelector('[data-profile-action="verify"]', { timeout: 6000 });
    await k.click('[data-profile-action="verify"]');
    check(await until(() => k.evaluate(() => { const d = document.getElementById('kaVerifyDialog'); return d.open && /Pro'ya özel/.test(d.textContent) && [...d.querySelectorAll('a')].some(a => a.href.includes('play.google.com')) && [...d.querySelectorAll('a')].some(a => a.href.includes('apps.apple.com')) && !d.querySelector('[data-vf-file]'); })), `${N} Pro değil: yükleme kapalı, Google Play / App Store`);

    // ---- kendi profili: Pro → belge yükle ----
    prof(U1).is_premium = true; rpcCalls.length = 0; uploads.length = 0;
    await page.goto(`${SITE}/profil?id=${U1}`); await settle(page, 1500);
    k = frameOf(page);
    await k.waitForSelector('[data-profile-action="verify"]', { timeout: 6000 });
    await k.click('[data-profile-action="verify"]');
    await k.waitForSelector('#kaVerifyDialog [data-vf-file]');
    const form = await k.evaluate(() => { const d = document.getElementById('kaVerifyDialog'); return { name: /Ayşe Yılmaz/.test(d.textContent), note: /karar verilince silinir/.test(d.textContent), off: d.querySelector('[data-vf-send]').disabled }; });
    check(form.name && form.note && form.off, `${N} Pro: ad, KVKK notu, dosya seçilmeden gönder kapalı ${JSON.stringify(form)}`);
    await k.setInputFiles('#kaVerifyDialog [data-vf-file]', { name: 'belge.pdf', mimeType: 'application/pdf', buffer: Buffer.from('x') });
    check(await k.evaluate(() => !document.querySelector('[data-vf-err]').hidden && document.querySelector('[data-vf-send]').disabled), `${N} fotoğraf olmayan dosya reddedildi`);
    await k.setInputFiles('#kaVerifyDialog [data-vf-file]', { name: 'belge.png', mimeType: 'image/png', buffer: IMG });
    await k.click('#kaVerifyDialog [data-vf-send]');
    check(await until(() => k.evaluate(() => /inceleniyor/.test(document.getElementById('kaVerifyDialog').textContent))), `${N} gönderildi: "inceleniyor"`);
    const up = uploads.find(x => !x.del && x.path.includes('/kisg-verifications/'));
    const sub = rpcCalls.find(x => x.fn === 'kisg_submit_verification');
    check(up && up.path.includes(`/kisg-verifications/${U1}/`) && /\.png$/.test(up.path) && sub && up.path.endsWith(sub.body.p_path), `${N} belge gizli depoda kendi klasörüne yüklendi, aynı yol onaya gönderildi`);

    // ---- gönderme reddedilirse yüklenen dosya silinir ----
    db._submitErr = 'KISG_PRO_ONLY: onayli hesap Pro uyelere acik'; uploads.length = 0;
    await k.evaluate(() => document.getElementById('kaVerifyDialog').close());
    await k.click('[data-profile-action="verify"]');
    await k.waitForSelector('#kaVerifyDialog [data-vf-file]');
    await k.setInputFiles('#kaVerifyDialog [data-vf-file]', { name: 'b.jpg', mimeType: 'image/jpeg', buffer: IMG });
    await k.click('#kaVerifyDialog [data-vf-send]');
    check(await until(() => k.evaluate(() => /Pro üyeliğin aktif görünmüyor/.test(document.querySelector('[data-vf-err]')?.textContent || ''))) && await until(() => uploads.some(x => x.del)), `${N} sunucu reddederse hata gösterilir, yüklenen dosya silinir`);
    delete db._submitErr;

    // ---- durumlar ----
    db.professional_verifications = [{ user_id: U1, status: 'pending', reason: null, verified_name: null }];
    await k.evaluate(() => document.getElementById('kaVerifyDialog').close());
    await k.click('[data-profile-action="verify"]');
    check(await until(() => k.evaluate(() => /Belgen inceleniyor/.test(document.getElementById('kaVerifyDialog').textContent) && !document.querySelector('#kaVerifyDialog [data-vf-file]'))), `${N} bekleyen başvuru: yeni yükleme yok`);
    db.professional_verifications = [{ user_id: U1, status: 'rejected', reason: 'Ad okunmuyor', verified_name: null }];
    await k.evaluate(() => document.getElementById('kaVerifyDialog').close());
    await k.click('[data-profile-action="verify"]');
    check(await until(() => k.evaluate(() => /reddedildi: Ad okunmuyor/.test(document.getElementById('kaVerifyDialog').textContent) && !!document.querySelector('#kaVerifyDialog [data-vf-file]'))), `${N} ret: sebep + yeniden yükleme`);
    db.professional_verifications = [{ user_id: U1, status: 'approved', reason: null, verified_name: 'AYSE  YILMAZ' }];
    await k.evaluate(() => document.getElementById('kaVerifyDialog').close());
    await k.click('[data-profile-action="verify"]');
    check(await until(() => k.evaluate(() => /Hesabın onaylı/.test(document.getElementById('kaVerifyDialog').textContent))), `${N} onaylı (Türkçe/büyük harf farkı önemsiz)`);
    prof(U1).is_premium = false;
    await k.evaluate(() => document.getElementById('kaVerifyDialog').close());
    await k.click('[data-profile-action="verify"]');
    check(await until(() => k.evaluate(() => /duraklatıldı/.test(document.getElementById('kaVerifyDialog').textContent))), `${N} Pro bitti: "rozetin duraklatıldı" + uygulama`);
    if (vp.isMobile) check(await k.evaluate(() => { const d = document.getElementById('kaVerifyDialog').getBoundingClientRect(); return d.left >= 0 && d.right <= innerWidth + 1 && document.documentElement.scrollWidth <= innerWidth; }), `${N} pencere ekrana sığıyor`);
    check(errs.length === 0, `${N} sayfa hatası yok ${errs.join(' ')}`);
    await ctx.close();
  }

  // ---- migration öncesi: RPC yok → rozet, filtre, başvuru yok ----
  {
    resetDb();
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await setup(ctx, true);
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.goto(`${SITE}/hizmetler`); await settle(page, 2000);
    const g = frameOf(page);
    await g.waitForSelector('[data-view="services"] [data-service-id]');
    check(!await g.evaluate(() => !!document.querySelector('[data-vchip], [data-filter="verified"]')) && (await badge(g, '[data-vu]')).every(x => !x), 'migration öncesi: Hizmetler filtresi ve rozet yok');
    await page.goto(`${SITE}/profil?id=${U1}`); await settle(page, 2000);
    const k = frameOf(page);
    await k.waitForSelector('#kpName');
    check(!await k.evaluate(() => !!document.querySelector('[data-profile-action="verify"]')) && errs.length === 0, 'migration öncesi: başvuru satırı yok, hata yok');
    await ctx.close();
  }
} finally {
  await browser.close();
}
