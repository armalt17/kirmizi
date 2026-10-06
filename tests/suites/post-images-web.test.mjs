// Post'ta iki fotoğraf (v4.35.0) — seçim, yayın, kart ızgarası (Twitter düzeni), görüntüleyici, düzenleme, sütun yoksa geri düşüş.
import { chromium, db, writes, uploads, IMG, check, LAUNCH, setup, frameOf, resetDb, U1 } from '../helpers/harness.mjs';

const SITE = 'https://isgcalisanplatformu.com';
const settle = (page, ms = 700) => page.waitForTimeout(ms);
const until = async (fn, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await new Promise(r => setTimeout(r, 80)); } return false; };
const png = n => ({ name: `foto${n}.png`, mimeType: 'image/png', buffer: IMG });
function seedTwo() {
  resetDb();
  const p = db.professional_posts.find(x => x.user_id === U1);
  p.image_path = `${U1}/${p.id}-a.webp`; p.image_path_2 = `${U1}/${p.id}-b.webp`;
  return p.id;
}
const openComposer = async (page, f) => { await f.evaluate(() => document.querySelector('[data-view="works"] [data-composer]').click()); await f.waitForSelector('#kaPostDialog[open]'); await settle(page, 200); };
async function publish(page, f, text) {
  uploads.length = 0; writes.length = 0;
  if (text != null) await f.fill('#kaPostContent', text);
  await f.evaluate(() => document.getElementById('kaPostForm').requestSubmit());
  await until(() => f.evaluate(() => !document.getElementById('kaPostDialog').open));
  await settle(page, 400);
  return writes.find(w => w.table === 'professional_posts');
}
const preview = f => f.evaluate(() => { const p = document.getElementById('kaPostPreview'); return { n: p.querySelectorAll('img').length, vis: !p.hidden, add: !document.querySelector('#kaPostDialog .k-file-button').hidden, label: document.querySelector('[data-photo-label]').textContent }; });

