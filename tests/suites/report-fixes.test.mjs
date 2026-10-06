// Dış test raporu (3 Ekim 2026, v4.25.1) bulguları F01–F08 — hedefli tarayıcı testi.
import { chromium, fs, OUT, APP, U1, db, writes, uploads, check, LAUNCH, setup, frameOf, resetDb } from '../helpers/harness.mjs';
import path from 'node:path';

const SITE = 'https://isgcalisanplatformu.com';
const settle = (page, ms = 800) => page.waitForTimeout(ms);
const until = async (fn, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await new Promise(r => setTimeout(r, 60)); } return false; };
const J = (route, status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
const AV = `https://twaptpofhbnnfciowoig.supabase.co/storage/v1/object/public/profile-avatars/${U1}/avatar-old.webp`;
const vp = { viewport: { width: 1366, height: 900 } };

async function openAvatar(page, f) {
  await page.evaluate(() => { const n = document.getElementById('kisg-pro-nav').shadowRoot; n.querySelector('.ka-account-toggle').click(); n.querySelector('[data-action="avatar"]').click(); });
  await f.waitForSelector('#kaAvatarDialog[open]');
}
// Sayfada düz renkli PNG üretip dosya seçicisine verir (gerçek "change" olayı)
const pickColor = (f, color, w, h) => f.evaluate(async ([color, w, h]) => {
  const c = new OffscreenCanvas(w, h), x = c.getContext('2d'); x.fillStyle = color; x.fillRect(0, 0, w, h);
  const blob = await c.convertToBlob({ type: 'image/png' }), dt = new DataTransfer();
  dt.items.add(new File([blob], color + '.png', { type: 'image/png' }));
  const input = document.querySelector('#kaAvatarDialog [data-av-file]'); input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true }));
}, [color, w, h]);

