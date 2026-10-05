// Kod Sağlığı Raporu düzeltmeleri (v4.33.0) — hedefli test.
// Kayıt onayı/tercih başka cihazda, hesap silme talebi, istek süre sınırı, yorum çift gönderim kilidi,
// yorum sayısının görünümler arası eşitlenmesi, hata veren görselin yeniden görünmesi, şehir seçici erişilebilirliği.
import { chromium, APP, db, writes, check, LAUNCH, setup, frameOf, resetDb, U1 } from '../helpers/harness.mjs';

const SITE = 'https://isgcalisanplatformu.com';
const P5 = 'bbbbbbbb-0000-4000-8000-000000000005';
const settle = (page, ms = 800) => page.waitForTimeout(ms);
const until = async (fn, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await new Promise(r => setTimeout(r, 60)); } return false; };
const H = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const LEGAL = (APP.match(/version: '(\d{4}-\d\d-\d\d)'/) || [])[1];

// ---- statik ----
check(/global: \{ fetch: \(u, o = \{\}\) => fetch\(u, o\.signal \|\| !AbortSignal\.timeout/.test(APP), 'istekler için merkezi süre sınırı (çağıran sinyal vermediyse)');
check(/kisg_legal: CONFIG\.legal\.version, kisg_disc: su\.discoverable\.checked/.test(APP), 'kayıtta sözleşme sürümü ve "Uzmanlarda Görün" tercihi hesaba da yazılıyor');
check(!/kalıcı olarak siler/.test(APP), 'ayarlarda gerçekleşmeyen "kalıcı olarak siler" vaadi yok');

const browser = await chromium.launch(LAUNCH);
try {
  // ================= 1) Başka cihazda giriş: onay kaydı + onboarding hesap bilgisinden =================
  {
    resetDb();
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await setup(ctx, false);
    const user = { id: U1, aud: 'authenticated', email: 'a@b.c', role: 'authenticated', created_at: new Date(Date.now() - 3600e3).toISOString(), user_metadata: { full_name: 'Ayşe Yılmaz', kisg_legal: LEGAL, kisg_disc: true } };
    const updates = [];
    await ctx.route('https://twaptpofhbnnfciowoig.supabase.co/auth/v1/**', r => {
      const req = r.request();
      if (req.method() === 'OPTIONS') return r.fulfill({ status: 200, headers: H });
      if (req.url().includes('/token')) return r.fulfill({ headers: H, contentType: 'application/json', body: JSON.stringify({ access_token: 'x.eyJzdWIiOiIxIn0.y', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r', user }) });
      if (req.method() === 'PUT') { const b = JSON.parse(req.postData() || '{}'); updates.push(b); Object.assign(user.user_metadata, b.data || {}); }
      return r.fulfill({ headers: H, contentType: 'application/json', body: JSON.stringify(user) });
    });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.goto(`${SITE}/`); await settle(page, 1200);
    const f = frameOf(page);
    await page.evaluate(() => document.getElementById('kisg-pro-nav').shadowRoot.querySelector('[data-action="login"]').click());
    await f.waitForSelector('#kaLoginDialog[open]');
    await f.fill('#kaLoginEmail', 'a@b.c'); await f.fill('#kaLoginPassword', 'herhangi');
    writes.length = 0;
    await f.click('#kaLoginSubmit');
    check(await until(() => writes.filter(w => w.table === 'legal_acceptances').length >= 1), 'bu tarayıcıda yerel kayıt yokken onay, hesap bilgisinden sunucuya yazıldı');
    const rows = writes.filter(w => w.table === 'legal_acceptances').flatMap(w => [].concat(w.body));
    check(rows.length === 2 && rows.every(r => r.document_version === LEGAL) && rows.map(r => r.document_type).sort().join() === 'kvkk_notice_informed,terms_of_use', `iki onay satırı, sürüm ${LEGAL} (${rows.map(r => r.document_type).join(',')})`);
    check(await until(() => f.evaluate(() => document.getElementById('kaLoginDialog').open && !document.querySelector('#kaLoginDialog [data-pane="onboard"], #kaLoginDialog [data-auth-pane="onboard"]')?.hidden)), 'başka cihazda ilk girişte profil tamamlama (onboarding) açıldı');
    // tekrar giriş: aynı onay yeniden yazılmaz
    await page.reload(); await settle(page, 1500);
    check(writes.filter(w => w.table === 'legal_acceptances').length === 1, 'sayfa yenilenince onay ikinci kez yazılmadı');
    check(errs.length === 0, `sayfa hatası yok ${errs.join(' ')}`);
    await ctx.close();
  }

  // ================= 2) Hesap silme talebi Destek'e yönlenir =================
  {
    resetDb();
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await setup(ctx, true);
    const page = await ctx.newPage();
    await page.goto(`${SITE}/hesaplar-ve-gizlilik`); await settle(page, 1500);
    const f = frameOf(page);
    await f.waitForSelector('[data-account-delete]:visible');
    check((await f.textContent('[data-account-delete]')).trim() === 'Silme Talebi', 'ayarlarda düğme "Silme Talebi"');
    await f.click('[data-account-delete]'); await f.waitForSelector('#kaDeleteDialog[open]');
    await f.click('#kaDeleteDialog [data-action="support"]');
    check(await until(() => f.evaluate(() => document.getElementById('kaSupportDialog').open)), '"Silme Talebi Gönder" Destek penceresini açar');
    const pre = await f.evaluate(() => ({ cat: document.querySelector('#kaSupportDialog input[name="category"]:checked')?.value, msg: document.getElementById('kaSupportMessage').value, del: document.getElementById('kaDeleteDialog').open }));
    check(pre.cat === 'account' && /silinmesini talep ediyorum/.test(pre.msg) && !pre.del, `konu "Hesap", mesaj hazır, silme penceresi kapandı ${JSON.stringify(pre)}`);
    await ctx.close();
  }

  // ================= 3) Yorum: çift gönderim kilidi + görünümler arası sayı =================
  {
    resetDb();
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await setup(ctx, true);
    let posts = 0;
    await ctx.route('https://twaptpofhbnnfciowoig.supabase.co/rest/v1/professional_post_comments*', async r => {
      if (r.request().method() === 'POST') { posts++; await new Promise(res => setTimeout(res, 1500)); }
      return r.fallback();
    });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.goto(`${SITE}/`); await settle(page, 1200);
    const f = frameOf(page);
    await f.waitForSelector(`[data-view="works"] [data-post-id="${P5}"]`);
    const feedCount = () => f.evaluate(id => (document.querySelector(`[data-view="works"] [data-post-id="${id}"] [data-comment-count-link]`)?.getAttribute('aria-label') || '').match(/\d+/)?.[0], P5);
    const before = Number(await feedCount());
    await f.evaluate(id => document.querySelector(`[data-view="works"] [data-post-id="${id}"] a.kw-post-detail`).click(), P5);
    await f.waitForSelector(`[data-view="work"] [data-post-id="${P5}"] .cm-item`); await settle(page, 600);
    await f.fill('[data-view="work"] .cm-compose textarea', 'Çift gönderim testi');
    await f.click('[data-view="work"] .cm-send');
    await settle(page, 200);
    // istek sürerken liste yeniden çizilir (başka yoruma beğeni) → form yeniden oluşur
    await f.click('[data-view="work"] [data-comment-like="12"]'); await settle(page, 250);
    const again = await f.evaluate(() => { const b = document.querySelector('[data-view="work"] .cm-send'); const was = b?.disabled; b?.removeAttribute('disabled'); b?.click(); return was; });
    await settle(page, 2200);
    check(posts === 1, `istek sürerken ikinci gönderim yapılmadı (POST ${posts}, yeniden çizilen düğme devre dışı: ${again})`);
    const n = writes.filter(w => w.table === 'professional_post_comments' && w.body?.content === 'Çift gönderim testi').length;
    check(n === 1, `yorum bir kez yazıldı (${n})`);
    await page.goBack(); await settle(page, 900);
    const after = Number(await feedCount());
    check(after === before + 1, `Akış kartındaki yorum sayısı detayla eşitlendi (${before} → ${after})`);
    const preview = await f.textContent(`[data-view="works"] [data-post-id="${P5}"] .cp-text`).catch(() => '');
    check(preview === 'Çift gönderim testi', `Akış önizlemesi en yeni yorumu gösteriyor (${preview})`);
    check(errs.length === 0, `sayfa hatası yok ${errs.join(' ')}`);

    // ================= 4) Hata veren görsel, yeni kaynakla yeniden görünür =================
    const vis = await f.evaluate(async () => {
      const img = document.createElement('img'); document.getElementById('kisgApp').append(img);
      img.src = 'data:image/png;base64,AAAA';
      await new Promise(r => setTimeout(r, 400)); const hid = img.hidden;
      img.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
      await new Promise(r => setTimeout(r, 400)); const back = !img.hidden; img.remove(); return { hid, back };
    });
    check(vis.hid && vis.back, `bozuk görsel gizlenir, geçerli kaynak yüklenince yeniden görünür ${JSON.stringify(vis)}`);
    await ctx.close();
  }

  // ================= 5) Şehir seçici: ekran okuyucu etkin seçeneği izler =================
  {
    resetDb();
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await setup(ctx, true);
    const page = await ctx.newPage();
    await page.goto(`${SITE}/uzmanlar`); await settle(page, 1500);
    const f = frameOf(page);
    await f.click('[data-view="experts"] [data-desktop-filters] .kc-city-btn');
    const q = '[data-view="experts"] [data-desktop-filters] [data-city-q]';
    await f.waitForSelector(q);
    const a0 = await f.evaluate(s => { const i = document.querySelector(s); return { role: i.getAttribute('role'), ctl: i.getAttribute('aria-controls'), ad: i.getAttribute('aria-activedescendant') }; }, q);
    await f.press(q, 'ArrowDown'); await f.press(q, 'ArrowDown');
    const a1 = await f.evaluate(s => { const i = document.querySelector(s), id = i.getAttribute('aria-activedescendant'), o = document.getElementById(id); return { id, active: o?.classList.contains('is-active'), text: o?.textContent, listOk: !!document.getElementById(i.getAttribute('aria-controls')) }; }, q);
    check(a0.role === 'combobox' && a0.ctl && a0.ad, `arama kutusu combobox, liste bağlı, ilk seçenek etkin ${JSON.stringify(a0)}`);
    check(a1.active && a1.listOk && a1.id !== a0.ad, `ok tuşları aria-activedescendant'ı etkin seçeneğe taşır ${JSON.stringify(a1)}`);
    await ctx.close();
  }
} finally {
  await browser.close();
}
