// Tıklanabilir Linkler V1 — hedefli tarayıcı testi (Post içeriği, Hizmet Bul kartı, Post Detay, Hizmet Detay).
import { chromium, OUT, db, check, LAUNCH, setup, frameOf, resetDb, iso, U1, U2 } from '../helpers/harness.mjs';
import path from 'node:path';

const SITE = 'https://isgcalisanplatformu.com';
const settle = (page, ms = 700) => page.waitForTimeout(ms);
const until = async (fn, ms = 5000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await new Promise(r => setTimeout(r, 60)); } return false; };
const POST_ID = 'bbbbbbbb-0000-4000-8000-000000000000';
const SVC_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const CONTENT = [
  'Rehber: https://ornek.com/a?b=1&c=2. Devamı yakında',
  '(bkz. https://ornek.com/yol) ve https://tr.wikipedia.org/wiki/Test_(bilim), ayrıca http://ornek.com.tr/x!',
  'Güvensiz: javascript:alert(1) <img src=x onerror=alert(1)> ftp://ornek.com http://localhost',
  'Tırnak: https://evil.com/"onmouseover="alert(1)" son satır'
].join('\n');
const EXPECT = ['https://ornek.com/a?b=1&c=2', 'https://ornek.com/yol', 'https://tr.wikipedia.org/wiki/Test_(bilim)', 'http://ornek.com.tr/x', 'https://evil.com/'];

function seed() {
  resetDb();
  const p = db.professional_posts.find(x => x.id === POST_ID);
  p.content = CONTENT; p.user_id = U2; p.author = { ...p.author, id: U2 };
  const v = db.professional_services.find(x => x.id === SVC_ID);
  v.description = 'Detaylı bilgi: https://ornek.com/hizmet.\nİkinci satır (https://ornek.com/iletisim).';
}
async function linkState(f, sel) {
  return f.evaluate(s => {
    const box = document.querySelector(s);
    if (!box) return null;
    const links = [...box.querySelectorAll('.k-ext-link')];
    return {
      text: box.textContent,
      links: links.map(l => ({ tag: l.tagName, href: l.getAttribute('href') || l.dataset.extHref, text: l.textContent, target: l.getAttribute('target'), rel: l.getAttribute('rel'), role: l.getAttribute('role') })),
      injected: box.querySelectorAll('img,script,[onerror],[onmouseover]').length,
      nestedA: box.querySelectorAll('a a').length + (box.closest('a') ? box.querySelectorAll('a').length : 0),
      ws: getComputedStyle(box).whiteSpace
    };
  }, sel);
}

// v4.22.0: harici bağlantı önce "Kırmızı İSG’den ayrılıyorsunuz" penceresini açar; "Siteye Git" yeni sekmede açar.
async function viaWarn(ctx, page, f, click) {
  const early = ctx.waitForEvent('page', { timeout: 700 }).catch(() => null);
  await click();
  const shown = await f.waitForFunction(() => document.getElementById('kaExtDialog')?.open, null, { timeout: 3000 }).then(() => true).catch(() => false);
  const direct = await early;
  if (!shown || direct) { if (direct) await direct.close(); return null; }
  const [pop] = await Promise.all([ctx.waitForEvent('page', { timeout: 4000 }).catch(() => null), f.click('#kaExtDialog [data-ext-go]')]);
  return pop;
}

