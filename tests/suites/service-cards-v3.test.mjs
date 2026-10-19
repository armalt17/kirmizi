// Hizmet Bul kart kimliği (v4.23.0) — hedefli görsel/yapı testi.
import { chromium, OUT, db, check, LAUNCH, setup, frameOf, resetDb, iso, U1, U2 } from '../helpers/harness.mjs';
import path from 'node:path';

const SITE = 'https://isgcalisanplatformu.com';
const CATS = [
  [11, 'Mühendislik / Teknik Hizmetler', 'muhendislik-teknik', 'eng'],
  [12, 'Risk Değerlendirmesi', 'risk-degerlendirmesi', 'risk'],
  [13, 'Patlamadan Korunma', 'patlamadan-korunma', 'atex'],
  [14, 'Ortam Ölçümleri', 'ortam-olcumleri', 'measure'],
  [15, 'Eğitim', 'egitim', 'training'],
  [16, 'İşyeri Hekimliği / Sağlık', 'saglik', 'health'],
  [17, 'Acil Durum ve Yangın', 'acil-durum', 'fire'],
  [18, 'Danışmanlık ve Denetim', 'danismanlik', 'consult'],
  [19, 'Diğer', 'diger', 'general']
];
const TITLES = ['Makine Emniyeti ve Teknik Uygunluk', 'Şantiye Risk Değerlendirmesi', 'Patlamadan Korunma Dokümanı (ATEX)', 'Gürültü ve Toz Ölçümü', 'Yüksekte Çalışma Eğitimi', 'İşyeri Hekimliği Hizmeti', 'Acil Durum Planı ve Tatbikat', 'Aylık İSG Denetimi', 'Özel İSG Talepleri'];
function seed() {
  resetDb();
  db.professional_service_categories = CATS.map(([id, name, slug], i) => ({ id, name, slug, sort_order: i, is_active: true }));
  const prov = uid => { const a = db.profiles.find(p => p.id === uid); return { id: a.id, full_name: a.full_name, avatar_url: null, profession: a.profession, title: a.title, certificate_class: a.certificate_class, current_company: a.current_company, city: a.city, show_phone_publicly: a.show_phone_publicly }; };
  db.professional_services = CATS.map(([id, name, slug], i) => ({ id: `aaaaaaaa-0000-4000-8000-0000000001${String(i).padStart(2, '0')}`, user_id: i % 2 ? U2 : U1, title: TITLES[i], category_id: id, description: 'Mevzuata uygun, sahaya özel hizmet. Kapsam, süre ve raporlama ihtiyaca göre planlanır; tüm çıktılar yazılı olarak teslim edilir.', service_region: i % 3 ? 'İstanbul' : 'Tüm Türkiye', service_mode: ['onsite', 'remote', 'both'][i % 3], status: 'active', created_at: iso(10 + i), category: { id, name, slug }, provider: prov(i % 2 ? U2 : U1) }));
}

