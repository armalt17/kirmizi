// Konular V1 — etiket sistemi web testi: şerit, filtre, panel (sağ panel / alt sayfa), composer etiket seçimi/oluşturma,
// kart chip'i, düzenlemede değişmezlik, migration öncesi güvence.
import { chromium, OUT, U1, U2, db, writes, check, LAUNCH, setup, frameOf, resetDb, iso } from '../helpers/harness.mjs';
import path from 'node:path';

const SITE = 'https://isgcalisanplatformu.com';
const settle = (page, ms = 800) => page.waitForTimeout(ms);
const until = async (fn, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await new Promise(r => setTimeout(r, 60)); } return false; };
const T = n => `aaaa0000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const TAGS = [
  { id: T(1), name: 'Bakanlığa Şikayet', pinned: true }, { id: T(2), name: 'Yüksekte Çalışma' }, { id: T(3), name: 'İş Kazaları' },
  { id: T(4), name: 'ATEX', created_by: U2, note: 'Patlayıcı ortam ekipmanları ve bölge sınıflandırması' }, { id: T(5), name: 'Koruma Ekipmanları' }
];
const TREND = [{ ...TAGS[0], slot: 'pinned', score: null }, { ...TAGS[1], slot: 'trending', score: 12.9, posts: 1280, posts_24h: 42 }, { ...TAGS[2], slot: 'trending', score: 4.1 }, { ...TAGS[3], slot: 'trending', score: 3 }, { ...TAGS[4], slot: 'new', score: null }];
const norm = s => s.toLocaleLowerCase('tr-TR').replace(/[çğıöşü]/g, c => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' })[c]).replace(/[^a-z0-9]/g, '');
const J = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });

function seed() {
  resetDb();
  db.professional_tags = TAGS.map(t => ({ ...t, normalized_name: norm(t.name) }));
  // İki post "Yüksekte Çalışma" etiketli; diğerleri eski (kategori chip'li, etiketsiz)
  const ps = db.professional_posts;
  [ps[0], ps[3]].forEach(p => { p.tag_id = T(2); p.tag = { id: T(2), name: 'Yüksekte Çalışma' }; });
  ps.filter(p => p.user_id === U1).slice(0, 1).forEach(p => { p.tag_id = T(3); p.tag = { id: T(3), name: 'İş Kazaları' }; });
  // Mock POST etiket nesnesini gömmez: gerçek PostgREST gibi eklenen satıra tag eklenir
  const push = ps.push.bind(ps);
  ps.push = (...items) => push(...items.map(x => (x.tag_id ? { ...x, tag: db.professional_tags.find(t => t.id === x.tag_id) } : x)));
}
async function rpcMock(ctx, rpc, mode = {}) {
  await ctx.route('https://twaptpofhbnnfciowoig.supabase.co/rest/v1/rpc/kisg_*', r => {
    const fn = new URL(r.request().url()).pathname.split('/').pop(), body = JSON.parse(r.request().postData() || '{}');
    rpc.push({ fn, body });
    if (mode.noRpc) return J(r, { code: 'PGRST202', message: 'Could not find the function' }, 404);
    if (fn === 'kisg_tags_trending') return J(r, TREND);
    if (fn === 'kisg_tags_search') { const n = norm(body.p_q); return J(r, db.professional_tags.filter(t => norm(t.name).includes(n)).map(t => ({ id: t.id, name: t.name, pinned: !!t.pinned, exact: norm(t.name) === n }))); }
    if (fn === 'kisg_tag_resolve') {
      if (mode.blocked) return J(r, { code: 'P0001', message: 'Bu etiket kullanilamiyor.', hint: 'tag_blocked' }, 400);
      let t = db.professional_tags.find(x => norm(x.name) === norm(body.p_name));
      if (!t) { t = { id: T(90 + db.professional_tags.length), name: body.p_name.trim(), normalized_name: norm(body.p_name), created_by: U1 }; db.professional_tags.push(t); }
      return J(r, [{ id: t.id, name: t.name }]);
    }
    return r.fallback();
  });
}

const browser = await chromium.launch(LAUNCH);
try {
  for (const vp of [{ name: 'desktop', width: 1366, height: 900 }, { name: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true }]) {
    const N = vp.name, mobile = N === 'mobile';
    // masaüstünde sabit konunun açıklaması var, mobilde yok (yoksa hiçbir şey görünmemeli)
    const NOTE = 'Sahada yaşadığın mevzuat sorunlarını paylaş.'; TREND[0].note = mobile ? null : NOTE;
    seed();
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch });
    await setup(ctx, true);
    const rpc = []; await rpcMock(ctx, rpc);
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e)));
    const postReqs = []; page.on('request', q => { if (q.method() === 'GET' && q.url().includes('/rest/v1/professional_posts?')) postReqs.push(decodeURIComponent(q.url())); });
    await page.goto(`${SITE}/`); await settle(page, 1500);
    let f = frameOf(page); await f.waitForSelector('[data-view="works"] [data-post-id]');
    await f.waitForSelector('[data-tag-strip]:not([hidden]) .kt-chip');

    // ---- şerit ----
    const chips = await f.$$eval('[data-tag-strip] .kt-chip', b => b.map(x => ({ t: x.textContent.trim(), all: x.matches('[data-tag-all]'), title: x.title, hash: getComputedStyle(x, '::before').content, ico: x.querySelectorAll('svg').length, bg: getComputedStyle(x).backgroundColor })));
    check(chips.map(c => c.t).join('|') === 'Alanlar|Bakanlığa Şikayet|Yüksekte Çalışma|İş Kazaları|ATEX|Koruma Ekipmanları' && chips[0].all, `${N} şerit: kırmızı "Alanlar" başta → sabit → gündem → yeni ${JSON.stringify(chips.map(c => c.t))}`);
    const tagChips = chips.slice(1);
    check(tagChips.every(c => c.hash === 'none' && !c.ico && c.bg === tagChips[0].bg) && chips[0].bg === 'rgb(227, 10, 23)', `${N} şerit: alanlar aynı sade tasarım (# yok, ikon yok), "Alanlar" kırmızı (v4.39.0)`);
    check(tagChips[0].title === (mobile ? '' : NOTE) && !tagChips[1].title, `${N} sabit etiketin açıklaması (title): "${tagChips[0].title}"`);
    check(rpc.some(x => x.fn === 'kisg_tags_trending' && x.body.p_limit === 8), `${N} şerit verisi: kisg_tags_trending (8 slot)`);
    const sr = await f.evaluate(() => { const s = document.querySelector('[data-tag-strip]').getBoundingClientRect(), c = document.querySelector('.kw-composer').getBoundingClientRect(); return { above: s.bottom <= c.top + 1, sw: document.documentElement.scrollWidth - document.documentElement.clientWidth }; });
    check(sr.above && sr.sw <= 0, `${N} şerit composer'ın üstünde, sayfa taşmıyor`);
    check(await f.$$eval('[data-view="works"] .kw-post-tags', n => n.some(x => x.querySelector('[data-tag-filter]')) && n.some(x => x.querySelector('.k-tag'))), `${N} kart: etiketli postta etiket chip'i, eski postta kategori chip'i`);
    await page.screenshot({ path: path.join(OUT, `tags-strip-${N}.png`) });

    // ---- filtre ----
    postReqs.length = 0;
    await f.click('[data-tag-strip] [data-tag-name="Yüksekte Çalışma"]'); await settle(page, 900);
    let ids = await f.$$eval('[data-view="works"] [data-post-id]', n => n.map(x => x.dataset.postId));
    check(postReqs.some(u => u.includes(`tag_id=eq.${T(2)}`)) && ids.length === 2 && await f.getAttribute('[data-tag-strip] [data-tag-name="Yüksekte Çalışma"]', 'aria-pressed') === 'true', `${N} etikete dokunmak Akış'ı filtreler (${ids.length} post), yeni sayfa açılmaz`);
    check(page.url() === `${SITE}/?konu=yuksekte-calisma`, `${N} konu kendi adresinde açılır (${page.url()})`);
    const hd = await f.evaluate(() => { const h = document.querySelector('[data-tag-head]'), r = h.getBoundingClientRect(); return { vis: !h.hidden, name: h.querySelector('.kt-head-name')?.textContent, back: h.querySelector('[data-tag-off]')?.textContent, share: !!h.querySelector('[data-tag-share]'), compose: !!h.querySelector('[data-composer]'), nameW: Math.round(h.querySelector('.kt-head-name').getBoundingClientRect().width), h: Math.round(r.height), counts: /gönderi|yeni/.test(h.textContent) }; });
    check(hd.vis && hd.name === 'Yüksekte Çalışma' && hd.back === '← Tüm Akış' && hd.share && !hd.compose && !hd.counts && hd.nameW > 100 && hd.h <= 60, `${N} konu başlığı: tek satır, ← Tüm Akış + ad + link (ayrı "Bu konuda paylaş" yok — Paylaş konuyu ekler); sayı yok ${JSON.stringify(hd)}`);
    check((await f.textContent('[data-tag-strip] .kt-chip.is-on')).endsWith('×'), `${N} seçili çipte × var`);
    // geri tuşu ana akışa döner
    await page.goBack(); await settle(page, 900);
    check(page.url() === `${SITE}/` && await f.isHidden('[data-tag-head]') && (await f.$$eval('[data-view="works"] [data-post-id]', n => n.length)) >= 10, `${N} geri tuşu ana akışa döner (${page.url()})`);
    // "← Tüm Akış" ana akışa döner
    await f.click('[data-tag-strip] [data-tag-name="Yüksekte Çalışma"]'); await settle(page, 900);
    await f.click('[data-tag-head] [data-tag-off]'); await settle(page, 900);
    check(page.url() === `${SITE}/` && await f.isHidden('[data-tag-head]'), `${N} "← Tüm Akış" ana akışa döner`);
    // üstteki "Akış" sekmesi ana akışa döner
    await f.click('[data-tag-strip] [data-tag-name="Yüksekte Çalışma"]'); await settle(page, 900);
    await page.evaluate(() => document.getElementById('kisg-pro-nav').shadowRoot.querySelector('[data-view-link="works"]').click()); await settle(page, 900);
    check(page.url() === `${SITE}/` && await f.isHidden('[data-tag-head]') && !(await f.$('[data-tag-strip] .kt-chip.is-on')), `${N} "Akış" sekmesi ana akışa döner`);
    // seçili çipe (×) dokunmak da kaldırır
    await f.click('[data-tag-strip] [data-tag-name="Yüksekte Çalışma"]'); await settle(page, 900);
    await f.click('[data-tag-strip] [data-tag-name="Yüksekte Çalışma"]'); await settle(page, 900);
    check((await f.$$eval('[data-view="works"] [data-post-id]', n => n.length)) >= 10 && page.url() === `${SITE}/`, `${N} aynı etikete (×) tekrar dokunmak filtreyi kaldırır`);
    await f.click('[data-tag-strip] [data-tag-name="ATEX"]'); await settle(page, 900);
    check(/“ATEX” alanında henüz Post yok/.test(await f.textContent('[data-view="works"] [data-list]')), `${N} boş filtre: alana özgü boş durum`);
    await f.click('[data-view="works"] [data-tag-off]'); await settle(page, 900);
    // sabit etiket filtrelenince nedeni görünür
    await f.click('[data-tag-strip] [data-tag-name="Bakanlığa Şikayet"]'); await settle(page, 700);
    check(mobile ? !(await f.$('[data-tag-head] .kt-head-note')) : (await f.textContent('[data-tag-head] .kt-head-note')) === NOTE && await f.isVisible('[data-tag-head] .kt-head-note svg'), `${N} sabit konu filtresinde ${mobile ? 'açıklama yoksa not görünmez' : 'admin açıklaması iğne ikonuyla görünür'}`);
    await f.click('[data-tag-strip] [data-tag-name="Bakanlığa Şikayet"]'); await settle(page, 700);
    check(await f.isHidden('[data-tag-head]'), `${N} filtre kalkınca konu başlığı gizlenir`);
    check(!(await f.$('[data-tag-strip] .kt-chip.is-on')) && (await f.$$eval('[data-view="works"] [data-post-id]', n => n.length)) >= 10, `${N} "Tüm Postlar" filtreyi kaldırır`);

    // ---- etiket paneli (v4.37.0: yalnız Post yazarken "Etiket Ekle"; konu keşfi Konular sayfasında) ----
    await f.evaluate(() => document.querySelector('[data-view="works"] [data-composer]').click()); await f.waitForSelector('#kaPostDialog[open]');
    await f.click('#kaPostDialog [data-tag-add]'); await f.waitForSelector('#kaTagDialog[open]'); await settle(page, 500);
    const pl = await f.evaluate(() => { const d = document.getElementById('kaTagDialog'), r = d.getBoundingClientRect(); return { place: d.dataset.place, right: Math.round(window.innerWidth - r.right), w: Math.round(r.width), title: d.querySelector('#kaTagTitle').textContent, secs: [...d.querySelectorAll('.kt-sec')].map(x => x.textContent), rows: d.querySelectorAll('.kt-row').length, rank: d.querySelectorAll('.kt-rank,.kt-heat').length }; });
    check(pl.place === (mobile ? 'sheet' : 'center') && pl.title === 'Alan seç' && JSON.stringify(pl.secs) === '["Sabit","Gündemde"]' && pl.rows === 5 && pl.rank === 0, `${N} Alan seç paneli: ${mobile ? 'alt sayfa' : 'ortada'}, Sabit + Gündemde, sıra/ısı çubuğu yok (${JSON.stringify(pl)})`);
    if (!mobile) check(pl.right > 100 && pl.w <= 500, `${N} masaüstü panel yandan değil ortada açılır (${pl.right}px, ${pl.w}px)`);
    check(mobile ? !(await f.$('#kaTagDialog .kt-pinned .kt-meta')) : (await f.textContent('#kaTagDialog .kt-pinned .kt-meta')) === NOTE, `${N} panel: sabit konu ${mobile ? 'açıklamasızsa alt satır yok' : 'açıklaması görünür'}`);
    const top = await f.$eval('#kaTagDialog [data-tag-name="Yüksekte Çalışma"]', b => b.querySelector('.kt-meta')?.textContent);
    check(top === '1.280 gönderi · Son 24 saatte 42 yeni' && !(await f.$('#kaTagDialog [data-tag-name="ATEX"] .kt-meta')), `${N} satır sayıları; sayısı gelmeyen etiket (eski DB) sayı göstermez (${top})`);
    const kb = await f.evaluate(() => ({ fs: parseFloat(getComputedStyle(document.getElementById('kaTagQ')).fontSize), focused: document.activeElement?.id === 'kaTagQ', h: document.getElementById('kaTagDialog').getBoundingClientRect().height }));
    check(kb.fs >= 16, `${N} arama kutusu 16px (iOS odakta yakınlaştırmaz) ${kb.fs}`);
    check(kb.focused === !mobile, `${N} ${mobile ? 'dokunmatikte klavye kendiliğinden açılmaz' : 'masaüstünde arama odaklı açılır'}`);
    await page.screenshot({ path: path.join(OUT, `tags-panel-${N}.png`) });
    await f.fill('#kaTagQ', 'kaz'); await settle(page, 600);
    const h2 = await f.$eval('#kaTagDialog', d => d.getBoundingClientRect().height);
    check(Math.abs(h2 - kb.h) < 2, `${N} arama sonuçları panel yüksekliğini zıplatmaz (${Math.round(kb.h)} → ${Math.round(h2)})`);
    const res = await f.$$eval('#kaTagDialog .kt-row:not([data-tag-new])', b => b.map(x => x.textContent));
    check(JSON.stringify(res) === '["İş Kazaları"]' && rpc.some(x => x.fn === 'kisg_tags_search' && x.body.p_q === 'kaz') && (await f.$eval('#kaTagDialog [data-tag-new]', b => b.textContent).catch(() => '')) === 'Yeni alan:kaz', `${N} panel: canlı arama + "Yeni alan" satırı ${JSON.stringify(res)}`);
    await f.click('#kaTagDialog .kt-row:not([data-tag-new])'); await settle(page, 600);
    check(!(await f.evaluate(() => document.getElementById('kaTagDialog').open)) && (await f.textContent('#kaPostDialog [data-tag-chip-name]')) === 'İş Kazaları', `${N} panelden seçilen etiket Post'a eklenir, panel kapanır`);
    await f.evaluate(() => document.querySelector('#kaPostDialog [data-close]').click()); await settle(page, 400);

    // ---- Konu Ara → Konular sayfası → yeni konu: Post penceresi o etiketle açılır; paylaşınca konu oluşur, Akış o konuya geçer ----
    await f.click('[data-tag-strip] [data-tag-all]'); await f.waitForSelector('[data-view="topics"]:not([hidden])'); await settle(page, 400);
    check(!(await f.evaluate(() => document.getElementById('kaTagDialog').open)), `${N} Konu Ara artık Konular sayfasını açar (panel değil)`);
    await f.fill('[data-topic-q]', 'Saha Güvenliği'); await settle(page, 500);
    await f.click('[data-topic-start]'); await f.waitForSelector('#kaPostDialog[open]'); await settle(page, 300);
    check((await f.textContent('#kaPostDialog [data-tag-chip-name]')) === 'Saha Güvenliği' && await f.isVisible('#kaPostDialog [data-tag-clear]'), `${N} Konular'dan yeni konu: Post penceresi o etiketle açıldı (kaldırılabilir)`);
    const tagsBefore = db.professional_tags.length;
    await f.fill('#kaPostContent', 'Saha güvenliği konusunda ilk post'); writes.length = 0; rpc.length = 0;
    await f.click('#kaPostSubmit'); await settle(page, 1800);
    const ins0 = writes.find(w => w.table === 'professional_posts'), made = db.professional_tags.find(t => t.name === 'Saha Güvenliği');
    check(rpc.some(x => x.fn === 'kisg_tag_resolve' && x.body.p_name === 'Saha Güvenliği') && made && ins0?.body.tag_id === made.id && db.professional_tags.length === tagsBefore + 1, `${N} konu Post paylaşılınca oluştu ve Posta bağlandı`);
    check(await until(() => f.getAttribute(`[data-tag-strip] [data-tag-name="Saha Güvenliği"]`, 'aria-pressed').then(v => v === 'true').catch(() => false)) && await page.evaluate(() => location.search === '?konu=saha-guvenligi'), `${N} Akış yeni konuya geçti (/?konu=saha-guvenligi)`);
    // v4.40.1: açıklamayı yalnız yönetim yazar — alanı açan kullanıcıya da davet/düzenleme yok
    await settle(page, 800);
    check(await f.evaluate(() => !document.querySelector('[data-tag-head] [data-note-form], [data-tag-head] [data-note-edit], [data-tag-head] .kt-note-add')), `${N} yeni alan: kullanıcıya açıklama daveti/düzenleme yok (yalnız yönetim yazar)`);
    await f.click('[data-tag-strip] [data-tag-name="Saha Güvenliği"]'); await settle(page, 700);
    // başkasının alanı: açıklama görünür, düzenleme yok; sabit alan: düzenleme yok
    await f.click('[data-tag-strip] [data-tag-name="ATEX"]');
    check(await until(() => f.evaluate(() => document.querySelector('[data-tag-head] .kt-head-note.is-plain span')?.textContent === 'Patlayıcı ortam ekipmanları ve bölge sınıflandırması' && !document.querySelector('[data-tag-head] [data-note-edit]'))), `${N} başka kullanıcının alanında açıklama görünür (sabit olmasa da), düzenleme yok`);
    await f.click('[data-tag-strip] [data-tag-name="Bakanlığa Şikayet"]');
    check(await until(() => f.evaluate(() => document.querySelector('[data-tag-head] .kt-head-name')?.textContent === 'Bakanlığa Şikayet')) && await f.evaluate(() => !document.querySelector('[data-tag-head] [data-note-edit]')), `${N} sabit alanda düzenleme düğmesi yok (yönetim yazar)`);
    await f.click('[data-tag-strip] [data-tag-name="Bakanlığa Şikayet"]'); await settle(page, 500);
    // vazgeçilirse konu oluşmaz
    await f.click('[data-tag-strip] [data-tag-all]'); await f.waitForSelector('[data-view="topics"]:not([hidden])'); await settle(page, 400);
    await f.fill('[data-topic-q]', 'Boş Konu'); await settle(page, 500);
    await f.click('[data-topic-start]'); await f.waitForSelector('#kaPostDialog[open]'); rpc.length = 0;
    await f.evaluate(() => document.querySelector('#kaPostDialog [data-close]').click()); await settle(page, 400);
    check(!db.professional_tags.some(t => t.name === 'Boş Konu') && !rpc.some(x => x.fn === 'kisg_tag_resolve'), `${N} Post paylaşılmadan vazgeçilirse konu oluşmaz`);
    await f.evaluate(() => document.querySelector('[data-view="topics"] [data-view-link="works"]').click()); await f.waitForSelector('[data-view="works"]:not([hidden])'); await settle(page, 500);

    // ---- composer: Akış etikete filtreliyken yeni post o etiketle başlar ----
    await f.click('[data-tag-strip] [data-tag-name="Yüksekte Çalışma"]'); await settle(page, 900);
    await f.click('[data-view="works"] .kw-composer-main'); await f.waitForSelector('#kaPostDialog[open]');
    check((await f.textContent('#kaPostDialog [data-tag-chip-name]')) === 'Yüksekte Çalışma' && await f.isVisible('#kaPostDialog [data-tag-clear]'), `${N} filtreli etiket composer'a otomatik eklendi, kaldırılabilir`);
    await f.click('#kaPostDialog [data-tag-clear]');
    check(await f.isHidden('#kaPostDialog [data-tag-chip]') && await f.isVisible('#kaPostDialog [data-tag-add]'), `${N} otomatik etiket × ile kaldırıldı`);
    await f.evaluate(() => document.querySelector('#kaPostDialog [data-close]').click()); await settle(page, 400);
    await f.click('[data-tag-strip] [data-tag-name="Yüksekte Çalışma"]'); await settle(page, 900);
    await f.click('[data-view="works"] .kw-composer-main'); await f.waitForSelector('#kaPostDialog[open]');
    check(await f.isHidden('#kaPostDialog [data-tag-chip]'), `${N} filtre yokken composer etiketsiz açılır`);
    await f.evaluate(() => document.querySelector('#kaPostDialog [data-close]').click()); await settle(page, 400);

    // ---- composer: yeni etiket oluştur ----
    check(!(await f.$('#kaPostCategory')), `${N} composer'da kategori listesi yok`);
    await f.click('[data-view="works"] .kw-composer-main'); await f.waitForSelector('#kaPostDialog[open]');
    check(await f.isVisible('#kaPostDialog [data-tag-add]') && await f.isHidden('#kaPostDialog [data-tag-chip]'), `${N} composer: "+ Etiket Ekle" görünür`);
    await f.click('#kaPostDialog [data-tag-add]'); await f.waitForSelector('#kaTagDialog[open]');
    check((await f.textContent('#kaTagTitle')) === 'Alan seç', `${N} aynı panel "Alan seç" olarak açılır`);
    await f.fill('#kaTagQ', 'Saha  Denetimi'); await settle(page, 600);
    const nw = await f.$eval('#kaTagDialog [data-tag-new]', b => b.textContent).catch(() => '');
    check(nw === 'Yeni alan:Saha Denetimi', `${N} listede yoksa yazılan ad yeni alan olarak önerilir (${nw})`);
    await f.click('#kaTagDialog [data-tag-new]'); await settle(page, 400);
    check(await f.evaluate(() => document.getElementById('kaPostDialog').open) && (await f.textContent('#kaPostDialog [data-tag-chip-name]')) === 'Saha Denetimi' && await f.isHidden('#kaPostDialog [data-tag-add]') && await f.isVisible('#kaPostDialog [data-tag-clear]'), `${N} seçilen etiket kaldırılabilir chip olarak görünür (en fazla 1)`);
    await f.fill('#kaPostContent', 'Etiketli yeni post'); writes.length = 0; rpc.length = 0;
    await f.click('#kaPostSubmit'); await settle(page, 1500);
    const ins = writes.find(w => w.table === 'professional_posts');
    const resolved = rpc.find(x => x.fn === 'kisg_tag_resolve');
    check(resolved?.body.p_name === 'Saha Denetimi' && ins?.body.tag_id === resolved && db.professional_tags.find(t => t.name === 'Saha Denetimi')?.id === ins?.body.tag_id || (ins?.body.tag_id && resolved && db.professional_tags.find(t => t.name === 'Saha Denetimi')?.id === ins.body.tag_id), `${N} paylaşırken yeni etiket oluşturuldu ve posta bağlandı (${ins?.body.tag_id})`);
    check(ins && !('category_id' in ins.body), `${N} yeni post kategori göndermez`);
    const newCard = `[data-view="works"] [data-post-id="${ins?.body.id}"]`;
    check(await until(() => f.$eval(`${newCard} [data-tag-filter]`, b => b.textContent).then(t => t === 'Saha Denetimi').catch(() => false)), `${N} yeni post kartında etiket chip'i`);

    // ---- composer: var olan etiketi seç, sonra kaldır ----
    await f.click('[data-view="works"] .kw-composer-main'); await f.waitForSelector('#kaPostDialog[open]');
    await f.click('#kaPostDialog [data-tag-add]'); await f.waitForSelector('#kaTagDialog[open]'); await settle(page, 300);
    await f.click('#kaTagDialog [data-tag-name="ATEX"]'); await settle(page, 300);
    await f.click('#kaPostDialog [data-tag-clear]');
    check(await f.isHidden('#kaPostDialog [data-tag-chip]') && await f.isVisible('#kaPostDialog [data-tag-add]'), `${N} chip × ile kaldırılır`);
    await f.click('#kaPostDialog [data-tag-add]'); await f.waitForSelector('#kaTagDialog[open]'); await settle(page, 300);
    await f.click('#kaTagDialog [data-tag-name="ATEX"]'); await settle(page, 300);
    await f.fill('#kaPostContent', 'ATEX postu'); writes.length = 0; rpc.length = 0;
    await f.click('#kaPostSubmit'); await settle(page, 1500);
    const ins2 = writes.find(w => w.table === 'professional_posts');
    check(ins2?.body.tag_id === T(4) && !rpc.some(x => x.fn === 'kisg_tag_resolve'), `${N} var olan etiket seçimi: id doğrudan, oluşturma çağrısı yok`);

    // ---- düzenleme: etiket değişmez ----
    const own = `[data-view="works"] [data-post-id="${ins2?.body.id}"]`;
    await f.evaluate(sel => document.querySelector(`${sel} [data-popover-trigger]`).click(), own);
    await f.evaluate(sel => document.querySelector(`${sel} [data-post-action="edit"], ${sel} [data-act="edit"], ${sel} .kw-menu button`).click(), own);
    await f.waitForSelector('#kaPostDialog[open]'); await settle(page, 300);
    check((await f.textContent('#kaPostDialog [data-tag-chip-name]')) === 'ATEX' && await f.isHidden('#kaPostDialog [data-tag-clear]') && await f.isHidden('#kaPostDialog [data-tag-add]'), `${N} düzenlemede etiket gösterilir ama değiştirilemez/kaldırılamaz`);
    await f.fill('#kaPostContent', 'ATEX postu (düzenlendi)'); writes.length = 0;
    await f.click('#kaPostSubmit'); await settle(page, 1200);
    const up = writes.find(w => w.table === 'professional_posts');
    check(up && JSON.stringify(Object.keys(up.body).sort()) === '["content","image_path","image_path_2"]', `${N} düzenleme etiket/kategori göndermez ${JSON.stringify(up?.body)}`);

    // ---- profil kartındaki etiket → Akış filtreli ----
    await page.goto(`${SITE}/profil?id=${U1}`); await settle(page, 1500); f = frameOf(page);
    await f.waitForSelector('[data-view="profile"] [data-tag-filter]');
    const tname = await f.$eval('[data-view="profile"] [data-tag-filter]', b => b.textContent);
    postReqs.length = 0;
    await f.click('[data-view="profile"] [data-tag-filter]'); await settle(page, 1500);
    check(/\/\?konu=[a-z0-9-]+$/.test(page.url()) && await f.evaluate(() => document.getElementById('kisgApp').dataset.activeView) === 'works' && postReqs.some(u => u.includes('tag_id=eq.')) && await f.getAttribute(`[data-tag-strip] [data-tag-name="${tname}"]`, 'aria-pressed') === 'true', `${N} profil kartındaki "${tname}" etiketi Akış'ı o etikete filtreli açar`);
    // doğrudan konu linki (paylaşılan link) konu görünümünü açar
    postReqs.length = 0;
    await page.goto(`${SITE}/?konu=bakanliga-sikayet`); await settle(page, 1500); f = frameOf(page);
    check(await until(() => f.$eval('[data-tag-head] .kt-head-name', e => e.textContent).then(t => t === 'Bakanlığa Şikayet').catch(() => false)) && postReqs.some(u => u.includes(`tag_id=eq.${T(1)}`)), `${N} paylaşılan konu linki doğrudan konu görünümünü açar`);
    await page.screenshot({ path: path.join(OUT, `tags-topic-${N}.png`) });
    check(errs.length === 0, `${N} sayfa hatası yok ${errs.join(' ')}`);
    await ctx.close();
  }

  // ---- hata eşleme: engellenmiş etiket ----
  {
    seed();
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } }); await setup(ctx, true);
    const rpc = []; await rpcMock(ctx, rpc, { blocked: true });
    const page = await ctx.newPage(); await page.goto(`${SITE}/`); await settle(page, 1500);
    const f = frameOf(page); await f.waitForSelector('[data-view="works"] [data-post-id]');
    await f.click('[data-view="works"] .kw-composer-main'); await f.waitForSelector('#kaPostDialog[open]');
    await f.click('#kaPostDialog [data-tag-add]'); await f.waitForSelector('#kaTagDialog[open]');
    await f.fill('#kaTagQ', 'Yasak Konu'); await settle(page, 600); await f.click('#kaTagDialog [data-tag-new]');
    await f.fill('#kaPostContent', 'deneme'); writes.length = 0;
    await f.click('#kaPostSubmit'); await settle(page, 1200);
    check(/Bu alan kullanılamıyor/.test(await f.textContent('#kaPostError')) && !writes.some(w => w.table === 'professional_posts'), 'engellenmiş etiket: Türkçe hata, post gönderilmedi');
    await ctx.close();
  }

  // ---- migration öncesi güvence: RPC ve ilişki yok → şerit gizli, akış çalışır ----
  {
    seed();
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } }); await setup(ctx, false);
    const rpc = []; await rpcMock(ctx, rpc, { noRpc: true });
    await ctx.route('https://twaptpofhbnnfciowoig.supabase.co/rest/v1/professional_posts?*', r => (/professional_tags/.test(decodeURIComponent(r.request().url())) ? J(r, { code: 'PGRST200', message: "Could not find a relationship between 'professional_posts' and 'professional_tags'" }, 400) : r.fallback()));
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.goto(`${SITE}/`); await settle(page, 2000);
    const f = frameOf(page);
    const n = await f.$$eval('[data-view="works"] [data-post-id]', x => x.length).catch(() => 0);
    check(n >= 10 && await f.isHidden('[data-tag-strip]') && errs.length === 0, `migration öncesi: akış etiketsiz çalışır (${n} post), şerit gizli, hata yok`);
    await ctx.close();
  }
} finally {
  await browser.close();
}
