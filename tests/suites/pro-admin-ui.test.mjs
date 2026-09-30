// Professional Admin UI v1 (/pro-admin) — hedefli tarayıcı testi.
// Hostinger üst sayfa + srcdoc iframe simülasyonu; Supabase Auth ve RPC sahte sunucu ile karşılanır.
// Doğrulananlar: giriş / yetki kapısı, yalnız admin RPC kullanımı (tablo isteği yok), bölümler, aksiyonların
// RPC argümanları, gerekçe zorunluluğu, hata eşleme, mobil yerleşim.
import { chromium, fs, ROOT, OUT, libs, check, LAUNCH } from '../helpers/harness.mjs';
import path from 'node:path';

const ADMIN_HTML = fs.readFileSync(path.join(ROOT, 'kisg-pro-admin.html'), 'utf8');
const X = '99999999-9999-4999-8999-999999999999', A = '11111111-1111-4111-8111-111111111111', M = '22222222-2222-4222-8222-222222222222';
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const tokenFor = uid => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: uid, exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated', aud: 'authenticated' })}.c2ln`;
const uidOf = t => { try { return JSON.parse(Buffer.from(String(t).split('.')[1], 'base64url')).sub; } catch { return null; } };
const H = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' };
const iso = m => new Date(Date.now() - m * 60000).toISOString();

const hostPage = p => `<!doctype html><html><head><meta charset="utf-8"><title>${p}</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{height:100%}body{margin:0;font-family:sans-serif}header{height:64px;background:#222;color:#fff}footer{height:200px;background:#eee}</style></head><body><header>Hostinger header</header><section><div class="block-layout"><div><iframe style="width:100%;border:0" srcdoc="${ADMIN_HTML.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"></iframe></div></div></section><footer>footer</footer></body></html>`;

