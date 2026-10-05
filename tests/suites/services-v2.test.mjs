// v4.13.0 Hizmet Bul V2 + Akış sağ panel: kart hiyerarşisi, detay (Kapsam / Profili Gör / telefon gizliliği),
// sağ panel sağlayıcı çeşitliliği, "Öne Çıkan" yalnız veride işaret varsa (bugün DB'de alan yok).
import { chromium, OUT, U1, U2, iso, db, resetDb, errors, setup, frameOf, check, LAUNCH } from '../helpers/harness.mjs';
import { navClick, settle } from '../helpers/auth.mjs';

const S = n => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}`;
const sides = page => page.evaluate(() => document.getElementById('kisg-pro-sides').shadowRoot);
const browser = await chromium.launch(LAUNCH);

for (const vp of [{ name: 'desktop', width: 1366, height: 900 }, { name: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true }]) {
  resetDb();
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch });
  await setup(ctx, true);
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`${vp.name}: ${e.message}`));
  await page.goto('https://isgcalisanplatformu.com/hizmetler'); await settle(page, 1500);
  let f = frameOf(page);
  await f.waitForSelector('[data-view="services"] .ks-card');
  // Kart hiyerarşisi: başlık → açıklama → kategori/bölge/şekil → profesyonel (avatar+ad+meslek) → "Hizmeti İncele"
  const cards = await f.evaluate(() => [...document.querySelectorAll('[data-view="services"] .ks-card')].map(c => ({
    order: [...c.children].map(x => (x.getAttribute('class') || x.tagName).split(' ')[0]),
    title: c.querySelector('h2')?.textContent.trim(), cat: c.querySelector('.ks-copy .ks-cat')?.textContent.trim(),
    pro: !!c.querySelector('.ks-lead .k-avatar'), line: c.querySelector('.ks-meta')?.textContent.trim() || '', cta: c.querySelector('.ks-cta'),
    featured: c.querySelectorAll('.k-featured').length, price: /₺|TL\b|fiyat|teklif|puan/i.test(c.textContent)
  })));
  check(cards.length === 6, `${vp.name}: 6 hizmet kartı`);
  check(cards.every(c => JSON.stringify(c.order) === JSON.stringify(['ks-lead', 'ks-copy', 'ks-go'])), `${vp.name}: v4.32 kart: kişi fotoğrafı → metin → ok (${cards[0].order.join(',')})`);
  check(cards.every(c => c.title && c.cat && c.pro && !c.cta), `${vp.name}: her kartta kategori, profesyonelin fotoğrafı; ayrı "Hizmeti İncele" yok`);
  check(/^Mehmet Şahin Öztürk · /.test(cards.find(c => c.title === 'Gürültü ve Toz Ölçümü')?.line) && /^Ayşe Yılmaz · /.test(cards.find(c => c.title === 'Uzaktan İSG Danışmanlığı')?.line), `${vp.name}: "kişi · şekil · bölge" satırı`);
  check(cards.every(c => c.featured === 0), `${vp.name}: DB'de öne çıkarma alanı yok → taç rozeti yok`);
  check(cards.every(c => !c.price), `${vp.name}: fiyat/teklif/puan yok (pazar yeri değil)`);
  const overflow = await f.evaluate(() => [...document.querySelectorAll('[data-view="services"] .ks-card')].some(c => c.scrollWidth > c.clientWidth + 1));
  check(!overflow, `${vp.name}: kart taşması yok`);
  await page.screenshot({ path: `${OUT}/services-v2-list-${vp.name}.png` });

  // Detay: telefonu herkese açık sağlayıcı (U2) → Profili Gör birincil, Ara + WhatsApp; Kapsam bölümü
  await page.goto(`https://isgcalisanplatformu.com/hizmet-detay?id=${S(5)}`); await settle(page, 1500);
  f = frameOf(page);
  await f.waitForSelector('#khTitle');
  const d = await f.evaluate(() => {
    const v = document.querySelector('[data-view="service"]') || document;
    const acts = [...v.querySelectorAll('.kh-actions a, .kh-actions button')].map(a => ({ t: a.textContent.trim(), cls: a.className, href: a.getAttribute('href') || '' }));
    return { title: document.querySelector('#khTitle').textContent.trim(), labels: [...v.querySelectorAll('.kh-label')].map(x => x.textContent.trim()),
      facts: [...v.querySelectorAll('.kh-facts dt')].map(x => x.textContent.trim()), acts, pro: v.querySelector('.kh-pro-copy strong')?.textContent.trim(), featured: v.querySelectorAll('.k-featured').length };
  });
  check(d.title === 'Gürültü ve Toz Ölçümü' && d.labels.includes('Hizmet hakkında') && d.labels.includes('Kapsam'), `${vp.name} detay: başlık + "Hizmet hakkında" + "Kapsam" (${d.labels.join(', ')})`);
  check(['Hizmet şekli', 'Hizmet bölgesi', 'Kategori'].every(x => d.facts.includes(x)), `${vp.name} detay: kapsam kategori/bölge/şekil`);
  check(d.pro === 'Mehmet Şahin Öztürk' && d.acts[0]?.t === 'Profili Gör' && /k-btn-primary/.test(d.acts[0].cls), `${vp.name} detay: sağlayıcı + birincil "Profili Gör"`);
  check(d.acts.some(a => a.href === 'tel:+905324445566') && d.acts.some(a => a.href === 'https://wa.me/905324445566'), `${vp.name} detay: telefon herkese açık → Ara + WhatsApp`);
  check(d.featured === 0, `${vp.name} detay: taç rozeti yok`);
  await page.screenshot({ path: `${OUT}/services-v2-detail-${vp.name}.png`, fullPage: true });

  // Telefonu gizli sağlayıcı (U1) → Ara / WhatsApp yok, telefon sorgulanmaz
  const phoneReqs = [];
  page.on('request', r => { if (/\/rest\/v1\/profiles\?.*select=phone|\/rest\/v1\/rpc\/get_public_phone/.test(r.url())) phoneReqs.push(r.url()); });
  await page.goto(`https://isgcalisanplatformu.com/hizmet-detay?id=${S(3)}`); await settle(page, 1500);
  f = frameOf(page);
  await f.waitForSelector('#khTitle');
  const hidden = await f.evaluate(() => [...document.querySelectorAll('.kh-actions a')].map(a => a.getAttribute('href') || ''));
  check(!hidden.some(h => /^tel:|wa\.me/.test(h)) && phoneReqs.length === 0, `${vp.name} detay: telefon gizli → Ara/WhatsApp yok, telefon sorgusu yok`);
  await ctx.close();
}

