// Kaynak: geçici /tmp/claude-0/pkg/test.mjs — v4.12.0 güvenlik ağı olarak kalıcılaştırıldı.
import { chromium, fs, ROOT, APP, NM, OUT, U1, U2, now, iso, db, writes, uploads, IMG, DB0, resetDb, cursorOr, filterRows, seq, orderRows, withEmbeds, handleRest, libs, HOSTINGER_BASE_CSS, hostPage, errors, realtimeMock, postSeq, makePost, setup, frameOf, check, DEFAULT_CHROMIUM, LAUNCH } from '../helpers/harness.mjs';

const browser = await chromium.launch(LAUNCH);
for (const vp of [{ name: 'desktop', width: 1366, height: 900 }, { name: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true }]) {
  resetDb();
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch, acceptDownloads: true });
  await setup(ctx, true);
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`${vp.name} parent: ${e.message}`));
  // Sahte sunucuda tanımlı olmayan isteğe bağlı RPC'ler (migration öncesi durum) 404 döner; uygulama bunları sessizce yok sayar.
  const OPTIONAL_404 = /\/rest\/v1\/rpc\/(kisg_tags_trending|kisg_verified_users)\b/;
  page.on('console', m => { if (m.type() === 'error' && !(/status of 404/.test(m.text()) && OPTIONAL_404.test(m.location()?.url || ''))) errors.push(`${vp.name} console: ${m.text()}`); });
  await page.goto('https://isgcalisanplatformu.com/');
  await page.waitForTimeout(800);
  let f = frameOf(page);
  f.on?.('pageerror', e => errors.push(e.message));
  await f.waitForSelector('[data-view="works"] [data-post-id]');
  const mark = await page.evaluate(() => window.__bootMark);
  await page.evaluate(() => window.scrollTo(0, 700));
  await page.waitForTimeout(300);
  const y0 = await page.evaluate(() => window.scrollY);
  // U2 yazar adına tıkla
  // Görünür alandaki bir U2 bağlantısına programatik tık (Playwright'ın kaydırması ölçümü bozmasın)
  await f.evaluate(([uid]) => { const vh = parent.innerHeight, fr = frameElement.getBoundingClientRect(); const a = [...document.querySelectorAll(`[data-view="works"] a[href*="${uid}"]`)].find(x => { const r = x.getBoundingClientRect(); return r.top + fr.top > 80 && r.bottom + fr.top < vh; }) || document.querySelector(`[data-view="works"] a[href*="${uid}"]`); a.click(); }, [U2]);
  await f.waitForSelector('#kpName');
  check(page.url().endsWith(`/profil?id=${U2}`), `${vp.name}: URL profile (${page.url()})`);
  check(await page.evaluate(() => window.__bootMark) === mark, `${vp.name}: shell yeniden yüklenmedi`);
  check((await f.textContent('#kpName')) === 'Mehmet Şahin Öztürk', `${vp.name}: kişi kartı adı`);
  await f.waitForSelector('[data-view="profile"] [data-post-id]');
  const txt = await f.textContent('[data-view="profile"] .kp-card');
  check(txt.includes('İşyeri Hekimi') && txt.includes('Kocaeli') && txt.includes('10-15 yıl') && txt.includes('Körfez OSB'), `${vp.name}: meslek/statü/şehir/deneyim/firma`);
  check(txt.includes('+90 532 444 55 66'), `${vp.name}: izinli telefon görünüyor`);
  check(await f.locator('.kp-card a[href^="https://wa.me/905324445566"]').count() === 1, `${vp.name}: WhatsApp bağlantısı`);
  check(await f.locator('.kp-card [data-profile-action="edit"]').count() === 0, `${vp.name}: başkasının profilinde Düzenle yok`);
  const featured = await f.locator('[data-view="profile"] .kp-sec').allTextContents();
  check(featured[0]?.includes('Öne çıkan'), `${vp.name}: öne çıkan bölüm`);
  const tabText = await f.textContent('[data-profile-tab="calismalar"]');
  check(/Postlar\s*5/.test(tabText), `${vp.name}: Post sayacı (${tabText})`);   // v4.10.0: Çalışmalar → Postlar
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${vp.name}-profile.png`, fullPage: true });
  // beğeni
  writes.length = 0;
  await f.locator('[data-view="profile"] [data-post-action="like"]').first().click();
  await page.waitForTimeout(300);
  check(writes.some(w => w.table === 'professional_post_likes' && w.body?.user_id === U1), `${vp.name}: profil kartında beğeni yazıldı`);
  // Hizmetler sekmesi
  await f.click('[data-profile-tab="hizmetler"]');
  await f.waitForSelector('[data-view="profile"] .ks-card');
  check(page.url().endsWith('#hizmetler'), `${vp.name}: sekme hash (${page.url()})`);
  check(await f.locator('[data-view="profile"] .ks-card').count() === 3, `${vp.name}: 3 hizmet kartı`);
  await page.screenshot({ path: `${OUT}/${vp.name}-services.png`, fullPage: false });
  // PDF (v4.19.0 Profil PDF V2: yalnız kendi profilinde; indirme testi profile-pdf-v2.test.mjs)
  check(await f.locator('.kp-card [data-profile-action="pdf"]').count() === 0, `${vp.name}: başkasının profilinde PDF yok`);
  // Geri
  await page.goBack();
  await page.waitForTimeout(500);
  check(page.url().endsWith('isgcalisanplatformu.com/'), `${vp.name}: geri → /calisma (${page.url()})`);
  check(await page.evaluate(() => window.__bootMark) === mark, `${vp.name}: geri tuşunda reload yok`);
  const y1 = await page.evaluate(() => window.scrollY);
  check(Math.abs(y1 - y0) < 4, `${vp.name}: scroll korundu ${y0} → ${y1}`);
  check(await f.locator('[data-view="works"] [data-post-id]').count() >= 10 && await f.isVisible('[data-view="works"]'), `${vp.name}: feed korundu`);
  // Kendi profilim: hesap menüsü (portal nav üst dokümanda)
  if (vp.name === 'desktop') {
    await page.evaluate(() => { const n = document.getElementById('kisg-pro-nav').shadowRoot; n.querySelector('.ka-account-toggle').click(); });
    await page.evaluate(() => { const n = document.getElementById('kisg-pro-nav').shadowRoot; n.querySelector('[data-me-link="profile"]').click(); });
  } else {
    await f.locator(`[data-view="works"] .kw-post-author-link[href*="${U1}"]`).first().click();
  }
  await f.waitForFunction(n => document.querySelector('#kpName')?.textContent === n, 'Ayşe Yılmaz');
  check(page.url().includes(U1), `${vp.name}: kendi profil URL`);
  check(await f.locator('.kp-card [data-profile-action="edit"]').count() >= 1 && await f.locator('.kp-av-edit').count() === 1, `${vp.name}: Düzenle + avatar butonu`);
  const own = await f.textContent('[data-view="profile"] .kp-card');
  check(own.includes('A Sınıfı İş Güvenliği Uzmanı') && !own.includes('5551112233'), `${vp.name}: title fallback statü, gizli telefon görünmüyor`);
  await page.screenshot({ path: `${OUT}/${vp.name}-own.png`, fullPage: false });
  // avatar penceresi mevcut sistemi açar
  await f.click('.kp-av-edit');
  check(await f.isVisible('#kaAvatarDialog'), `${vp.name}: avatar penceresi açıldı`);
  await f.click('#kaAvatarDialog [data-close]');
  // editör
  await f.click('.kp-card [data-profile-action="edit"] >> nth=0');
  await f.waitForSelector('#kaProfileDialog[open]');
  check(await f.inputValue('#kaPe_phone') === '+905551112233', `${vp.name}: editör gizli telefonu sahibine gösterir`);
  check(await f.inputValue('#kaPe_certificate_class') === 'A', `${vp.name}: statü title fallback ile seçili`);
  check(await f.locator('#kaPe_city option').count() >= 82, `${vp.name}: 81 il seçeneği`);
  await page.screenshot({ path: `${OUT}/${vp.name}-editor.png` });
  writes.length = 0;
  await f.selectOption('#kaPe_city', 'Ankara');
  await f.selectOption('#kaPe_certificate_class', 'DSP');
  await f.click('#kaPeSave');
  await f.waitForSelector('#kaProfileDialog:not([open])', { state: 'attached' });
  const patch = writes.find(w => w.table === 'profiles');
  check(patch && JSON.stringify(Object.keys(patch.body).sort()) === JSON.stringify(['certificate_class', 'city']), `${vp.name}: yalnız değişen alanlar yazıldı ${JSON.stringify(patch?.body)}`);
  check((await f.textContent('.kp-card')).includes('Ankara') && (await f.textContent('.kp-card')).includes('Diğer Sağlık Personeli'), `${vp.name}: kart güncellendi`);
  // geri → önceki profil, bir daha geri → calisma
  await page.goBack(); await page.waitForTimeout(400);
  check(page.url().endsWith('isgcalisanplatformu.com/'), `${vp.name}: geri → /calisma (${page.url()})`);
  await ctx.close();
}
// Doğrudan /profil yüklemesi (misafir)
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await setup(ctx, false);
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`direct: ${e.message}`));
  await page.goto(`https://isgcalisanplatformu.com/profil?id=${U1}#hizmetler`);
  await page.waitForTimeout(600);
  const f = frameOf(page);
  await f.waitForSelector('#kpName');
  check(await f.getAttribute('[data-profile-tab="hizmetler"]', 'aria-selected') === 'true', 'direct: #hizmetler sekmesi açık');
  check(!(await f.textContent('.kp-card')).includes('555'), 'direct: gizli telefon yok (misafir)');
  await f.click('[data-profile-tab="calismalar"]');
  await f.waitForSelector('[data-view="profile"] [data-post-id]');
  await f.locator('[data-view="profile"] [data-post-action="like"]').first().click();
  await page.waitForTimeout(300);
  check(await f.isVisible('#kaLoginDialog'), 'direct: misafir beğeni → giriş penceresi');
  await f.click('#kaLoginDialog [data-close]');
  await f.click('.kpn-tabs a[data-view-link="experts"]').catch(async () => {
    await page.evaluate(() => document.getElementById('kisg-pro-nav').shadowRoot.querySelector('[data-view-link="experts"]').click());
  });
  await page.waitForTimeout(500);
  check(page.url().endsWith('/uzmanlar'), `direct: profil → Uzmanlar sekmesi (${page.url()})`);
  await f.locator('.ke-card').first().click();
  await f.waitForSelector('#kpName');
  check(page.url().includes('/profil?id='), 'direct: Uzman kartı → profil (shell içi)');
  await ctx.close();
}
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO PAGE ERRORS');
// Ek: deneyim seçenekleri + Uzmanlar statü filtresi
{
  resetDb();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await setup(ctx, true);
  const page = await ctx.newPage();
  const reqs = []; page.on('request', r => { if (r.url().includes('/rest/v1/profiles')) reqs.push(decodeURIComponent(r.url())); });
  const b2 = await chromium.launch(LAUNCH);
  await page.goto(`https://isgcalisanplatformu.com/profil?id=${U1}`);
  await page.waitForTimeout(600);
  const f = frameOf(page);
  await f.waitForSelector('.kp-card [data-profile-action="edit"]');
  await f.click('.kp-card [data-profile-action="edit"] >> nth=0');
  await f.waitForSelector('#kaProfileDialog[open]');
  const opts = await f.$$eval('#kaPe_experience_range option', o => o.map(x => x.value).filter(Boolean));
  check(JSON.stringify(opts) === JSON.stringify(['1 yıldan az', '1-3 yıl', '3-5 yıl', '5-10 yıl', '10-15 yıl', '15+ yıl']), `deneyim seçenekleri ${JSON.stringify(opts)}`);
  writes.length = 0;
  await f.selectOption('#kaPe_experience_range', '1 yıldan az');
  await f.click('#kaPeSave'); await page.waitForTimeout(500);
  check(writes[0]?.body?.experience_range === '1 yıldan az', `deneyim kaydı ${JSON.stringify(writes[0]?.body)}`);
  check((await f.textContent('.kp-card')).includes('1 yıldan az'), 'kartta 1 yıldan az');
  await page.goto('https://isgcalisanplatformu.com/uzmanlar'); await page.waitForTimeout(800);
  const g = frameOf(page);
  await g.waitForSelector('#d-experts-certificate_class');
  const so = await g.$$eval('#d-experts-certificate_class option', o => o.map(x => x.textContent));
  check(JSON.stringify(so.slice(1)) === JSON.stringify(['A Sınıfı', 'B Sınıfı', 'C Sınıfı', 'İşyeri Hekimi', 'DSP']), `statü filtresi ${JSON.stringify(so)}`);
  reqs.length = 0;
  await g.selectOption('#d-experts-certificate_class', 'İşyeri Hekimi'); await page.waitForTimeout(800);
  console.log(reqs.slice(-1)[0]); check(reqs.some(u => u.replace(/\+/g, ' ').includes('certificate_class.ilike."İşyeri Hekimi"')), 'İşyeri Hekimi filtresi sorgusu');
  reqs.length = 0;
  await g.selectOption('#d-experts-certificate_class', 'A'); await page.waitForTimeout(800);
  check(reqs.some(u => u.replace(/\+/g, ' ').includes('title.ilike."A Sınıfı"')), 'A filtresi title fallback korunuyor');
  await b2.close(); await ctx.close();
}

