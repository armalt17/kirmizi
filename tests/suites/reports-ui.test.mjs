// Şikâyet / Bildir V1 — UI: menü noktaları, misafir → giriş → devam, kendi içeriği yok,
// doğru target_type / target_id, istemci reporter_id/status göndermez, tekrar/hata eşlemesi.
// Mock sözleşme: DB davranışı (unique, KISG_REPORT_OWN) reports-db suite'inde gerçek PostgreSQL ile sınanır.
import { chromium, OUT, U1, U2, errors, setup, frameOf, check, LAUNCH, resetDb, db, writes } from '../helpers/harness.mjs';
import { submitPane, settle } from '../helpers/auth.mjs';

const POST_U2 = 'bbbbbbbb-0000-4000-8000-000000000000', POST_U1 = 'bbbbbbbb-0000-4000-8000-000000000001', POST5 = 'bbbbbbbb-0000-4000-8000-000000000005';
const SVC_U2 = 'aaaaaaaa-0000-4000-8000-000000000001', SVC_U1 = 'aaaaaaaa-0000-4000-8000-000000000003';
const reqs = [];
// professional_reports: PostgREST + migration sözleşmesi (yalnız INSERT, return=minimal, unique, kendi içeriği reddi)
async function reportsRoute(ctx, { fail = false } = {}) {
  await ctx.route('https://twaptpofhbnnfciowoig.supabase.co/rest/v1/professional_reports*', async route => {
    const req = route.request(), H = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: H });
    const body = JSON.parse(req.postData() || 'null');
    reqs.push({ method: req.method(), body, prefer: req.headers()['prefer'] || '', url: req.url() });
    const err = (status, e) => route.fulfill({ status, headers: H, contentType: 'application/json', body: JSON.stringify(e) });
    if (fail) return err(500, { code: 'XX000', message: 'boom' });
    if (req.method() !== 'POST') return err(403, { code: '42501', message: 'permission denied for table professional_reports' });
    const owner = { post: db.professional_posts, comment: db.professional_post_comments, service: db.professional_services }[body.target_type]?.find(r => String(r.id) === body.target_id)?.user_id ?? (body.target_type === 'profile' ? body.target_id : null);
    if (owner === U1) return err(400, { code: 'P0001', message: 'KISG_REPORT_OWN' });
    const dup = reqs.filter(r => r.method === 'POST' && r.ok && r.body.target_type === body.target_type && r.body.target_id === body.target_id).length;
    if (dup) return err(409, { code: '23505', message: 'duplicate key value violates unique constraint "professional_reports_once_per_reporter"' });
    reqs[reqs.length - 1].ok = true;
    return route.fulfill({ status: 201, headers: H, body: '' });
  });
}
const posts = () => reqs.filter(r => r.method === 'POST');
const dialogOpen = f => f.evaluate(() => document.getElementById('kaReportDialog').open);
async function submitReport(page, f, reason, details) {
  await f.waitForSelector('#kaReportDialog[open]');
  if (reason) await f.check(`#kaReportDialog input[value="${reason}"]`);
  if (details != null) await f.fill('#kaReportDetails', details);
  await f.click('#kaReportSubmit'); await settle(page, 700);
}
const toastText = f => f.evaluate(() => document.querySelector('[data-toast]').textContent.trim());
const reasonsOf = f => f.evaluate(() => [...document.querySelectorAll('#kaReportDialog .kr-reason')].map(l => l.textContent.trim()));
const browser = await chromium.launch(LAUNCH);