const browser = await chromium.launch(LAUNCH);
try {
  for (const vp of [{ name: 'desktop', width: 1366, height: 900 }, { name: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true }]) {
    seed();
    const N = vp.name;
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch });
    await setup(ctx, true);
    await ctx.route(/^https:\/\/(ornek\.com|tr\.wikipedia\.org|evil\.com)\//, r => r.fulfill({ contentType: 'text/html', body: 'dış sayfa' }));
    await ctx.route(/^http:\/\/ornek\.com\.tr\//, r => r.fulfill({ contentType: 'text/html', body: 'dış sayfa' }));
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(String(e)));
    let dialogs = 0; page.on('dialog', d => { dialogs++; d.dismiss(); });

    // ---- Akış kartı (post detayına giden bağlantının içinde) ----
    await page.goto(`${SITE}/`); await settle(page, 1200);
    let f = frameOf(page);
    const feedSel = `[data-post-id="${POST_ID}"] .kw-post-content`;
    await until(() => f.$(feedSel).then(Boolean));
    let st = await linkState(f, feedSel);
    check(st && JSON.stringify(st.links.map(l => l.href)) === JSON.stringify(EXPECT), `${N} akış: yalnız geçerli http/https URL'leri, sondaki noktalama/parantez hariç ${JSON.stringify(st?.links.map(l => l.href))}`);
    check(st && st.links.every(l => l.tag === 'SPAN' && l.role === 'link') && st.nestedA === 0, `${N} akış: kart bağlantısı içinde iç içe <a> yok (role=link öğe)`);
    check(st && st.injected === 0 && st.text.includes('<img src=x onerror=alert(1)>') && st.text.includes('javascript:alert(1)') && st.text.includes('"onmouseover="alert(1)"'), `${N} akış: HTML/JS düz metin olarak kaldı, öğe/öznitelik enjekte edilmedi`);
    check(st && st.text.split('\n').length === 4 && st.ws === 'pre-wrap', `${N} akış: satır sonları korundu`);
    check(st && st.links[0].text === 'https://ornek.com/a?b=1&c=2' && st.text.includes('&c=2. Devamı'), `${N} akış: bağlantı metni URL'nin kendisi, nokta dışarıda`);
    const url0 = page.url();
    const pop = await viaWarn(ctx, page, f, () => f.click(`${feedSel} .k-ext-link >> nth=0`));
    await settle(page, 500);
    check(pop && pop.url() === 'https://ornek.com/a?b=1&c=2' && page.url() === url0, `${N} akış: tıklama URL'yi yeni sekmede açtı, kart post detayına gitmedi (${pop?.url()})`);
    if (pop) await pop.close();
    const plainClick = await f.evaluate(s => { const a = document.querySelector(s).closest('a'); return !!a && a.getAttribute('href').includes('/calisma-detay'); }, feedSel);
    check(plainClick, `${N} akış: metnin geri kalanı hâlâ post detayına götüren karta ait`);

    // ---- Post Detay ----
    await page.goto(`${SITE}/calisma-detay?id=${POST_ID}`); await settle(page, 1200);
    f = frameOf(page);
    const detSel = '[data-view="work"] .kw-post-content';
    await until(() => f.$(detSel).then(Boolean));
    st = await linkState(f, detSel);
    check(st && JSON.stringify(st.links.map(l => l.href)) === JSON.stringify(EXPECT) && st.links.every(l => l.tag === 'A' && l.target === '_blank' && /\bnoopener\b/.test(l.rel) && /\bnoreferrer\b/.test(l.rel)), `${N} Post Detay: gerçek <a>, yeni sekme, rel=noopener noreferrer`);
    check(st && st.injected === 0, `${N} Post Detay: enjeksiyon yok`);
    const detUrl = page.url();
    const pop2 = await viaWarn(ctx, page, f, () => f.click(`${detSel} .k-ext-link >> nth=2`));
    await settle(page, 500);
    check(pop2 && pop2.url() === 'https://tr.wikipedia.org/wiki/Test_(bilim)' && page.url() === detUrl, `${N} Post Detay: bağlantı yeni sekmede, sayfa yerinde (${pop2?.url()})`);
    if (pop2) await pop2.close();

    // ---- Hizmet Bul kartı ----
    await page.goto(`${SITE}/hizmetler`); await settle(page, 1200);
    f = frameOf(page);
    const cardSel = `[data-service-id="${SVC_ID}"] .ks-description`;
    await until(() => f.$(`[data-service-id="${SVC_ID}"]`).then(Boolean));
    // v4.32.0: mobil satır kartında açıklama gösterilmez; kart bağlantıları masaüstünde denetlenir
    if (N === 'desktop') {
    st = await linkState(f, cardSel);
    check(st && JSON.stringify(st.links.map(l => l.href)) === JSON.stringify(['https://ornek.com/hizmet', 'https://ornek.com/iletisim']) && st.links.every(l => l.tag === 'SPAN') && st.nestedA === 0, `${N} Hizmet Bul kartı: linkler (nokta/parantez hariç), iç içe <a> yok ${JSON.stringify(st?.links.map(l => l.href))}`);
    const svcUrl = page.url();
    const pop3 = await viaWarn(ctx, page, f, () => f.click(`${cardSel} .k-ext-link >> nth=0`));
    await settle(page, 500);
    check(pop3 && pop3.url() === 'https://ornek.com/hizmet' && page.url() === svcUrl, `${N} Hizmet Bul kartı: bağlantı yeni sekmede, kart detaya gitmedi`);
    if (pop3) await pop3.close();
    // klavye: Enter
    const pop4 = await viaWarn(ctx, page, f, async () => { await f.focus(`${cardSel} .k-ext-link >> nth=1`); await page.keyboard.press('Enter'); });
    await settle(page, 400);
    check(pop4 && pop4.url() === 'https://ornek.com/iletisim' && page.url() === svcUrl, `${N} Hizmet Bul kartı: klavye (Enter) ile de açılır`);
    if (pop4) await pop4.close();
    } else check(!(await f.isVisible(cardSel)), `${N} Hizmet Bul kartı: mobil satırda açıklama yok`);
    // kartın geri kalanı detaya gider (davranış değişmedi)
    await f.click(`[data-service-id="${SVC_ID}"] h2`); await settle(page, 1000);
    check(page.url().includes('/hizmet-detay'), `${N} Hizmet Bul kartı: başlığa tıklama hâlâ detaya gider`);

    // ---- Hizmet Detay ----
    f = frameOf(page);
    await until(() => f.$('.kh-desc').then(Boolean));
    st = await linkState(f, '.kh-desc');
    check(st && st.links.length === 2 && st.links.every(l => l.tag === 'A' && l.target === '_blank' && /noopener/.test(l.rel) && /noreferrer/.test(l.rel)) && st.text.includes('\n') && st.ws === 'pre-wrap', `${N} Hizmet Detay: gerçek bağlantılar, satır sonu korunmuş`);
    check(dialogs === 0 && errs.length === 0, `${N} alert/sayfa hatası yok ${errs.join(' ')}`);
    await page.screenshot({ path: path.join(OUT, `links-v1-${N}.png`) });
    await ctx.close();
  }
} finally {
  await browser.close();
}
