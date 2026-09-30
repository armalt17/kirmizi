// Akış → Uzmanlar (Post atmamış görünür uzmanlar da; web 12, mobil 3) + Destek & Geri Bildirim — hedefli test.
import { chromium, OUT, db, writes, check, LAUNCH, setup, frameOf, resetDb, U1, U2 } from '../helpers/harness.mjs';
import path from 'node:path';

const SITE = 'https://isgcalisanplatformu.com';
const settle = (page, ms = 800) => page.waitForTimeout(ms);
const until = async (fn, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await new Promise(r => setTimeout(r, 60)); } return false; };
const pid = i => `eeeeeeee-0000-4000-8000-${String(i).padStart(12, '0')}`;
const HIDDEN = pid(99);

function seed() {
  resetDb();
  // Harness'in gömülü yazar nesnesine gerçek embed'deki is_discoverable eklenir (Post sahipleri görünür).
  db.professional_posts.forEach(p => { p.author = { ...p.author, is_discoverable: true }; });
  // Hiç Post atmamış 14 görünür uzman + 1 gizli uzman
  for (let i = 1; i <= 14; i++) db.profiles.push({ id: pid(i), full_name: `Postsuz Uzman ${i}`, avatar_url: null, profession: 'İş Güvenliği Uzmanı', title: null, certificate_class: 'B Sınıfı', city: 'Bursa', current_company: null, is_discoverable: true, show_phone_publicly: false, last_post_at: null });
  db.profiles.push({ id: HIDDEN, full_name: 'Gizli Uzman', avatar_url: null, profession: 'İşyeri Hekimi', is_discoverable: false, last_post_at: null });
}

