// Mobil uygulama modu (v4.42.0) — React Native WebView köprüsü: window.ReactNativeWebView varken Hostinger üst/alt
// gizlenir, "Uygulamayı İndir" kalkar; kisg:ready / kisg:session / kisg:pro / kisg:share / kisg:open / kisg:file mesajları;
// window.kisgApp.setSession / signOut. ?app=1 (köprüsüz) ve normal web karşılaştırması.
import { chromium, db, check, LAUNCH, setup, frameOf, resetDb, U1, U2 } from '../helpers/harness.mjs';

const SITE = 'https://isgcalisanplatformu.com';
const settle = (page, ms = 700) => page.waitForTimeout(ms);
const until = async (fn, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await new Promise(r => setTimeout(r, 80)); } return false; };
const RN = () => { window.__rn = []; window.ReactNativeWebView = { postMessage: m => window.__rn.push(JSON.parse(m)) }; };
const msgs = page => page.evaluate(() => window.__rn || []);
const chrome = page => page.evaluate(() => ({
  header: getComputedStyle(document.querySelector('header')).display, footer: getComputedStyle(document.querySelector('footer')).display,
  get: !!document.getElementById('kisg-pro-nav')?.shadowRoot.querySelector('.kpn-get'), app: typeof window.kisgApp
}));