const browser = await chromium.launch(LAUNCH);
try {
  for (const vp of [{ name: 'desktop', width: 1366, height: 900 }, { name: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true }]) {
    const N = vp.name;
    const own = seedTwo();
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch });
    await setup(ctx, true);
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.goto(`${SITE}/`); await settle(page, 1500);
    const f = frameOf(page);
    const card = `[data-view="works"] [data-post-id="${own}"]`;
    await f.waitForSelector(`${card} .kw-media-set`);

    // ---- kart: iki görsel yan yana, 16:9, eşit, kırpılmış ----
    await until(() => f.evaluate(s => [...document.querySelectorAll(`${s} .kw-post-image`)].every(i => i.complete && i.naturalWidth > 0), card));
    const g = await f.evaluate(s => {
      const set = document.querySelector(`${s} .kw-media-set`), r = set.getBoundingClientRect(), bs = [...set.querySelectorAll('.kw-media')].map(b => b.getBoundingClientRect()), im = set.querySelector('.kw-post-image');
      return { n: set.dataset.n, ratio: +(r.width / r.height).toFixed(2), w: bs.map(b => Math.round(b.width)), h: bs.map(b => Math.round(b.height)), gap: Math.round(bs[1].left - bs[0].right), top: Math.round(bs[1].top - bs[0].top), fit: getComputedStyle(im).objectFit, more: set.querySelectorAll('.kw-media-more').length, sw: document.documentElement.scrollWidth, vw: innerWidth };
    }, card);
    check(g.n === '2' && Math.abs(g.ratio - 16 / 9) < 0.03 && Math.abs(g.w[0] - g.w[1]) <= 1 && g.h[0] === g.h[1] && g.gap === 2 && g.top === 0 && g.fit === 'cover' && g.more === 0 && g.sw <= g.vw, `${N} kart: iki görsel yan yana, 16:9 alan, eşit genişlik, 2px ara, kırpılmış (cover) ${JSON.stringify(g)}`);
    const single = await f.evaluate(() => { const s = [...document.querySelectorAll('[data-view="works"] .kw-media-set[data-n="1"]')][0]; return s ? getComputedStyle(s).display : 'yok'; });
    check(single === 'block', `${N} tek görselli post eski düzende (${single})`);

    // ---- görüntüleyici ----
    await f.click(`${card} .kw-media >> nth=1`);
    await f.waitForSelector('#kaMediaDialog[open]');
    const vs = () => f.evaluate(() => { const d = document.getElementById('kaMediaDialog'); return { src: d.querySelector('[data-media-img]').getAttribute('src'), count: d.querySelector('[data-media-count]').textContent, nav: [...d.querySelectorAll('[data-media-step]')].filter(b => !b.hidden && b.getBoundingClientRect().width > 0).length }; });
    let v = await vs();
    check(v.src.endsWith('-b.webp') && v.count === '2 / 2' && v.nav === 2, `${N} görüntüleyici: tıklanan ikinci görselle açıldı, sayaç 2 / 2, oklar görünür ${JSON.stringify(v)}`);
    if (vp.hasTouch) {
      await f.evaluate(() => { const st = document.querySelector('#kaMediaDialog .k-media-stage'), t = x => new Touch({ identifier: 1, target: st, clientX: x, clientY: 300 });
        st.dispatchEvent(new TouchEvent('touchstart', { touches: [t(300)], changedTouches: [t(300)], bubbles: true }));
        st.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [t(120)], bubbles: true })); });
      v = await vs(); check(v.src.endsWith('-a.webp') && v.count === '1 / 2', `${N} görüntüleyici: sola kaydırma diğer görsele geçti ${JSON.stringify(v)}`);
    } else {
      await page.keyboard.press('ArrowRight'); v = await vs();
      check(v.src.endsWith('-a.webp') && v.count === '1 / 2', `${N} görüntüleyici: → tuşu başa döndü ${JSON.stringify(v)}`);
      await f.click('#kaMediaDialog [data-media-step="1"]'); v = await vs();
      check(v.src.endsWith('-b.webp') && v.count === '2 / 2', `${N} görüntüleyici: sonraki oku çalışıyor ${JSON.stringify(v)}`);
    }
    await f.click('#kaMediaDialog [data-close]'); await settle(page, 300);
    const p0 = await f.evaluate(() => document.querySelector('[data-view="works"] .kw-media-set[data-n="1"] .kw-media')?.closest('[data-post-id]')?.dataset.postId);
    await f.click(`[data-view="works"] [data-post-id="${p0}"] .kw-media`); await f.waitForSelector('#kaMediaDialog[open]');
    v = await vs(); check(v.count === '' && v.nav === 0, `${N} tek görselde sayaç ve ok yok ${JSON.stringify(v)}`);
    await f.click('#kaMediaDialog [data-close]'); await settle(page, 300);

    // ---- yeni post: tek seçimde iki fotoğraf ----
    await openComposer(page, f);
    await f.setInputFiles('#kaPostImage', [png(1), png(2), png(3)]);
    await until(() => f.evaluate(() => document.querySelectorAll('#kaPostPreview img').length === 2));
    let pv = await preview(f);
    check(pv.n === 2 && pv.vis && !pv.add, `${N} düzenleyici: üç seçimden ilk iki fotoğraf alındı, ekleme düğmesi gizlendi ${JSON.stringify(pv)}`);
    await f.click('#kaPostPreview [data-remove-image="0"]'); pv = await preview(f);
    check(pv.n === 1 && pv.add && pv.label === '2. Fotoğrafı Ekle', `${N} düzenleyici: biri kaldırılınca yeniden eklenebilir ${JSON.stringify(pv)}`);
    await f.setInputFiles('#kaPostImage', png(4)); await until(() => f.evaluate(() => document.querySelectorAll('#kaPostPreview img').length === 2));
    let w = await publish(page, f, 'İki fotoğraflı post');
    const ups = uploads.filter(u => !u.del && /professional-posts/.test(u.path));
    check(ups.length === 2 && w?.body?.image_path && w.body.image_path_2 && w.body.image_path !== w.body.image_path_2 && [w.body.image_path, w.body.image_path_2].every(x => x.startsWith(`${U1}/`)), `${N} yayın: iki dosya yüklendi, image_path + image_path_2 yazıldı ${JSON.stringify(w?.body)}`);

    // ---- düzenleme: ilk görseli kaldır → ikinci öne kayar, eski dosya silinir ----
    await f.evaluate(id => { const c = document.querySelector(`[data-view="works"] [data-post-id="${id}"]`); c.querySelector('[data-popover-trigger]').click(); c.querySelector('[data-post-action="edit"]').click(); }, own);
    await f.waitForSelector('#kaPostDialog[open]'); await settle(page, 300);
    pv = await preview(f); check(pv.n === 2, `${N} düzenleme: mevcut iki görsel önizlemede ${JSON.stringify(pv)}`);
    await f.click('#kaPostPreview [data-remove-image="0"]');
    w = await publish(page, f, null);
    const del = uploads.find(u => u.del);
    check(w?.body?.image_path === `${U1}/${own}-b.webp` && w.body.image_path_2 === null && del && /-a\.webp/.test(del.body || ''), `${N} düzenleme: ilk kaldırıldı, ikinci öne kaydı, eski dosya silindi ${JSON.stringify(w?.body)} ${del?.body}`);
    await settle(page, 600);
    check(await f.evaluate(s => document.querySelector(`${s} .kw-media-set`)?.dataset.n, card) === '1', `${N} kart yerinde tek görsele döndü`);
    check(errs.length === 0, `${N} sayfa hatası yok ${errs.join(' ')}`);
    await ctx.close();
  }

  // ---- SQL uygulanmadıysa: akış tek görselle çalışır, düzenleyici en fazla 1 fotoğraf alır ----
  {
    resetDb();
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await setup(ctx, true);
    let refused = 0;
    await ctx.route('https://twaptpofhbnnfciowoig.supabase.co/rest/v1/professional_posts*', r => {
      if (r.request().method() === 'GET' && r.request().url().includes('image_path_2')) { refused++; return r.fulfill({ status: 400, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify({ code: '42703', message: 'column professional_posts.image_path_2 does not exist' }) }); }
      return r.fallback();
    });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.goto(`${SITE}/`); await settle(page, 1500);
    const f = frameOf(page);
    check(await until(() => f.evaluate(() => document.querySelectorAll('[data-view="works"] [data-post-id]').length > 3)) && refused >= 1, `sütun yok: akış yüklendi (sütunsuz sorguya düştü, ret ${refused})`);
    await openComposer(page, f);
    await f.setInputFiles('#kaPostImage', [png(1), png(2)]);
    await until(() => f.evaluate(() => document.querySelectorAll('#kaPostPreview img').length >= 1));
    const pv = await preview(f);
    check(pv.n === 1 && pv.label === 'Fotoğrafı Değiştir', `sütun yok: tek fotoğraf alındı ${JSON.stringify(pv)}`);
    const w = await publish(page, f, 'Tek');
    check(w?.body?.image_path && !('image_path_2' in w.body), `sütun yok: kayıtta image_path_2 gönderilmedi ${JSON.stringify(w?.body)}`);
    check(errs.length === 0, `sütun yok: sayfa hatası yok ${errs.join(' ')}`);
    await ctx.close();
  }
} finally {
  await browser.close();
}
