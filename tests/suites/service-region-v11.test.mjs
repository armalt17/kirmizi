// Hizmet Bölgesi V1.1 + iframe kenar çizgisi — hedefli tarayıcı testi.
import { chromium, fs, ROOT, OUT, db, writes, check, LAUNCH, setup, frameOf, resetDb, iso, U1, U2, APP } from '../helpers/harness.mjs';
import { evalExpr } from '../helpers/postgrest-logic.mjs';
import path from 'node:path';

const SITE = 'https://isgcalisanplatformu.com';
const settle = (page, ms = 700) => page.waitForTimeout(ms);
const until = async (fn, ms = 5000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await new Promise(r => setTimeout(r, 60)); } return false; };
const SVC = (i, region, title, user = U1) => ({ id: `eeeeeeee-2222-4000-8000-${String(i).padStart(12, '0')}`, user_id: user, title, category_id: 1, description: 'Test hizmeti', service_region: region, service_mode: 'onsite', status: 'active', created_at: iso(10 + i), updated_at: iso(10 + i), category: { id: 1, name: 'Sağlık', slug: 'saglik' }, provider: { id: user, full_name: 'Ayşe Yılmaz', avatar_url: null, profession: 'İş Güvenliği Uzmanı', title: null, certificate_class: 'A', current_company: null, city: 'İstanbul', show_phone_publicly: false } });
function seed() {
  resetDb(); writes.length = 0;
  db.professional_services = [SVC(1, 'Tüm Türkiye', 'Ulusal Danışmanlık', U2), SVC(2, 'İstanbul', 'İstanbul Ölçüm', U2), SVC(3, 'Kocaeli, Sakarya', 'Körfez Ölçüm'), SVC(4, 'istanbul', 'Küçük Harf İstanbul'), SVC(5, 'Ankara', 'Başkent Eğitim')];
}
// terminology-city-filter ile aynı: hizmet listesinde or=(...) koşullarını gerçek PostgREST gibi değerlendir
const orLog = [];
async function logicRest(ctx) {
  await ctx.route('https://twaptpofhbnnfciowoig.supabase.co/rest/v1/professional_services*', async route => {
    const req = route.request(), u = new URL(req.url());
    const ors = u.searchParams.getAll('or');
    if (req.method() !== 'GET' || !ors.length || u.searchParams.get('id')) return route.fallback();
    orLog.push(ors.join(' '));
    let rows = db.professional_services.filter(r => ors.every(o => evalExpr('or' + o, r)));
    for (const [k, v] of u.searchParams) { if (['select', 'order', 'limit', 'or', 'offset'].includes(k) || k.includes('.')) continue; if (v.startsWith('eq.')) rows = rows.filter(r => String(r[k]) === v.slice(3)); }
    return route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(rows.slice(0, +u.searchParams.get('limit') || 100)) });
  });
}
const titles = f => f.evaluate(() => [...document.querySelectorAll('[data-view="services"] .ks-card h2')].map(h => h.textContent.trim()).sort());
async function pickCity(f, scope, city) {
  await f.evaluate(sel => document.querySelector(`${sel} .kc-city-btn`).click(), scope);
  await f.evaluate(([sel, c]) => [...document.querySelectorAll(`${sel} [data-city]`)].find(li => li.dataset.city === c).click(), [scope, city]);
}

