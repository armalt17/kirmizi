// Harici Link Uyarısı (v4.22.0) — hedefli tarayıcı testi.
import { chromium, OUT, db, check, LAUNCH, setup, frameOf, resetDb, U2 } from '../helpers/harness.mjs';
import path from 'node:path';

const SITE = 'https://isgcalisanplatformu.com';
const settle = (page, ms = 600) => page.waitForTimeout(ms);
const POST_ID = 'bbbbbbbb-0000-4000-8000-000000000000';
const isOpen = f => f.evaluate(() => !!document.getElementById('kaExtDialog')?.open);

function seed() {
  resetDb();
  const p = db.professional_posts.find(x => x.id === POST_ID);
  p.content = 'İç: https://isgcalisanplatformu.com/hizmetler ve https://www.isgcalisanplatformu.com/uzmanlar\nDış: https://ornek.com/rehber';
}

const browser = await chromium.launch(LAUNCH);
try {
  for (const vp of [{ name: 'desktop', width: 1366, height: 900 }, { name: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true }]) {
    seed();
    const N = vp.name;
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch });
    await setup(ctx, true);
    await ctx.route(/^https:\/\/www\.isgcalisanplatformu\.com\//, r => r.fulfill({ contentType: 'text/html', body: '<p>iç</p>' }));
    await ctx.route(/^https:\/\/(ornek\.com|instagram\.com|wa\.me)\//, r => r.fulfill({ contentType: 'text/html', body: '<p>dış</p>' }));
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(String(e)));
    const pops = []; ctx.on('page', p => pops.push(p));

    // ---- Profil: sosyal bağlantı ----
    await page.goto(`${SITE}/profil?id=${U2}`); await settle(page, 1200);
    let f = frameOf(page); await f.waitForSelector('.kp-social');
    const url0 = page.url();
    await f.click('.kp-social[href^="https://ornek.com"]'); await settle(page, 500);
    const dlg = await f.evaluate(() => { const d = document.getElementById('kaExtDialog'); return { open: d.open, title: d.querySelector('h2').textContent, text: d.querySelector('#kaExtText').textContent, host: d.querySelector('[data-ext-host]').textContent, btns: [...d.querySelectorAll('footer button')].map(b => b.textContent) }; });
    check(dlg.open && dlg.title === 'Kırmızı İSG’den ayrılıyorsunuz' && dlg.text === 'Bu bağlantı harici bir web sitesine yönlendiriyor.' && JSON.stringify(dlg.btns) === '["Vazgeç","Siteye Git"]', `${N}: harici bağlantı → uyarı penceresi (başlık, metin, Vazgeç / Siteye Git)`);
    check(dlg.host === 'ornek.com' && pops.length === 0 && page.url() === url0, `${N}: doğrudan yönlendirme yok; hedef alan adı gösteriliyor (${dlg.host})`);
    await page.screenshot({ path: path.join(OUT, `ext-warning-${N}.png`) });
    await f.click('#kaExtDialog footer [data-close]'); await settle(page, 400);
    check(!(await isOpen(f)) && pops.length === 0 && page.url() === url0, `${N}: Vazgeç → pencere kapandı, hiçbir yere gidilmedi`);
    await f.click('.kp-social[href^="https://ornek.com"]'); await settle(page, 300);
    const [pop] = await Promise.all([ctx.waitForEvent('page', { timeout: 4000 }).catch(() => null), f.click('#kaExtDialog [data-ext-go]')]);
    await pop?.waitForLoadState().catch(() => {});
    const iso = pop ? await pop.evaluate(() => ({ opener: window.opener === null, ref: document.referrer })) : null;
    check(pop && pop.url() === 'https://ornek.com/' && iso.opener && iso.ref === '' && page.url() === url0, `${N}: Siteye Git → yeni sekme, opener yok (noopener), referrer yok (noreferrer)`);
    check(!(await isOpen(f)), `${N}: Siteye Git sonrası pencere kapandı`);
    await pop?.close(); pops.length = 0;
    // WhatsApp da harici
    await f.click('.kp-card a[href^="https://wa.me/"]'); await settle(page, 400);
    check(await isOpen(f) && (await f.textContent('[data-ext-host]')) === 'wa.me' && pops.length === 0, `${N}: WhatsApp bağlantısı da önce uyarı açar`);
    await f.click('#kaExtDialog footer [data-close]'); await settle(page, 300);

    // ---- Post Detay: iç bağlantı uyarısız, dış bağlantı uyarılı ----
    await page.goto(`${SITE}/calisma-detay?id=${POST_ID}`); await settle(page, 1200);
    f = frameOf(page);
    const sel = '[data-view="work"] .kw-post-content .k-ext-link';
    await f.waitForSelector(sel);
    const [ipop] = await Promise.all([ctx.waitForEvent('page', { timeout: 3000 }).catch(() => null), f.click(`${sel} >> nth=0`)]);
    await settle(page, 300);
    check(!(await isOpen(f)) && ipop && new URL(ipop.url()).hostname === 'isgcalisanplatformu.com', `${N}: isgcalisanplatformu.com bağlantısı uyarısız (eski davranış: yeni sekme)`);
    await ipop?.close(); pops.length = 0;
    const [wpop] = await Promise.all([ctx.waitForEvent('page', { timeout: 3000 }).catch(() => null), f.click(`${sel} >> nth=1`)]);
    await settle(page, 300);
    check(!(await isOpen(f)) && wpop && new URL(wpop.url()).hostname === "www.isgcalisanplatformu.com", `${N}: www.isgcalisanplatformu.com da iç sayılır`);
    await wpop?.close(); pops.length = 0;
    await f.click(`${sel} >> nth=2`); await settle(page, 400);
    check(await isOpen(f) && (await f.textContent('[data-ext-host]')) === 'ornek.com' && pops.length === 0, `${N}: Post içindeki dış bağlantı → uyarı`);
    await f.click('#kaExtDialog footer [data-close]'); await settle(page, 300);

    // ---- Akış kartı (inert span) : dış → uyarı, kart detaya gitmez ----
    await page.goto(`${SITE}/`); await settle(page, 1200);
    f = frameOf(page);
    const card = `[data-post-id="${POST_ID}"] .kw-post-content .k-ext-link`;
    await f.waitForSelector(card);
    const feedUrl = page.url();
    await f.click(`${card} >> nth=2`); await settle(page, 400);
    check(await isOpen(f) && page.url() === feedUrl && pops.length === 0, `${N}: akış kartında dış bağlantı → uyarı, kart Post detayına gitmedi`);
    await f.click('#kaExtDialog footer [data-close]'); await settle(page, 300);
    // Uygulama içi normal bağlantılar etkilenmez
    await f.click(`[data-post-id="${POST_ID}"] .kw-post-content`, { position: { x: 2, y: 2 } }).catch(() => {});
    await settle(page, 900);
    check(!(await isOpen(frameOf(page))), `${N}: uygulama içi (kart / profil) bağlantılarında uyarı yok`);
    check(errs.length === 0, `${N}: sayfa hatası yok ${errs.join(' ')}`);
    await ctx.close();
  }
} finally {
  await browser.close();
}