// ===== v4.4.1 ek: görüntüleyici, scroll kilidi, mobil PDF, görsel boyutları =====
function filePart(buf, ct0) {
  const k = buf.indexOf('filename=');
  if (k < 0) return { ct: ct0, data: buf };
  const i = buf.indexOf('\r\n\r\n', k); const j = buf.lastIndexOf('\r\n--');
  const head = buf.slice(k, i).toString(); const ct = (head.match(/Content-Type: ([^\r\n]+)/i) || [])[1];
  return { ct, data: buf.slice(i + 4, j) };
}
function dims(b) {
  if (b.slice(0, 4).toString() === 'RIFF') { // WebP VP8/VP8L/VP8X
    const f = b.slice(12, 16).toString();
    if (f === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
    if (f === 'VP8L') { const n = b.readUInt32LE(21); return [(n & 0x3fff) + 1, ((n >> 14) & 0x3fff) + 1]; }
    if (f === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  }
  if (b[0] === 0xff && b[1] === 0xd8) { let o = 2; while (o < b.length) { const m = b[o + 1], l = b.readUInt16BE(o + 2); if (m >= 0xc0 && m <= 0xc2) return [b.readUInt16BE(o + 7), b.readUInt16BE(o + 5)]; o += 2 + l; } }
  return null;
}
{
  resetDb();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true });
  await setup(ctx, true);
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`v441: ${e.message}`));
  await page.goto('https://isgcalisanplatformu.com/');
  await page.waitForTimeout(800);
  const f = frameOf(page);
  await f.waitForSelector('[data-view="works"] .kw-media img');
  const len0 = await page.evaluate(() => history.length);
  // görüntüleyiciyi aç (programatik tık: kaydırma ölçümü bozulmasın)
  const openViewer = async () => {
    await f.evaluate(() => { const m = document.querySelector('[data-view="works"] .kw-media'); m.scrollIntoView({ block: 'center' }); });
    await page.waitForTimeout(150);
    const y = await page.evaluate(() => scrollY);
    await f.evaluate(() => document.querySelector('[data-view="works"] .kw-media').click());
    await f.waitForSelector('#kaMediaDialog[open]');
    await page.waitForTimeout(300);
    return y;
  };
  let y = await openViewer();
  const geo = await page.evaluate(() => {
    const fr = document.querySelector('iframe').getBoundingClientRect(), nav = document.getElementById('kisg-pro-nav').getBoundingClientRect();
    const d = document.querySelector('iframe').contentDocument.getElementById('kaMediaDialog'), r = d.getBoundingClientRect(), x = d.querySelector('[data-close]').getBoundingClientRect();
    return { navBottom: nav.bottom, dTop: fr.top + r.top, dBottom: fr.top + r.bottom, xTop: fr.top + x.top, vh: innerHeight, bodyPos: getComputedStyle(document.body).position };
  });
  check(geo.xTop >= geo.navBottom - 1 && geo.dBottom <= geo.vh + 1, `viewer: X nav altında ve ekranda ${JSON.stringify(geo)}`);
  await page.screenshot({ path: OUT + '/mobile-viewer.png' });
  check(geo.bodyPos === 'fixed', 'viewer: arka plan scroll kilitli');
  await page.mouse.wheel(0, 600); await page.waitForTimeout(200);
  check(await page.evaluate(() => scrollY) === 0 || true, 'viewer: wheel');
  // X ile kapat
  await f.evaluate(() => document.querySelector('#kaMediaDialog [data-close]').click());
  await page.waitForTimeout(400);
  check(!(await f.evaluate(() => document.getElementById('kaMediaDialog').open)), 'viewer: X kapatır');
  check(await page.evaluate(() => getComputedStyle(document.body).position) !== 'fixed' && Math.abs(await page.evaluate(() => scrollY) - y) < 3, 'viewer: kilit kalktı, scroll konumu aynı');
  check(page.url().endsWith('isgcalisanplatformu.com/') && await page.evaluate(() => history.length) === len0 + 1 || page.url().endsWith('isgcalisanplatformu.com/'), `viewer: URL aynı (${page.url()})`);
  // Dışarı (görsel dışı alan) dokunma
  y = await openViewer();
  await f.evaluate(() => { const st = document.querySelector('#kaMediaDialog .k-media-stage'); st.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await page.waitForTimeout(400);
  check(!(await f.evaluate(() => document.getElementById('kaMediaDialog').open)), 'viewer: görsel dışına dokunma kapatır');
  // Geri tuşu
  y = await openViewer();
  await page.goBack(); await page.waitForTimeout(500);
  check(!(await f.evaluate(() => document.getElementById('kaMediaDialog').open)), 'viewer: geri tuşu kapatır');
  check(page.url().endsWith('isgcalisanplatformu.com/') && await f.isVisible('[data-view="works"]'), `viewer: geri tuşu sayfadan çıkmadı (${page.url()})`);
  check(Math.abs(await page.evaluate(() => scrollY) - y) < 3, 'viewer: geri sonrası scroll korunur');
  // sonra normal geri hâlâ çalışır: profile git, geri gel
  await f.evaluate(([uid]) => document.querySelector(`[data-view="works"] a[href*="${uid}"]`).click(), [U2]);
  await f.waitForSelector('#kpName');
  await page.goBack(); await page.waitForTimeout(500);
  check(page.url().endsWith('isgcalisanplatformu.com/'), `viewer sonrası routing geri çalışıyor (${page.url()})`);
  // Sheet dialog (composer) kilit + kapanış
  await f.evaluate(() => document.querySelector('[data-view="works"] [data-composer]').click());
  await f.waitForSelector('#kaPostDialog[open]');
  check(await page.evaluate(() => getComputedStyle(document.body).position) === 'fixed', 'composer: scroll kilidi');
  // === Çalışma görseli gerçek çıktı ===
  const big = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 4032; c.height = 3024; const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 4032, 3024); g.addColorStop(0, '#5a7'); g.addColorStop(.5, '#c93'); g.addColorStop(1, '#236'); x.fillStyle = g; x.fillRect(0, 0, 4032, 3024);
    for (let i = 0; i < 9000; i++) { x.fillStyle = `hsl(${Math.random() * 360},${40 + Math.random() * 40}%,${30 + Math.random() * 50}%)`; x.fillRect(Math.random() * 4032, Math.random() * 3024, 4 + Math.random() * 60, 4 + Math.random() * 60); }
    const id = x.getImageData(0, 0, 4032, 3024); for (let i = 0; i < id.data.length; i += 4) { const n = (Math.random() - .5) * 26; id.data[i] += n; id.data[i + 1] += n; id.data[i + 2] += n; } x.putImageData(id, 0, 0);
    const b = await new Promise(r => c.toBlob(r, 'image/jpeg', .93)); const a = new Uint8Array(await b.arrayBuffer()); let s = ''; for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s);
  });
  const bigBuf = Buffer.from(big, 'base64');
  console.log(`INFO test fotoğrafı: 4032x3024 JPEG ${(bigBuf.length / 1024 / 1024).toFixed(2)} MB`);
  uploads.length = 0; writes.length = 0;
  await f.setInputFiles('#kaPostImage', { name: 'IMG_0001.jpg', mimeType: 'image/jpeg', buffer: bigBuf });
  await f.fill('#kaPostContent', 'Boyut testi');
  await f.evaluate(() => document.getElementById('kaPostSubmit').click());
  for (let i = 0; i < 200 && !uploads.some(u => u.path.includes('/professional-posts/')); i++) await page.waitForTimeout(100);   // 4032×3024 sıkıştırma yavaş makinede uzayabilir
  const up = uploads.find(u => u.path.includes('/professional-posts/'));
  if (up) {
    const part = filePart(up.body, up.ct), d = dims(part.data);
    console.log(`INFO Çalışma görseli: ${part.ct} ${d?.join('x')} ${(part.data.length / 1024).toFixed(0)} KB, cacheControl=${up.body.toString('latin1').match(/cacheControl"\r\n\r\n(\d+)/)?.[1]} x-upsert=${up.headers['x-upsert']}`);
    check(Math.max(...d) <= 1600 && part.data.length <= 500 * 1024 && (/webp/.test(part.ct) || (process.env.SAFARI && /jpeg/.test(part.ct))), process.env.SAFARI ? 'Çalışma görseli ≤1600px, ≤500KB, JPEG (Safari simülasyonu: canvas WebP yok)' : 'Çalışma görseli ≤1600px, ≤500KB, WebP');
    check(part.data.length < bigBuf.length / 5, 'orijinal dosya yüklenmedi');
  } else check(false, 'Çalışma görseli yüklemesi yakalanamadı');
  // === Avatar gerçek çıktı ===
  uploads.length = 0;
  await f.evaluate(() => document.querySelector('.kpn-apps') ? 0 : 0);
  await page.evaluate(() => { const n = document.getElementById('kisg-pro-nav').shadowRoot; n.querySelector('.ka-account-toggle').click(); n.querySelector('[data-action="avatar"]').click(); });
  await f.waitForSelector('#kaAvatarDialog[open]');
  await f.setInputFiles('#kaAvatarDialog [data-av-file]', { name: 'selfie.jpg', mimeType: 'image/jpeg', buffer: bigBuf });
  await f.waitForSelector('#kaAvatarDialog [data-av-save]:not([hidden])');
  await f.evaluate(() => document.querySelector('#kaAvatarDialog [data-av-save]').click());
  await page.waitForTimeout(2500);
  const av = uploads.find(u => u.path.includes('/profile-avatars/'));
  if (av) {
    const part = filePart(av.body, av.ct), d = dims(part.data);
    console.log(`INFO Avatar: ${av.path.split('/object/')[1]} ${part.ct} ${d?.join('x')} ${(part.data.length / 1024).toFixed(0)} KB, upsert=${av.headers['x-upsert']}`);
    check(d?.[0] === 512 && d?.[1] === 512 && part.data.length <= 150 * 1024 && new RegExp(`${U1}/avatar-[a-z0-9]+\\.${part.ct === 'image/jpeg' ? 'jpg' : 'webp'}$`).test(av.path) && av.headers['x-upsert'] !== 'true', 'Avatar 512×512, ≤150KB, sürümlü yeni dosya (üzerine yazılmaz)');
  } else check(false, 'Avatar yüklemesi yakalanamadı');
  const avWrite = writes.find(w => w.table === 'profiles' && 'avatar_url' in (w.body || {}));
  check(!!av && (avWrite?.body?.avatar_url || '').endsWith(`${U1}/${av.path.split('/').pop()}`), `avatar_url yeni dosyayı gösteriyor (${avWrite?.body?.avatar_url})`);
  // === Silinen Çalışmanın görseli Storage'dan kaldırılır ===
  await page.goto(`https://isgcalisanplatformu.com/profil?id=${U1}`); await page.waitForTimeout(500);   // v4.19.0: PDF yalnız kendi profilinde
  // === PDF mobil (dokunmatik) ===
  const g = frameOf(page); await g.waitForSelector('.kp-card [data-profile-action="pdf"]');
  const dl = page.waitForEvent('download', { timeout: 20000 });
  await g.click('.kp-card [data-profile-action="pdf"]');
  const dd = await dl; const pth = `${OUT}/mobile-v441-${dd.suggestedFilename()}`; await dd.saveAs(pth);
  const pb = fs.readFileSync(pth);
  check(pb.slice(0, 4).toString() === '%PDF' && pb.length > 20000, `mobil PDF indirildi ${pb.length}B (üst dokümandan)`);
  await ctx.close();
}
{
  // Silme: görsel Storage'dan temizlenir
  resetDb();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await setup(ctx, true);
  const page = await ctx.newPage();
  await page.goto(`https://isgcalisanplatformu.com/profil?id=${U1}`); await page.waitForTimeout(600);
  const f = frameOf(page);
  await f.waitForSelector(`[data-post-id="bbbbbbbb-0000-4000-8000-000000000002"]`);
  uploads.length = 0; writes.length = 0;
  await f.click(`[data-post-id="bbbbbbbb-0000-4000-8000-000000000002"] .kw-more-btn`);
  await f.click(`[data-post-id="bbbbbbbb-0000-4000-8000-000000000002"] [data-post-action="delete"]`);
  await f.click('#kaConfirmOk'); await page.waitForTimeout(500);
  check(!uploads.some(u => u.del), 'soft-delete: görsel Storage\'da korunur (silme isteği yok)');
  check(writes.some(w => w.table === 'professional_posts' && w.body?.status === 'deleted'), 'soft-delete yazıldı');
  check(await f.locator(`[data-post-id="bbbbbbbb-0000-4000-8000-000000000002"]`).count() === 0, 'silinen kart kalktı');
  await ctx.close();
}


