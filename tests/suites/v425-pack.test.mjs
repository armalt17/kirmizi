// v4.25.0 paketi — hedefli tarayıcı testi: Profil V2, Hizmet Bul Visual V3, Uzmanlar V2 (sıralama, işaret), Akış (vitrin, "Son Post" yok).
import { chromium, OUT, U1, U2, db, writes, check, LAUNCH, setup, frameOf, resetDb, iso, orderRows } from '../helpers/harness.mjs';
import { evalExpr } from '../helpers/postgrest-logic.mjs';
import path from 'node:path';

const SITE = 'https://isgcalisanplatformu.com';
const U3 = '33333333-0000-4000-8000-000000000003';   // Postu yok, tek aktif hizmeti var
const U4 = '44444444-0000-4000-8000-000000000004';   // ne Post ne hizmet
const settle = (page, ms = 900) => page.waitForTimeout(ms);
const until = async (fn, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await new Promise(r => setTimeout(r, 60)); } return false; };
const pid = n => `abcdabcd-0000-4000-8000-${String(n).padStart(12, '0')}`;
const NAMES = ['Zehra Aksoy', 'Burak Çelik', 'Ceren Demir', 'Deniz Er', 'Elif Fırat', 'Fatih Gök', 'Gizem Han', 'Hakan Işık', 'İpek Kara', 'Kemal Lale', 'Leyla Mutlu', 'Murat Nas', 'Nazlı Oral', 'Onur Pek', 'Pınar Sarı', 'Selim Tan', 'Tuğba Uz', 'Umut Var', 'Yasin Yel', 'Ahmet Zor', 'Berk Acar', 'Cem Bal'];

function seed() {
  resetDb();
  const svcBase = { category_id: 1, description: 'Kapsamlı hizmet.', service_region: 'Ankara', service_mode: 'onsite', status: 'active', category: { id: 1, name: 'Sağlık' } };
  db.profiles.push(
    { id: U3, full_name: 'Selin Hizmetçi', avatar_url: null, profession: 'İş Güvenliği Uzmanı', title: null, certificate_class: 'B', city: 'Ankara', current_company: null, about: null, social_links: [], is_discoverable: true, show_phone_publicly: false, phone: null, last_post_at: null, created_at: iso(5000) },
    { id: U4, full_name: 'Kaan Sessiz', avatar_url: null, profession: 'İşyeri Hekimi', title: null, certificate_class: null, city: 'İzmir', current_company: null, about: null, social_links: [], is_discoverable: true, show_phone_publicly: false, phone: null, last_post_at: null, created_at: iso(6000) }
  );
  db.professional_services.push({ ...svcBase, id: 'aaaaaaaa-0000-4000-8000-000000000033', user_id: U3, title: 'Ankara Risk Analizi', created_at: iso(50) });
  // Uzmanlar sıralaması: 22 görünür uzman (sayfa 18) — farklı kayıt ve son Post zamanları
  NAMES.forEach((name, i) => db.profiles.push({ id: pid(i + 1), full_name: name, avatar_url: null, profession: 'İş Güvenliği Uzmanı', title: null, certificate_class: null, city: 'Bursa', current_company: null, is_discoverable: true, show_phone_publicly: false, last_post_at: i % 4 === 3 ? null : iso(10 + i * 7), created_at: iso(100000 - ((i * 37) % 22) * 1000) }));
  db.profiles.forEach(p => { p.created_at ||= iso(200000); });
  // PostgREST gömülü aktif hizmet sayacı (mock gömülü sayaçları hesaplamaz): Selin'de 1, diğerlerinde 0
  db.profiles.forEach(p => { p.services = [{ count: p.id === U3 ? 1 : 0 }]; p.posts = [{ count: 0 }]; });
}

// Ortak mock genel or=(…) imleçlerini yok sayar: Uzmanlar sorgusu için or + order + limit gerçek PostgREST gibi değerlendirilir.
async function expertsRest(ctx) {
  await ctx.route('https://twaptpofhbnnfciowoig.supabase.co/rest/v1/profiles?*', route => {
    const req = route.request(), u = new URL(req.url());
    if (req.method() !== 'GET' || u.searchParams.get('is_discoverable') !== 'eq.true' || !/services:/.test(u.searchParams.get('select') || '')) return route.fallback();
    let rows = db.profiles.filter(r => r.is_discoverable === true && u.searchParams.getAll('or').every(o => evalExpr('or' + o, r)));
    rows = orderRows(rows, u.searchParams).slice(0, +u.searchParams.get('limit') || 100);
    return route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(rows) });
  });
}