{
  // Akış sağ panel: başlık "Hizmetler — Tümünü gör →"; en yeni aktif hizmetler, sağlayıcı başına önce bir tane
  resetDb();
  const U3 = 'cdcdcdcd-0000-4000-8000-000000000003';
  db.profiles.push({ ...db.profiles.find(p => p.id === U2), id: U3, full_name: 'Üçüncü Sağlayıcı', show_phone_publicly: false });
  const base = db.professional_services.find(v => v.id === S(3));
  // U1 en yeni 3 hizmete sahip: eski mantık (limit 3) yalnız U1'i gösterirdi
  db.professional_services.push(
    { ...base, id: S(21), title: 'Yeni A1', created_at: iso(0) }, { ...base, id: S(22), title: 'Yeni A2', created_at: iso(0.5) }, { ...base, id: S(23), title: 'Yeni A3', created_at: iso(0.7) },
    { ...base, id: S(24), user_id: U3, title: 'Üçüncü Hizmet', created_at: iso(9000), provider: { ...base.provider, id: U3, full_name: 'Üçüncü Sağlayıcı' } },
    { ...base, id: S(25), title: 'Arşivlenmiş', status: 'archived', created_at: iso(0) }
  );
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await setup(ctx, true);
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`rail: ${e.message}`));
  const svcReqs = [];
  page.on('request', r => { if (/\/rest\/v1\/professional_services\?/.test(r.url()) && r.method() === 'GET') svcReqs.push(decodeURIComponent(r.url())); });
  await page.goto('https://isgcalisanplatformu.com/'); await settle(page, 1800);
  const side = await page.evaluate(() => { const r = document.getElementById('kisg-pro-sides').shadowRoot; return {
    head: r.querySelector('#kwServicesTitle')?.textContent.trim(), all: r.querySelector('.kw-side-head-services a')?.textContent.trim(), bottom: r.querySelectorAll('.kw-side-link').length,
    popular: /Popüler|Elite/i.test(r.textContent),
    items: [...r.querySelectorAll('.kw-offer')].map(a => ({ title: a.querySelector('strong')?.textContent, by: a.querySelector('.kw-offer-meta')?.textContent.split(' · ')[0], cat: a.title, ico: !!a.querySelector('.ks-lead .k-avatar + .ks-mark svg'), featured: a.querySelectorAll('.k-featured').length })),
    tool: !!r.querySelector('[data-side-find] input[type=search]') && !!r.querySelector('.kw-offer-cta [data-then="publish"]')
  }; });
  check(side.head === 'Hizmet Bul' && /^Tümünü gör/.test(side.all) && side.bottom === 0 && !side.popular && side.tool, `sağ panel "Hizmet Bul" aracı: arama + "Yayınla", Popüler yok: ${side.head} | ${side.all}`);
  check(side.items.length === 3 && JSON.stringify(side.items.map(x => x.title)) === JSON.stringify(['Yeni A1', 'İşyeri Hekimliği Hizmeti', 'Üçüncü Hizmet']), `sağlayıcı başına bir hizmet, en yeniden: ${side.items.map(x => `${x.title} (${x.by})`).join(' | ')}`);
  check(new Set(side.items.map(x => x.by)).size === 3 && side.items.every(x => x.cat && x.ico && x.featured === 0), 'üç farklı sağlayıcı, kategori ikonu + adı (title), taç yok');
  check(svcReqs.some(q => /status=eq\.active/.test(q) && /order=created_at\.desc/.test(q) && /limit=24/.test(q)), 'sorgu: aktif, en yeni, 24 aday');
  await page.screenshot({ path: `${OUT}/services-v2-feed-desktop.png`, clip: { x: 0, y: 64, width: 1366, height: 836 } });
  await ctx.close();
}