function server(ctx) {
  const st = { rpc: [], table: [], fail: {} };
  const users = [
    { id: M, full_name: 'Mehmet Öztürk', email: 'mehmet@ornek.com', title: 'İSG Uzmanı', city: 'Kocaeli', avatar_url: null, is_discoverable: true, is_premium: false, created_at: iso(5000), post_count: 2, service_count: 1, open_report_count: 2, active_sanction: null, active_sanction_ends_at: null },
    { id: A, full_name: 'Ayşe Yılmaz', email: 'ayse@ornek.com', title: null, city: 'İstanbul', avatar_url: null, is_discoverable: false, is_premium: true, created_at: iso(9000), post_count: 1, service_count: 0, open_report_count: 0, active_sanction: 'suspension', active_sanction_ends_at: iso(-3000) }];
  const posts = [
    { kind: 'post', id: 'bbbbbbbb-0000-4000-8000-000000000001', user_id: M, author_name: 'Mehmet Öztürk', title: null, body: 'Spam içerikli post', status: 'active', created_at: iso(30), moderated_at: null, moderation_reason: null, parent_id: null, open_report_count: 2 },
    { kind: 'post', id: 'bbbbbbbb-0000-4000-8000-000000000002', user_id: M, author_name: 'Mehmet Öztürk', title: null, body: 'Gizlenmiş post', status: 'hidden', created_at: iso(60), moderated_at: iso(20), moderation_reason: 'spam', parent_id: null, open_report_count: 0 }];
  const reports = [
    { id: 'rrrrrrrr-0000-4000-8000-000000000001'.replace(/r/g, 'a'), reporter_id: A, reporter_name: 'Ayşe Yılmaz', target_type: 'post', target_id: posts[0].id, reason: 'spam', details: 'reklam yapıyor', status: 'pending', created_at: iso(10), reviewed_by: null, reviewed_at: null, resolution_note: null, action_taken: null, target_owner_id: M, target_owner_name: 'Mehmet Öztürk', target_preview: 'Spam içerikli post', target_status: 'active', same_target_pending: 2 },
    { id: 'aaaaaaaa-0000-4000-8000-000000000002', reporter_id: A, reporter_name: 'Ayşe Yılmaz', target_type: 'profile', target_id: M, reason: 'fake_profile', details: null, status: 'pending', created_at: iso(5), reviewed_by: null, reviewed_at: null, resolution_note: null, action_taken: null, target_owner_id: M, target_owner_name: 'Mehmet Öztürk', target_preview: 'Mehmet Öztürk - İSG Uzmanı', target_status: null, same_target_pending: 1 }];
  const withTotal = rows => rows.map(r => ({ ...r, total_count: rows.length }));
  const ADMIN_RPC = {
    admin_overview: () => ({ users_total: 1296, users_new_7d: 12, posts: { active: 14, hidden: 1, deleted: 3 }, comments: { active: 9, deleted: 3 }, services: { active: 3, archived: 1 }, reports: { pending: 2 }, active_suspensions: 1, active_bans: 0, warnings_30d: 2, admin_actions_7d: 4 }),
    admin_list_audit_log: () => withTotal([{ id: 'l1', admin_id: X, admin_name: 'Admin', action: 'post.hide', target_type: 'post', target_id: posts[1].id, reason: 'spam', before: {}, after: {}, created_at: iso(20) }]),
    admin_list_users: a => withTotal(users.filter(u => !a.p_q || u.full_name.toLowerCase().includes(String(a.p_q).toLowerCase()) || u.email.includes(a.p_q))),
    admin_get_user: a => { const u = users.find(x => x.id === a.p_user_id); return { profile: { id: u.id, full_name: u.full_name, email: u.email, phone: '+905324445566', show_phone_publicly: false, title: u.title, city: u.id === A ? 'istanbul' : u.city, profession: 'İş Güvenliği Uzmanı', current_company: null, experience_range: '5-10 yıl', about: 'Hakkında metni', is_discoverable: u.is_discoverable, is_premium: u.is_premium, created_at: u.created_at, avatar_url: null, linkedin_url: null, instagram_url: null, website_url: null, certificate_class: u.id === A ? 'A Sınıfı' : 'Uzman Hekim' }, is_admin: false, counts: { posts: { active: 1, hidden: 1 }, comments: {}, services: { active: 1 }, reports_made: 0 }, reports_against: reports.filter(r => r.target_owner_id === u.id).map(r => ({ id: r.id, target_type: r.target_type, target_id: r.target_id, reason: r.reason, status: r.status, created_at: r.created_at })), sanctions: u.id === A ? [{ id: 'ssssssss-0000-4000-8000-000000000001'.replace(/s/g, 'e'), user_id: A, type: 'suspension', reason: 'spam', starts_at: iso(100), ends_at: iso(-3000), revoked_at: null, created_at: iso(100) }] : [], recent_admin_actions: [] }; },
    admin_list_content: a => withTotal(a.p_kind === 'post' ? posts.filter(p => !a.p_status || p.status === a.p_status) : []),
    admin_list_reports: a => withTotal(reports.filter(r => !a.p_status || r.status === a.p_status).filter(r => !a.p_target_type || r.target_type === a.p_target_type)),
    admin_update_profile: a => ({ changed: Object.keys(a.p_patch) }),
    admin_moderate_content: a => { if (a.p_id === 'fail') throw 0; const p = posts.find(x => x.id === a.p_id); if (a.p_action === 'hide') p.status = 'hidden'; if (a.p_action === 'restore') p.status = 'active'; if (a.p_action === 'delete') p.status = 'deleted'; return { status: p.status }; },
    admin_sanction_user: () => 'ffffffff-0000-4000-8000-000000000001',
    admin_revoke_sanction: () => ({ revoked_at: iso(0) }),
    admin_resolve_report: a => { const r = reports.find(x => x.id === a.p_report_id); r.status = a.p_status; return { status: a.p_status, action_taken: 'none', reports_closed: 1 }; }
  };
  st.ready = Promise.all([
    ctx.route('https://isgcalisanplatformu.com/**', r => r.fulfill({ contentType: 'text/html', body: hostPage(new URL(r.request().url()).pathname) })),
    ctx.route('https://cdn.jsdelivr.net/**', r => { const f = libs[r.request().url()]; return f ? r.fulfill({ headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) }) : r.fulfill({ status: 404 }); }),
    ctx.route('https://twaptpofhbnnfciowoig.supabase.co/storage/**', r => r.fulfill({ status: 404, headers: H, body: '' })),
    ctx.route('https://twaptpofhbnnfciowoig.supabase.co/auth/v1/**', r => {
      const req = r.request(), p = new URL(req.url()).pathname;
      if (req.method() === 'OPTIONS') return r.fulfill({ status: 200, headers: H });
      if (p.endsWith('/token')) {
        const body = JSON.parse(req.postData() || '{}');
        const uid = body.email === 'admin@ornek.com' && body.password === 'dogru' ? X : body.email === 'ayse@ornek.com' && body.password === 'dogru' ? A : null;
        if (!uid) return r.fulfill({ status: 400, headers: H, contentType: 'application/json', body: JSON.stringify({ code: 'invalid_credentials', message: 'Invalid login credentials' }) });
        return r.fulfill({ headers: H, contentType: 'application/json', body: JSON.stringify({ access_token: tokenFor(uid), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r', user: { id: uid, aud: 'authenticated', email: body.email } }) });
      }
      if (p.endsWith('/logout')) return r.fulfill({ status: 204, headers: H, body: '' });
      const uid = uidOf((req.headers().authorization || '').replace(/^Bearer /i, ''));
      return r.fulfill({ headers: H, contentType: 'application/json', body: JSON.stringify({ id: uid, aud: 'authenticated', email: uid === X ? 'admin@ornek.com' : 'ayse@ornek.com' }) });
    }),
    ctx.route('https://twaptpofhbnnfciowoig.supabase.co/rest/v1/**', r => {
      const req = r.request(), u = new URL(req.url());
      if (req.method() === 'OPTIONS') return r.fulfill({ status: 200, headers: H });
      const m = /\/rest\/v1\/rpc\/([a-z_]+)$/.exec(u.pathname);
      if (!m) { st.table.push({ method: req.method(), path: u.pathname }); return r.fulfill({ status: 404, headers: H, body: '[]' }); }
      const name = m[1], args = JSON.parse(req.postData() || '{}'), uid = uidOf((req.headers().authorization || '').replace(/^Bearer /i, ''));
      st.rpc.push({ name, args, uid, method: req.method() });
      const J = (b, status = 200) => r.fulfill({ status, headers: H, contentType: 'application/json', body: JSON.stringify(b) });
      if (name === 'kisg_is_admin') return J(uid === X);
      if (!ADMIN_RPC[name]) return J({ code: 'PGRST202', message: `Could not find the function public.${name}` }, 404);
      if (uid !== X) return J({ code: '42501', message: 'KISG_ADMIN_ONLY', details: null, hint: null }, 403);
      if (st.fail[name]) return J(st.fail[name], 400);
      try { return J(ADMIN_RPC[name](args)); } catch { return J({ code: '22023', message: 'KISG_ADMIN_STATE: yalniz aktif icerik gizlenir' }, 400); }
    })
  ]);
  return st;
}
const session = uid => ([key, value]) => localStorage.setItem(key, value);
async function open(browser, { uid = null, width = 1280, height = 900, qs = '' } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const st = server(ctx); await st.ready;
  if (uid) await ctx.addInitScript(session(uid), ['sb-twaptpofhbnnfciowoig-auth-token', JSON.stringify({ access_token: tokenFor(uid), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r', user: { id: uid, aud: 'authenticated', email: uid === X ? 'admin@ornek.com' : 'ayse@ornek.com' } })]);
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.goto('https://isgcalisanplatformu.com/pro-admin' + qs);
  const f = page.frames().find(x => x !== page.mainFrame()) || (await page.waitForEvent('frameattached'));
  await f.waitForSelector('#kisgAdmin[data-ready]');
  return { ctx, page, f, st, errs };
}
const until = async (fn, ms = 5000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await new Promise(r => setTimeout(r, 50)); } return false; };
const visible = (f, sel) => f.locator(sel).first().isVisible().catch(() => false);
const lastRpc = (st, name) => [...st.rpc].reverse().find(x => x.name === name);
const ALLOWED = new Set(['kisg_is_admin', 'admin_overview', 'admin_list_users', 'admin_get_user', 'admin_list_content', 'admin_list_reports', 'admin_list_audit_log', 'admin_update_profile', 'admin_moderate_content', 'admin_sanction_user', 'admin_revoke_sanction', 'admin_resolve_report']);

// ---------------- statik ----------------
check(!/service_role|service-role|serviceRole/i.test(ADMIN_HTML.replace(/service_role YOKTUR|service_role YOK/g, '')), 'admin HTML\'de service role anahtarı/kullanımı yok');
check(/sb_publishable_/.test(ADMIN_HTML) && !/eyJhbGciOi/.test(ADMIN_HTML), 'yalnız publishable anahtar var (JWT biçimli gizli anahtar yok)');
check(!/\.from\(\s*['"]/.test(ADMIN_HTML), 'kodda doğrudan tablo erişimi (db.from) yok');
check(!/<a[^>]+data-view-link|kisgApp/.test(ADMIN_HTML), 'Professional App Shell\'e bağlı değil (ayrı ve bağımsız sayfa)');

const browser = await chromium.launch(LAUNCH);
try {
  // ---------------- 1) oturum yok → giriş ----------------
  {
    const { ctx, f, st, errs } = await open(browser);
    check(await until(() => visible(f, '[data-gate-pane="login"]')), 'oturum yoksa giriş formu açılır');
    check(!st.rpc.length, 'giriş öncesi hiçbir RPC çağrılmaz');
    await f.fill('input[name="email"]', 'admin@ornek.com'); await f.fill('input[name="password"]', 'yanlis');
    await f.click('[data-gate-pane="login"] button[type="submit"]');
    check(await until(async () => (await f.textContent('[data-login-error]')).includes('hatalı')), 'hatalı şifre: "E-posta veya şifre hatalı."');
    await f.fill('input[name="password"]', 'dogru');
    await f.click('[data-gate-pane="login"] button[type="submit"]');
    check(await until(() => visible(f, '.pa-stats')), 'admin girişi sonrası Genel Bakış açılır');
    check(errs.length === 0, `sayfa hatası yok ${errs.join(' ')}`);
    await ctx.close();
  }
  // ---------------- 2) admin olmayan kullanıcı ----------------
  {
    const { ctx, f, st } = await open(browser, { uid: A });
    check(await until(() => visible(f, '[data-gate-pane="denied"]')), 'admin olmayan kullanıcı "Yetkiniz yok" görür');
    check(st.rpc.length === 1 && st.rpc[0].name === 'kisg_is_admin', 'admin olmayan kullanıcı için yalnız kisg_is_admin çağrıldı (veri istenmedi)');
    check(!(await visible(f, '.pa-shell')), 'yönetim menüsü gösterilmez');
    await ctx.close();
  }
  // ---------------- 3) admin, masaüstü ----------------
  {
    const { ctx, page, f, st, errs } = await open(browser, { uid: X });
    check(await until(() => visible(f, '.pa-stats')), 'admin oturumu: Genel Bakış');
    const stats = await f.locator('.pa-stat').allTextContents();
    check(stats.some(t => t.includes('Bekleyen şikâyet') && t.includes('2')) && stats.some(t => t.includes('1.296')), `özet kutuları admin_overview verisini gösteriyor (${stats.length} kutu)`);
    check((await f.textContent('[data-pending]')).trim() === '2', 'menüde bekleyen şikâyet sayısı');
    check((await f.locator('.pa-table tbody tr').count()) === 1 && (await f.textContent('.pa-table')).includes('Post gizlendi'), 'son yönetici işlemleri listesi');
    await page.screenshot({ path: path.join(OUT, 'pro-admin-overview-desktop.png'), fullPage: true });

    // Kullanıcılar
    await f.click('.pa-nav [data-sec="users"]');
    check(await until(() => f.locator('[data-user]').count().then(n => n === 2)), 'Kullanıcılar listesi');
    check(new URL(page.url()).searchParams.get('b') === 'users', 'bölüm üst sayfa adresinde (?b=users)');
    await f.fill('.pa-search', 'mehmet');
    check(await until(() => lastRpc(st, 'admin_list_users')?.args.p_q === 'mehmet'), 'arama admin_list_users(p_q) ile yapılır');
    check(await until(() => f.locator('[data-user]').count().then(n => n === 1)), 'arama sonucu 1 kullanıcı');
    await f.click(`[data-user="${M}"]`);
    check(await until(async () => (await f.textContent('.pa-drawer')).includes('mehmet@ornek.com')), 'kullanıcı paneli: e-posta ve ayrıntılar (admin_get_user)');
    // Profil düzenle: gerekçesiz → hata, çağrı yok
    await f.click('.pa-drawer button:has-text("Profili düzenle")');
    // Admin V1.1: Şehir (81 il) ve Mesleki Belge / Statü dropdown'ları, mevcut değer seçili
    const sel = await f.evaluate(() => { const c = document.querySelector('.pa-dialog select[name="city"]'), k = document.querySelector('.pa-dialog select[name="certificate_class"]');
      return { cityTag: c?.tagName, cityN: c?.options.length, cityV: c?.value, cityFirst: c?.options[1]?.value, cityLast: c?.options[c.options.length - 1]?.value,
        certV: k?.value, certOpts: k ? [...k.options].map(o => o.value + '=' + o.textContent) : [] }; });
    check(sel.cityTag === 'SELECT' && sel.cityN === 82 && sel.cityV === 'Kocaeli' && sel.cityFirst === 'Adana' && sel.cityLast === 'Zonguldak', `Şehir: 81 il dropdown, mevcut değer seçili ${JSON.stringify(sel).slice(0, 120)}`);
    check(JSON.stringify(sel.certOpts) === JSON.stringify(['=—', 'Uzman Hekim=(mevcut) Uzman Hekim', 'A=A Sınıfı', 'B=B Sınıfı', 'C=C Sınıfı', 'İşyeri Hekimi=İşyeri Hekimi', 'DSP=DSP']) && sel.certV === 'Uzman Hekim',
      `Mesleki Belge / Statü: 5 seçenek; listede olmayan mevcut değer kaybolmadan seçili ${JSON.stringify(sel.certOpts)}`);
    await f.selectOption('.pa-dialog select[name="city"]', 'Ankara');
    await f.selectOption('.pa-dialog select[name="certificate_class"]', 'B');
    const before = st.rpc.filter(x => x.name === 'admin_update_profile').length;
    await f.click('.pa-dialog button[type="submit"]');
    check(await until(async () => (await f.textContent('.pa-dialog .pa-error')).includes('Gerekçe')) && st.rpc.filter(x => x.name === 'admin_update_profile').length === before, 'gerekçe boşsa kaydetmez (istek gönderilmez)');
    await f.fill('.pa-dialog textarea[name="reason"]', 'şehir düzeltmesi');
    await f.click('.pa-dialog button[type="submit"]');
    check(await until(() => lastRpc(st, 'admin_update_profile')), 'admin_update_profile çağrıldı');
    const up = lastRpc(st, 'admin_update_profile').args;
    check(JSON.stringify(up.p_patch) === '{"certificate_class":"B","city":"Ankara"}' && up.p_reason === 'şehir düzeltmesi' && up.p_user_id === M, `yalnız değişen alan gönderildi ${JSON.stringify(up)}`);
    check(await until(async () => (await f.textContent('[data-toast]')).includes('Profil güncellendi')), 'başarı bildirimi');
    // Yaptırım
    await until(() => visible(f, '.pa-drawer button:has-text("Yaptırım uygula")'));
    await f.click('.pa-drawer button:has-text("Yaptırım uygula")');
    await f.check('.pa-dialog input[name="type"][value="suspension"]');
    await f.selectOption('.pa-dialog select[name="duration"]', '3');
    await f.check('.pa-dialog input[name="hide"]');
    await f.fill('.pa-dialog textarea[name="reason"]', 'tekrarlayan spam');
    await f.click('.pa-dialog button[type="submit"]');
    check(await until(() => lastRpc(st, 'admin_sanction_user')), 'admin_sanction_user çağrıldı');
    const sa = lastRpc(st, 'admin_sanction_user').args, days = (Date.parse(sa.p_ends_at) - Date.now()) / 86400000;
    check(sa.p_type === 'suspension' && sa.p_hide_content === true && sa.p_reason === 'tekrarlayan spam' && days > 2.9 && days < 3.1, `askı: tür, 3 gün, içerik gizleme, gerekçe ${JSON.stringify(sa)}`);
    await f.click('.pa-drawer button:has-text("Kapat")').catch(() => {});
    // Yazımı farklı mevcut değerler (istanbul, "A Sınıfı") seçenekle eşleşir; dokunulmazsa kayda girmez
    await f.fill('.pa-search', '');
    await until(() => f.locator('[data-user]').count().then(n => n === 2));
    await f.click(`[data-user="${A}"]`);
    await until(async () => (await f.textContent('.pa-drawer')).includes('ayse@ornek.com'));
    await f.click('.pa-drawer button:has-text("Profili düzenle")');
    const selA = await f.evaluate(() => ({ city: document.querySelector('.pa-dialog select[name="city"]').value, cert: document.querySelector('.pa-dialog select[name="certificate_class"]').value, n: document.querySelector('.pa-dialog select[name="certificate_class"]').options.length }));
    check(selA.city === 'İstanbul' && selA.cert === 'A' && selA.n === 6, `küçük harf "istanbul" → İstanbul, "A Sınıfı" → A seçili ${JSON.stringify(selA)}`);
    await f.fill('.pa-dialog textarea[name="about"]', 'Yeni hakkında');
    await f.fill('.pa-dialog textarea[name="reason"]', 'metin düzeltmesi');
    const nUp = st.rpc.filter(x => x.name === 'admin_update_profile').length;
    await f.click('.pa-dialog button[type="submit"]');
    check(await until(() => st.rpc.filter(x => x.name === 'admin_update_profile').length === nUp + 1), 'ikinci profil kaydı gönderildi');
    check(JSON.stringify(lastRpc(st, 'admin_update_profile').args.p_patch) === '{"about":"Yeni hakkında"}', `dokunulmayan şehir/statü kayda girmedi ${JSON.stringify(lastRpc(st, 'admin_update_profile').args.p_patch)}`);
    await f.click('.pa-drawer button:has-text("Kapat")').catch(() => {});

    // Postlar
    await f.click('.pa-nav [data-sec="posts"]');
    check(await until(() => f.locator('[data-row]').count().then(n => n === 1)), 'Postlar: aktif filtre varsayılan');
    check(lastRpc(st, 'admin_list_content').args.p_kind === 'post' && lastRpc(st, 'admin_list_content').args.p_status === 'active', 'admin_list_content(post, active)');
    await f.click('[data-row] button:has-text("Gizle")');
    await f.fill('.pa-dialog textarea[name="reason"]', 'spam');
    await f.click('.pa-dialog button[type="submit"]');
    check(await until(() => lastRpc(st, 'admin_moderate_content')), 'admin_moderate_content çağrıldı');
    const mo = lastRpc(st, 'admin_moderate_content').args;
    check(mo.p_kind === 'post' && mo.p_action === 'hide' && mo.p_reason === 'spam', `gizleme argümanları ${JSON.stringify(mo)}`);
    check(await until(() => f.locator('[data-row]').count().then(n => n === 0)), 'liste yenilendi (gizlenen post aktif listeden çıktı)');
    await f.click('.pa-chip:has-text("Gizli")');
    check(await until(() => f.locator('[data-row]').count().then(n => n === 2)), 'Gizli filtresi');
    // Sunucu hatası dialogda Türkçe gösterilir
    st.fail.admin_moderate_content = { code: '22023', message: 'KISG_ADMIN_STATE: yalniz gizlenmis icerik geri acilir' };
    await f.click('[data-row] >> nth=0 >> button:has-text("Geri aç")');
    await f.click('.pa-dialog button[type="submit"]');
    check(await until(async () => (await f.textContent('.pa-dialog .pa-error').catch(() => '')).includes('İşlem yapılamadı')), 'sunucu hatası dialogda gösterilir, dialog açık kalır');
    delete st.fail.admin_moderate_content;
    await f.click('.pa-dialog button:has-text("Vazgeç")');

    // Yorumlar / Hizmetler
    await f.click('.pa-nav [data-sec="comments"]');
    check(await until(() => lastRpc(st, 'admin_list_content')?.args.p_kind === 'comment') && await until(async () => (await f.textContent('[data-main]')).includes('Kayıt yok')), 'Yorumlar bölümü (admin_list_content comment)');
    await f.click('.pa-nav [data-sec="services"]');
    check(await until(() => lastRpc(st, 'admin_list_content')?.args.p_kind === 'service'), 'Hizmetler bölümü (admin_list_content service)');

    // Şikâyetler
    await f.click('.pa-nav [data-sec="reports"]');
    check(await until(() => f.locator('[data-report]').count().then(n => n === 2)), 'Şikâyetler: bekleyenler');
    check((await f.textContent('[data-report] >> nth=0')).includes('2 bekleyen şikâyet'), 'aynı hedefteki bekleyen şikâyet sayısı gösteriliyor');
    await f.click('[data-report] >> nth=0 >> button:has-text("Sonuçlandır")');
    const outcomes = await f.locator('.pa-dialog input[name="outcome"]').evaluateAll(els => els.map(e => e.value));
    check(outcomes.includes('resolved|hide') && outcomes.includes('resolved|delete') && outcomes.includes('dismissed|none'), `post şikâyeti seçenekleri ${outcomes.join(',')}`);
    await f.check('.pa-dialog input[value="resolved|hide"]');
    await f.fill('.pa-dialog textarea[name="reason"]', 'reklam doğrulandı');
    await f.click('.pa-dialog button[type="submit"]');
    check(await until(() => lastRpc(st, 'admin_resolve_report')), 'admin_resolve_report çağrıldı');
    const rr = lastRpc(st, 'admin_resolve_report').args;
    check(rr.p_status === 'resolved' && rr.p_content_action === 'hide' && rr.p_note === 'reklam doğrulandı', `sonuçlandırma argümanları ${JSON.stringify(rr)}`);
    check(await until(() => f.locator('[data-report]').count().then(n => n === 1)), 'sonuçlanan şikâyet bekleyenlerden çıktı');
    await f.click('[data-report] >> nth=0 >> button:has-text("Sonuçlandır")');
    const pOut = await f.locator('.pa-dialog input[name="outcome"]').evaluateAll(els => els.map(e => e.value));
    check(!pOut.some(v => v.endsWith('|hide') || v.endsWith('|delete')), 'profil şikâyetinde içerik gizle/sil seçeneği yok');
    await f.click('.pa-dialog button:has-text("Vazgeç")');
    await page.screenshot({ path: path.join(OUT, 'pro-admin-reports-desktop.png'), fullPage: true });

    check(st.table.length === 0, `hiçbir doğrudan tablo isteği yok (yalnız /rpc) ${JSON.stringify(st.table)}`);
    const used = [...new Set(st.rpc.map(x => x.name))];
    check(used.every(n => ALLOWED.has(n)), `yalnız Migration B RPC'leri kullanıldı: ${used.join(', ')}`);
    check(st.rpc.every(x => x.method === 'POST' && x.uid === X), 'tüm RPC\'ler yöneticinin kendi JWT\'siyle gitti');
    check(errs.length === 0, `sayfa hatası yok ${errs.join(' ')}`);
    await ctx.close();
  }
  // ---------------- 4) doğrudan bölüm adresi + oturum kaybı ----------------
  {
    const { ctx, page, f, st } = await open(browser, { uid: X, qs: '?b=reports' });
    check(await until(() => f.locator('[data-report]').count().then(n => n === 2)), '?b=reports doğrudan Şikâyetler\'i açar');
    const frameH = () => page.evaluate(() => document.querySelector('iframe').getBoundingClientRect().height);
    await f.click('.pa-nav [data-sec="overview"]'); await until(() => visible(f, '.pa-stats'));
    await f.evaluate(() => { const m = document.querySelector('[data-main]'); m.append(Object.assign(document.createElement('div'), { style: 'height:2500px', id: 'tall' })); });
    await until(async () => (await frameH()) > 2500);
    const tallH = await frameH();
    await f.evaluate(() => document.getElementById('tall').remove());
    check(await until(async () => (await frameH()) < tallH - 2000), `içerik kısalınca iframe de küçülür (${Math.round(tallH)} → ${Math.round(await frameH())}px)`);
    const rect = await f.evaluate(() => { const n = document.querySelector('.pa-nav').getBoundingClientRect(), m = document.querySelector('[data-main]').getBoundingClientRect(); return { navTop: n.top, mainTop: m.top }; });
    check(Math.abs(rect.navTop - rect.mainTop) < 4, 'masaüstü: menü ve içerik aynı hizada başlıyor');
    await f.click('.pa-nav [data-sec="reports"]'); await until(() => f.locator('[data-report]').count().then(n => n === 2));
    check((await f.getAttribute('.pa-nav [data-sec="reports"]', 'aria-current')) === 'page', 'menüde aktif bölüm işaretli');
    st.fail.admin_list_users = { code: '42501', message: 'KISG_ADMIN_ONLY' };
    await f.click('.pa-nav [data-sec="users"]');
    check(await until(() => visible(f, '[data-gate-pane="denied"]')), 'sunucu yetkiyi reddederse arayüz "Yetkiniz yok" ekranına döner');
    await ctx.close();
  }
  // ---------------- 5) mobil ----------------
  {
    const { ctx, page, f } = await open(browser, { uid: X, width: 390, height: 844 });
    check(await until(() => visible(f, '.pa-stats')), 'mobil: Genel Bakış');
    const ov = await f.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, dir: getComputedStyle(document.querySelector('.pa-nav')).flexDirection }));
    check(ov.sw <= ov.cw + 1 && ov.dir === 'row', `mobil: yatay taşma yok, menü yatay sekme (${ov.sw}/${ov.cw}, ${ov.dir})`);
    await f.click('.pa-nav [data-sec="users"]');
    await until(() => f.locator('[data-user]').count().then(n => n === 2));
    const gap = await f.evaluate(() => document.querySelector('[data-main]').getBoundingClientRect().top - document.querySelector('.pa-nav').getBoundingClientRect().bottom);
    check(gap < 24, `mobil: menü ile içerik arasında boşluk yok (${Math.round(gap)}px)`);
    const card = await f.evaluate(() => getComputedStyle(document.querySelector('.pa-table tr')).display);
    check(card === 'block', 'mobil: tablo satırları karta dönüşür');
    const fh = await page.evaluate(() => document.querySelector('iframe').getBoundingClientRect().height);
    check(fh > 400, `iframe yüksekliği içeriğe göre ayarlanıyor (${Math.round(fh)}px)`);
    await page.screenshot({ path: path.join(OUT, 'pro-admin-users-mobile.png'), fullPage: true });
    await ctx.close();
  }
} finally {
  await browser.close();
}