for (const vp of [{ name: 'desktop', width: 1366, height: 900 }, { name: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true }]) {
  resetDb(); reqs.length = 0; writes.length = 0;
  const N = vp.name;
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch });
  await setup(ctx, true); await reportsRoute(ctx);
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`${N}: ${e.message}`));
  await page.goto('https://isgcalisanplatformu.com/'); await settle(page, 1800);
  let f = frameOf(page);
  await f.waitForSelector(`[data-view="works"] [data-post-id="${POST_U2}"]`);

  // --- Post: başkasının Postunda yalnız "Bildir"; kendi Postunda sahip menüsü aynen (Bildir yok)
  const menus = await f.evaluate(([a, b]) => { const m = id => [...document.querySelectorAll(`[data-view="works"] [data-post-id="${id}"] [data-owner-slot] .k-popover button`)].map(x => x.textContent.trim()); return { other: m(a), own: m(b) }; }, [POST_U2, POST_U1]);
  check(JSON.stringify(menus.other) === '["Bildir"]' && JSON.stringify(menus.own) === '["Düzenle","Profilde öne çıkar","Sil"]', `${N} Post menüsü: başkası [Bildir], kendi ${JSON.stringify(menus.own)}`);
  await f.evaluate(id => { const c = document.querySelector(`[data-view="works"] [data-post-id="${id}"]`); c.scrollIntoView({ block: 'center' }); c.querySelector('[data-owner-slot] [data-popover-trigger]').click(); }, POST_U2);
  check(await f.locator(`[data-view="works"] [data-post-id="${POST_U2}"] .kw-menu:not([hidden])`).count() === 1, `${N} Post üç nokta menüsü açıldı`);
  await f.evaluate(id => document.querySelector(`[data-view="works"] [data-post-id="${id}"] [data-post-action="report"]`).click(), POST_U2);
  await f.waitForSelector('#kaReportDialog[open]'); await settle(page, 450);
  const dlg = await f.evaluate(() => { const d = document.getElementById('kaReportDialog'); const r = d.getBoundingClientRect(); const b = document.getElementById('kaReportSubmit').getBoundingClientRect(); return { fits: b.bottom <= r.bottom + 0.5 && b.top >= r.top, title: document.getElementById('kaReportTitle').textContent, place: d.dataset.place, bottom: Math.round(innerHeight - r.bottom), w: Math.round(r.width), vw: innerWidth }; });
  check(dlg.title === 'Postu bildir', `${N} dialog başlığı: ${dlg.title}`);
  if (vp.isMobile) check(dlg.place === 'sheet' && dlg.w === dlg.vw && dlg.fits, `${N} mobilde alt sayfa (sheet), tam genişlik, Bildir butonu kaydırmadan görünür (${dlg.w}/${dlg.vw})`);
  else check(dlg.w < 640, `${N} masaüstünde ortalı dialog (${dlg.w}px)`);
  const rs = await reasonsOf(f);
  check(JSON.stringify(rs) === JSON.stringify(['Spam veya reklam', 'Uygunsuz / rahatsız edici içerik', 'Yanıltıcı bilgi', 'Taciz / hakaret', 'Diğer']), `${N} Post nedenleri (sahte profil yok): ${rs.join(' | ')}`);
  await page.screenshot({ path: `${OUT}/reports-dialog-${N}.png` });
  await f.click('#kaReportSubmit'); await settle(page, 200);
  check(await f.textContent('#kaReportError') === 'Bir neden seç.' && posts().length === 0, `${N} neden seçilmeden gönderilmez`);
  await submitReport(page, f, 'spam', '  Reklam linki var  ');
  let p = posts()[0];
  check(p && JSON.stringify(p.body) === JSON.stringify({ target_type: 'post', target_id: POST_U2, reason: 'spam', details: 'Reklam linki var' }), `${N} Post kaydı: ${JSON.stringify(p?.body)}`);
  check(p && !/return=representation/.test(p.prefer) && !('reporter_id' in p.body) && !('status' in p.body), `${N} istemci reporter_id/status göndermez, satır geri okumaz (Prefer: ${p?.prefer || '-'})`);
  check(!(await dialogOpen(f)) && await toastText(f) === 'Bildiriminiz alındı.', `${N} başarı: "Bildiriminiz alındı."`);
  check(await f.locator(`[data-view="works"] [data-post-id="${POST_U2}"]`).count() === 1, `${N} bildirilen Post akışta duruyor (otomatik gizleme yok)`);
  // Tekrar bildirme: DB unique → kullanıcıya bilgi, hata değil
  await f.evaluate(id => { const c = document.querySelector(`[data-view="works"] [data-post-id="${id}"]`); c.querySelector('[data-owner-slot] [data-popover-trigger]').click(); c.querySelector('[data-post-action="report"]').click(); }, POST_U2);
  await submitReport(page, f, 'other');
  check(posts().length === 2 && !(await dialogOpen(f)) && await toastText(f) === 'Bunu daha önce bildirdin. Bildirimin inceleniyor.', `${N} tekrar bildirme → "daha önce bildirdin"`);

  // --- Yorum (bigint kimlik): başkasının yorumunda Bildir, kendi yorumunda Düzenle/Sil
  await page.goto(`https://isgcalisanplatformu.com/calisma-detay?id=${POST5}`); await settle(page, 1800);
  f = frameOf(page);
  await f.waitForSelector('[data-view="work"] [data-comment-id="12"]');
  const cm = await f.evaluate(() => { const m = id => [...document.querySelectorAll(`[data-view="work"] [data-comment-id="${id}"] .cm-menu button`)].map(x => x.textContent.trim()); return { other: m(12), own: m(11) }; });
  check(JSON.stringify(cm.other) === '["Bildir"]' && JSON.stringify(cm.own) === '["Düzenle","Sil"]', `${N} yorum menüsü: başkası ${JSON.stringify(cm.other)}, kendi ${JSON.stringify(cm.own)}`);
  await f.evaluate(() => { const c = document.querySelector('[data-view="work"] [data-comment-id="12"]'); c.querySelector('[data-popover-trigger]').click(); c.querySelector('[data-comment-act="report"]').click(); });
  check(await f.textContent('#kaReportTitle') === 'Yorumu bildir', `${N} yorum dialogu`);
  await submitReport(page, f, 'harassment');
  p = posts().at(-1);
  check(JSON.stringify(p.body) === JSON.stringify({ target_type: 'comment', target_id: '12', reason: 'harassment', details: null }), `${N} Yorum kaydı (bigint → "12"): ${JSON.stringify(p.body)}`);
  // Post Detay: bu Post kullanıcının kendisinin → sahip menüsü, Bildir yok
  const dm = await f.evaluate(() => [...document.querySelectorAll('[data-view="work"] [data-owner-slot] .k-popover button')].map(x => x.textContent.trim()));
  check(dm.includes('Düzenle') && !dm.includes('Bildir'), `${N} Post Detay (kendi Postu): sahip menüsü, Bildir yok (${dm.join()})`);

  // --- Hizmet: başkasının hizmetinde Bildir menüsü; kendi hizmetinde yalnız yönet menüsü
  await page.goto(`https://isgcalisanplatformu.com/hizmet-detay?id=${SVC_U2}`); await settle(page, 1500);
  f = frameOf(page); await f.waitForSelector('#khTitle');
  check(await f.isVisible('[data-service-report] .kw-dots') && !(await f.isVisible('[data-service-owner]')), `${N} başkasının hizmeti: Bildir menüsü var, yönet yok`);
  await f.click('[data-service-report] .kw-dots'); await f.click('[data-service-action="report"]');
  check(await f.textContent('#kaReportTitle') === 'Hizmeti bildir', `${N} hizmet dialogu`);
  await submitReport(page, f, 'misleading', 'Fiyat bilgisi yanlış');
  p = posts().at(-1);
  check(JSON.stringify(p.body) === JSON.stringify({ target_type: 'service', target_id: SVC_U2, reason: 'misleading', details: 'Fiyat bilgisi yanlış' }), `${N} Hizmet kaydı: ${JSON.stringify(p.body)}`);
  await page.goto(`https://isgcalisanplatformu.com/hizmet-detay?id=${SVC_U1}`); await settle(page, 1500);
  f = frameOf(page); await f.waitForSelector('#khTitle');
  check(await f.isVisible('[data-service-owner]') && !(await f.isVisible('[data-service-report]')), `${N} kendi hizmeti: yönet menüsü var, Bildir yok`);

  // --- Profil: başkasının profilinde "Profili bildir" (sahte profil nedeni dahil); kendi profilinde yok
  await page.goto(`https://isgcalisanplatformu.com/profil?id=${U2}`); await settle(page, 1800);
  f = frameOf(page); await f.waitForSelector('#kpName');
  check(await f.locator('.kp-more').count() === 1, `${N} başkasının profilinde üç nokta menüsü`);
  await f.click('.kp-more .kw-dots'); await f.click('[data-profile-action="report"]');
  check(await f.textContent('#kaReportTitle') === 'Profili bildir' && (await reasonsOf(f)).includes('Sahte profil / yanıltıcı kimlik'), `${N} profil dialogu + "Sahte profil / yanıltıcı kimlik"`);
  await submitReport(page, f, 'fake_profile');
  p = posts().at(-1);
  check(JSON.stringify(p.body) === JSON.stringify({ target_type: 'profile', target_id: U2, reason: 'fake_profile', details: null }), `${N} Profil kaydı: ${JSON.stringify(p.body)}`);
  await page.goto(`https://isgcalisanplatformu.com/profil?id=${U1}`); await settle(page, 1800);
  f = frameOf(page); await f.waitForSelector('#kpName');
  check(await f.locator('.kp-more, [data-profile-action="report"]').count() === 0, `${N} kendi profilinde Bildir yok`);

  check(posts().length === 5 && reqs.every(r => r.method === 'POST'), `${N} yalnız INSERT isteği (${reqs.length} istek, okuma/güncelleme yok)`);
  check(!writes.some(w => ['professional_posts', 'professional_post_comments', 'professional_services', 'profiles', 'professional_notifications'].includes(w.table)), `${N} içerik/profil/bildirim tablolarına yazım yok`);
  await ctx.close();
}