{
  // Tek sağlayıcı varsa panel yine dolar (çeşitlilik kuralı boş bırakmaz)
  resetDb();
  db.professional_services = db.professional_services.filter(v => v.user_id === U1);
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await setup(ctx, true);
  const page = await ctx.newPage();
  await page.goto('https://isgcalisanplatformu.com/'); await settle(page, 1800);
  const n = await page.evaluate(() => document.getElementById('kisg-pro-sides').shadowRoot.querySelectorAll('.kw-offer').length);
  check(n === 3, `tek sağlayıcı: panel 3 hizmetle dolu (${n})`);
  await ctx.close();
}

{
  // Öne Çıkan UI kancası (yalnız mock): satırda ileride eklenecek featured_until geleceği gösterirse taç basılır,
  // süresi geçmişse basılmaz. Gerçek DB'de alan YOK — bu yalnız render kancasının doğrulamasıdır.
  resetDb();
  db.professional_services.find(v => v.id === S(1)).featured_until = new Date(Date.now() + 864e5).toISOString();
  db.professional_services.find(v => v.id === S(2)).featured_until = new Date(Date.now() - 864e5).toISOString();
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await setup(ctx, true);
  const page = await ctx.newPage();
  await page.goto('https://isgcalisanplatformu.com/hizmetler'); await settle(page, 1500);
  const f = frameOf(page);
  await f.waitForSelector('[data-view="services"] .ks-card');
  const b = await f.evaluate(() => [...document.querySelectorAll('[data-view="services"] .ks-card')].filter(c => c.querySelector('.k-featured')).map(c => [c.querySelector('h2').textContent, c.querySelector('.k-featured').textContent.trim(), c.classList.contains('is-featured')]));
  check(b.length === 1 && b[0][0] === 'İşyeri Hekimliği Hizmeti' && b[0][1] === 'Öne Çıkan' && b[0][2], `taç kancası: yalnız süresi geçerli işaretli kart (${JSON.stringify(b)})`);
  await page.screenshot({ path: `${OUT}/services-v2-featured-hook.png` });
  await ctx.close();
}

await browser.close();
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO PAGE ERRORS');
