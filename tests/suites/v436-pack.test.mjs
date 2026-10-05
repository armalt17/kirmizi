// v4.36.0 — sekme ikonları, Uzmanlar "Hizmet Alanı" filtresi, profil şehrinde "Yurtdışı",
// Hizmet Bul yan kolonu (4 yeni yayın, kırmızı harfli avatar, iş ilanları bağlantısı), profil ipucunda deneyim yok.
import { chromium, db, check, LAUNCH, setup, frameOf, resetDb, U1, U2 } from '../helpers/harness.mjs';

const SITE = 'https://isgcalisanplatformu.com';
const settle = (page, ms = 700) => page.waitForTimeout(ms);
const until = async (fn, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await new Promise(r => setTimeout(r, 80)); } return false; };
const nav = page => page.evaluate(() => [...document.getElementById('kisg-pro-nav').shadowRoot.querySelectorAll('.ka-tab')].map(a => ({ v: a.dataset.viewLink, t: a.textContent.trim(), svg: !!a.querySelector('svg'), active: a.classList.contains('is-active'), stroke: getComputedStyle(a.querySelector('svg')).stroke, w: Math.round(a.getBoundingClientRect().width), sw: a.scrollWidth })));

const browser = await chromium.launch(LAUNCH);
try {
  // ---- sekme ikonları (masaüstü + dar mobil) ----
  for (const vp of [{ name: 'desktop', width: 1366, height: 900 }, { name: 'mobile320', width: 320, height: 700, isMobile: true, hasTouch: true }]) {
    resetDb();
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch });
    await setup(ctx, true);
    const page = await ctx.newPage();
    await page.goto(`${SITE}/`); await settle(page, 1500);
    const t = await nav(page);
    check(JSON.stringify(t.map(x => x.t)) === '["Akış","Uzmanlar","Hizmet Bul"]' && t.every(x => x.svg && x.sw <= x.w), `${vp.name} sekmeler: her birinde ikon, metin aynı, taşma yok ${JSON.stringify(t.map(x => [x.t, x.w, x.sw]))}`);
    check(t[0].active && t[0].stroke === 'rgb(227, 10, 23)' && t[1].stroke !== t[0].stroke, `${vp.name} etkin sekmenin (Akış) ev ikonu kırmızı`);
    await ctx.close();
  }

  // ---- Hizmet Bul yan kolonu + profil ipucu ----
  {
    resetDb();
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await setup(ctx, true);
    const page = await ctx.newPage();
    await page.goto(`${SITE}/`); await settle(page, 1800);
    const side = await page.evaluate(() => {
      const r = document.getElementById('kisg-pro-sides').shadowRoot, offers = [...r.querySelectorAll('[data-side-services] .kw-offer')];
      const ini = offers.map(o => o.querySelector('.k-avatar')).filter(a => a && !a.querySelector('img'));
      const jobs = r.querySelector('.kw-jobs');
      return { n: offers.length, ini: ini.length, bg: ini.map(a => getComputedStyle(a).backgroundColor), fg: ini.map(a => getComputedStyle(a).color), jobs: jobs && { href: jobs.getAttribute('href'), text: jobs.textContent.trim(), target: jobs.target, afterCta: !!jobs.previousElementSibling?.matches('.kw-offer-cta') } };
    });
    check(side.n === Math.min(4, db.professional_services.filter(v => v.status === 'active').length), `yan kolon: en fazla 4 yeni yayın (${side.n})`);
    check(side.ini > 0 && side.bg.every(c => c === 'rgb(227, 10, 23)') && side.fg.every(c => c === 'rgb(255, 255, 255)'), `fotoğrafsız avatarlar Kırmızı İSG kırmızısı, harfler beyaz ${JSON.stringify(side.bg)}`);
    check(side.jobs?.href === 'https://isgcalisanplatformu.com/isg-is-ilanlari' && side.jobs.target === '_top' && /iş ilanlarını gör/.test(side.jobs.text) && side.jobs.afterCta, `"Sektördeki iş ilanlarını gör" hizmet kutusunun altında ${JSON.stringify(side.jobs)}`);
    // profil ipucu: deneyim istenmez
    db.profiles.find(p => p.id === U1).about = null;
    await page.goto(`${SITE}/profil?id=${U1}`); await settle(page, 1500);
    const f = frameOf(page);
    const hint = await f.evaluate(() => document.querySelector('.kp-hint')?.textContent || '');
    check(/hakkında/.test(hint) && !/deneyim/.test(hint), `profil ipucu deneyim istemiyor ("${hint.trim()}")`);
    // profil düzenle: şehir listesinde Yurtdışı (en sonda)
    await f.evaluate(() => document.querySelector('.kp-card [data-profile-action="edit"]').click()); await f.waitForSelector('#kaProfileDialog[open]');
    const ops = await f.evaluate(() => [...document.querySelectorAll('#kaPe_city option')].map(o => o.value));
    check(ops[ops.length - 1] === 'Yurtdışı' && ops.includes('İzmir'), `profil düzenle: şehirlerde "Yurtdışı" var (${ops.length} seçenek)`);
    await f.selectOption('#kaPe_city', 'Yurtdışı');
    await f.evaluate(() => document.getElementById('kaProfileForm').requestSubmit());
    check(await until(() => db.profiles.find(p => p.id === U1).city === 'Yurtdışı'), 'profil şehri "Yurtdışı" olarak kaydedildi');
    await ctx.close();
  }

  // ---- Uzmanlar: Hizmet Alanı + Yurtdışı ----
  {
    resetDb();
    db.profiles.find(p => p.id === U1).city = 'Yurtdışı';
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await setup(ctx, true);
    const svcReqs = [];
    ctx.on('request', r => { if (r.url().includes('/rest/v1/professional_services') && r.url().includes('category_id')) svcReqs.push(decodeURIComponent(r.url())); });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.goto(`${SITE}/uzmanlar`); await settle(page, 1800);
    const f = frameOf(page);
    const D = '[data-view="experts"] [data-desktop-filters]';
    const names = () => f.evaluate(() => [...document.querySelectorAll('[data-view="experts"] .ke-card h2')].map(h => h.textContent).sort());
    const all = await names();
    const fl = await f.evaluate(d => ({ labels: [...document.querySelectorAll(`${d} .kc-flabel`)].map(x => x.textContent), cat: [...document.querySelectorAll(`${d} [data-filter="category"] option`)].map(o => o.textContent), spec: !!document.querySelector('[data-filter="specialties"]'), ph: document.getElementById('keSearch').placeholder }), D);
    check(fl.labels.includes('Hizmet Alanı') && !fl.labels.includes('Uzmanlık') && !fl.spec && JSON.stringify(fl.cat) === JSON.stringify(['Tüm hizmet alanları', ...db.professional_service_categories.map(c => c.name)]) && !/uzmanlık/i.test(fl.ph), `filtreler: "Uzmanlık" yok, "Hizmet Alanı" kategorilerle dolu ${JSON.stringify(fl)}`);
    // Sağlık (1) yalnız U2'nin aktif hizmeti; Risk Değerlendirmesi (3) yalnız U1
    for (const [cat, uid] of [[1, U2], [3, U1]]) {
      await f.selectOption(`${D} [data-filter="category"]`, String(cat));
      const want = db.profiles.find(p => p.id === uid).full_name;
      check(await until(async () => JSON.stringify(await names()) === JSON.stringify([want])), `Hizmet Alanı ${db.professional_service_categories.find(c => c.id === cat).name}: yalnız o alanda aktif hizmeti olan uzman (${(await names()).join(', ')})`);
    }
    check(svcReqs.some(u => /status=eq\.active/.test(u) && /category_id=eq\.3/.test(u)), 'sorgu: yalnız aktif hizmetler, seçilen kategori');
    await f.selectOption(`${D} [data-filter="category"]`, '');
    check(await until(async () => JSON.stringify(await names()) === JSON.stringify(all)), 'Hizmet Alanı temizlenince liste eski haline döndü');
    // Yurtdışı: Uzmanlar şehir seçicide var, Hizmet Bul'da yok
    await f.click(`${D} .kc-city-btn`); await f.fill(`${D} [data-city-q]`, 'yurt'); await settle(page, 200);
    const opt = await f.evaluate(d => [...document.querySelectorAll(`${d} [data-city]`)].map(o => o.dataset.city), D);
    check(JSON.stringify(opt) === '["Yurtdışı"]', `Uzmanlar şehir seçicide "Yurtdışı" (${opt})`);
    const profReqs = []; page.on('request', r => { const u = decodeURIComponent(r.url()); if (u.includes('/rest/v1/profiles') && u.includes('city.ilike')) profReqs.push(u); });
    await f.click(`${D} [data-city="Yurtdışı"]`);
    // Not: sahte sunucu bu or(...) koşullarını uygulamaz (şehir filtresi diğer testlerde de sorgu üzerinden doğrulanır)
    check(await until(() => profReqs.some(u => /city\.ilike\."%Yurtdışı%"/.test(u) && /city\.ilike\."%Yurtdisi%"/.test(u))), `"Yurtdışı" filtresi profil şehrinde (yazım varyantlarıyla) aranıyor`);
    await page.goto(`${SITE}/hizmetler`); await settle(page, 1500);
    const g = frameOf(page);
    const svcCities = await g.evaluate(() => [...document.querySelectorAll('[data-view="services"] .kc-city-native option')].map(o => o.value));
    check(svcCities.length > 80 && !svcCities.includes('Yurtdışı'), `Hizmet Bul şehir filtresinde "Yurtdışı" yok (${svcCities.length})`);
    check(errs.length === 0, `sayfa hatası yok ${errs.join(' ')}`);
    await ctx.close();
  }
} finally {
  await browser.close();
}