const browser = await chromium.launch(LAUNCH);
try {
  for (const vp of [{ name: 'desktop', width: 1366, height: 900 }, { name: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true }]) {
    const N = vp.name, mobile = N === 'mobile';
    seed();
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch });
    await setup(ctx, true); await expertsRest(ctx);
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(String(e)));
    const restReqs = []; page.on('request', r => { if (r.url().includes('/rest/v1/profiles?')) restReqs.push(decodeURIComponent(r.url())); });
    const overflow = f => f.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

    // ================= 1) PROFİL V2 =================
    // a) Kendi profili: Hesap & Gizlilik erişimi, editörde görünürlük anahtarı yok
    await page.goto(`${SITE}/profil?id=${U1}`); await settle(page, 1200);
    let f = frameOf(page); await f.waitForSelector('.kp-card [data-profile-action="edit"]');
    const acc = await f.evaluate(() => { const a = document.querySelector('.kp-card .kp-account'); return a && { href: a.getAttribute('href'), view: a.dataset.viewLink, text: a.textContent }; });
    check(acc?.href === `${SITE}/hesaplar-ve-gizlilik` && acc.view === 'account' && /Hesap & Gizlilik/.test(acc.text), `${N} profil (sahip): Hesap & Gizlilik bağlantısı ${JSON.stringify(acc)}`);
    await f.evaluate(() => document.querySelector('.kp-card [data-profile-action="edit"]').click()); await f.waitForSelector('#kaProfileDialog[open]');
    check(await f.locator('#kaProfileDialog input[type="checkbox"]').count() === 0 && !(await f.textContent('#kaProfileDialog')).includes("Uzmanlar'da görünür ol"), `${N} profil düzenle: görünürlük / telefon anahtarı yok`);
    const before = { ...db.profiles.find(p => p.id === U1) };
    await settle(page, 300);   // pencere açılışındaki Ad Soyad odağı tamamlansın
    writes.length = 0;
    await f.fill('#kaPe_current_company', 'Yeni Firma A.Ş.'); await f.click('#kaPeSave');
    await f.waitForSelector('#kaProfileDialog:not([open])', { state: 'attached' });
    const patch = writes.find(w => w.table === 'profiles');
    const me = db.profiles.find(p => p.id === U1);
    check(patch && JSON.stringify(Object.keys(patch.body)) === '["current_company"]' && me.is_discoverable === before.is_discoverable && me.show_phone_publicly === before.show_phone_publicly, `${N} profil düzenle: yalnız değişen alan yazıldı, görünürlük değerleri korundu ${JSON.stringify(patch?.body)}`);
    // Editördeki Hesap & Gizlilik bağlantısı: pencere kapanır, kabuk içinde hesap sayfası açılır
    await f.evaluate(() => document.querySelector('.kp-card [data-profile-action="edit"]').click()); await f.waitForSelector('#kaProfileDialog[open]');
    await f.click('#kaProfileDialog .kpe-privacy a');
    check(await until(() => f.evaluate(() => !document.getElementById('kaProfileDialog').open && document.getElementById('kisgApp').dataset.activeView === 'account')) && page.url() === `${SITE}/hesaplar-ve-gizlilik`, `${N} editör → Hesap & Gizlilik (pencere kapandı, ${page.url()})`);
    // Kart bağlantısı da aynı sayfayı açar
    await page.goto(`${SITE}/profil?id=${U1}`); await settle(page, 1200); f = frameOf(page); await f.waitForSelector('.kp-card .kp-account');
    await f.click('.kp-card .kp-account');
    check(await until(() => f.evaluate(() => document.getElementById('kisgApp').dataset.activeView === 'account')), `${N} kart → Hesap & Gizlilik`);

    // b) Ziyaretçi: aktif hizmeti olan profil → "Hizmet veriyor" + sekme vurgusu; tıklama hizmetleri açar
    const nU2 = db.professional_services.filter(v => v.user_id === U2 && v.status === 'active').length;
    await page.goto(`${SITE}/profil?id=${U2}`); await settle(page, 1200); f = frameOf(page);
    await f.waitForSelector('[data-kp-serving]:not([hidden])');
    const sv = await f.evaluate(() => ({ text: document.querySelector('[data-kp-serving]').textContent, has: document.querySelector('.kp').classList.contains('has-services'), acc: !!document.querySelector('.kp-card .kp-account'), tab: document.querySelector('[data-profile-tab][aria-selected="true"]').dataset.profileTab, bg: getComputedStyle(document.querySelector('.kp-serving-btn')).backgroundColor }));
    check(sv.text === `Hizmet veriyor${nU2} aktif hizmet` && sv.has && !sv.acc && sv.tab === 'calismalar', `${N} ziyaretçi: "Hizmet veriyor · ${nU2} aktif hizmet", sekme vurgulu, Hesap & Gizlilik yok ${JSON.stringify(sv)}`);
    check(sv.bg === 'rgb(255, 255, 255)', `${N} "Hizmet veriyor" nötr (beyaz zemin; ücretli rozet rengi yok)`);
    await f.click('[data-kp-serving] button');
    check(await until(() => f.evaluate(() => document.querySelector('[data-profile-tab][aria-selected="true"]').dataset.profileTab === 'hizmetler' && !document.querySelector('[data-profile-panel="hizmetler"]').hidden && document.querySelectorAll('[data-profile-services] .ks-card').length > 0)) && page.url().endsWith('#hizmetler'), `${N} "Hizmet veriyor" → Verdiği Hizmetler açıldı`);
    await page.screenshot({ path: path.join(OUT, `v425-profile-${N}.png`) });
    // c) Postu olmayan + hizmeti olan profil: ziyaretçi doğrudan hizmetleri görür; açık #calismalar korunur
    await page.goto(`${SITE}/profil?id=${U3}`); await settle(page, 1400); f = frameOf(page);
    check(await until(() => f.evaluate(() => document.querySelector('[data-profile-tab][aria-selected="true"]')?.dataset.profileTab === 'hizmetler')), `${N} Postu olmayan hizmet veren profil: Verdiği Hizmetler açık`);
    await page.goto(`${SITE}/uzmanlar`); await settle(page, 600);
    await page.goto(`${SITE}/profil?id=${U3}#calismalar`); await settle(page, 1400); f = frameOf(page);
    check(await f.evaluate(() => document.querySelector('[data-profile-tab][aria-selected="true"]').dataset.profileTab) === 'calismalar', `${N} adres #calismalar ise sekme değişmez`);
    // d) Aktif hizmeti olmayan profil: ekstra vurgu yok
    await page.goto(`${SITE}/profil?id=${U4}`); await settle(page, 1400); f = frameOf(page); await f.waitForSelector('#kpName');
    await settle(page, 400);
    check(await f.evaluate(() => document.querySelector('[data-kp-serving]').hidden && !document.querySelector('.kp').classList.contains('has-services')), `${N} hizmeti olmayan profil: "Hizmet veriyor" ve sekme vurgusu yok`);
    check(await overflow(f) <= 0, `${N} profil: yatay taşma yok`);

    // ================= 2) HİZMET BUL V3 =================
    await page.goto(`${SITE}/hizmetler`); await settle(page, 1400); f = frameOf(page);
    await f.waitForSelector('[data-view="services"] .ks-card');
    const sm = await f.evaluate(() => {
      const v = document.querySelector('[data-view="services"]'), r = s => { const e = v.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return b.width ? { h: Math.round(b.height), top: Math.round(b.top), w: Math.round(b.width), left: Math.round(b.left), right: Math.round(b.right), bottom: Math.round(b.bottom) } : null; };
      const head = v.querySelector('.kc-results-head p'), hero = v.querySelector('.ks-hero'), art = v.querySelector('.ks-hero-art');
      return { search: r('.kc-search'), mode: r('[data-desktop-filters] [data-filter="mode"]'), city: r('[data-desktop-filters] .kc-city-btn'), filterBtn: r('[data-open-filters]'), chip: r('.ks-chip'),
        count: { fs: parseFloat(getComputedStyle(head).fontSize), color: getComputedStyle(head).color }, hero: r('.ks-hero'), art: r('.ks-hero-art'), heroBox: hero.getBoundingClientRect().toJSON(), artBox: art.getBoundingClientRect().toJSON(), cards: v.querySelectorAll('.ks-card').length };
    });
    if (!mobile) {
      check(sm.search.h === 56 && sm.mode.h === sm.city.h && sm.mode.h === sm.search.h && sm.mode.top === sm.city.top && sm.mode.w === sm.city.w, `${N} Hizmet Bul: arama ve iki filtre aynı yükseklik/hizada ${JSON.stringify({ s: sm.search, m: sm.mode, c: sm.city })}`);
    } else {
      check(sm.search.h <= 44 && sm.filterBtn.h <= 44 && sm.chip.h <= 32, `${N} Hizmet Bul: arama/Filtrele ≤44px, çip ≤32px (${sm.search.h}/${sm.filterBtn.h}/${sm.chip.h})`);
      check(sm.count.fs <= 12, `${N} Hizmet Bul: "X hizmet listeleniyor" ikincil (${sm.count.fs}px)`);
      const inside = sm.artBox.left >= sm.heroBox.left && sm.artBox.right <= sm.heroBox.right && sm.artBox.top >= sm.heroBox.top && sm.artBox.bottom <= sm.heroBox.bottom;
      check(inside && sm.hero.h < 300, `${N} Hizmet Bul: baret kahraman alanının içinde, kesilmiyor; kahraman ${sm.hero.h}px`);
    }
    check(await overflow(f) <= 0 && errs.length === 0, `${N} Hizmet Bul: taşma/hata yok ${errs.join(' ')}`);
    // filtre davranışı aynı: şehir seçimi sorguya gider
    await page.screenshot({ path: path.join(OUT, `v425-services-${N}.png`) });

    // ================= 3) UZMANLAR V2 =================
    await page.goto(`${SITE}/uzmanlar`); await settle(page, 1400); f = frameOf(page);
    await f.waitForSelector('[data-view="experts"] .ke-card');
    const opts = await f.$$eval('[data-view="experts"] [data-sort] option', o => o.map(x => [x.value, x.textContent]));
    check(JSON.stringify(opts) === JSON.stringify([['active', 'Son Aktif'], ['new', 'Yeni Katılanlar'], ['az', 'A–Z']]), `${N} Uzmanlar: sıralama seçenekleri ${JSON.stringify(opts)} ("Önerilen" güvenilir veri olmadığı için yok)`);
    const names = () => f.$$eval('[data-view="experts"] .ke-card h2', h => h.map(x => x.textContent));
    const loadAll = async () => { for (let i = 0; i < 5; i++) { const more = f.locator('[data-view="experts"] [data-more]'); if (!(await more.isVisible())) break; await more.click(); await settle(page, 700); } return names(); };
    const visible = db.profiles.filter(p => p.is_discoverable === true);
    const expect = {
      active: [...visible].sort((a, b) => (b.last_post_at ? Date.parse(b.last_post_at) : -Infinity) - (a.last_post_at ? Date.parse(a.last_post_at) : -Infinity) || (a.id < b.id ? 1 : -1)).map(p => p.full_name),
      new: [...visible].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || (a.id < b.id ? 1 : -1)).map(p => p.full_name),
      az: [...visible].sort((a, b) => (a.full_name < b.full_name ? -1 : a.full_name > b.full_name ? 1 : a.id < b.id ? -1 : 1)).map(p => p.full_name)
    };
    let got = await loadAll();
    check(JSON.stringify(got) === JSON.stringify(expect.active) && got.length === visible.length, `${N} Son Aktif (varsayılan): last_post_at ↓, boşlar sonda; sayfalama tekrarsız (${got.length})`);
    for (const k of ['new', 'az']) {
      restReqs.length = 0;
      await f.selectOption('[data-view="experts"] [data-sort]', k); await settle(page, 1200);
      got = await loadAll();
      const ord = restReqs.find(u => u.includes('is_discoverable=eq.true') && u.includes('order='))?.match(/order=([^&]+)/)?.[1];
      check(JSON.stringify(got) === JSON.stringify(expect[k]) && got.length === visible.length, `${N} ${k === 'new' ? 'Yeni Katılanlar' : 'A–Z'}: doğru sıra, sayfalama tekrarsız (${got.length}; order=${ord})`);
    }
    check(await f.evaluate(() => document.querySelector('[data-view="experts"] [data-filter-label]').textContent) === (mobile ? 'Filtrele' : 'Filtrele') && await f.isHidden('[data-view="experts"] [data-reset]'), `${N} sıralama filtre sayılmaz ("Filtreleri temizle" görünmez)`);
    // Hizmet veriyor işareti yalnız aktif hizmeti olan kartta
    const serving = await f.$$eval('[data-view="experts"] .ke-card', c => c.filter(x => x.querySelector('.ke-serving')).map(x => x.querySelector('h2').textContent));
    check(JSON.stringify(serving) === '["Selin Hizmetçi"]', `${N} kartta "Hizmet veriyor" yalnız aktif hizmeti olan uzmanda ${JSON.stringify(serving)}`);
    // Meslek / Uzmanlık datalist üçgeni gizli; arama tek çerçeve
    if (!mobile) {
      // Göstergenin hesaplanmış stili okunamaz; kural etkin stil sayfasında ve Meslek/Uzmanlık girişleri datalist'li
      const tri = await f.evaluate(() => {
        const rules = [...document.styleSheets].flatMap(sh => { try { return [...sh.cssRules]; } catch { return []; } }).map(r => r.cssText);
        const rule = rules.find(t => t.includes('input[list]::-webkit-calendar-picker-indicator'));
        const inputs = [...document.querySelectorAll('[data-view="experts"] [data-desktop-filters] input[list]')].map(i => i.dataset.filter);
        return { rule: !!rule && /display: none/.test(rule), inputs };
      });
      check(tri.rule && JSON.stringify(tri.inputs) === '["title","specialties"]', `${N} Meslek/Uzmanlık datalist üçgeni gizli ${JSON.stringify(tri)}`);
    }
    const sb = await f.evaluate(() => { const s = document.querySelector('[data-view="experts"] .kc-search'), i = s.querySelector('input'), c = getComputedStyle(s); return { border: c.borderTopWidth, inputBorder: getComputedStyle(i).borderTopWidth, shadow: c.boxShadow }; });
    check(sb.border === '0px' && sb.inputBorder === '0px' && (sb.shadow.match(/0px 0px 0px 1px/g) || []).length === 1, `${N} Uzmanlar arama: tek ince çerçeve ${JSON.stringify(sb)}`);
    check(await overflow(f) <= 0, `${N} Uzmanlar: taşma yok`);
    await page.screenshot({ path: path.join(OUT, `v425-experts-${N}.png`) });
    // Sıralama, geri dönüşte korunur (snapshot)
    await f.selectOption('[data-view="experts"] [data-sort]', 'az'); await settle(page, 1000);
    await f.click('[data-view="experts"] .ke-card >> nth=0'); await settle(page, 1200);
    await page.goBack(); await settle(page, 1400); f = frameOf(page);
    check(await f.inputValue('[data-view="experts"] [data-sort]') === 'az' && (await names())[0] === expect.az[0], `${N} geri dönüşte A–Z sırası ve seçici korunur`);

    // ================= 4) AKIŞ =================
    await page.goto(`${SITE}/`); await settle(page, 1400); f = frameOf(page);
    await f.waitForSelector('[data-view="works"] [data-post-id]');
    const body = await page.evaluate(() => { const fr = document.querySelector('iframe'); return fr.contentDocument.body.innerText + ' ' + [...document.querySelectorAll('*')].filter(e => e.shadowRoot).map(e => e.shadowRoot.textContent).join(' ') + document.body.innerText; });
    check(!/Son Post ·/.test(body) && !(await f.locator('[data-live]').count()), `${N} Akış: "Son Post · …" satırı yok`);
    if (!mobile) {
      const msgs = () => page.evaluate(() => { const find = r => r.querySelector('[data-brandcard]') || [...r.querySelectorAll('*')].map(e => e.shadowRoot && find(e.shadowRoot)).find(Boolean); const b = find(document) || document.querySelector('iframe').contentDocument.querySelector('[data-brandcard]'); return b ? [...b.querySelectorAll('.kw-brandcard-msgs span')].map(s => [s.textContent, s.classList.contains('is-on')]) : null; });
      const m0 = await msgs();
      check(JSON.stringify(m0?.map(x => x[0])) === JSON.stringify(['Sahadaki deneyimini paylaş.', 'İSG profesyonellerini keşfet.', 'Hizmetini doğru kişilere ulaştır.']) && m0.filter(x => x[1]).length === 1, `${N} vitrin: üç mesaj, biri görünür`);
      const on0 = m0.findIndex(x => x[1]);
      check(await until(async () => (await msgs()).findIndex(x => x[1]) === (on0 + 1) % 3, 7000), `${N} vitrin: mesaj dönüyor`);
      await page.screenshot({ path: path.join(OUT, `v425-feed-${N}.png`) });
    }
    check(errs.length === 0, `${N}: sayfa hatası yok ${errs.join(' ')}`);
    await ctx.close();
  }
} finally {
  await browser.close();
}