{
  // Misafir: Bildir → mevcut giriş penceresi → giriş sonrası Bildir dialogu kaldığı hedefle açılır
  resetDb(); reqs.length = 0;
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await setup(ctx, false); await reportsRoute(ctx);
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`guest: ${e.message}`));
  await page.goto('https://isgcalisanplatformu.com/'); await settle(page, 1800);
  const f = frameOf(page);
  await f.waitForSelector(`[data-view="works"] [data-post-id="${POST_U1}"]`);
  const guestMenus = await f.evaluate(() => [...document.querySelectorAll('[data-view="works"] [data-owner-slot] .k-popover button')].map(x => x.textContent.trim()));
  check(guestMenus.length > 0 && guestMenus.every(t => t === 'Bildir'), `misafir: tüm Post menüleri yalnız Bildir (${guestMenus.length})`);
  await f.evaluate(id => { const c = document.querySelector(`[data-view="works"] [data-post-id="${id}"]`); c.querySelector('[data-owner-slot] [data-popover-trigger]').click(); c.querySelector('[data-post-action="report"]').click(); }, POST_U2);
  await settle(page, 500);
  check(await f.evaluate(() => document.getElementById('kaLoginDialog').open) && !(await dialogOpen(f)), 'misafir Bildir → giriş penceresi (Bildir dialogu değil)');
  check(posts().length === 0, 'misafirde istek gönderilmedi');
  await f.fill('#kaLoginEmail', 'a@b.c'); await f.fill('#kaLoginPassword', 'dogru-sifre'); await submitPane(f, 'login'); await settle(page, 1500);
  check(!(await f.evaluate(() => document.getElementById('kaLoginDialog').open)) && await dialogOpen(f) && await f.textContent('#kaReportTitle') === 'Postu bildir', 'giriş sonrası Bildir dialogu kaldığı yerden açıldı');
  await submitReport(page, f, 'inappropriate');
  check(JSON.stringify(posts()[0]?.body) === JSON.stringify({ target_type: 'post', target_id: POST_U2, reason: 'inappropriate', details: null }) && await toastText(f) === 'Bildiriminiz alındı.', `giriş sonrası kayıt: ${JSON.stringify(posts()[0]?.body)}`);
  // Giriş sonrası kendi Postunun menüsü sahip menüsüne döndü
  check(await f.evaluate(id => [...document.querySelectorAll(`[data-view="works"] [data-post-id="${id}"] [data-owner-slot] .k-popover button`)].map(x => x.textContent.trim()).join(), POST_U1) === 'Düzenle,Profilde öne çıkar,Sil', 'giriş sonrası kendi Postunda Bildir yok, sahip menüsü var');
  await ctx.close();
}