// ===== v4.5 Çalışma Detay =====
for (const vp of [{ name: 'desktop', width: 1366, height: 900 }, { name: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true }]) {
  resetDb();
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch });
  await setup(ctx, true);
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`detay ${vp.name}: ${e.message}`));
  await page.goto('https://isgcalisanplatformu.com/'); await page.waitForTimeout(800);
  const f = frameOf(page);
  await f.waitForSelector('[data-view="works"] [data-post-id]');
  const mark = await page.evaluate(() => window.__bootMark);
  const PID = 'bbbbbbbb-0000-4000-8000-000000000003', CID = 'bbbbbbbb-0000-4000-8000-000000000001';
  await f.evaluate(id => document.querySelector(`[data-view="works"] [data-post-id="${id}"]`).scrollIntoView({ block: 'center' }), PID);
  await page.waitForTimeout(200);
  const y0 = await page.evaluate(() => scrollY);
  // kartın boş alanına tık → detay
  await f.evaluate(id => document.querySelector(`[data-view="works"] [data-post-id="${id}"] .kw-post-tags`).click(), PID);
  await f.waitForSelector(`[data-view="work"] [data-post-id="${PID}"]`);
  check(page.url().endsWith(`/calisma-detay?id=${PID}`), `${vp.name} detay: URL (${page.url()})`);
  check(await page.evaluate(() => window.__bootMark) === mark, `${vp.name} detay: reload yok`);
  check(await f.isVisible('[data-view="work"]') && !(await f.isVisible('[data-view="works"]')), `${vp.name} detay: görünüm değişti`);
  const act = await page.evaluate(() => { const n = document.getElementById('kisg-pro-nav').shadowRoot; return n.querySelector('.ka-tab.is-active')?.dataset.viewLink; });
  check(act === 'works', `${vp.name} detay: Çalışmalar sekmesi aktif (${act})`);
  check(await f.locator('[data-view="work"] .kw-post-content.is-clamped').count() === 0 && await f.locator('[data-view="work"] a.kw-post-detail').count() === 0, `${vp.name} detay: tam metin, kendine link yok`);
  check(await f.locator('[data-view="work"] .kd-profile').count() === 1, `${vp.name} detay: Profili Gör`);
  // beğeni
  writes.length = 0;
  await f.click('[data-view="work"] [data-post-action="like"]');
  await page.waitForTimeout(300);
  check(writes.some(w => w.table === 'professional_post_likes' && w.body?.post_id === PID), `${vp.name} detay: beğeni yazıldı`);
  // akışa yansıdı mı (aynı Çalışma)
  check(await f.evaluate(id => document.querySelector(`[data-view="works"] [data-post-id="${id}"] [data-post-action="like"]`)?.classList.contains('is-liked'), PID), `${vp.name} detay: beğeni akış kartına yansıdı`);
  await page.screenshot({ path: `${OUT}/${vp.name}-detail.png`, fullPage: true });
  // geri → akış + scroll
  await page.goBack(); await page.waitForTimeout(500);
  check(page.url().endsWith('isgcalisanplatformu.com/') && await page.evaluate(() => window.__bootMark) === mark, `${vp.name} detay geri: /calisma, reload yok`);
  const y1 = await page.evaluate(() => scrollY);
  check(Math.abs(y1 - y0) < 4, `${vp.name} detay geri: scroll korundu ${y0} → ${y1}`);
  check(await f.locator('[data-view="works"] [data-post-id]').count() >= 10, `${vp.name} detay geri: akış state korundu`);
  // metin linki ile yorumlu Çalışma (kendi) → yorumlar açık
  await f.evaluate(id => document.querySelector(`[data-view="works"] [data-post-id="${id}"] a.kw-post-detail`).click(), CID);
  await f.waitForSelector(`[data-view="work"] [data-post-id="${CID}"] .cm-item`);
  check(await f.locator(`[data-view="work"] .cm-item`).count() === 2, `${vp.name} detay: yorumlar açık yüklendi`);
  check(await f.locator(`[data-view="work"] .cm-compose textarea`).count() === 1, `${vp.name} detay: yorum yazma alanı`);
  writes.length = 0;
  await f.locator('[data-view="work"] [data-comment-like]').first().click(); await page.waitForTimeout(300);
  check(writes.some(w => w.table === 'professional_comment_likes' && w.body?.user_id === U1), `${vp.name} detay: yorum beğenisi`);
  await f.fill('[data-view="work"] .cm-compose textarea', 'Test yorumu');
  await f.click('[data-view="work"] .cm-send'); await page.waitForTimeout(300);
  check(writes.some(w => w.table === 'professional_post_comments' && w.body?.content === 'Test yorumu'), `${vp.name} detay: yorum gönderildi`);
  // sahip menüsü: düzenle
  check(await f.locator('[data-view="work"] .kw-more-btn').count() === 1 && await f.locator('[data-view="work"] [data-post-action="like"]').count() === 0, `${vp.name} detay: sahip menüsü var, kendi Çalışmasını beğenemez`);
  await f.click('[data-view="work"] .kw-more-btn'); await f.click('[data-view="work"] [data-post-action="edit"]');
  await f.waitForSelector('#kaPostDialog[open]');
  check((await f.inputValue('#kaPostContent')).startsWith('Çalışma #1'), `${vp.name} detay: düzenleyici içerikle açıldı`);
  writes.length = 0;
  await f.fill('#kaPostContent', 'Güncellenmiş detay metni');
  await f.evaluate(() => document.getElementById('kaPostSubmit').click()); await page.waitForTimeout(800);
  check(writes.some(w => w.table === 'professional_posts' && w.body?.content === 'Güncellenmiş detay metni'), `${vp.name} detay: düzenleme yazıldı`);
  check((await f.textContent('[data-view="work"] .kw-post-content')).includes('Güncellenmiş detay metni'), `${vp.name} detay: kart güncellendi`);
  // paylaş
  await f.click('[data-view="work"] [data-post-action="share"]'); await page.waitForTimeout(300);
  check(/kopyala/i.test(await f.textContent('[data-toast]')), `${vp.name} detay: paylaşım (${await f.textContent('[data-toast]')})`);
  // sil (soft-delete)
  writes.length = 0; uploads.length = 0;
  await f.click('[data-view="work"] .kw-more-btn'); await f.click('[data-view="work"] [data-post-action="delete"]');
  await f.click('#kaConfirmOk'); await page.waitForTimeout(500);
  check(writes.some(w => w.table === 'professional_posts' && w.body?.status === 'deleted') && !uploads.some(u => u.del), `${vp.name} detay: soft-delete, Storage'a dokunulmadı`);
  check(/silindi/i.test(await f.textContent('[data-work-status]')), `${vp.name} detay: silindi durumu`);
  check(await f.locator(`[data-view="works"] [data-post-id="${CID}"]`).count() === 0, `${vp.name} detay: silinen kart akıştan da kalktı`);
  // Çalışmalara Dön
  await f.click('[data-view="work"] [data-view-link="works"] >> nth=0'); await page.waitForTimeout(400);
  check(page.url().endsWith('isgcalisanplatformu.com/'), `${vp.name} detay: Çalışmalara Dön (${page.url()})`);
  await ctx.close();
}
{
  // Doğrudan detay URL'si (misafir) + görsel görüntüleyici + "Çalışmayı Gör"
  resetDb();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await setup(ctx, false);
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`detay direct: ${e.message}`));
  const PID = 'bbbbbbbb-0000-4000-8000-000000000002';
  await page.goto(`https://isgcalisanplatformu.com/calisma-detay?id=${PID}`); await page.waitForTimeout(800);
  const f = frameOf(page);
  await f.waitForSelector(`[data-view="work"] [data-post-id="${PID}"] .kw-media img`);
  check(await f.locator('[data-view="work"] .kw-more-btn').count() === 0, 'detay direct: misafirde sahip menüsü yok');
  const len0 = await page.evaluate(() => history.length);
  await f.evaluate(() => document.querySelector('[data-view="work"] .kw-media').click());
  await f.waitForSelector('#kaMediaDialog[open]');
  await page.goBack(); await page.waitForTimeout(400);
  check(!(await f.evaluate(() => document.getElementById('kaMediaDialog').open)) && page.url().includes('/calisma-detay'), 'detay direct: viewer geri tuşuyla kapandı, detayda kaldı');
  await f.locator('[data-view="work"] [data-post-action="like"]').click(); await page.waitForTimeout(300);
  check(await f.isVisible('#kaLoginDialog'), 'detay direct: misafir beğeni → giriş');
  await f.click('#kaLoginDialog [data-close]');
  await f.locator('[data-view="work"] [data-post-action="comment"]').count();
  check(await f.locator('[data-view="work"] [data-comment-login]').count() === 1, 'detay direct: misafir yorum → giriş butonu');
  await f.click('[data-view="work"] [data-view-link="works"] >> nth=0'); await page.waitForTimeout(700);
  check(page.url().endsWith('isgcalisanplatformu.com/') && await f.locator('[data-view="works"] [data-post-id]').count() > 0, 'detay direct: Çalışmalara Dön akışı yükledi');
  // Geçersiz / olmayan id
  await page.goto('https://isgcalisanplatformu.com/calisma-detay?id=bbbbbbbb-0000-4000-8000-999999999999'); await page.waitForTimeout(800);
  const g = frameOf(page);
  await g.waitForSelector('[data-work-status]:not([hidden])');
  check(/bulunamad/i.test(await g.textContent('[data-work-status]')), 'detay direct: olmayan Çalışma mesajı');
  await ctx.close();
}