const browser = await chromium.launch(LAUNCH);
try {
  for (const vp of [{ name: 'desktop', width: 1366, height: 900 }, { name: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]) {
    seed();
    const N = vp.name;
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch, deviceScaleFactor: vp.deviceScaleFactor || 1 });
    await setup(ctx, false);
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(String(e))); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(`${SITE}/hizmetler`); await page.waitForTimeout(1500);
    const f = frameOf(page);
    await f.waitForSelector('[data-view="services"] .ks-card[data-kind]');
    const cards = await f.evaluate(() => [...document.querySelectorAll('[data-view="services"] .ks-card')].map(c => {
      const bg = getComputedStyle(c, '::before').backgroundImage, mark = c.querySelector('.ks-lead > .ks-mark svg');
      const cat = c.querySelector('.ks-copy > .ks-cat'), cs = cat && getComputedStyle(cat);
      return {
        title: c.querySelector('h2')?.textContent, kind: c.dataset.kind, order: [...c.children].map(x => (x.getAttribute('class') || x.tagName).split(' ')[0]),
        motif: bg.startsWith('url("data:image/svg+xml'), bgKey: bg.slice(0, 400), markOk: !!mark && mark.getBoundingClientRect().width >= 12,
        red: mark ? [...mark.querySelectorAll('.a,.f')].length : 0, hidden: c.querySelector('.ks-mark')?.getAttribute('aria-hidden'),
        cat: cat?.textContent, catUpper: cs?.textTransform, catColor: cs?.color, h: c.getBoundingClientRect().height,
        cta: c.querySelector('.ks-cta'), pro: !!c.querySelector('.ks-lead > .k-avatar') && /Yılmaz|Öztürk|Sağlayıcı/.test(c.querySelector('.ks-meta')?.textContent || ''), facts: c.querySelector('.ks-meta')?.textContent
      };
    }));
    const byTitle = Object.fromEntries(cards.map(c => [c.title, c]));
    check(cards.length === 9, `${N}: 9 hizmet kartı`);
    check(CATS.every(([, , , kind], i) => byTitle[TITLES[i]]?.kind === kind), `${N}: kategori → işaret ailesi (${cards.map(c => c.kind).join(', ')})`);
    check(cards.every(c => !c.motif && c.markOk && c.red === 1 && c.hidden === 'true'), `${N}: her kartta dekoratif (aria-hidden) kategori ikonu + tek kırmızı detay; arka plan deseni yok (v4.31 sade dil)`);
    check(new Set(cards.map(c => c.kind)).size === 9, `${N}: 9 farklı kategori → 9 farklı ikon ailesi`);
    check(cards.every(c => JSON.stringify(c.order) === JSON.stringify(['ks-lead', 'ks-copy', 'ks-go'])), `${N}: v4.32 sade kart: kişi fotoğrafı + kategori rozeti → metin → ok`);
    check(cards.every(c => c.cat && c.catUpper === 'none' && c.catColor === 'rgb(135, 145, 160)'), `${N}: kategori bir kez, küçük gri ad (etiket/hap yok)`);
    check(cards.every(c => /Yerinde|Uzaktan/.test(c.facts) && c.pro && !c.cta), `${N}: kişi fotoğrafı + "kişi · şekil · bölge"; "Hizmeti İncele" yok (kartın tamamı bağlantı)`);
    const maxH = Math.max(...cards.map(c => c.h));
    check(N === 'mobile' ? maxH <= 130 : maxH <= 200, `${N}: kart yüksekliği kompakt (en fazla ${Math.round(maxH)}px)`);
    const over = await f.evaluate(() => [...document.querySelectorAll('.ks-card')].some(c => c.scrollWidth > c.clientWidth + 1) || document.documentElement.scrollWidth > document.documentElement.clientWidth);
    check(!over, `${N}: taşma yok`);
    // Kart hâlâ detaya gider, kategori filtresi çalışır
    await page.screenshot({ path: path.join(OUT, `service-cards-v3-${N}.png`), fullPage: N === 'mobile' });
    if (N === 'mobile') { const r = await page.evaluate(() => { const fr = document.querySelector('iframe').getBoundingClientRect(), c = document.querySelector('iframe').contentDocument.querySelectorAll('.ks-card'); const a = c[0].getBoundingClientRect(), b = c[2].getBoundingClientRect(); return { x: 0, y: fr.top + a.top + scrollY, width: 390, height: b.bottom - a.top }; }); await page.screenshot({ path: path.join(OUT, 'service-cards-v3-mobile-zoom.png'), clip: r, fullPage: true }); }
    await f.click(`[data-service-id="${db.professional_services[2].id}"] h2`); await page.waitForTimeout(1000);
    check(page.url().includes(`/hizmet-detay?id=${db.professional_services[2].id}`), `${N}: kart tıklaması detaya gider`);
    // Profil > Verdiği Hizmetler aynı kart ailesi
    await page.goto(`${SITE}/profil?id=${U1}#hizmetler`); await page.waitForTimeout(1300);
    const g = frameOf(page); await g.waitForSelector('[data-view="profile"] .ks-card');
    check(await g.evaluate(() => [...document.querySelectorAll('[data-view="profile"] .ks-card')].every(c => c.dataset.kind && c.querySelector('.ks-mark'))), `${N}: profildeki hizmet kartları da aynı sistemde`);
    check(errs.length === 0, `${N}: sayfa/console hatası yok ${errs.join(' ')}`);
    await ctx.close();
  }
} finally {
  await browser.close();
}
