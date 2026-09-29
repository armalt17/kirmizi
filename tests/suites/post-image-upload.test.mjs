// Kaynak: geçici /tmp/claude-0/pkg/imgtest.mjs — v4.12.0 güvenlik ağı olarak kalıcılaştırıldı.
import { chromium, fs, ROOT, APP, NM, OUT, U1, U2, now, iso, db, writes, uploads, IMG, DB0, resetDb, cursorOr, filterRows, seq, orderRows, withEmbeds, handleRest, libs, HOSTINGER_BASE_CSS, hostPage, errors, realtimeMock, postSeq, makePost, setup, frameOf, check, DEFAULT_CHROMIUM, LAUNCH } from '../helpers/harness.mjs';
import { b64, tokenFor, uidOf, uidSeq, authMock, boot, acct, paneOf, errOf, navLogin, go, submitPane, fillSignup, visibleView, navClick, settle, flag, noProfileInsert } from '../helpers/auth.mjs';

// ===== Mobil fotoğraf yükleme: MIME / EXIF / Android dosya anlık görüntüsü / bozuk dosya =====
function exifJpeg(jpeg, orientation) {
  const tiff = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, orientation, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), tiff]);
  const app1 = Buffer.concat([Buffer.from([0xFF, 0xE1]), Buffer.from([(payload.length + 2) >> 8, (payload.length + 2) & 0xFF]), payload]);
  return Buffer.concat([jpeg.subarray(0, 2), app1, jpeg.subarray(2)]);
}
async function makeImage(f, { w, h, type = 'image/jpeg', q = 0.9, split = false, noise = true }) {
  const b64 = await f.evaluate(async ({ w, h, type, q, split, noise }) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
    if (split) { x.fillStyle = '#e30a17'; x.fillRect(0, 0, w / 2, h); x.fillStyle = '#1040e0'; x.fillRect(w / 2, 0, w / 2, h); }
    else { const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#89b4e8'); g.addColorStop(1, '#c07a3a'); x.fillStyle = g; x.fillRect(0, 0, w, h); if (noise) for (let i = 0; i < 4000; i++) { x.fillStyle = `hsl(${Math.random() * 360},50%,${30 + Math.random() * 40}%)`; x.fillRect(Math.random() * w, Math.random() * h, 3 + Math.random() * 40, 3 + Math.random() * 40); } }
    const b = await new Promise(r => c.toBlob(r, type, q)); const a = new Uint8Array(await b.arrayBuffer()); let s = ''; for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s);
  }, { w, h, type, q, split, noise });
  return Buffer.from(b64, 'base64');
}
async function inspect(f, buf) {
  return f.evaluate(async b64 => {
    const bin = atob(b64), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    const bmp = await createImageBitmap(new Blob([a])); const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; const x = c.getContext('2d'); x.drawImage(bmp, 0, 0);
    const px = (u, v) => [...x.getImageData(Math.floor(bmp.width * u), Math.floor(bmp.height * v), 1, 1).data].slice(0, 3);
    return { w: bmp.width, h: bmp.height, top: px(0.5, 0.15), bottom: px(0.5, 0.85), left: px(0.15, 0.5), right: px(0.85, 0.5) };
  }, buf.toString('base64'));
}
const isRed = p => p[0] > 170 && p[2] < 90, isBlue = p => p[2] > 170 && p[0] < 90;
async function openComposer(page, f) {
  await f.evaluate(() => document.querySelector('[data-view="works"] [data-composer]').click());
  await f.waitForSelector('#kaPostDialog[open]'); await settle(page, 200);
}
async function pick(page, f, file) { await f.setInputFiles('#kaPostImage', file); await settle(page, 700); }
const formErr = f => f.evaluate(() => { const e = document.getElementById('kaPostError'); return e && !e.hidden ? e.textContent : ''; });
const previewOn = f => f.evaluate(() => { const p = document.getElementById('kaPostPreview'), i = p.querySelector('img'); return !p.hidden && i.complete && i.naturalWidth > 0; });
async function publish(page, f, text) {
  uploads.length = 0; writes.length = 0;
  if (text != null) await f.fill('#kaPostContent', text);
  await f.evaluate(() => document.getElementById('kaPostForm').requestSubmit()); await settle(page, 3500);
  const up = uploads.find(u => !u.del && /professional-posts/.test(u.path));
  let body = null;
  if (up) { const ct = up.headers['content-type'] || ''; const m = /boundary=(.+)$/.exec(ct); if (m) { const parts = up.body.toString('binary').split('--' + m[1]); const part = parts.find(x => /Content-Type: image\//i.test(x)); if (part) body = Buffer.from(part.slice(part.indexOf('\r\n\r\n') + 4).replace(/\r\n$/, ''), 'binary'); } else body = up.body; }
  return { up, body, err: await formErr(f), open: await f.evaluate(() => document.getElementById('kaPostDialog').open), write: writes.find(w => w.table === 'professional_posts') };
}
const APP_OLD = process.env.APP_OLD;
const browser = await chromium.launch(LAUNCH);
const VPS2 = [{ name: 'android', width: 412, height: 915, isMobile: true, hasTouch: true, ua: 'Mozilla/5.0 (Linux; Android 14; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36' }, { name: 'desktop', width: 1366, height: 900 }];
for (const vp of VPS2.slice(0, +(process.env.NVP || 2))) {
  const N = vp.name;
  resetDb();
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch, userAgent: vp.ua });
  await setup(ctx, true);
  // Cihaz simülasyonları (gerçek cihaz davranışı DEĞİL):
  // __expire: seçilen File nesnesi sonradan okunamaz olur (Android content:// anlık görüntü kaybı → NotReadableError)
  // __cibCalls: createImageBitmap çağrı seçenekleri kaydı
  await ctx.addInitScript(() => {
    window.__expire = false; window.__cibCalls = [];
    const picked = new WeakSet();
    const inDesc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files');
    Object.defineProperty(HTMLInputElement.prototype, 'files', { get() { const fl = inDesc.get.call(this); if (fl) for (const f of fl) picked.add(f); return fl; }, set(v) { inDesc.set.call(this, v); }, configurable: true });
    const dead = () => Promise.reject(new DOMException('The requested file could not be read, typically due to permission problems that have occurred after a reference to a file was acquired.', 'NotReadableError'));
    const cib = window.createImageBitmap.bind(window);
    window.createImageBitmap = (src, ...rest) => { window.__cibCalls.push(rest[rest.length - 1] && typeof rest[rest.length - 1] === 'object' ? { ...rest[rest.length - 1] } : {}); if (window.__expire && picked.has(src)) return dead(); return cib(src, ...rest); };
    const ab = Blob.prototype.arrayBuffer; Blob.prototype.arrayBuffer = function () { if (window.__expire && picked.has(this)) return dead(); return ab.call(this); };
    const cou = URL.createObjectURL.bind(URL); URL.createObjectURL = o => (window.__expire && picked.has(o) ? 'blob:https://isgcalisanplatformu.com/00000000-dead-4000-8000-000000000000' : cou(o));
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`img ${N}: ${e.message}`));
  await page.goto('https://isgcalisanplatformu.com/'); await settle(page, 1200);
  const f = frameOf(page); await f.waitForSelector('[data-view="works"] [data-post-id]');
  const big = await makeImage(f, { w: 4000, h: 3000 });
  // 1) Normal JPEG
  await openComposer(page, f); await pick(page, f, { name: 'IMG_20250929_133601.jpg', mimeType: 'image/jpeg', buffer: big });
  let r = await publish(page, f, 'Normal JPEG');
  let m = r.body && await inspect(f, r.body);
  check(r.up && !r.err && !r.open && m && Math.max(m.w, m.h) === 1600 && r.body.length <= 1024 * 1024 && /image\/webp/.test(r.up.headers['content-type'] || '') || (r.up && /webp/.test(r.up.path)), `${N} JPEG 4000×3000 → ${m?.w}×${m?.h}, ${Math.round((r.body?.length || 0) / 1024)} KB, ${r.up?.path.split('/').pop()}`);
  check(r.up && new RegExp(`/professional-posts/${U1}/[0-9a-f-]{36}-[0-9a-f-]{36}\\.webp$`).test(r.up.path) && r.write?.body?.image_path?.endsWith('.webp') && r.body.length <= 500 * 1024 * 1.05, `${N} storage yolu {uid}/{postId}-{id}.webp, hedef ≤500 KB, image_path yazıldı`);
  // 2) MIME / uzantı farklılıkları (içerik geçerli)
  for (const [label, file] of [
    ['MIME application/octet-stream, uzantısız ad', { name: 'IMG_1234', mimeType: 'application/octet-stream', buffer: big }],
    ['MIME image/jpg (standart dışı)', { name: 'photo.jpeg', mimeType: 'image/jpg', buffer: big }],
    ['PNG içerik .jpg adıyla', { name: 'screenshot.jpg', mimeType: 'image/jpeg', buffer: await makeImage(f, { w: 1080, h: 2340, type: 'image/png', noise: false }) }],
    ['WebP içerik', { name: 'foto.webp', mimeType: 'image/webp', buffer: await makeImage(f, { w: 3000, h: 4000, type: 'image/webp', q: 0.9 }) }]
  ]) {
    await openComposer(page, f); await pick(page, f, file);
    const pv = await previewOn(f), e0 = await formErr(f);
    r = await publish(page, f, label); m = r.body && await inspect(f, r.body);
    check(pv && !e0 && r.up && !r.err && m && Math.max(m.w, m.h) <= 1600 && r.body.length <= 1024 * 1024, `${N} ${label}: kabul edildi → ${m?.w}×${m?.h}, ${Math.round((r.body?.length || 0) / 1024)} KB ${r.err || ''}`);
  }
  // 3) EXIF orientation 6 (telefon dik çekim): küçük ve büyük
  for (const [w, h] of [[1200, 800], [4000, 3000]]) {
    const src = exifJpeg(await makeImage(f, { w, h, split: true, noise: false }), 6);
    await openComposer(page, f); await pick(page, f, { name: 'dik.jpg', mimeType: 'image/jpeg', buffer: src });
    await f.evaluate(() => { window.__cibCalls.length = 0; });
    r = await publish(page, f, 'EXIF 6'); m = r.body && await inspect(f, r.body);
    const calls = await f.evaluate(() => window.__cibCalls);
    check(m && m.h > m.w && Math.max(m.w, m.h) === Math.min(1600, w) && isRed(m.top) && isBlue(m.bottom), `${N} EXIF yön 6 (${w}×${h}): dik ve doğru döndürülmüş → ${m?.w}×${m?.h} üst=${m?.top} alt=${m?.bottom}`);
    if (w > 1600) check(calls[0]?.resizeHeight === 1600 && calls[0]?.resizeWidth === 1200 && calls[0]?.imageOrientation === 'from-image', `${N} büyük fotoğraf doğrudan hedef boyutta decode edildi (tam çözünürlük açılmadı) ${JSON.stringify(calls[0])}`);
  }
  // 4) Android dosya anlık görüntüsü kaybı (SİMÜLASYON): seçimden sonra File okunamaz olur
  await openComposer(page, f); await pick(page, f, { name: 'IMG_20250929_133601.jpg', mimeType: 'image/jpeg', buffer: big });
  await f.evaluate(() => { window.__expire = true; });
  r = await publish(page, f, 'Snapshot');
  await f.evaluate(() => { window.__expire = false; });
  check(r.up && !r.err && !r.open, `${N} [simülasyon] seçimden sonra okunamaz olan dosya yine de yüklendi ${r.err ? '— ' + r.err : ''}`);
  // 5) Gerçekten bozuk / desteklenmeyen dosyalar reddedilir
  const corrupt = Buffer.concat([big.subarray(0, 600), Buffer.alloc(40000, 7)]);
  for (const [label, file, expect] of [
    ['JPEG imzalı bozuk dosya', { name: 'bozuk.jpg', mimeType: 'image/jpeg', buffer: corrupt }, 'açılamadı'],
    ['rastgele bayt .jpg', { name: 'x.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(Array.from({ length: 5000 }, (_, i) => (i * 37) & 255)) }, 'desteklenen bir fotoğraf değil'],
    ['PDF .png adıyla', { name: 'belge.png', mimeType: 'image/png', buffer: Buffer.from('%PDF-1.7\n' + 'x'.repeat(3000)) }, 'desteklenen bir fotoğraf değil'],
    ['HEIC (bu tarayıcı açamıyor)', { name: 'IMG_0001.HEIC', mimeType: 'image/heic', buffer: Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic'), Buffer.alloc(3000, 1)]) }, 'HEIC']
  ]) {
    await openComposer(page, f); await pick(page, f, file); await settle(page, 400);
    const e1 = await formErr(f), pv = await f.evaluate(() => !document.getElementById('kaPostPreview').hidden);
    r = await publish(page, f, label);
    check(e1.includes(expect) && !pv && !r.up, `${N} ${label}: seçimde reddedildi ("${e1.slice(0, 60)}…"), yükleme yok`);
    if (r.open) { await f.evaluate(() => document.getElementById('kaPostDialog').close()); await settle(page, 200); }
  }
  // 6) Düzenleme: kendi Çalışmasının fotoğrafını değiştir (octet-stream MIME ile)
  const own = await f.evaluate(([u]) => { const c = [...document.querySelectorAll('[data-view="works"] [data-post-id]')].find(x => x.querySelector('[data-post-action="edit"]')); return c?.dataset.postId; }, [U1]);
  await f.evaluate(id => { const c = document.querySelector(`[data-view="works"] [data-post-id="${id}"]`); c.querySelector('[data-popover-trigger]').click(); c.querySelector('[data-post-action="edit"]').click(); }, own);
  await f.waitForSelector('#kaPostDialog[open]'); await settle(page, 300);
  const before = db.professional_posts.find(p => p.id === own).image_path;
  await pick(page, f, { name: 'IMG_9999', mimeType: 'application/octet-stream', buffer: big });
  r = await publish(page, f, null);
  check(r.up && !r.err && r.write?.body?.image_path && r.write.body.image_path !== before && r.write.body.image_path.startsWith(`${U1}/${own}-`) && !uploads.some(u => u.del), `${N} düzenleme: yeni fotoğraf yüklendi, image_path güncellendi, eski dosya silinmedi (${r.write?.body?.image_path})`);
  // 7) Düzenlemede bozuk dosya seçilirse mevcut görsel korunur
  await f.evaluate(id => { const c = document.querySelector(`[data-view="works"] [data-post-id="${id}"]`); c.querySelector('[data-popover-trigger]').click(); c.querySelector('[data-post-action="edit"]').click(); }, own);
  await f.waitForSelector('#kaPostDialog[open]'); await settle(page, 300);
  await pick(page, f, { name: 'bozuk.jpg', mimeType: 'image/jpeg', buffer: corrupt }); await settle(page, 400);
  const keep = await f.evaluate(() => { const i = document.querySelector('#kaPostPreview img'); return { vis: !document.getElementById('kaPostPreview').hidden, src: i.getAttribute('src') || '' }; });
  check((await formErr(f)).includes('açılamadı') && keep.vis && keep.src.includes('/professional-posts/'), `${N} düzenleme + bozuk dosya: hata gösterildi, mevcut görsel önizlemede korundu`);
  await f.evaluate(() => document.getElementById('kaPostDialog').close()); await settle(page, 200);
  await ctx.close();
}
// 8) iPhone/Safari simülasyonu: canvas WebP üretemez → JPEG
{
  resetDb();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  process.env.SAFARI = '1'; await setup(ctx, true); delete process.env.SAFARI;
  const page = await ctx.newPage();
  await page.goto('https://isgcalisanplatformu.com/'); await settle(page, 1200);
  const f = frameOf(page); await f.waitForSelector('[data-view="works"] [data-post-id]');
  const big = exifJpeg(await makeImage(f, { w: 4032, h: 3024, split: true, noise: false }), 6);
  await openComposer(page, f); await pick(page, f, { name: 'IMG_0420.JPG', mimeType: 'image/jpeg', buffer: big });
  const r = await publish(page, f, 'Safari'); const m = r.body && await inspect(f, r.body);
  check(r.up && /\.jpg$/.test(r.up.path) && m && m.h === 1600 && m.w === 1200 && isRed(m.top) && r.body.length <= 1024 * 1024, `safari-sim: WebP yok → JPEG ${m?.w}×${m?.h}, ${Math.round((r.body?.length || 0) / 1024)} KB, yön doğru`);
  await ctx.close();
}
await browser.close();
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO PAGE ERRORS');