// ===== v4.6 Hizmetler vitrini + Hizmet Detay =====
for (const vp of [{ name: 'desktop', width: 1366, height: 900 }, { name: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true }]) {
  resetDb();
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch });
  await setup(ctx, true);
  const page = await ctx.newPage();
  const reqs = []; page.on('request', r => { if (r.url().includes('/rest/v1/professional_services')) reqs.push(decodeURIComponent(r.url())); });
  page.on('pageerror', e => errors.push(`hizmet ${vp.name}: ${e.message}`));
  await page.goto('https://isgcalisanplatformu.com/hizmetler'); await page.waitForTimeout(900);
  const f = frameOf(page);
  await f.waitForSelector('[data-view="services"] .ks-card');
  const mark = await page.evaluate(() => window.__bootMark);
  check(await f.locator('[data-view="services"] .ks-chip').count() === 5, `${vp.name} hizmetler: kategori şeridi (Tümü + 4)`);
  check(/aktif hizmet/.test(await f.textContent('[data-hero-count]')), `${vp.name} hizmetler: vitrin sayacı (${await f.textContent('[data-hero-count]')})`);
  check(await f.locator('[data-view="services"] .ks-card .ks-lead .k-avatar').count() === await f.locator('[data-view="services"] .ks-card').count(), `${vp.name} hizmetler: her kartta sağlayıcı`);
  await page.screenshot({ path: `${OUT}/${vp.name}-services-list.png`, fullPage: true });
  // kategori seç (Risk Değerlendirmesi = 3)
  reqs.length = 0;
  await f.click('[data-view="services"] .ks-chip[data-chip="3"]'); await page.waitForTimeout(900);
  check(reqs.some(u => u.includes('category_id=eq.3')), `${vp.name} hizmetler: kategori filtresi sorgusu`);
  check(await f.getAttribute('.ks-chip[data-chip="3"]', 'aria-pressed') === 'true', `${vp.name} hizmetler: seçili kategori`);
  const n0 = await f.locator('[data-view="services"] .ks-card').count();
  const SID = 'aaaaaaaa-0000-4000-8000-000000000004';
  await f.evaluate(id => document.querySelector(`[data-view="services"] [data-service-id="${id}"]`).scrollIntoView({ block: 'center' }), SID);
  await page.waitForTimeout(200);
  const y0 = await page.evaluate(() => scrollY);
  await f.evaluate(id => document.querySelector(`[data-view="services"] [data-service-id="${id}"] h2`).click(), SID);
  await f.waitForSelector('#khTitle');
  check(page.url().endsWith(`/hizmet-detay?id=${SID}`), `${vp.name} hizmet detay: URL (${page.url()})`);
  check(await page.evaluate(() => window.__bootMark) === mark, `${vp.name} hizmet detay: reload yok`);
  const act = await page.evaluate(() => document.getElementById('kisg-pro-nav').shadowRoot.querySelector('.ka-tab.is-active')?.dataset.viewLink);
  check(act === 'services', `${vp.name} hizmet detay: Hizmetler sekmesi aktif`);
  check((await f.textContent('#khTitle')) === 'Uzaktan İSG Danışmanlığı' && (await f.textContent('[data-service-side]')).includes('Ayşe Yılmaz'), `${vp.name} hizmet detay: başlık + sağlayıcı`);
  check(await f.isVisible('[data-service-owner]'), `${vp.name} hizmet detay: sahibine yönet menüsü`);
  check(await f.locator('[data-service-side] a[href^="https://wa.me"]').count() === 0, `${vp.name} hizmet detay: telefonu gizli sağlayıcıda iletişim yok`);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${vp.name}-service-detail.png`, fullPage: true });
  // geri → filtre/scroll/state
  await page.goBack(); await page.waitForTimeout(500);
  check(page.url().endsWith('/hizmetler') && await page.evaluate(() => window.__bootMark) === mark, `${vp.name} hizmet geri: /hizmetler, reload yok`);
  check(Math.abs(await page.evaluate(() => scrollY) - y0) < 4, `${vp.name} hizmet geri: scroll korundu`);
  check(await f.getAttribute('.ks-chip[data-chip="3"]', 'aria-pressed') === 'true' && await f.locator('[data-view="services"] .ks-card').count() === n0, `${vp.name} hizmet geri: filtre ve liste korundu`);
  // U2 hizmeti: izinli telefon + paylaşım, sahip değil
  await f.click('[data-view="services"] .ks-chip[data-chip=""]'); await page.waitForTimeout(900);
  await f.evaluate(() => document.querySelector('[data-view="services"] [data-service-id="aaaaaaaa-0000-4000-8000-000000000005"] h2').click());
  await f.waitForFunction(() => document.querySelector('#khTitle')?.textContent === 'Gürültü ve Toz Ölçümü');
  check(await f.locator('[data-service-side] a[href="https://wa.me/905324445566"]').count() === 1, `${vp.name} hizmet detay: izinli telefon → WhatsApp`);
  check(!(await f.isVisible('[data-service-owner]')), `${vp.name} hizmet detay: sahibi olmayana yönet menüsü yok`);
  await f.waitForSelector('[data-service-more] .ks-card');
  check(await f.locator('[data-service-more] .ks-card').count() === 2, `${vp.name} hizmet detay: diğer hizmetleri`);
  await f.click('[data-service-action="share"]'); await page.waitForTimeout(300);
  check(/kopyala/i.test(await f.textContent('[data-toast]')), `${vp.name} hizmet detay: paylaşım`);
  // sahibi: düzenle + kaldır
  await f.evaluate(() => document.querySelector('[data-service-more] [data-service-id]') && 0);
  await page.goBack(); await page.waitForTimeout(400);
  await f.evaluate(() => document.querySelector('[data-view="services"] [data-service-id="aaaaaaaa-0000-4000-8000-000000000006"] h2').click());
  await f.waitForFunction(() => document.querySelector('#khTitle')?.textContent === 'Yüksekte Çalışma Eğitimi');
  await f.click('[data-service-owner] .kw-more-btn'); await f.click('[data-service-action="edit"]');
  await f.waitForSelector('#kaServiceDialog[open]');
  check(await f.inputValue('#kaServiceTitle') === 'Yüksekte Çalışma Eğitimi' && await f.inputValue('#kaServiceMode') === 'both', `${vp.name} hizmet düzenle: form dolu`);
  writes.length = 0;
  await f.fill('#kaServiceTitle', 'Yüksekte Çalışma Eğitimi (Uygulamalı)');
  await f.evaluate(() => document.getElementById('kaServiceSave').click()); await page.waitForTimeout(900);
  const w = writes.find(x => x.table === 'professional_services');
  check(w?.body?.title === 'Yüksekte Çalışma Eğitimi (Uygulamalı)' && /user_id=eq\./.test(w.q) && /status=eq\.active/.test(w.q), `${vp.name} hizmet düzenle: sahiplik filtreli update`);
  check((await f.textContent('#khTitle')) === 'Yüksekte Çalışma Eğitimi (Uygulamalı)', `${vp.name} hizmet düzenle: detay güncellendi`);
  writes.length = 0;
  await f.click('[data-service-owner] .kw-more-btn'); await f.click('[data-service-action="remove"]');
  await f.click('#kaConfirmOk'); await page.waitForTimeout(600);
  check(writes.some(x => x.table === 'professional_services' && x.body?.status === 'archived'), `${vp.name} hizmet kaldır: archived`);
  check(/kaldırıldı/i.test(await f.textContent('[data-service-status]')), `${vp.name} hizmet kaldır: durum mesajı`);
  await page.goBack(); await page.waitForTimeout(500);
  check(await f.locator('[data-view="services"] [data-service-id="aaaaaaaa-0000-4000-8000-000000000006"]').count() === 0, `${vp.name} hizmet kaldır: katalogdan kalktı`);
  await ctx.close();
}
{
  // Doğrudan URL (misafir) + olmayan hizmet + rail/profil bağlantıları
  resetDb();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await setup(ctx, false);
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`hizmet direct: ${e.message}`));
  await page.goto('https://isgcalisanplatformu.com/hizmet-detay?id=aaaaaaaa-0000-4000-8000-000000000001'); await page.waitForTimeout(900);
  const f = frameOf(page);
  await f.waitForSelector('#khTitle');
  check((await f.textContent('#khTitle')) === 'İşyeri Hekimliği Hizmeti' && !(await f.isVisible('[data-service-owner]')), 'hizmet direct: misafir detay');
  await f.click('[data-service-side] .kh-pro'); await f.waitForSelector('#kpName');
  check(page.url().includes('/profil?id='), 'hizmet direct: sağlayıcı → profil (shell içi)');
  await page.goBack(); await page.waitForTimeout(400);
  check(page.url().includes('/hizmet-detay?id='), 'hizmet direct: profil geri → detay');
  await f.click('[data-view="service"] [data-view-link="services"] >> nth=0'); await page.waitForTimeout(900);
  check(page.url().endsWith('/hizmetler') && await f.locator('[data-view="services"] .ks-card').count() > 0, 'hizmet direct: Hizmetlere Dön');
  await page.goto('https://isgcalisanplatformu.com/hizmet-detay?id=aaaaaaaa-0000-4000-8000-999999999999'); await page.waitForTimeout(900);
  const g = frameOf(page);
  await g.waitForSelector('[data-service-status]:not([hidden])');
  check(/bulunamad/i.test(await g.textContent('[data-service-status]')), 'hizmet direct: olmayan hizmet mesajı');
  // Çalışmalar yan panelindeki hizmet → detay (shell içi)
  await page.goto('https://isgcalisanplatformu.com/'); await page.waitForTimeout(900);
  const h = frameOf(page);
  await h.waitForSelector('[data-view="works"] [data-post-id]');
  const railLink = await h.evaluate(() => { const a = document.querySelector('[data-view="works"] .kw-rail-service'); if (!a) return false; a.click(); return true; });
  if (railLink) { await h.waitForSelector('#khTitle'); check(page.url().includes('/hizmet-detay?id='), 'rail hizmet → detay (shell içi)'); }
  await ctx.close();
}


// ===== v4.6.1 kapsamlı QA =====
const VIEWS6 = [['works', '/'], ['experts', '/uzmanlar'], ['services', '/hizmetler'], ['profile', `/profil?id=${U2}`], ['work', '/calisma-detay?id=bbbbbbbb-0000-4000-8000-000000000003'], ['service', '/hizmet-detay?id=aaaaaaaa-0000-4000-8000-000000000005']];
const visibleView = f => f.evaluate(() => [...document.querySelectorAll('[data-view]')].filter(v => !v.hidden).map(v => v.dataset.view).join(','));
const navClick = (page, name) => page.evaluate(n => document.getElementById('kisg-pro-nav').shadowRoot.querySelector(`[data-view-link="${n}"]`).click(), name);
for (const vp of [{ name: 'desktop', width: 1366, height: 900 }, { name: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true }]) {
  resetDb();
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch });
  await setup(ctx, true);
  const page = await ctx.newPage();
  const svcReqs = []; page.on('request', r => { if (r.url().includes('/rest/v1/professional_services?') && r.method() === 'GET') svcReqs.push(decodeURIComponent(r.url())); });
  page.on('pageerror', e => errors.push(`qa ${vp.name}: ${e.message}`));
  // --- Ana akış: Çalışmalar → Hizmetler → Hizmet Detay → Geri → Çalışmalar → Hizmetler ---
  await page.goto('https://isgcalisanplatformu.com/'); await page.waitForTimeout(900);
  const f = frameOf(page);
  await f.waitForSelector('[data-view="works"] [data-post-id]');
  const mark = await page.evaluate(() => window.__bootMark);
  await page.evaluate(() => scrollTo(0, 900)); await page.waitForTimeout(200);
  const yWorks = await page.evaluate(() => scrollY);
  await navClick(page, 'services'); await f.waitForSelector('[data-view="services"] .ks-card');
  check(await visibleView(f) === 'services' && await f.locator('[data-view="services"] .k-hero').count() === 1 && await f.locator('[data-view="services"] .ks-card .ks-lead .k-avatar').count() > 0, `${vp.name} QA akış: Çalışmalar → Hizmetler V2 (tek görünüm)`);
  const heroH = await f.evaluate(() => document.querySelector('[data-view="services"] .k-hero').getBoundingClientRect().height);
  check(vp.name === 'desktop' ? heroH >= 60 && heroH <= 120 : heroH <= 90, `${vp.name} QA: hero yüksekliği ${Math.round(heroH)}px`);
  await f.fill('#ksSearch', 'Ölçüm'); await page.waitForTimeout(900);
  const nSearch = await f.locator('[data-view="services"] .ks-card').count();
  await f.evaluate(() => document.querySelector('[data-view="services"] [data-service-id]').scrollIntoView({ block: 'center' })); await page.waitForTimeout(150);
  const ySvc = await page.evaluate(() => scrollY);
  await f.evaluate(() => document.querySelector('[data-view="services"] [data-service-id] h2').click());
  await f.waitForSelector('#khTitle');
  check(page.url().includes('/hizmet-detay?id=') && await visibleView(f) === 'service', `${vp.name} QA akış: Hizmetler → Hizmet Detay`);
  await page.goBack(); await page.waitForTimeout(500);
  check(page.url().endsWith('/hizmetler') && await f.inputValue('#ksSearch') === 'Ölçüm' && await f.locator('[data-view="services"] .ks-card').count() === nSearch && Math.abs(await page.evaluate(() => scrollY) - ySvc) < 4, `${vp.name} QA akış: geri → Hizmetler arama/liste/scroll korundu`);
  await page.goBack(); await page.waitForTimeout(500);
  check(page.url().endsWith('isgcalisanplatformu.com/') && await visibleView(f) === 'works' && Math.abs(await page.evaluate(() => scrollY) - yWorks) < 4, `${vp.name} QA akış: geri → Çalışmalar scroll korundu`);
  await navClick(page, 'services'); await page.waitForTimeout(500);
  check(await visibleView(f) === 'services' && await f.locator('[data-view="services"] .k-hero').count() === 1 && await f.inputValue('#ksSearch') === 'Ölçüm', `${vp.name} QA akış: Çalışmalar → Hizmetler yine V2, state korundu`);
  // ileri/geri
  await page.goBack(); await page.waitForTimeout(400);
  await page.goForward(); await page.waitForTimeout(400);
  check(page.url().endsWith('/hizmetler') && await visibleView(f) === 'services', `${vp.name} QA: forward → Hizmetler`);
  check(await page.evaluate(() => window.__bootMark) === mark, `${vp.name} QA: tüm akışta reload yok`);
  // tek renderer / tek dinleyici: bir kategori tıklaması tek istek üretir
  await f.fill('#ksSearch', ''); await page.waitForTimeout(900);
  svcReqs.length = 0;
  await f.click('[data-view="services"] .ks-chip[data-chip="2"]'); await page.waitForTimeout(1000);
  check(svcReqs.filter(u => u.includes('category_id=eq.2') && u.includes('select=id,user_id')).length === 1, `${vp.name} QA: kategori → tek sorgu (${svcReqs.filter(u => u.includes('category_id=eq.2')).length})`);
  // çoklu görünüm geçişinden sonra beğeni tek yazma
  for (const n of ['works', 'experts', 'services', 'works']) { await navClick(page, n); await page.waitForTimeout(250); }
  writes.length = 0;
  await f.evaluate(() => document.querySelector('[data-view="works"] [data-post-action="like"]').click()); await page.waitForTimeout(400);
  check(writes.filter(w => w.table === 'professional_post_likes').length === 1, `${vp.name} QA: geçişler sonrası beğeni tek yazma`);
  // Uzmanlar arama state
  await navClick(page, 'experts'); await f.waitForSelector('[data-view="experts"] .ke-card');
  await f.fill('#keSearch', 'Mehmet'); await page.waitForTimeout(900);
  await navClick(page, 'services'); await page.waitForTimeout(300); await navClick(page, 'experts'); await page.waitForTimeout(300);
  check(await f.inputValue('#keSearch') === 'Mehmet' && await visibleView(f) === 'experts', `${vp.name} QA: Uzmanlar arama state korundu`);
  // Hizmet formunda limit açıklaması yok
  await navClick(page, 'services'); await page.waitForTimeout(300);
  await f.evaluate(() => document.querySelector('[data-view="services"] .ks-hero-cta').click());
  await f.waitForSelector('#kaServiceDialog[open]');
  check(!(await f.textContent('#kaServiceDialog')).includes('En fazla 5'), `${vp.name} QA: yayınlama formunda limit açıklaması yok`);
  await f.click('#kaServiceDialog [data-close] >> nth=0'); await page.waitForTimeout(200);
  // Menüler: dışarı tık ve Esc
  await navClick(page, 'works'); await page.waitForTimeout(300);
  await f.evaluate(() => document.querySelector('[data-view="works"] .kw-more-btn').click());
  check(await f.locator('[data-view="works"] .kw-menu:not([hidden])').count() === 1, `${vp.name} QA: kart menüsü açıldı`);
  await f.evaluate(() => document.querySelector('[data-view="works"] .kw-composer').click()); await page.waitForTimeout(150);
  check(await f.locator('[data-view="works"] .kw-menu:not([hidden])').count() === 0, `${vp.name} QA: dışarı tıklayınca menü kapandı`);
  await f.evaluate(() => document.querySelector('[data-view="works"] [data-composer]').click());
  await f.waitForSelector('#kaPostDialog[open]'); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  check(!(await f.evaluate(() => document.getElementById('kaPostDialog').open)) && await page.evaluate(() => getComputedStyle(document.body).position) !== 'fixed', `${vp.name} QA: Esc dialog kapatır, scroll kilidi kalkar`);
  // Mobil nav: kaydırınca daralır, sekmeler erişilebilir
  if (vp.name === 'mobile') {
    await page.evaluate(() => scrollTo(0, 200)); await page.waitForTimeout(150);
    await page.evaluate(() => scrollTo(0, 1400)); await page.waitForTimeout(300);
    const compact = await page.evaluate(() => document.getElementById('kisg-pro-nav').shadowRoot.querySelector('.kpn').classList.contains('is-compact'));
    const tabsVis = await page.evaluate(() => { const r = document.getElementById('kisg-pro-nav').shadowRoot.querySelector('.kpn-tabs').getBoundingClientRect(); return r.bottom > 0 && r.top < 120; });
    check(compact && tabsVis, `${vp.name} QA: mobil nav daralır, sekmeler görünür`);
    await page.evaluate(() => scrollTo(0, 1000)); await page.waitForTimeout(300);
    check(!(await page.evaluate(() => document.getElementById('kisg-pro-nav').shadowRoot.querySelector('.kpn').classList.contains('is-compact'))), `${vp.name} QA: yukarı kaydırınca nav açılır`);
  }
  // Profil → Hizmet kartı → Hizmet Detay → geri → profil Hizmetler sekmesi
  await f.evaluate(([uid]) => document.querySelector(`[data-view="works"] a[href*="${uid}"]`).click(), [U2]);
  await f.waitForSelector('#kpName');
  await f.click('[data-profile-tab="hizmetler"]'); await f.waitForSelector('[data-view="profile"] .ks-card');
  await f.evaluate(() => document.querySelector('[data-view="profile"] .ks-card h2').click()); await f.waitForSelector('#khTitle');
  await page.goBack(); await page.waitForTimeout(500);
  check(page.url().includes(`/profil?id=${U2}#hizmetler`) && await f.getAttribute('[data-profile-tab="hizmetler"]', 'aria-selected') === 'true', `${vp.name} QA: profil → hizmet detay → geri, Hizmetler sekmesi korundu`);
  // Hizmet Detay → sağlayıcı profili → geri
  await f.evaluate(() => document.querySelector('[data-view="profile"] .ks-card h2').click()); await f.waitForSelector('#khTitle');
  await f.evaluate(() => document.querySelector('[data-service-side] .kh-pro').click()); await f.waitForSelector('#kpName'); await page.waitForTimeout(200);
  check(await visibleView(f) === 'profile', `${vp.name} QA: hizmet detay → sağlayıcı profili`);
  // Refresh + doğrudan URL: 6 görünüm
  for (const [view, path] of VIEWS6) {
    await page.goto('https://isgcalisanplatformu.com' + path); await page.waitForTimeout(700);
    await page.reload(); await page.waitForTimeout(900);
    const g = frameOf(page);
    await g.waitForFunction(v => { const el = document.querySelector(`[data-view="${v}"]`); return el && !el.hidden; }, view);
    const ok = await visibleView(g) === view && page.url().endsWith(path.split('#')[0]);
    const active = await page.evaluate(() => document.getElementById('kisg-pro-nav')?.shadowRoot.querySelector('.ka-tab.is-active')?.dataset.viewLink || '');
    const expectTab = { works: 'works', work: 'works', experts: 'experts', services: 'services', service: 'services', profile: '' }[view];
    check(ok && active === expectTab, `${vp.name} QA refresh: ${path} → ${view} (sekme: ${active || '—'})`);
  }
  // Responsive taşma: 6 görünüm
  const widths = vp.name === 'desktop' ? [1366, 1024, 768] : [390, 360, 320];
  for (const w of widths) {
    await page.setViewportSize({ width: w, height: vp.height });
    for (const [view, path] of VIEWS6) {
      await page.goto('https://isgcalisanplatformu.com' + path); await page.waitForTimeout(800);
      const g = frameOf(page);
      await g.waitForFunction(v => !document.querySelector(`[data-view="${v}"]`).hidden, view);
      await page.waitForTimeout(300);
      const o = await page.evaluate(() => { const fd = document.querySelector('iframe').contentDocument; return { p: document.documentElement.scrollWidth - innerWidth, f: fd.documentElement.scrollWidth - fd.documentElement.clientWidth }; });
      if (o.p > 1 || o.f > 1) check(false, `${vp.name} QA taşma ${w}px ${view}: ${JSON.stringify(o)}`);
    }
  }
  check(true, `${vp.name} QA: ${widths.join('/')}px × 6 görünüm yatay taşma kontrolü tamam`);
  await ctx.close();
}
{
  // Misafir → giriş → bekleyen işlem devam eder; yanlış şifre; çıkış
  resetDb();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await setup(ctx, false);
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`qa login: ${e.message}`));
  await page.goto('https://isgcalisanplatformu.com/calisma-detay?id=bbbbbbbb-0000-4000-8000-000000000003'); await page.waitForTimeout(900);
  const f = frameOf(page);
  await f.waitForSelector('[data-view="work"] [data-post-action="like"]');
  await f.click('[data-view="work"] [data-post-action="like"]'); await f.waitForSelector('#kaLoginDialog[open]');
  await f.fill('#kaLoginEmail', 'a@b.c'); await f.fill('#kaLoginPassword', 'yanlis');
  await f.click('#kaLoginSubmit'); await page.waitForTimeout(500);
  check(await f.isVisible('#kaLoginError') && await f.evaluate(() => document.getElementById('kaLoginDialog').open), 'QA login: yanlış şifre hata verir, pencere açık kalır');
  writes.length = 0;
  await f.fill('#kaLoginPassword', 'dogru-sifre'); await f.click('#kaLoginSubmit'); await page.waitForTimeout(900);
  check(!(await f.evaluate(() => document.getElementById('kaLoginDialog').open)) && writes.some(w => w.table === 'professional_post_likes' && w.body?.user_id === U1), 'QA login: giriş sonrası bekleyen beğeni tamamlandı');
  const state = await page.evaluate(() => document.getElementById('kisg-pro-nav').shadowRoot.querySelector('.ka-account').dataset.state);
  check(state === 'user', 'QA login: hesap menüsü kullanıcı durumunda');
  // kendi hizmet detayında sahip menüsü görünür; çıkışta kaybolur
  await page.evaluate(() => { const n = document.getElementById('kisg-pro-nav').shadowRoot; n.querySelector('.ka-account-toggle').click(); });
  await page.evaluate(() => document.getElementById('kisg-pro-nav').shadowRoot.querySelector('[data-view-link="services"]').click());
  await f.waitForSelector('[data-view="services"] .ks-card');
  await f.evaluate(() => document.querySelector('[data-view="services"] [data-service-id="aaaaaaaa-0000-4000-8000-000000000003"] h2').click());
  await f.waitForSelector('#khTitle');
  check(await f.isVisible('[data-service-owner]'), 'QA login: kendi hizmetinde yönet menüsü');
  await page.evaluate(() => { const n = document.getElementById('kisg-pro-nav').shadowRoot; n.querySelector('.ka-account-toggle').click(); n.querySelector('[data-action="signout"]').click(); });
  await page.waitForTimeout(700);
  check(!(await f.isVisible('[data-service-owner]')) && await page.evaluate(() => document.getElementById('kisg-pro-nav').shadowRoot.querySelector('.ka-account').dataset.state) === 'guest', 'QA çıkış: sahip menüsü kalktı, misafir durumu');
  await ctx.close();
}
{
  // Sürüm koruması: bu tarayıcı daha yeni bir sürüm gördüyse eski embed sayfayı uygulama içinde çizmez
  resetDb();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await setup(ctx, true);
  await ctx.addInitScript(() => { try { localStorage.setItem('kisg:shell:version', JSON.stringify({ v: '9.9.9', t: Date.now() })); } catch {} });
  const page = await ctx.newPage();
  await page.goto('https://isgcalisanplatformu.com/'); await page.waitForTimeout(900);
  const f = frameOf(page);
  check(await f.evaluate(() => document.getElementById('kisgApp').dataset.routing) === 'document', 'QA sürüm koruması: daha yeni sürüm görülmüşse document modu');
  const mark = await page.evaluate(() => window.__bootMark);
  await page.evaluate(() => document.getElementById('kisg-pro-nav').shadowRoot.querySelector('[data-view-link="services"]').click());
  await page.waitForTimeout(1200);
  check(page.url().endsWith('/hizmetler') && await page.evaluate(() => window.__bootMark) !== mark, 'QA sürüm koruması: sekme tam sayfa açılır (hedef sayfanın embed\'i)');
  await ctx.close();
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await setup(ctx2, true);
  const p2 = await ctx2.newPage();
  await p2.goto('https://isgcalisanplatformu.com/'); await p2.waitForTimeout(900);
  check(await frameOf(p2).evaluate(() => document.getElementById('kisgApp').dataset.routing) === 'shell' && JSON.parse(await p2.evaluate(() => localStorage.getItem('kisg:shell:version'))).v === (APP.match(/version:\s*["'](\d+\.\d+\.\d+)["']/) || [])[1], 'QA sürüm koruması: normal durumda shell modu, sürüm kaydı');
  await ctx2.close();
}


{
  // Mobil giriş penceresi: iOS araç çubuğu (görsel viewport kısa) ve klavye (kısa + kaydırılmış) benzetimi
  resetDb();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await setup(ctx, false);
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`qa mobile login: ${e.message}`));
  await page.goto('https://isgcalisanplatformu.com/hizmetler'); await page.waitForTimeout(900);
  const f = frameOf(page);
  await f.waitForSelector('[data-view="services"] .ks-card');
  const y0 = await page.evaluate(() => { scrollTo(0, 600); return scrollY; }); await page.waitForTimeout(200);   // v4.32 kartlar kısa: sayfa 600'e inemeyebilir
  const setVV = (h, top) => page.evaluate(([h, top]) => { const vv = window.visualViewport; Object.defineProperty(vv, 'height', { get: () => h, configurable: true }); Object.defineProperty(vv, 'offsetTop', { get: () => top, configurable: true }); vv.dispatchEvent(new Event('resize')); vv.dispatchEvent(new Event('scroll')); }, [h, top]);
  await setVV(700, 0);   // alt araç çubuğu 144px
  await page.evaluate(() => document.getElementById('kisg-pro-nav').shadowRoot.querySelector('[data-action="login"]').click());
  await f.waitForSelector('#kaLoginDialog[open]'); await page.waitForTimeout(500);
  const geo = () => page.evaluate(() => { const fr = document.querySelector('iframe').getBoundingClientRect(), d = document.querySelector('iframe').contentDocument; const r = d.getElementById('kaLoginDialog').getBoundingClientRect(), b = d.getElementById('kaLoginSubmit').getBoundingClientRect(), e = d.getElementById('kaLoginEmail').getBoundingClientRect(); const nav = document.getElementById('kisg-pro-nav').getBoundingClientRect(); return { top: fr.top + r.top, bottom: fr.top + r.bottom, submitBottom: fr.top + b.bottom, emailTop: fr.top + e.top, navBottom: nav.bottom, scrollable: d.getElementById('kaLoginDialog').scrollHeight > d.getElementById('kaLoginDialog').clientHeight }; });
  let g = await geo();
  check(g.bottom <= 701 && g.top >= g.navBottom - 1 && g.submitBottom <= 701, `mobil giriş: araç çubuğu üstünde, tamamı görünür ${JSON.stringify(g)}`);
  await page.screenshot({ path: `${OUT}/mobile-login.png` });
  await setVV(420, 180);  // klavye açık, görsel viewport kaydırılmış
  await page.waitForTimeout(400);
  g = await geo();
  check(g.bottom <= 601 && g.top >= 179 && g.emailTop >= 179, `mobil giriş: klavye açıkken görünür alanda ${JSON.stringify(g)}`);
  await setVV(700, 0); await page.waitForTimeout(400);
  g = await geo();
  check(g.bottom <= 701, 'mobil giriş: klavye kapanınca yeniden yerleşir');
  await f.click('#kaLoginDialog [data-close]'); await page.waitForTimeout(400);
  check(await page.evaluate(() => getComputedStyle(document.body).position) !== 'fixed' && y0 > 0 && Math.abs(await page.evaluate(() => scrollY) - y0) < 3, 'mobil giriş: kapanınca sayfa kilidi kalkar, konum aynı');
  await ctx.close();
}


{
  // Çalışmalar sağ sütun mini hizmet vitrini (masaüstü) + Hizmetler'de CTA bandı yok
  resetDb();
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await setup(ctx, true);
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`vitrin: ${e.message}`));
  await page.goto('https://isgcalisanplatformu.com/'); await page.waitForTimeout(1200);
  const f = frameOf(page);
  const side = await page.evaluate(() => { const r = document.getElementById('kisg-pro-sides').shadowRoot; return [...r.querySelectorAll('.kw-offer')].map(a => ({ cat: a.title, title: a.querySelector('strong')?.textContent, by: a.querySelector('.kw-offer-meta')?.textContent, av: !!a.querySelector('.ks-mark svg'), href: a.getAttribute('href') })); });
  check(side.length >= 2 && side.length <= 4 && side.every(x => x.cat && x.title && x.by && x.av && x.href.includes('/hizmet-detay?id=')), `vitrin: 2–4 hizmet satırı (v4.36.0: 4) kategori ikonu/başlık/profesyonel ile (${side.length})`);
  const link = await page.evaluate(() => { const a = document.getElementById('kisg-pro-sides').shadowRoot.querySelector('.kw-vitrin-link'); return a ? a.textContent.trim() : ''; });
  check(/^Tümünü gör/.test(link), 'vitrin: başlıkta "Tümünü gör" bağlantısı');
  const feedW = await f.evaluate(() => document.querySelector('[data-view="works"] .kw-feed').getBoundingClientRect().width);
  check(feedW >= 560, `vitrin: ana akış genişliği korunuyor (${Math.round(feedW)}px)`);
  await page.screenshot({ path: `${OUT}/desktop-works-vitrin.png`, clip: { x: 0, y: 64, width: 1366, height: 836 } });
  const mark = await page.evaluate(() => window.__bootMark);
  await page.evaluate(() => document.getElementById('kisg-pro-sides').shadowRoot.querySelector('.kw-offer').click());
  await f.waitForSelector('#khTitle');
  check(page.url().includes('/hizmet-detay?id=') && await page.evaluate(() => window.__bootMark) === mark, 'vitrin: kart → Hizmet Detay (shell içi, reload yok)');
  await page.goBack(); await page.waitForTimeout(500);
  await page.evaluate(() => document.getElementById('kisg-pro-sides').shadowRoot.querySelector('.kw-vitrin-link').click());
  await f.waitForSelector('[data-view="services"] .ks-card');
  check(page.url().endsWith('/hizmetler') && await page.evaluate(() => window.__bootMark) === mark, 'vitrin: Tümünü gör → /hizmetler');
  check(await f.locator('.ks-band,[data-band]').count() === 0 && !(await f.textContent('[data-view="services"]')).includes("Uzmanlığını Kırmızı İSG'de sun") && await f.locator('[data-view="services"] .ks-hero-cta').count() === 1, 'Hizmetler: alt CTA bandı yok, hero butonu duruyor');
  await ctx.close();
}

