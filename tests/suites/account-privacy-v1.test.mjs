// Hesap & Gizlilik V1 — hedefli tarayıcı testi (/hesaplar-ve-gizlilik).
import { chromium, OUT, db, writes, check, LAUNCH, setup, frameOf, resetDb, U1 } from '../helpers/harness.mjs';
import path from 'node:path';

const SITE = 'https://isgcalisanplatformu.com', URL_ = `${SITE}/hesaplar-ve-gizlilik`;
const settle = (page, ms = 600) => page.waitForTimeout(ms);
const me = () => db.profiles.find(p => p.id === U1);
const ready = f => f.waitForSelector('[data-view="account"] [data-account-main]:not([hidden])', { timeout: 8000 });
const vals = f => f.evaluate(() => ({ disc: document.getElementById('kgDiscoverable').checked, phone: document.getElementById('kgPhone').checked }));

const browser = await chromium.launch(LAUNCH);
try {
  for (const vp of [{ name: 'desktop', width: 1366, height: 900 }, { name: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true }]) {
    resetDb();
    const N = vp.name, opts = { viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch };

    // ---- Misafir ----
    {
      const ctx = await browser.newContext(opts); await setup(ctx, false);
      const page = await ctx.newPage(); await page.goto(URL_); await settle(page, 1200);
      const f = frameOf(page);
      await f.waitForSelector('[data-account-status]:not([hidden]) [data-action="login"]');
      check(await f.isHidden('[data-account-main]') && (await f.textContent('#kgTitle')) === 'Hesap & Gizlilik', `${N} misafir: ayarlar gizli, "Giriş Yap" gösteriliyor`);
      await f.click('[data-account-status] [data-action="login"]'); await settle(page, 400);
      check(await f.evaluate(() => !!document.querySelector('dialog[open]')), `${N} misafir: Giriş Yap giriş penceresini açar`);
      await ctx.close();
    }

    // ---- Oturum açık ----
    const ctx = await browser.newContext(opts); await setup(ctx, true);
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.goto(URL_); await settle(page, 1000);
    let f = frameOf(page); await ready(f);
    check(page.url() === URL_ && await f.evaluate(() => document.getElementById('kisgApp').dataset.activeView) === 'account', `${N}: /hesaplar-ve-gizlilik App Shell içinde 7. görünüm olarak açıldı`);
    check(JSON.stringify(await vals(f)) === JSON.stringify({ disc: true, phone: false }), `${N}: anahtarlar DB değerleriyle geldi`);
    check((await f.textContent('[data-account-email]')) === 'a@b.c' && await f.evaluate(() => !document.querySelector('[data-view="account"] input:not([type="checkbox"])')), `${N}: e-posta salt okunur metin (düzenlenebilir alan yok)`);
    const over = await f.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(over <= 0, `${N}: yatay taşma yok (${over})`);
    await page.screenshot({ path: path.join(OUT, `account-privacy-${N}.png`), fullPage: true });

    // Telefon: aç → kaydet
    writes.length = 0;
    await f.click('.kg-switch:has(#kgPhone)'); await f.waitForSelector('[data-account-note="show_phone_publicly"][data-tone="ok"]');
    const w1 = writes.filter(w => w.table === 'profiles');
    check(w1.length === 1 && JSON.stringify(w1[0].body) === '{"show_phone_publicly":true}' && w1[0].q.includes(`id=eq.${U1}`), `${N}: telefon görünürlüğü yalnız bu alanla, yalnız kendi satırına yazıldı ${JSON.stringify(w1)}`);
    check(me().show_phone_publicly === true && me().phone === '+905551112233', `${N}: DB'de true; telefon verisi silinmedi`);
    check((await f.textContent('[data-account-note="show_phone_publicly"]')) === 'Kaydedildi.', `${N}: "Kaydedildi." geri bildirimi`);
    // Uzmanlarda görünürlük: kapat
    await f.click('.kg-switch:has(#kgDiscoverable)'); await f.waitForSelector('[data-account-note="is_discoverable"][data-tone="ok"]');
    check(me().is_discoverable === false && me().full_name === 'Ayşe Yılmaz', `${N}: is_discoverable=false kaydedildi, profil korunuyor`);

    // Yeniden açılış: güncel değerler
    await page.reload(); await settle(page, 1000); f = frameOf(page); await ready(f);
    check(JSON.stringify(await vals(f)) === JSON.stringify({ disc: false, phone: true }), `${N}: sayfa yeniden açılınca güncel değerler`);

    // Uzmanlar: gizlenen profil listede yok
    await page.evaluate(() => document.getElementById('kisg-pro-nav')?.shadowRoot?.querySelector('[data-view-link="experts"]')?.click());
    await settle(page, 1200); f = frameOf(page);
    const listed = await f.evaluate(uid => !!document.querySelector(`[data-view="experts"] a[href*="${uid}"]`), U1);
    check(page.url().endsWith('/uzmanlar') && !listed, `${N}: Uzmanlar listesinde görünmüyor`);
    await page.goBack(); await settle(page, 800); f = frameOf(page); await ready(f);

    // Hata: kayıt başarısız → geri al + hata mesajı
    await ctx.route(/\/rest\/v1\/profiles\?/, r => r.request().method() === 'PATCH' ? r.fulfill({ status: 500, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"message":"x"}' }) : r.fallback());
    await f.click('.kg-switch:has(#kgPhone)'); await f.waitForSelector('[data-account-note="show_phone_publicly"][data-tone="error"]');
    check((await vals(f)).phone === true && me().show_phone_publicly === true && /Kaydedilemedi/.test(await f.textContent('[data-account-note="show_phone_publicly"]')), `${N}: hata → anahtar eski değere döndü, sade hata mesajı`);
    await ctx.unroute(/\/rest\/v1\/profiles\?/);

    // Hesabı sil: onay penceresi, silme isteği yok
    writes.length = 0; let rpc = 0; page.on('request', r => { if (/\/rpc\/|\/auth\/v1\/admin|functions\/v1/.test(r.url())) rpc++; });
    await f.click('[data-account-delete]'); await settle(page, 400);
    const dlg = await f.evaluate(() => { const d = document.getElementById('kaDeleteDialog'); return { open: d.open, text: d.textContent, buttons: [...d.querySelectorAll('footer button')].map(b => b.textContent) }; });
    check(dlg.open && /Destek üzerinden alıyoruz/.test(dlg.text) && JSON.stringify(dlg.buttons) === '["Vazgeç","Silme Talebi Gönder"]', `${N}: Silme Talebi → pencere talep akışını açıklıyor; doğrudan silme yok, Destek'e yönlendirir ${JSON.stringify(dlg.buttons)}`);
    await f.click('#kaDeleteDialog footer [data-close]'); await settle(page, 300);
    check(!(await f.evaluate(() => document.getElementById('kaDeleteDialog').open)) && writes.length === 0 && rpc === 0 && db.profiles.length === 2, `${N}: silme/yazma isteği gönderilmedi`);

    // Hesap menüsü bağlantısı + shell içi geçiş
    await page.goto(`${SITE}/hizmetler`); await settle(page, 1000);
    const mark = await page.evaluate(() => (window.__bootMark = Math.random()));
    await page.evaluate(() => { const n = document.getElementById('kisg-pro-nav').shadowRoot; n.querySelector('.ka-account-toggle').click(); });
    await settle(page, 300);
    const link = await page.evaluate(() => { const a = document.getElementById('kisg-pro-nav').shadowRoot.querySelector('#kaAccountMenu [data-view-link="account"]'); return a && { text: a.textContent, href: a.href, visible: a.getBoundingClientRect().width > 0 }; });
    check(link && link.text === 'Hesap & Gizlilik' && link.href === URL_ && link.visible, `${N}: hesap menüsünde "Hesap & Gizlilik"`);
    await page.evaluate(() => document.getElementById('kisg-pro-nav').shadowRoot.querySelector('#kaAccountMenu [data-view-link="account"]').click());
    await settle(page, 1000); f = frameOf(page); await ready(f);
    check(page.url() === URL_ && await page.evaluate(() => window.__bootMark) === mark, `${N}: menüden shell içinde açıldı (yeniden yükleme yok)`);

    // Çıkış
    await f.click('[data-view="account"] [data-action="signout"]'); await settle(page, 1000);
    check(await f.isVisible('[data-account-status] [data-action="login"]') && await f.isHidden('[data-account-main]'), `${N}: Çıkış Yap → oturum kapandı, giriş istemi`);
    check(errs.length === 0, `${N}: sayfa hatası yok ${errs.join(' ')}`);
    await ctx.close();
  }
} finally {
  await browser.close();
}