const browser = await chromium.launch(LAUNCH);
try {
  // ---------------- iframe kenar çizgisi (gerçek Hostinger gibi: iframe'de border stili yok) ----------------
  for (const vp of [{ name: 'desktop', width: 1366, height: 900 }, { name: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true }]) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch });
    await setup(ctx, false);
    const bare = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{height:100%}body{margin:0}header{height:64px;background:#222}footer{height:200px;background:#eee}</style></head><body><header></header><section><div class="block-layout"><div><iframe style="width:100%" srcdoc="${APP.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"></iframe></div></div></section><footer></footer></body></html>`;
    await ctx.route(`${SITE}/**`, r => r.fulfill({ contentType: 'text/html', body: bare }));
    const page = await ctx.newPage();
    const before = await (async () => { await page.setContent(bare.replace(/srcdoc="[^"]*"/, 'srcdoc="x"')); return page.evaluate(() => getComputedStyle(document.querySelector('iframe')).borderLeftWidth); })();
    await page.goto(`${SITE}/`); await settle(page, 1200);
    const b = await page.evaluate(() => { const s = getComputedStyle(document.querySelector('iframe')); return [s.borderLeftWidth, s.borderRightWidth, s.borderTopWidth, s.borderBottomWidth].join(' '); });
    const w = await page.evaluate(() => Math.round(document.querySelector('iframe').getBoundingClientRect().width));
    check(before !== '0px' && b === '0px 0px 0px 0px', `${vp.name} iframe kenarlığı kaldırıldı (önce ${before}, şimdi ${b}), genişlik ${w}px`);
    await page.screenshot({ path: path.join(OUT, `iframe-edge-${vp.name}.png`) });
    await ctx.close();
  }

  // ---------------- Hizmet Bul: filtre, kart, detay ----------------
  for (const vp of [{ name: 'desktop', width: 1366, height: 900 }, { name: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true }]) {
    seed();
    const mobile = vp.name === 'mobile';
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch });
    await setup(ctx, true); await logicRest(ctx); orLog.length = 0;
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.goto(`${SITE}/hizmetler`); await settle(page, 1200);
    const f = frameOf(page);
    await f.waitForSelector('[data-view="services"] .ks-card');
    const all = await titles(f);
    check(all.length === 5, `${vp.name} Tüm Şehirler: tüm hizmetler (${all.length})`);
    const card = await f.evaluate(() => [...document.querySelectorAll('[data-view="services"] .ks-card')].find(c => c.textContent.includes('Ulusal Danışmanlık'))?.textContent || '');
    check(card.includes('Tüm Türkiye'), `${vp.name} kartta bölge "Tüm Türkiye" görünüyor`);
    const scope = mobile ? '#kaFilterDialog' : '[data-view="services"] [data-desktop-filters]';
    const run = async city => {
      if (mobile) { await f.evaluate(() => document.querySelector('[data-view="services"] [data-open-filters]').click()); await f.waitForSelector('#kaFilterDialog[open]'); }
      await pickCity(f, scope, city);
      if (mobile) await f.evaluate(() => document.getElementById('kaFilterForm').requestSubmit());
      await settle(page, 1300);
      return titles(f);
    };
    let r = await run('İstanbul');
    check(JSON.stringify(r) === JSON.stringify(['Küçük Harf İstanbul', 'Ulusal Danışmanlık', 'İstanbul Ölçüm'].sort()), `${vp.name} İstanbul → İstanbul + "Tüm Türkiye" hizmetleri (${r.join(', ')})`);
    check(orLog.some(o => /service_region\.ilike\."%İstanbul%"/.test(o) && /service_region\.ilike\."%Tüm Türkiye%"/.test(o) && /service_region\.ilike\."%Tum Turkiye%"/.test(o)), `${vp.name} sorgu: seçilen il ve "Tüm Türkiye" (Türkçe yazım varyantlarıyla) aynı or() içinde`);
    r = await run('Sakarya');
    check(JSON.stringify(r) === JSON.stringify(['Körfez Ölçüm', 'Ulusal Danışmanlık'].sort()), `${vp.name} Sakarya → çok illi eski kayıt + Tüm Türkiye (${r.join(', ')})`);
    r = await run('');
    check(r.length === 5, `${vp.name} Tüm Şehirler → filtre kalktı, "Tüm Türkiye" ayrıca çoğalmadı (${r.length})`);
    const o = await f.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(o <= 1, `${vp.name} yatay taşma yok (${o})`);
    // detay
    await page.goto(`${SITE}/hizmet-detay?id=eeeeeeee-2222-4000-8000-000000000001`); await settle(page, 1200);
    const g = frameOf(page);
    check(await until(async () => ((await g.textContent('.kh-facts').catch(() => '')) || '').includes('Tüm Türkiye')), `${vp.name} Hizmet Detay: "Hizmet bölgesi: Tüm Türkiye"`);
    check(errs.length === 0, `${vp.name} sayfa hatası yok ${errs.join(' ')}`);
    await ctx.close();
  }

  // ---------------- Hizmet formu: seçenekler, eski değerler, kayıt ----------------
  {
    seed();
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await setup(ctx, true);
    const page = await ctx.newPage();
    await page.goto(`${SITE}/hizmetler`); await settle(page, 1200);
    let f = frameOf(page);
    await f.evaluate(() => document.querySelector('[data-view="services"] [data-publish]').click());
    await f.waitForSelector('#kaServiceDialog[open]');
    const opts = await f.evaluate(() => { const s = document.getElementById('kaServiceRegion'); return { tag: s.tagName, n: s.options.length, v: s.value, first: [...s.options].slice(0, 3).map(o => o.value), last: s.options[s.options.length - 1].value }; });
    check(opts.tag === 'SELECT' && opts.n === 83 && opts.v === '' && JSON.stringify(opts.first) === JSON.stringify(['', 'Tüm Türkiye', 'Adana']) && opts.last === 'Zonguldak', `yeni hizmet: "Seçin" + "Tüm Türkiye" + 81 il ${JSON.stringify(opts)}`);
    await f.fill('#kaServiceTitle', 'Yeni Ulusal Hizmet');
    await f.selectOption('#kaServiceCategory', { index: 1 });
    await f.fill('#kaServiceDescription', 'Tüm Türkiye genelinde uzaktan danışmanlık.');
    await f.selectOption('#kaServiceMode', 'remote');
    await f.selectOption('#kaServiceRegion', 'Tüm Türkiye');
    await f.click('#kaServiceSave');
    check(await until(() => writes.some(w => w.table === 'professional_services' && !Array.isArray(w.body) && w.body.title === 'Yeni Ulusal Hizmet')), 'yeni hizmet kaydedildi');
    const created = writes.find(w => w.table === 'professional_services' && w.body.title === 'Yeni Ulusal Hizmet')?.body;
    check(created?.service_region === 'Tüm Türkiye', `service_region = "Tüm Türkiye" (${created?.service_region})`);
    // düzenleme: listede olmayan eski değer korunur
    const edit = async (id) => {
      await page.goto(`${SITE}/hizmet-detay?id=${id}`); await settle(page, 1200);
      f = frameOf(page);
      await f.click('[data-service-owner] .kw-more-btn'); await f.click('[data-service-action="edit"]');
      await f.waitForSelector('#kaServiceDialog[open]');
      return f.evaluate(() => { const s = document.getElementById('kaServiceRegion'); return { v: s.value, label: s.selectedOptions[0]?.textContent, n: s.options.length }; });
    };
    let e = await edit('eeeeeeee-2222-4000-8000-000000000003');
    check(e.v === 'Kocaeli, Sakarya' && e.label === 'Kocaeli, Sakarya (mevcut)' && e.n === 84, `eski çok illi değer "(mevcut)" olarak seçili ${JSON.stringify(e)}`);
    await f.fill('#kaServiceTitle', 'Körfez Ölçüm (güncel)');
    writes.length = 0;
    await f.click('#kaServiceSave');
    check(await until(() => writes.some(w => w.table === 'professional_services')), 'düzenleme kaydedildi');
    const upd = writes.find(w => w.table === 'professional_services')?.body;
    check(upd?.service_region === 'Kocaeli, Sakarya' && upd?.title === 'Körfez Ölçüm (güncel)', `başka alan düzenlenince eski bölge değeri bozulmadı (${upd?.service_region})`);
    e = await edit('eeeeeeee-2222-4000-8000-000000000004');
    check(e.v === 'İstanbul' && e.n === 83, `küçük harf "istanbul" → İstanbul seçeneği seçili ${JSON.stringify(e)}`);
    await page.screenshot({ path: path.join(OUT, 'service-region-form.png') });
    await ctx.close();
  }
} finally {
  await browser.close();
}