const browser = await chromium.launch(LAUNCH);
try {
  // ---------- React Native WebView ----------
  for (const vp of [{ name: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true }, { name: 'desktop', width: 1280, height: 900 }]) {
    const N = vp.name;
    resetDb(); db._verified = []; db.professional_verifications = [];
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch });
    await setup(ctx, true);
    await ctx.addInitScript(RN);
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e)));
    const pops = []; ctx.on('page', p => pops.push(p));
    await page.goto(`${SITE}/profil?id=${U1}`); await settle(page, 1800);
    const f = frameOf(page);
    await f.waitForSelector('#kpName');
    const ch = await chrome(page);
    check(ch.header === 'none' && ch.footer === 'none' && !ch.get && ch.app === 'object', `${N}: Hostinger üst/alt gizli, "Uygulamayı İndir" yok, window.kisgApp var ${JSON.stringify(ch)}`);
    const ready = (await msgs(page)).find(m => m.type === 'kisg:ready');
    check(ready && ready.version === await f.evaluate(() => document.documentElement.outerHTML.match(/version:\s*["'](\d+\.\d+\.\d+)["']/)?.[1] || ''), `${N}: kisg:ready + sürüm ${JSON.stringify(ready)}`);
    check(await f.evaluate(() => document.getElementById('kisgApp').getBoundingClientRect().top) < 140, `${N}: uygulama ekranın üstünden başlıyor (Hostinger üst boşluğu yok)`);

    // Paylaş → kisg:share
    await f.click('[data-profile-action="share"]');
    check(await until(async () => (await msgs(page)).some(m => m.type === 'kisg:share' && m.url.includes(`/profil?id=${U1}`))), `${N}: Profili Paylaş → kisg:share (yerel paylaşım)`);
    // PDF → kisg:file (base64 PDF)
    await f.click('.kp-card [data-profile-action="pdf"]');
    if (vp.isMobile) { await until(async () => /PDF hazır/.test(await f.textContent('[data-pdf-label]')), 20000); await f.click('.kp-card [data-profile-action="pdf"]'); }
    check(await until(async () => (await msgs(page)).some(m => m.type === 'kisg:file' && m.mime === 'application/pdf' && /\.pdf$/.test(m.name) && Buffer.from(m.base64, 'base64').subarray(0, 5).toString() === '%PDF-'), 25000), `${N}: PDF İndir → kisg:file (base64 PDF), tarayıcı indirmesi yok`);
    // Pro değil → Onaylı hesap → "Pro'ya geç" → kisg:pro
    db._verified = [];
    await page.goto(`${SITE}/profil?id=${U1}`); await settle(page, 1800);
    let g = frameOf(page);
    await g.waitForSelector('[data-profile-action="verify"]', { timeout: 8000 });
    await g.click('[data-profile-action="verify"]');
    await g.waitForSelector('#kaVerifyDialog [data-vf-pro]');
    check(!await g.evaluate(() => !!document.querySelector('#kaVerifyDialog a[href*="play.google.com"]')), `${N}: uygulamada mağaza bağlantısı yerine "Pro'ya geç"`);
    await g.click('#kaVerifyDialog [data-vf-pro]');
    check(await until(async () => (await msgs(page)).some(m => m.type === 'kisg:pro')) && !await g.evaluate(() => document.getElementById('kaVerifyDialog').open), `${N}: Pro'ya geç → kisg:pro, pencere kapandı`);
    // Dış bağlantı → uyarı → Siteye Git → kisg:open (yeni sekme yok)
    await page.goto(`${SITE}/profil?id=${U2}`); await settle(page, 1800);
    g = frameOf(page);
    await g.waitForSelector('.kp-social[href^="https://ornek.com"]');
    await g.click('.kp-social[href^="https://ornek.com"]'); await g.waitForSelector('#kaExtDialog[open]');
    await g.click('#kaExtDialog [data-ext-go]');
    check(await until(async () => (await msgs(page)).some(m => m.type === 'kisg:open' && m.url.startsWith('https://ornek.com'))) && pops.length === 0, `${N}: dış bağlantı uyarıdan sonra kisg:open ile uygulamaya gider, sekme açılmaz ${pops.map(p => p.url())} ${JSON.stringify((await msgs(page)).filter(m => m.type === 'kisg:open'))}`);
    // Oturum: çıkış → kisg:session SIGNED_OUT; setSession → oturum geri
    await page.evaluate(() => { window.__rn.length = 0; });
    check(await page.evaluate(() => window.kisgApp.signOut()) === true && await until(async () => (await msgs(page)).some(m => m.type === 'kisg:session' && m.event === 'SIGNED_OUT' && m.access_token === null)), `${N}: kisgApp.signOut → kisg:session SIGNED_OUT`);
    check(await until(() => g.evaluate(() => !!document.querySelector('[data-view="profile"]') && !document.querySelector('[data-profile-action="edit"]'))), `${N}: çıkıştan sonra misafir görünümü`);
    check(errs.length === 0, `${N}: sayfa hatası yok ${errs.join(' ')}`);
    await ctx.close();
  }

  // ---------- kisgApp.setSession: misafirken uygulama oturumu aktarır ----------
  {
    resetDb();
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await setup(ctx, false);
    await ctx.addInitScript(RN);
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.goto(`${SITE}/`); await settle(page, 1800);
    const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
    const at = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: U1, exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated', aud: 'authenticated' })}.c2ln`;
    const ok = await page.evaluate(([a]) => window.kisgApp.setSession(a, 'refresh-1'), [at]);
    check(ok === true && await until(async () => (await msgs(page)).some(m => m.type === 'kisg:session' && m.event === 'SIGNED_IN' && m.access_token === at)), 'kisgApp.setSession → web oturumu açıldı, kisg:session SIGNED_IN');
    check(await until(() => page.evaluate(() => /Ayşe|AY/.test(document.getElementById('kisg-pro-nav').shadowRoot.textContent))), 'oturum açılınca menüde kullanıcı görünür');
    check(errs.length === 0, `setSession: sayfa hatası yok ${errs.join(' ')}`);
    await ctx.close();
  }

  // ---------- ?app=1 (köprüsüz) ve normal web ----------
  {
    resetDb(); db._verified = [];
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await setup(ctx, true);
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.goto(`${SITE}/`); await settle(page, 1500);
    let ch = await chrome(page);
    check(ch.header !== 'none' && ch.footer !== 'none' && ch.get && ch.app === 'undefined', `normal web: Hostinger üst/alt görünür, "Uygulamayı İndir" var, köprü yok ${JSON.stringify(ch)}`);
    await page.goto(`${SITE}/?app=1`); await settle(page, 1500);
    ch = await chrome(page);
    check(ch.header === 'none' && ch.footer === 'none' && !ch.get, `?app=1: uygulama modu ${JSON.stringify(ch)}`);
    await page.goto(`${SITE}/hizmetler`); await settle(page, 1500);
    ch = await chrome(page);
    check(ch.header === 'none' && !ch.get, '?app=1 sekme boyunca hatırlanır (sonraki sayfa yüklemesinde de)');
    await page.goto(`${SITE}/profil?id=${U1}`); await settle(page, 1800);
    const f = frameOf(page);
    await f.waitForSelector('[data-profile-action="verify"]', { timeout: 8000 });
    await f.click('[data-profile-action="verify"]');
    check(await until(() => f.evaluate(() => !!document.querySelector('#kaVerifyDialog a[href*="play.google.com"]'))), '?app=1 köprüsüz: Pro için mağaza bağlantıları kalır');
    check(errs.length === 0, `?app=1: sayfa hatası yok ${errs.join(' ')}`);
    await ctx.close();
  }
} finally {
  await browser.close();
}