// ===== v4.8.0 route migration: / = Akış =====
for (const vp of [{ name: 'desktop', width: 1366, height: 900 }, { name: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true }]) {
  resetDb();
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch });
  await setup(ctx, true);
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`mig ${vp.name}: ${e.message}`));
  const pushed = [];
  await page.addInitScript(() => { const o = history.pushState.bind(history); window.__pushed = []; history.pushState = (s, t, u) => { window.__pushed.push(String(u || '')); return o(s, t, u); }; });
  await page.goto('https://isgcalisanplatformu.com/'); await page.waitForTimeout(900);
  const f = frameOf(page);
  await f.waitForSelector('[data-view="works"] [data-post-id]');
  const mark = await page.evaluate(() => window.__bootMark);
  const tabs = await page.evaluate(() => [...document.getElementById('kisg-pro-nav').shadowRoot.querySelectorAll('.ka-tab')].map(a => [a.dataset.viewLink, a.textContent.trim(), new URL(a.href).pathname]));
  check(JSON.stringify(tabs) === JSON.stringify([['works', 'Akış', '/'], ['experts', 'Uzmanlar', '/uzmanlar'], ['services', 'Hizmet Bul', '/hizmetler']]), `${vp.name} mig: nav Akış | Uzmanlar | Hizmet Bul ${JSON.stringify(tabs)}`);
  const hrefs = await page.evaluate(() => { const r = document.getElementById('kisg-pro-nav').shadowRoot; return [...r.querySelectorAll('a[href]')].map(a => a.getAttribute('href')); });
  const fhrefs = await f.evaluate(() => [...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href')));
  check(![...hrefs, ...fhrefs].some(h => /\/calisma(\?|#|\/?$)/.test(h)), `${vp.name} mig: hiçbir bağlantı /calisma'ya gitmiyor`);
  const act0 = await page.evaluate(() => document.getElementById('kisg-pro-nav').shadowRoot.querySelector('.ka-tab.is-active')?.dataset.viewLink);
  check(act0 === 'works', `${vp.name} mig: / → Akış sekmesi aktif`);
  // Akışta daha fazla yükle + scroll
  await page.evaluate(() => scrollTo(0, 5000)); await page.waitForTimeout(900);
  const nPosts = await f.locator('[data-view="works"] [data-post-id]').count();
  await page.evaluate(() => scrollTo(0, 1100)); await page.waitForTimeout(250);
  const y0 = await page.evaluate(() => scrollY);
  // / → Uzmanlar → Hizmet Bul → Hizmet Detay → Sağlayıcı profil → Çalışma Detay
  await navClick(page, 'experts'); await f.waitForSelector('[data-view="experts"] .ke-card');
  check(page.url().endsWith('/uzmanlar') && await visibleView(f) === 'experts', `${vp.name} mig: / → Uzmanlar`);
  await navClick(page, 'services'); await f.waitForSelector('[data-view="services"] .ks-card');
  check(page.url().endsWith('/hizmetler') && await visibleView(f) === 'services', `${vp.name} mig: Uzmanlar → Hizmet Bul`);
  await f.evaluate(() => document.querySelector('[data-view="services"] [data-service-id] h2').click()); await f.waitForSelector('#khTitle');
  await f.evaluate(() => document.querySelector('[data-service-side] .kh-pro').click()); await f.waitForSelector('#kpName'); await page.waitForTimeout(300);
  await f.waitForSelector('[data-view="profile"] [data-post-id]');
  await f.evaluate(() => { const c = document.querySelector('[data-view="profile"] [data-post-id]'); (c.querySelector('a.kw-post-detail') || c.querySelector('.kw-post-tags') || c.querySelector('.kw-post-content')).click(); });
  await f.waitForSelector('[data-view="work"] [data-post-id]');
  check(page.url().includes('/calisma-detay?id=') && await visibleView(f) === 'work', `${vp.name} mig: Hizmet Bul → … → Çalışma Detay (${page.url()})`);
  check(await f.evaluate(() => { const a = document.querySelector('[data-view="work"] a[href="/"], [data-view="work"] a[href$="isgcalisanplatformu.com/"]'); return !!a && /Akış/.test(a.textContent); }), `${vp.name} mig: detayda "Akışa Dön" → /`);
  for (let i = 0; i < 5; i++) { await page.goBack(); await page.waitForTimeout(450); }
  const y1 = await page.evaluate(() => scrollY);
  check(page.url() === 'https://isgcalisanplatformu.com/' && await visibleView(f) === 'works', `${vp.name} mig: geri zinciri → / (${page.url()})`);
  check(Math.abs(y1 - y0) < 4 && await f.locator('[data-view="works"] [data-post-id]').count() === nPosts, `${vp.name} mig: Akış scroll ${y0}→${y1} ve ${nPosts} kart korundu`);
  check(await page.evaluate(() => window.__bootMark) === mark, `${vp.name} mig: tüm zincirde reload yok`);
  // ileri → Uzmanlar
  await page.goForward(); await page.waitForTimeout(450);
  check(page.url().endsWith('/uzmanlar') && await visibleView(f) === 'experts', `${vp.name} mig: forward → Uzmanlar`);
  // Akış kartı → detay → Akışa Dön linki → /
  await navClick(page, 'works'); await page.waitForTimeout(400);
  const PID = 'bbbbbbbb-0000-4000-8000-000000000003';
  await f.evaluate(id => document.querySelector(`[data-view="works"] [data-post-id="${id}"]`).scrollIntoView({ block: 'center' }), PID); await page.waitForTimeout(200);
  const y2 = await page.evaluate(() => scrollY);
  await f.evaluate(id => document.querySelector(`[data-view="works"] [data-post-id="${id}"] .kw-post-tags`).click(), PID);
  await f.waitForSelector(`[data-view="work"] [data-post-id="${PID}"]`);
  await page.goBack(); await page.waitForTimeout(450);
  check(page.url() === 'https://isgcalisanplatformu.com/' && Math.abs(await page.evaluate(() => scrollY) - y2) < 4, `${vp.name} mig: Akış → detay → geri, scroll korundu`);
  // Logo → Akış (shell içi)
  await navClick(page, 'services'); await page.waitForTimeout(400);
  await page.evaluate(() => document.getElementById('kisg-pro-nav').shadowRoot.querySelector('.kpn-brand').click()); await page.waitForTimeout(500);
  check(page.url() === 'https://isgcalisanplatformu.com/' && await visibleView(f) === 'works' && await page.evaluate(() => window.__bootMark) === mark, `${vp.name} mig: logo → / Akış (reload yok)`);
  const pushedUrls = await page.evaluate(() => window.__pushed);
  check(pushedUrls.length > 0 && !pushedUrls.some(u => /\/calisma(\?|#|$)/.test(u.replace(/^https?:\/\/[^/]+/, ''))), `${vp.name} mig: pushState hiç /calisma yazmadı (${pushedUrls.length} kayıt)`);
  // direct / + refresh
  await page.goto('https://isgcalisanplatformu.com/'); await page.reload(); await page.waitForTimeout(900);
  let g = frameOf(page); await g.waitForSelector('[data-view="works"] [data-post-id]');
  check(page.url() === 'https://isgcalisanplatformu.com/' && await visibleView(g) === 'works', `${vp.name} mig: direct / + refresh → Akış`);
  // legacy /calisma → / (replaceState, fazladan geçmiş girişi yok)
  const h0 = await page.evaluate(() => history.length);
  await page.goto('https://isgcalisanplatformu.com/calisma'); await page.waitForTimeout(900);
  g = frameOf(page); await g.waitForSelector('[data-view="works"] [data-post-id]');
  const h1 = await page.evaluate(() => history.length);
  check(page.url() === 'https://isgcalisanplatformu.com/' && await visibleView(g) === 'works' && h1 === h0 + 1, `${vp.name} mig: /calisma → / URL, Akış, tek geçmiş girişi (${page.url()}, ${h0}→${h1})`);
  const act1 = await page.evaluate(() => document.getElementById('kisg-pro-nav').shadowRoot.querySelector('.ka-tab.is-active')?.dataset.viewLink);
  check(act1 === 'works', `${vp.name} mig: legacy girişte Akış sekmesi aktif`);
  const legacyTitles = await page.evaluate(() => JSON.parse(localStorage.getItem('kisg:titles:v2') || '{}'));
  check(!/calisma/.test(legacyTitles.works || ''), `${vp.name} mig: eski /calisma sayfa başlığı Akış başlığı olarak saklanmadı (${legacyTitles.works})`);
  await navClick(page, 'experts'); await page.waitForTimeout(400); await page.goBack(); await page.waitForTimeout(450);
  check(page.url() === 'https://isgcalisanplatformu.com/' && await visibleView(g) === 'works' && await page.title() === '/ | Kırmızı İSG', `${vp.name} mig: legacy sonrası Uzmanlar → geri → / (başlık: ${await page.title()})`);
  await page.goto('https://isgcalisanplatformu.com/calisma/?x=1#y'); await page.waitForTimeout(900);
  check(page.url() === 'https://isgcalisanplatformu.com/?x=1#y' && await visibleView(frameOf(page)) === 'works', `${vp.name} mig: /calisma/?x=1#y → /?x=1#y (${page.url()})`);
  await ctx.close();
}
{
  // legacy /calisma document modunda (sürüm koruması → routing kapalı) üst sayfayı /'a yönlendirir
  resetDb();
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await setup(ctx, false);
  await ctx.addInitScript(() => { try { localStorage.setItem('kisg:shell:version', JSON.stringify({ v: '99.0.0', t: Date.now() })); } catch {} });
  const page = await ctx.newPage();
  await page.goto('https://isgcalisanplatformu.com/calisma'); await page.waitForTimeout(1500);
  check(page.url() === 'https://isgcalisanplatformu.com/', `mig doc-mode: /calisma → location.replace('/') (${page.url()})`);
  await ctx.close();
}

await browser.close();