const browser = await chromium.launch(LAUNCH);
try {
  for (const vp of [{ name: 'desktop', width: 1366, height: 900 }, { name: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true }]) {
    seed();
    const N = vp.name;
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch });
    await setup(ctx, true);
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.goto(`${SITE}/`); await settle(page, 1200);
    const f = frameOf(page);

    // ---- Akış → Uzmanlar ----
    if (N === 'desktop') {
      // Masaüstünde yan paneller üst dokümandaki #kisg-pro-sides gölge kökünde çizilir.
      const side = () => page.evaluate(() => [...(document.getElementById('kisg-pro-sides')?.shadowRoot?.querySelectorAll('[data-side-experts] > *') || [])].map(a => ({ cls: a.className, id: a.href ? new URL(a.href).searchParams.get('id') : null })));
      await until(() => side().then(x => x.length > 1));
      const rows = await side(), ids = rows.map(r => r.id);
      check(ids.length === 12, `${N}: sol panelde 12 uzman (${ids.length})`);
      check(ids[0] === U2 && ids[1] === U1, `${N}: Post atan uzmanlar önce (son aktif Post sırası)`);
      check(ids.slice(2).every(id => id.startsWith('eeeeeeee')) && ids.length === new Set(ids).size, `${N}: kalan yer Post atmamış görünür uzmanlarla dolduruldu, tekrar yok`);
      check(!ids.includes(HIDDEN), `${N}: is_discoverable=false olan listede yok`);
      check(JSON.stringify([...new Set(rows.map(r => r.cls))]) === '["kw-person"]', `${N}: satır tasarımı aynı (kw-person)`);
      // 12 satır sticky panelde: sayfa kaydırıldıkça son satıra ulaşılabilir (görünür alanın dışında kalmaz)
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await settle(page, 400);
      const last = await page.evaluate(() => { const r = [...document.getElementById('kisg-pro-sides').shadowRoot.querySelectorAll('[data-side-experts] > *')].pop().getBoundingClientRect(); return { top: r.top, bottom: r.bottom, vh: innerHeight }; });
      check(last.bottom <= last.vh && last.top >= 0, `${N}: 12. uzman satırı kaydırınca görünür (${Math.round(last.top)}–${Math.round(last.bottom)} / ${last.vh})`);
      await page.evaluate(() => window.scrollTo(0, 0)); await settle(page, 300);
      await page.screenshot({ path: path.join(OUT, `experts-rail-${N}.png`) });
    } else {
      await until(() => f.locator('.kw-rail-experts .kw-rail-expert').count().then(n => n > 0));
      const n = await f.locator('.kw-rail-experts .kw-rail-expert').count();
      check(n === 3, `${N}: akış içi şerit 3 uzman (mevcut sayı korundu: ${n})`);
      await f.locator('.kw-rail-experts').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(OUT, `experts-rail-${N}.png`) });
    }

    // ---- Destek & Geri Bildirim ----
    await page.evaluate(() => document.getElementById('kisg-pro-nav').shadowRoot.querySelector('.ka-account-toggle').click());
    await settle(page, 300);
    const item = await page.evaluate(() => { const b = document.getElementById('kisg-pro-nav').shadowRoot.querySelector('#kaAccountMenu [data-action="support"]'); return b && b.textContent; });
    check(item === 'Destek & Geri Bildirim', `${N}: hesap menüsünde "Destek & Geri Bildirim"`);
    await page.evaluate(() => document.getElementById('kisg-pro-nav').shadowRoot.querySelector('#kaAccountMenu [data-action="support"]').click());
    await until(() => f.evaluate(() => document.getElementById('kaSupportDialog').open));
    const form = await f.evaluate(() => ({ cats: [...document.querySelectorAll('#kaSupportDialog [name="category"]')].map(i => [i.value, i.closest('label').textContent]), inputs: [...document.querySelectorAll('#kaSupportDialog input:not([type="radio"]), #kaSupportDialog textarea')].map(i => i.id) }));
    check(JSON.stringify(form.cats) === JSON.stringify([['technical', 'Teknik sorun'], ['account', 'Hesap / profil sorunu'], ['suggestion', 'Öneri / geri bildirim'], ['other', 'Diğer']]), `${N}: 4 konu seçeneği`);
    check(JSON.stringify(form.inputs) === '["kaSupportMessage"]', `${N}: ad/e-posta istenmiyor, yalnız açıklama`);
    writes.length = 0;
    await f.click('#kaSupportSubmit'); await settle(page, 200);
    check(/konu seç/.test(await f.textContent('#kaSupportError')) && !writes.length, `${N}: konu seçilmeden gönderilmez`);
    await f.click('#kaSupportDialog label:has([value="account"])'); await f.click('#kaSupportSubmit'); await settle(page, 200);
    check(/açıklama/.test(await f.textContent('#kaSupportError')) && !writes.length, `${N}: açıklama boşken gönderilmez`);
    // Hata
    await ctx.route(/\/rest\/v1\/support_requests/, r => r.request().method() === 'POST' ? r.fulfill({ status: 500, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: '{"message":"x"}' }) : r.fallback());
    await f.fill('#kaSupportMessage', '  Profil fotoğrafım güncellenmiyor.\nAndroid.  ');
    await f.click('#kaSupportSubmit');
    check(await until(async () => /gönderilemedi/.test(await f.textContent('#kaSupportError'))) && await f.evaluate(() => document.getElementById('kaSupportDialog').open), `${N}: hata → pencere açık kalır, sade hata mesajı`);
    await ctx.unroute(/\/rest\/v1\/support_requests/);
    // Başarı
    writes.length = 0;
    await f.click('#kaSupportSubmit');
    await until(() => f.evaluate(() => !document.getElementById('kaSupportDialog').open));
    const w = writes.filter(x => x.table === 'support_requests');
    check(w.length === 1 && JSON.stringify(w[0].body) === JSON.stringify({ user_id: U1, category: 'account', message: 'Profil fotoğrafım güncellenmiyor.\nAndroid.' }), `${N}: support_requests'e yalnız user_id (oturum) + category + message ${JSON.stringify(w)}`);
    check(await until(async () => /Mesajın alındı/.test(await f.evaluate(() => document.querySelector('.k-toast')?.textContent || ''))), `${N}: başarı bildirimi`);
    check(!writes.some(x => x.table === 'professional_reports'), `${N}: Bildir (professional_reports) sistemine yazılmadı`);
    // Hesap & Gizlilik sayfasından da açılır
    await page.goto(`${SITE}/hesaplar-ve-gizlilik`); await settle(page, 1000);
    const g = frameOf(page); await g.waitForSelector('[data-account-main]:not([hidden])');
    await g.click('[data-view="account"] [data-action="support"]');
    check(await until(() => g.evaluate(() => document.getElementById('kaSupportDialog').open)), `${N}: Hesap & Gizlilik → "Mesaj Gönder" pencereyi açar`);
    await settle(page, 500);
    await page.screenshot({ path: path.join(OUT, `support-dialog-${N}.png`) });
    check(errs.length === 0, `${N}: sayfa hatası yok ${errs.join(' ')}`);
    await ctx.close();
  }
  // Misafir: giriş istenir
  {
    seed();
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); await setup(ctx, false);
    const page = await ctx.newPage(); await page.goto(`${SITE}/hesaplar-ve-gizlilik`); await settle(page, 1200);
    const f = frameOf(page);
    await f.evaluate(() => { const b = document.createElement('button'); b.dataset.action = 'support'; b.id = 'tst'; document.getElementById('kisgApp').append(b); });
    await f.click('#tst'); await settle(page, 500);
    check(await f.evaluate(() => document.getElementById('kaLoginDialog').open && !document.getElementById('kaSupportDialog').open), 'misafir: önce giriş penceresi açılır');
    await ctx.close();
  }
} finally {
  await browser.close();
}