{
  // Misafir kendi (giriş yapacağı hesabın) Postunu bildirmeye çalışırsa: giriş sonrası dialog açılmaz, uyarı
  resetDb(); reqs.length = 0;
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await setup(ctx, false); await reportsRoute(ctx);
  const page = await ctx.newPage();
  await page.goto('https://isgcalisanplatformu.com/'); await settle(page, 1800);
  const f = frameOf(page);
  await f.waitForSelector(`[data-view="works"] [data-post-id="${POST_U1}"]`);
  await f.evaluate(id => { const c = document.querySelector(`[data-view="works"] [data-post-id="${id}"]`); c.querySelector('[data-owner-slot] [data-popover-trigger]').click(); c.querySelector('[data-post-action="report"]').click(); }, POST_U1);
  await settle(page, 400);
  await f.fill('#kaLoginEmail', 'a@b.c'); await f.fill('#kaLoginPassword', 'dogru-sifre'); await submitPane(f, 'login'); await settle(page, 1500);
  check(!(await dialogOpen(f)) && await toastText(f) === 'Kendi içeriğini bildiremezsin.' && posts().length === 0, 'giriş sonrası hedef kendi Postu → dialog yok, uyarı, istek yok');
  await ctx.close();
}

{
  // DB kendi içeriği reddi (UI kontrolü atlatılsa bile) ve ağ/izin hatası eşlemesi
  resetDb(); reqs.length = 0;
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await setup(ctx, true); await reportsRoute(ctx);
  const page = await ctx.newPage();
  await page.goto(`https://isgcalisanplatformu.com/hizmet-detay?id=${SVC_U2}`); await settle(page, 1500);
  let f = frameOf(page); await f.waitForSelector('#khTitle');
  // Veri yarışı simülasyonu: sayfa açıkken hedefin sahibi değişmiş gibi (DB KISG_REPORT_OWN döner)
  db.professional_services.find(v => v.id === SVC_U2).user_id = U1;
  await f.click('[data-service-report] .kw-dots'); await f.click('[data-service-action="report"]');
  await submitReport(page, f, 'spam');
  check(!(await dialogOpen(f)) && await toastText(f) === 'Kendi içeriğini bildiremezsin.', 'DB KISG_REPORT_OWN → "Kendi içeriğini bildiremezsin."');
  await ctx.close();

  const ctx2 = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  resetDb(); await setup(ctx2, true); await reportsRoute(ctx2, { fail: true });
  const page2 = await ctx2.newPage();
  await page2.goto(`https://isgcalisanplatformu.com/hizmet-detay?id=${SVC_U2}`); await settle(page2, 1500);
  f = frameOf(page2); await f.waitForSelector('#khTitle');
  await f.click('[data-service-report] .kw-dots'); await f.click('[data-service-action="report"]');
  await submitReport(page2, f, 'spam', 'not');
  check(await dialogOpen(f) && await f.textContent('#kaReportError') === 'Bildirim şu anda gönderilemedi. Lütfen tekrar dene.' && await f.inputValue('#kaReportDetails') === 'not' && !(await f.isDisabled('#kaReportSubmit')), 'sunucu hatası: dialog açık kalır, metin korunur, tekrar denenebilir');
  await ctx2.close();
}

await browser.close();
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO PAGE ERRORS');
