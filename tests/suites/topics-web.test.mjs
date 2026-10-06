// Konular sayfası (v4.37.0): /?sayfa=konular — Konu Ara'dan açılır; sabitler, tüm konular (sıralama, 20'şer),
// arama, konuya gidiş (/?konu=slug), yeni konu başlatma. Etiket paneli yalnız "Etiket Ekle".
import path from 'node:path';
import { chromium, OUT, check, LAUNCH, setup, frameOf, resetDb, rpcCalls } from '../helpers/harness.mjs';

const SITE = 'https://isgcalisanplatformu.com';
const settle = (page, ms = 700) => page.waitForTimeout(ms);
const until = async (fn, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await new Promise(r => setTimeout(r, 80)); } return false; };
const H = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-expose-headers': 'content-range' };
const norm = s => s.toLocaleLowerCase('tr-TR').replace(/[çğıöşü]/g, c => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' })[c]).replace(/[^a-z0-9]/g, '');
const ago = h => new Date(Date.now() - h * 36e5).toISOString();
const NAMES = ['csgb', 'Soma Maden Kazası', 'İSG Sınavı', 'Yüksekte Çalışma', 'Yangın Tatbikatı', 'KKD', 'İskele', 'Risk Değerlendirmesi', 'ATEX', 'Eğitim Saatleri', 'Gürültü', 'Toz', 'Kimyasal', 'Forklift', 'Elektrik', 'Kaynak', 'Kapalı Alan', 'Ergonomi', 'İlk Yardım', 'Tahliye', 'Vinç', 'Makine Koruyucu', 'LOTO', 'Acil Durum', 'Psikososyal'];
const TAGS = NAMES.map((name, i) => ({ id: `abcdabcd-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, name, normalized_name: norm(name), pinned: false, blocked: false, created_at: ago(i === 4 ? 20 : 400 + i * 30), last_post_at: ago(1 + i * 5), posts: [{ count: 30 - i }], today: [{ count: i < 2 ? 5 - i * 2 : 0 }] }));
TAGS.push({ id: 'abcdabcd-0000-4000-8000-000000000099', name: 'Gizli', normalized_name: 'gizli', pinned: false, blocked: true, created_at: ago(5), last_post_at: ago(1), posts: [{ count: 9 }], today: [{ count: 9 }] });
const PIN = { id: 'abcdabcd-0000-4000-8000-000000000100', name: 'Bakanlığa Şikayet', slot: 'pinned', note: 'Mevzuat ve denetimle ilgili şikayet ve önerilerinizi burada toplayalım.', posts: 12, posts_24h: 1 };

function serveTags(route) {
  const u = new URL(route.request().url()), sp = u.searchParams;
  if (route.request().method() !== 'GET' || !(sp.get('select') || '').includes('today:professional_posts')) return route.fallback();
  let rows = TAGS.filter(t => (sp.get('blocked') !== 'eq.false' || !t.blocked) && (sp.get('pinned') !== 'eq.false' || !t.pinned));
  const like = sp.get('normalized_name'); if (like) { const n = like.replace(/^like\.|%|\*/g, ''); rows = rows.filter(t => t.normalized_name.includes(n)); }
  const [col, dir] = (sp.get('order') || 'last_post_at.desc').split(',')[0].split('.');
  rows = rows.slice().sort((a, b) => (dir === 'asc' ? 1 : -1) * String(a[col]).localeCompare(String(b[col]), 'tr'));
  const from = Number(sp.get('offset') || 0), page = rows.slice(from, from + Number(sp.get('limit') || rows.length));
  return route.fulfill({ status: 200, headers: { ...H, 'content-range': `${from}-${from + page.length - 1}/${rows.length}` }, contentType: 'application/json', body: JSON.stringify(page) });
}

const browser = await chromium.launch(LAUNCH);
try {
  for (const vp of [{ name: 'desktop', width: 1366, height: 900 }, { name: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true }]) {
    const N = vp.name;
    resetDb();
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch });
    await setup(ctx, true);
    const reqs = [];
    await ctx.route('https://twaptpofhbnnfciowoig.supabase.co/rest/v1/professional_tags*', r => { if ((r.request().url()).includes('today')) reqs.push({ url: decodeURIComponent(r.request().url()) }); return serveTags(r); });
    await ctx.route('https://twaptpofhbnnfciowoig.supabase.co/rest/v1/rpc/kisg_tags_trending', r => r.fulfill({ headers: H, contentType: 'application/json', body: JSON.stringify([PIN, { ...TAGS[0], slot: 'hot', posts: 30, posts_24h: 5 }]) }));
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.goto(`${SITE}/`); await settle(page, 1500);
    const f = frameOf(page);
    const mark = await page.evaluate(() => (window.__bootMark = Math.random()));
    // Konu Ara → Konular sayfası (yeniden yükleme yok)
    await f.waitForSelector('[data-tag-all]');
    await f.click('[data-tag-all]');
    await f.waitForSelector('[data-view="topics"]:not([hidden]) .kt-item[data-topic-id]');
    const nav = await page.evaluate(() => ({ url: location.pathname + location.search, title: document.title, tab: document.getElementById('kisg-pro-nav').shadowRoot.querySelector('.ka-tab.is-active')?.dataset.viewLink }));
    check(nav.url === '/?sayfa=konular' && nav.tab === 'works' && await page.evaluate(() => window.__bootMark) === mark && !(await f.evaluate(() => document.getElementById('kaTagDialog').open)), `${N} Konu Ara → /?sayfa=konular (shell içi, panel açılmadı, Akış sekmesi seçili) ${JSON.stringify(nav)}`);
    const v = await f.evaluate(() => {
      const el = document.querySelector('[data-view="topics"]'), items = [...el.querySelectorAll('[data-topic-list] .kt-item')], pin = el.querySelector('[data-topic-pins] .kt-item');
      const ht = el.querySelector('[data-topic-list] .kt-ht'), hero = el.querySelector('.k-hero-ico');
      return { n: items.length, first: items[0]?.querySelector('b').textContent, meta0: items[0]?.querySelector('small').innerHTML, status: el.querySelector('[data-topic-status]').textContent, pin: pin && { name: pin.querySelector('b').textContent, badge: pin.querySelector('.kt-badge')?.textContent, note: pin.querySelector('small').textContent },
        htBg: getComputedStyle(ht).backgroundColor, htFg: getComputedStyle(ht).color, heroBg: getComputedStyle(hero).backgroundColor, more: !el.querySelector('[data-topic-more]').hidden, href: items[1]?.getAttribute('href'), newBadge: items.filter(x => x.querySelector('.kt-badge')?.textContent === 'yeni').map(x => x.querySelector('b').textContent), sw: document.documentElement.scrollWidth, vw: innerWidth };
    });
    check(v.pin?.name === 'Bakanlığa Şikayet' && v.pin.badge === 'Sabit' && /Mevzuat/.test(v.pin.note), `${N} sabit konu en üstte, rozet + açıklama ${JSON.stringify(v.pin)}`);
    check(v.n === 20 && v.first === 'csgb' && v.status === '25 konu' && v.more && !v.newBadge.includes('Gizli'), `${N} tüm konular: ilk 20, toplam 25, engelli konu yok, "Daha fazla" görünür (${v.status})`);
    check(/30 gönderi/.test(v.meta0) && /<em>bugün 5 yeni<\/em>/.test(v.meta0), `${N} satır: gönderi sayısı + "bugün 5 yeni" (${v.meta0})`);
    check(v.newBadge.join() === 'Yangın Tatbikatı' && v.href === `${SITE}/?konu=soma-maden-kazasi`, `${N} son 3 günde açılan konuda "yeni" rozeti; bağlantı /?konu=slug`);
    check(v.htBg === 'rgb(227, 10, 23)' && v.htFg === 'rgb(255, 255, 255)' && v.heroBg === 'rgb(227, 10, 23)' && v.sw <= v.vw, `${N} # kutucukları ve başlık ikonu kırmızı, yatay taşma yok`);
    const q0 = reqs[0];
    check(q0 && /blocked=eq\.false/.test(q0.url) && /pinned=eq\.false/.test(q0.url) && /posts\.status=eq\.active/.test(q0.url) && /today\.created_at=gte\./.test(q0.url) && /order=last_post_at\.desc/.test(q0.url) && /offset=0/.test(q0.url) && /limit=20/.test(q0.url), `${N} sorgu: engelsiz, sabit hariç, aktif gönderi sayısı, son 24 saat, Son Aktif, ilk 20`);
    await page.screenshot({ path: path.join(OUT, `topics-${N}.png`), fullPage: true });
    // Daha fazla
    await f.click('[data-topic-more]');
    check(await until(() => f.evaluate(() => document.querySelectorAll('[data-topic-list] .kt-item').length === 25)) && await f.evaluate(() => document.querySelector('[data-topic-more]').hidden), `${N} "Daha fazla konu" kalan 5 konuyu ekledi, düğme gizlendi`);
    // Sıralama A–Z
    await f.selectOption('[data-topic-sort]', 'az');
    check(await until(() => f.evaluate(() => document.querySelector('[data-topic-list] .kt-item b')?.textContent === 'Acil Durum')) && reqs.some(r => /order=name\.asc/.test(r.url)), `${N} A–Z sıralaması (ilk: Acil Durum)`);
    // Arama: Türkçe karakterden bağımsız; sabitler gizlenir; yoksa "konusunu başlat"
    await f.fill('[data-topic-q]', 'yuksek');
    check(await until(() => f.evaluate(() => [...document.querySelectorAll('[data-topic-list] .kt-item b')].map(b => b.textContent).join() === 'Yüksekte Çalışma')) && await f.evaluate(() => document.querySelector('[data-topic-pins]').hidden), `${N} arama "yuksek" → Yüksekte Çalışma; sabitler gizli`);
    await f.fill('[data-topic-q]', 'Asbest Söküm');
    check(await until(() => f.evaluate(() => document.querySelector('[data-topic-status]').textContent === 'Bu adla bir konu yok.' && document.querySelector('[data-topic-start-title]').textContent === '“Asbest Söküm” konusunu başlat')), `${N} sonuç yok → "“Asbest Söküm” konusunu başlat"`);
    await f.click('[data-topic-start]');
    await f.waitForSelector('#kaPostDialog[open]');
    check(await f.evaluate(() => !document.querySelector('[data-tag-chip]').hidden && document.querySelector('[data-tag-chip-name]').textContent === 'Asbest Söküm'), `${N} yeni konu: düzenleyici o konuyla açıldı`);
    await f.evaluate(() => document.getElementById('kaPostDialog').close()); await settle(page, 300);
    // Konuya gidiş: Akış konu görünümü
    await f.fill('[data-topic-q]', ''); await until(() => f.evaluate(() => document.querySelectorAll('[data-topic-list] .kt-item').length >= 20));
    await f.click('[data-topic-list] .kt-item[data-topic-name="KKD"]');
    check(await until(() => page.evaluate(() => location.search === '?konu=kkd')) && await until(() => f.evaluate(() => document.querySelector('[data-tag-head] .kt-head-name')?.textContent === 'KKD')) && await page.evaluate(() => window.__bootMark) === mark, `${N} konuya tıklama → /?konu=kkd, Akış konu görünümü (yeniden yükleme yok)`);
    await page.goBack();
    check(await until(() => page.evaluate(() => location.search === '?sayfa=konular')) && await until(() => f.evaluate(() => !document.querySelector('[data-view="topics"]').hidden)), `${N} geri tuşu Konular sayfasına döndü`);
    // Doğrudan adres + panel artık yalnız Etiket Ekle
    await page.goto(`${SITE}/?sayfa=konular`); await settle(page, 1500);
    const g = frameOf(page);
    check(await until(() => g.evaluate(() => !document.querySelector('[data-view="topics"]').hidden && document.querySelectorAll('[data-topic-list] .kt-item').length === 20)), `${N} /?sayfa=konular doğrudan açılınca Konular sayfası`);
    check(await g.evaluate(() => document.getElementById('kaTagTitle').textContent) === 'Etiket Ekle', `${N} etiket paneli başlığı "Etiket Ekle"`);
    check(errs.length === 0, `${N} sayfa hatası yok ${errs.join(' ')}`);
    await ctx.close();
  }
  // hata durumu
  {
    resetDb();
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await setup(ctx, true);
    await ctx.route('https://twaptpofhbnnfciowoig.supabase.co/rest/v1/professional_tags*', r => (r.request().url().includes('today') ? r.fulfill({ status: 500, headers: H, contentType: 'application/json', body: '{"message":"x"}' }) : r.fallback()));
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.goto(`${SITE}/?sayfa=konular`); await settle(page, 1800);
    const f = frameOf(page);
    check(await f.evaluate(() => document.querySelector('[data-topic-status]').textContent) === 'Konular şu anda yüklenemedi. Biraz sonra tekrar dene.' && errs.length === 0, 'sunucu hatasında anlaşılır mesaj, sayfa hatası yok');
    await ctx.close();
  }
} finally {
  await browser.close();
}
