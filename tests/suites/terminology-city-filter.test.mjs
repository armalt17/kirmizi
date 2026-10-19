// Kaynak: geçici /tmp/claude-0/pkg/cityterm.mjs — v4.12.0 güvenlik ağı olarak kalıcılaştırıldı.
import { chromium, fs, ROOT, APP, NM, OUT, U1, U2, now, iso, db, writes, uploads, IMG, DB0, resetDb, cursorOr, filterRows, seq, orderRows, withEmbeds, handleRest, libs, HOSTINGER_BASE_CSS, hostPage, errors, realtimeMock, postSeq, makePost, setup, frameOf, check, DEFAULT_CHROMIUM, LAUNCH } from '../helpers/harness.mjs';
import { b64, tokenFor, uidOf, uidSeq, authMock, boot, acct, paneOf, errOf, navLogin, go, submitPane, fillSignup, visibleView, navClick, settle, flag, noProfileInsert } from '../helpers/auth.mjs';
import { splitTop, unq, likeRe, evalExpr } from '../helpers/postgrest-logic.mjs';

const reqLog = [];
async function logicRest(ctx) {
  await ctx.route('https://twaptpofhbnnfciowoig.supabase.co/rest/v1/**', async route => {
    const req = route.request(), u = new URL(req.url()), table = u.pathname.split('/').pop();
    if (req.method() !== 'GET' || !['profiles', 'professional_services'].includes(table) || !u.searchParams.getAll('or').length) return route.fallback();
    reqLog.push({ table, url: decodeURIComponent(u.search) });
    const ors = u.searchParams.getAll('or');
    let rows = (db[table] || []).filter(r => ors.every(o => evalExpr('or' + o, r)));
    for (const [k, v] of u.searchParams) { if (['select', 'order', 'limit', 'or', 'offset'].includes(k) || k.includes('.')) continue; if (v.startsWith('eq.')) rows = rows.filter(r => String(r[k]) === v.slice(3)); }
    if (table === 'professional_services') rows = rows.map(r => ({ ...r }));
    else rows = rows.map(({ phone, ...r }) => ({ ...r, posts: [{ count: db.professional_posts.filter(p => p.user_id === r.id && p.status === 'active').length }], services: [{ count: db.professional_services.filter(s => s.user_id === r.id && s.status === 'active').length }] }));
    const lim = +u.searchParams.get('limit') || 100;
    return route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(rows.slice(0, lim)) });
  });
}
const CITY_PEOPLE = [['İstanbul', 'Deniz Aksoy'], ['istanbul', 'Emre Kaya'], ['ISTANBUL', 'Seda Tunç'], ['Ankara', 'Burak Şen'], ['İzmir', 'Cem Yıldız'], ['izmir', 'Nur Ak'], ['Şanlıurfa', 'Hasan Er'], ['Sanliurfa', 'Ali Can'], ['Bursa', 'Elif Su'], [null, 'Şehirsiz Kişi']];
const SERVICE_REG = [['İstanbul, Kocaeli', 'Marmara Ölçüm'], ['Ankara', 'Başkent Eğitim'], ['Marmara', 'Bölgesel Danışmanlık'], ['izmir', 'Ege İSG'], ['Kocaeli, Sakarya', 'Körfez Ölçüm']];
function seedCities() {
  CITY_PEOPLE.forEach(([city, name], i) => db.profiles.push({ id: `dddddddd-0000-4000-8000-${String(900 + i).padStart(12, '0')}`, full_name: name, avatar_url: null, profession: 'İş Güvenliği Uzmanı', title: null, certificate_class: 'B', city, current_company: null, is_discoverable: true, specialties: [], last_post_at: iso(1000 + i) }));
  SERVICE_REG.forEach(([region, title], i) => db.professional_services.push({ id: `eeeeeeee-1111-4000-8000-${String(i).padStart(12, '0')}`, user_id: U2, title, category_id: 1, description: 'Test hizmeti', service_region: region, service_mode: 'onsite', status: 'active', created_at: iso(5000 + i), updated_at: iso(5000 + i), category: { id: 1, name: 'Sağlık', slug: 'saglik' }, provider: { id: U2, full_name: 'Mehmet Şahin Öztürk', avatar_url: null, profession: 'İşyeri Hekimi', title: null, certificate_class: 'İşyeri Hekimi', current_company: null } }));
  db.professional_posts.forEach((p, i) => { p.content = `Saha denetimi #${i}: risk değerlendirmesi ve düzeltici faaliyet takibi yapıldı.`; });
}
const names = (f, view) => f.evaluate(v => [...document.querySelectorAll(`[data-view="${v}"] .kc-card h2`)].map(h => h.textContent.trim()), view);
// Kullanıcıya görünen tüm metin: görünür metin + aria-label/placeholder/title/alt (iframe + üst dokümandaki nav/paneller)
const uiText = page => page.evaluate(() => {
  const collect = rootNode => { const t = [rootNode.body?.innerText || rootNode.innerText || '']; rootNode.querySelectorAll('[aria-label],[placeholder],[title],[alt]').forEach(n => ['aria-label', 'placeholder', 'title', 'alt'].forEach(a => { const v = n.getAttribute(a); if (v) t.push(v); })); return t.join('\n'); };
  const fd = document.querySelector('iframe').contentDocument;
  const hidden = [...fd.querySelectorAll('template')]; // yok sayılır
  const texts = [document.title, collect(fd)];
  for (const id of ['kisg-pro-nav', 'kisg-pro-sides']) { const h = document.getElementById(id); if (h?.shadowRoot) texts.push(h.shadowRoot.textContent, [...h.shadowRoot.querySelectorAll('[aria-label]')].map(n => n.getAttribute('aria-label')).join('\n')); }
  return texts.join('\n');
});
async function pickCity(f, scopeSel, city, query) {
  await f.evaluate(sel => document.querySelector(`${sel} .kc-city-btn`).click(), scopeSel);
  if (query != null) { await f.fill(`${scopeSel} [data-city-q]`, query); }
  await f.evaluate(([sel, c]) => [...document.querySelectorAll(`${sel} [data-city]`)].find(li => li.dataset.city === c).click(), [scopeSel, city]);
}
const browser = await chromium.launch(LAUNCH);
for (const vp of [{ name: 'desktop', width: 1366, height: 900 }, { name: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true }]) {
  const N = vp.name, mobile = !!vp.isMobile;
  resetDb(); seedCities();
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch });
  await setup(ctx, true); await logicRest(ctx);
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`cityterm ${N}: ${e.message}`));
  // ---- Terminoloji: Akış ----
  await page.goto('https://isgcalisanplatformu.com/'); await settle(page, 1500);
  const f = frameOf(page); await f.waitForSelector('[data-view="works"] [data-post-id]');
  let txt = await uiText(page);
  check(!/Çalışma/.test(txt), `${N} Akış: kullanıcıya görünen metinde "Çalışma" yok ${(txt.match(/.{0,30}Çalışma.{0,30}/) || [''])[0]}`);
  check(!/Son Post ·/.test(txt) && /Yeni Post|Post paylaş/.test(txt), `${N} Akış: "Post paylaş…" görünüyor; "Son Post ·" satırı yok (v4.25.0'da kaldırıldı)`);
  await f.evaluate(() => document.querySelector('[data-view="works"] [data-media]').click()); await settle(page, 500);
  check((await f.textContent('#kaMediaDialog .k-media-open')).includes('Postu Gör'), `${N} görüntüleyici: "Postu Gör →"`);
  await page.keyboard.press('Escape'); await settle(page, 300);
  await f.evaluate(() => document.querySelector('[data-view="works"] [data-composer]').click()); await f.waitForSelector('#kaPostDialog[open]');
  check(await f.textContent('#kaPostTitle') === 'Yeni Post' && await f.textContent('#kaPostSubmit') === 'Post Yayınla' && !/Çalışma/.test(await uiText(page)), `${N} composer: "Yeni Post" / "Post Yayınla"`);
  await page.keyboard.press('Escape'); await settle(page, 300);
  // ---- Post Detay ----
  const PID = 'bbbbbbbb-0000-4000-8000-000000000001';
  await f.evaluate(id => document.querySelector(`[data-view="works"] [data-post-id="${id}"] .kw-post-tags`).click(), PID); await f.waitForSelector(`[data-view="work"] [data-post-id="${PID}"]`); await settle(page, 600);
  txt = await uiText(page);
  check(page.url().endsWith(`/calisma-detay?id=${PID}`) && !/Çalışma/.test(txt) && /Post \| Kırmızı İSG/.test(await page.title()) && await f.getAttribute('[data-view="work"]', 'aria-label') === 'Post Detay', `${N} Post Detay: URL /calisma-detay aynı, metinde "Çalışma" yok, başlık "${await page.title()}"`);
  // ---- Profil ----
  await page.goto(`https://isgcalisanplatformu.com/profil?id=${U1}`); await settle(page, 1500);
  let g = frameOf(page); await g.waitForSelector('#kpName');
  txt = await uiText(page);
  const tab = (await g.textContent('[data-profile-tab="calismalar"]')).replace(/\s+/g, ' ').trim();
  check(!/Çalışma/.test(txt) && /^Postlar\s*\d+$/.test(tab), `${N} Profil: "Çalışma" yok, sekme "${tab}"`);
  // ---- Uzmanlar: kart sayacı + şehir filtresi ----
  await page.goto('https://isgcalisanplatformu.com/uzmanlar'); await settle(page, 1500);
  g = frameOf(page); await g.waitForSelector('[data-view="experts"] .ke-card');
  txt = await uiText(page);
  const counters = await g.evaluate(() => [...document.querySelectorAll('[data-view="experts"] .ke-card')].map(x => (x.title.match(/(\d+ Post( · \d+ Hizmet)?|\d+ Hizmet)$/) || [])[0]).filter(Boolean));
  check(!/Çalışma/.test(txt), `${N} Uzmanlar: "Çalışma" yok`);
  check(await g.locator('[data-view="experts"] input[data-filter="city"]').count() === 0, `${N} Uzmanlar: serbest metin şehir girişi kaldırıldı`);
  const all0 = await names(g, 'experts');
  let scope;
  if (mobile) { await g.evaluate(() => document.querySelector('[data-view="experts"] [data-open-filters]').click()); await g.waitForSelector('#kaFilterDialog[open]'); scope = '#kaFilterDialog'; }
  else scope = '[data-view="experts"] [data-desktop-filters]';
  const pick = await g.evaluate(sel => { const w = document.querySelector(`${sel} [data-city-picker]`); const s = w.querySelector('select'); return { label: w.querySelector('[data-city-value]').textContent, opts: s.options.length, first: s.options[0].textContent, vis: w.querySelector('.kc-city-btn').getBoundingClientRect().height > 30 }; }, scope);
  check(pick.label === 'Tüm Şehirler' && pick.opts === 83 && pick.first === 'Tüm Şehirler' && pick.vis, `${N} Uzmanlar şehir seçici: varsayılan "Tüm Şehirler", 81 il + Yurtdışı ${JSON.stringify(pick)}`);
  await g.evaluate(sel => document.querySelector(`${sel} .kc-city-btn`).click(), scope);
  const searchRes = {};
  for (const q of ['ist', 'sanli', 'IZM', 'çan', 'xyz']) { await g.fill(`${scope} [data-city-q]`, q); searchRes[q] = await g.evaluate(sel => [...document.querySelectorAll(`${sel} [data-city-list] li`)].map(li => li.textContent), scope); }
  check(searchRes.ist.join() === 'İstanbul' && searchRes.sanli.join() === 'Şanlıurfa' && searchRes.IZM.join() === 'İzmir' && searchRes['çan'].includes('Çanakkale') && searchRes['çan'].includes('Çankırı') && searchRes.xyz.join() === 'Şehir bulunamadı', `${N} şehir araması Türkçe karakterden bağımsız ${JSON.stringify(searchRes)}`);
  await page.screenshot({ path: `${OUT}/city-picker-${N}.png` });
  await g.evaluate(sel => document.querySelector(`${sel} .kc-city-btn`).click(), scope);
  const run = async (city, query) => {
    await pickCity(g, scope, city, query);
    if (mobile) { await g.evaluate(() => document.getElementById('kaFilterForm').requestSubmit()); }
    await settle(page, 1300);
    const r = await names(g, 'experts');
    if (mobile) { await g.evaluate(() => document.querySelector('[data-view="experts"] [data-open-filters]').click()); await g.waitForSelector('#kaFilterDialog[open]'); }
    return r;
  };
  const expCity = c => db.profiles.filter(p => p.is_discoverable && p.city && ['İstanbul', 'istanbul', 'ISTANBUL', 'Istanbul'].includes(c === 'İstanbul' ? p.city : '') ).map(p => p.full_name).sort().join();
  let r = await run('İstanbul', 'ist');
  const cnt = await g.evaluate(() => [...document.querySelectorAll('[data-view="experts"] .ke-card')].map(x => (x.title.match(/(\d+ Post( · \d+ Hizmet)?|\d+ Hizmet)$/) || [])[0]).filter(Boolean));
  check(cnt.length > 0 && cnt.every(c => /^\d+ Post( · \d+ Hizmet)?$|^\d+ Hizmet$/.test(c)) && cnt.some(c => /Post/.test(c)), `${N} Uzmanlar kart sayacı "${cnt[0]}"`);
  check(r.sort().join() === expCity('İstanbul') && r.includes('Ayşe Yılmaz') && r.length === 4, `${N} Uzmanlar İstanbul → yalnız İstanbul/istanbul/ISTANBUL (${r.join(', ')})`);
  check(reqLog.some(x => x.table === 'profiles' && /city\.ilike\."%İstanbul%"/.test(x.url) && /city\.ilike\."%istanbul%"/.test(x.url) && /city\.ilike\."%Istanbul%"/.test(x.url)), `${N} Uzmanlar sorgusu profiles.city üzerinde Türkçe yazım varyantlarıyla`);
  r = await run('Ankara'); check(r.join() === 'Burak Şen', `${N} Uzmanlar Ankara → ${r.join(', ')}`);
  r = await run('İzmir'); check(r.sort().join() === ['Cem Yıldız', 'Nur Ak'].sort().join(), `${N} Uzmanlar İzmir → İzmir/izmir (${r.join(', ')})`);
  r = await run('Şanlıurfa', 'urfa'); check(r.sort().join() === ['Ali Can', 'Hasan Er'].sort().join(), `${N} Uzmanlar Şanlıurfa → Şanlıurfa/Sanliurfa (${r.join(', ')})`);
  r = await run('Van'); check(r.length === 0 && await g.isVisible('[data-view="experts"] [data-empty]'), `${N} Uzmanlar Van → sonuç yok, boş durum`);
  r = await run(''); check(r.length === all0.length && r.includes('Şehirsiz Kişi'), `${N} Tüm Şehirler → filtre kalktı (${r.length}/${all0.length})`);
  // arama + şehir birlikte
  if (mobile) { await page.keyboard.press('Escape'); await settle(page, 300); }
  await g.fill('[data-view="experts"] [data-search]', 'Emre'); await settle(page, 900);
  if (mobile) { await g.evaluate(() => document.querySelector('[data-view="experts"] [data-open-filters]').click()); await g.waitForSelector('#kaFilterDialog[open]'); }
  r = await run('İstanbul'); check(r.join() === 'Emre Kaya', `${N} arama "Emre" + İstanbul → ${r.join(', ')}`);
  if (mobile) { await page.keyboard.press('Escape'); await settle(page, 300); }
  await g.fill('[data-view="experts"] [data-search]', ''); await settle(page, 900);
  // ---- Hizmet Bul ----
  await navClick(page, 'services'); await g.waitForSelector('[data-view="services"] .ks-card'); await settle(page, 600);
  check(await g.locator('[data-view="services"] input[data-filter="region"]').count() === 0, `${N} Hizmet Bul: serbest metin bölge girişi kaldırıldı`);
  const sscope = mobile ? '#kaFilterDialog' : '[data-view="services"] [data-desktop-filters]';
  const srun = async city => {
    if (mobile) { await g.evaluate(() => document.querySelector('[data-view="services"] [data-open-filters]').click()); await g.waitForSelector('#kaFilterDialog[open]'); }
    await pickCity(g, sscope, city);
    if (mobile) await g.evaluate(() => document.getElementById('kaFilterForm').requestSubmit());
    await settle(page, 1300);
    return g.evaluate(() => [...document.querySelectorAll('[data-view="services"] .ks-card h2')].map(h => h.textContent.trim()));
  };
  const sAll = await g.evaluate(() => document.querySelectorAll('[data-view="services"] .ks-card').length);
  const expSvc = c => db.professional_services.filter(v => v.status === 'active' && v.service_region && new RegExp(c, 'i').test(v.service_region.replace('izmir', 'İzmir'))).map(v => v.title).sort().join();
  r = await srun('İstanbul'); check(r.sort().join() === expSvc('İstanbul') && r.includes('Marmara Ölçüm') && !r.includes('Başkent Eğitim'), `${N} Hizmet Bul İstanbul → "İstanbul, Kocaeli" kaydı (${r.join(', ')})`);
  check(reqLog.some(x => x.table === 'professional_services' && /service_region\.ilike\."%İstanbul%"/.test(x.url)), `${N} Hizmet Bul sorgusu service_region üzerinde`);
  r = await srun('Kocaeli'); check(r.sort().join() === expSvc('Kocaeli') && r.includes('Körfez Ölçüm') && r.includes('Marmara Ölçüm'), `${N} Hizmet Bul Kocaeli → çok illi bölgelerde de eşleşir (${r.join(', ')})`);
  r = await srun('İzmir'); check(r.join() === 'Ege İSG', `${N} Hizmet Bul İzmir → "izmir" yazımı da eşleşir (${r.join(', ')})`);
  r = await srun(''); check(r.length === sAll, `${N} Hizmet Bul Tüm Şehirler → filtre kalktı (${r.length}/${sAll})`);
  // kategori + şehir birlikte
  if (!mobile) { await g.selectOption('[data-view="services"] [data-desktop-filters] [data-filter="mode"]', 'onsite'); await settle(page, 900); r = await srun('Ankara'); check(r.join() === 'Başkent Eğitim', `${N} hizmet şekli + Ankara → ${r.join(', ')}`); }
  else { await g.evaluate(() => document.querySelector('[data-view="services"] [data-open-filters]').click()); await g.waitForSelector('#kaFilterDialog[open]'); await g.selectOption('#kaFilterDialog [data-filter="mode"]', 'onsite'); await pickCity(g, '#kaFilterDialog', 'Ankara'); await g.evaluate(() => document.getElementById('kaFilterForm').requestSubmit()); await settle(page, 1300); r = await g.evaluate(() => [...document.querySelectorAll('[data-view="services"] .ks-card h2')].map(h => h.textContent.trim())); check(r.join() === 'Başkent Eğitim', `${N} hizmet şekli + Ankara → ${r.join(', ')}`); }
  const o = await page.evaluate(() => { const fd = document.querySelector('iframe').contentDocument; return fd.documentElement.scrollWidth - fd.documentElement.clientWidth; });
  check(o <= 1, `${N} yatay taşma yok (${o})`);
  await ctx.close();
}
await browser.close();
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO PAGE ERRORS');