const browser = await chromium.launch(LAUNCH);
try {
  // ================= F01 / F07 / temizlik: profil fotoğrafı kaydı =================
  for (const mode of ['error', 'zero', 'ok']) {
    resetDb(); db.profiles.find(p => p.id === U1).avatar_url = AV;
    const ctx = await browser.newContext(vp); await setup(ctx, true);
    if (mode !== 'ok') await ctx.route('https://twaptpofhbnnfciowoig.supabase.co/rest/v1/profiles?*', r => (r.request().method() === 'PATCH' && /avatar_url/.test(r.request().postData() || '') ? (mode === 'error' ? J(r, 500, { message: 'boom' }) : /object/.test(r.request().headers()['accept'] || '') ? J(r, 406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }) : J(r, 200, [])) : r.fallback()));
    const page = await ctx.newPage(); await page.goto(`${SITE}/`); await settle(page, 1500);
    const f = frameOf(page); await f.waitForSelector('[data-view="works"] [data-post-id]');
    uploads.length = 0; writes.length = 0;
    await openAvatar(page, f); await pickColor(f, '#2a6', 900, 700);
    await f.waitForSelector('#kaAvatarDialog [data-av-save]:not([hidden])');
    await f.click('#kaAvatarDialog [data-av-save]');
    const up = await until(() => uploads.some(u => !u.del && u.path.includes('/profile-avatars/'))) && uploads.find(u => !u.del && u.path.includes('/profile-avatars/'));
    await settle(page, 1200);
    const newPath = up ? up.path.split('/profile-avatars/')[1] : '';
    const dels = uploads.filter(u => u.del).map(u => u.body || '').join(' ');
    const me = db.profiles.find(p => p.id === U1);
    if (mode === 'ok') {
      check(/^.+\/avatar-[a-z0-9]+\.webp$/.test(newPath) && me.avatar_url.endsWith(newPath) && dels.includes(`${U1}/avatar-old.webp`) && !dels.includes(newPath), `F01 başarılı kayıt: yeni sürümlü dosya (${newPath}), profil onu gösteriyor, eski dosya temizlendi`);
    } else {
      const msg = await f.textContent('#kaAvatarDialog [data-av-error]');
      check(newPath !== `${U1}/avatar-old.webp` && dels.includes(newPath) && !dels.includes('avatar-old') && me.avatar_url === AV && /korunuyor/.test(msg) && await f.evaluate(() => document.getElementById('kaAvatarDialog').open),
        `${mode === 'error' ? 'F01 profil güncellemesi hata' : 'F07 sıfır satır güncellendi'}: eski dosyanın üzerine yazılmadı, yeni dosya silindi, profil eski fotoğrafta, hata gösterildi`);
    }
    await ctx.close();
  }

  // ================= F06: hızlı ardışık seçimde son seçim kalır =================
  {
    resetDb();
    const ctx = await browser.newContext(vp); await setup(ctx, true);
    const page = await ctx.newPage(); await page.goto(`${SITE}/`); await settle(page, 1500);
    const f = frameOf(page); await f.waitForSelector('[data-view="works"] [data-post-id]');
    await openAvatar(page, f);
    await pickColor(f, '#e00', 6000, 5000);   // A: büyük → geç çözülür
    await pickColor(f, '#00e', 40, 40);       // B: küçük → önce çözülür
    await settle(page, 4000);
    const px = await f.evaluate(() => { const c = document.querySelector('#kaAvatarDialog [data-av-canvas]'); return [...c.getContext('2d').getImageData(c.width / 2, c.height / 2, 1, 1).data].slice(0, 3); });
    check(px[2] > 200 && px[0] < 50, `F06 son seçilen fotoğraf (mavi) kaldı, geç çözülen eski seçim yok sayıldı (rgb ${px})`);
    await ctx.close();
  }

  // ================= F05 + F02: yorumlar =================
  {
    resetDb();
    const ctx = await browser.newContext(vp); await setup(ctx, true);
    const page = await ctx.newPage(); await page.goto(`${SITE}/`); await settle(page, 1500);
    const f = frameOf(page); await f.waitForSelector('[data-view="works"] [data-post-id]');
    const pid = await f.evaluate(() => document.querySelector('[data-view="works"] [data-post-id]').dataset.postId);
    const card = `[data-view="works"] [data-post-id="${pid}"]`, toggle = () => f.evaluate(s => document.querySelector(`${s} [data-post-action="comment"]`).click(), card);
    await toggle(); await settle(page, 300);
    await f.fill(`${card} [data-comment-form] textarea`, 'Taslak yorum');
    check(!(await f.isDisabled(`${card} [data-comment-form] .cm-send`)), 'F05 yazarken gönder düğmesi etkin');
    await toggle(); await settle(page, 300); await toggle(); await settle(page, 300);
    const st = await f.evaluate(s => { const fm = document.querySelector(`${s} [data-comment-form]`); return fm && { v: fm.querySelector('textarea').value, dis: fm.querySelector('.cm-send').disabled }; }, card);
    check(st?.v === 'Taslak yorum' && st.dis === false, `F05 taslak geri geldiğinde gönder düğmesi etkin ${JSON.stringify(st)}`);
    // F02: kendi yorumunu düzenle → 503 → yazılan metin alanda kalır
    await f.evaluate(s => document.querySelector(`${s} [data-comment-form]`).requestSubmit(), card); await settle(page, 900);
    const own = `${card} .cp`;
    await ctx.route('https://twaptpofhbnnfciowoig.supabase.co/rest/v1/professional_post_comments?*', r => (r.request().method() === 'PATCH' ? J(r, 503, { message: 'unavailable' }) : r.fallback()));
    await f.evaluate(s => document.querySelector(`${s} [data-popover-trigger]`).click(), own);
    await f.evaluate(s => document.querySelector(`${s} [data-comment-act="edit"]`).click(), own); await settle(page, 200);
    await f.fill(`${own} [data-comment-edit] textarea`, 'Yeni düzenleme metni');
    await f.evaluate(s => document.querySelector(`${s} [data-comment-edit]`).requestSubmit(), own); await settle(page, 900);
    const ed = await f.evaluate(s => { const fm = document.querySelector(`${s} [data-comment-edit]`); return fm && { v: fm.querySelector('textarea').value, dis: [...fm.querySelectorAll('button,textarea')].some(n => n.disabled) }; }, own);
    check(ed?.v === 'Yeni düzenleme metni' && ed.dis === false, `F02 düzenleme hatasında yazılan metin korunur, kontroller etkin ${JSON.stringify(ed)}`);
    await ctx.close();
  }

  // ================= F03: hizmet yenileme hatası katalog kartını kaldırmaz =================
  {
    resetDb();
    const sid = db.professional_services.find(v => v.user_id === U1 && v.status === 'active').id;
    const ctx = await browser.newContext(vp); await setup(ctx, true);
    let patched = false;
    await ctx.route('https://twaptpofhbnnfciowoig.supabase.co/rest/v1/professional_services?*', r => {
      const m = r.request().method(), u = decodeURIComponent(r.request().url());
      if (m === 'PATCH') { patched = true; return r.fallback(); }
      if (m === 'GET' && patched && u.includes(`id=eq.${sid}`)) return J(r, 503, { message: 'unavailable' });
      return r.fallback();
    });
    const page = await ctx.newPage(); await page.goto(`${SITE}/hizmetler`); await settle(page, 1500);
    const f = frameOf(page); await f.waitForSelector(`[data-view="services"] [data-service-id="${sid}"]`);
    await f.click(`[data-view="services"] [data-service-id="${sid}"]`); await settle(page, 1200);
    await f.click('[data-view="service"] [data-service-owner] [data-popover-trigger]'); await f.click('[data-service-action="edit"]');
    await f.waitForSelector('#kaServiceDialog[open]');
    await f.fill('#kaServiceTitle', 'Güncellenmiş Hizmet Başlığı'); await f.click('#kaServiceSave');
    await until(() => patched); await settle(page, 1500);
    await page.goBack(); await settle(page, 1200);
    check(await f.locator(`[data-view="services"] [data-service-id="${sid}"]`).count() === 1, 'F03 yenileme sorgusu 503: katalog kartı korundu');
    await ctx.close();
  }

  // ================= F04: PDF hizmetleri eksik üretmez =================
  for (const mode of ['slow', 'error']) {
    resetDb();
    const ctx = await browser.newContext({ ...vp, acceptDownloads: true }); await setup(ctx, true);
    await ctx.route(/Inter_\d+\w+\.ttf$/, r => r.fulfill({ status: 404, body: '' }));
    let served = 0;
    await ctx.route('https://twaptpofhbnnfciowoig.supabase.co/rest/v1/professional_services?*', async r => {
      const u = decodeURIComponent(r.request().url());
      if (r.request().method() !== 'GET' || !u.includes(`user_id=eq.${U1}`) || u.includes('count')) return r.fallback();
      if (mode === 'error') return J(r, 503, { message: 'unavailable' });
      await new Promise(x => setTimeout(x, 2500)); served = Date.now(); return r.fallback();
    });
    const page = await ctx.newPage(); await page.goto(`${SITE}/profil?id=${U1}${mode === 'slow' ? '#hizmetler' : ''}`);
    const f = frameOf(page); await f.waitForSelector('.kp-card [data-profile-action="pdf"]');
    const dl = page.waitForEvent('download', { timeout: mode === 'slow' ? 15000 : 5000 }).catch(() => null);
    const uiText = () => page.evaluate(() => document.querySelector('iframe').contentDocument.body.innerText + document.body.innerText + [...document.querySelectorAll('*')].filter(e => e.shadowRoot).map(e => e.shadowRoot.textContent).join(' '));
    await f.click('.kp-card [data-profile-action="pdf"]');
    const toastSeen = mode === 'error' && await until(async () => /PDF oluşturulamadı/.test(await uiText()), 5000);
    const d = await dl;
    if (mode === 'slow') {
      const at = Date.now(), buf = d ? fs.readFileSync(await d.path()) : Buffer.alloc(0);
      check(!!d && served && at >= served && buf.slice(0, 4).toString() === '%PDF', `F04 hizmet sorgusu sürerken PDF onu bekledi (indirme ${served ? at - served : '?'} ms sonra)`);
    } else {
      check(!d && toastSeen, 'F04 hizmet sorgusu hata verince eksik PDF üretilmedi, hata bildirildi');
    }
    await ctx.close();
  }

  // ================= F08: doğrudan sayfa (inline menü) giriş düğmesi okunur =================
  {
    resetDb();
    const ctx = await browser.newContext(vp); await setup(ctx, false);
    await ctx.route(`${SITE}/direct-test`, r => r.fulfill({ contentType: 'text/html', body: APP }));
    const page = await ctx.newPage(); await page.goto(`${SITE}/direct-test`); await settle(page, 1800);
    const c = await page.evaluate(() => { const b = document.querySelector('#kisgApp .ka-login'); const s = b && getComputedStyle(b); return s && { color: s.color, bg: s.backgroundColor, inline: document.getElementById('kisgApp').dataset.nav }; });
    check(c && c.color !== c.bg && c.color === 'rgb(255, 255, 255)', `F08 inline menüde giriş düğmesi yazısı görünür ${JSON.stringify(c)}`);
    await page.screenshot({ path: path.join(OUT, 'report-fixes-inline-login.png'), clip: { x: 900, y: 0, width: 466, height: 90 } });
    await ctx.close();
  }
} finally {
  await browser.close();
}
