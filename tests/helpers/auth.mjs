// Auth akışı test yardımcıları: durumlu Supabase Auth mock'u (kayıt + handle_new_user simülasyonu, OTP,
// şifre güncelleme, hata/ağ senaryoları), boot() ve ortak UI yardımcıları.
import { chromium, fs, ROOT, APP, NM, OUT, U1, U2, now, iso, db, writes, uploads, IMG, DB0, resetDb, cursorOr, filterRows, seq, orderRows, withEmbeds, handleRest, libs, HOSTINGER_BASE_CSS, hostPage, errors, realtimeMock, postSeq, makePost, setup, frameOf, check, DEFAULT_CHROMIUM, LAUNCH } from './harness.mjs';

// ===== Web Auth V1 testleri =====
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const tokenFor = uid => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: uid, exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated', aud: 'authenticated' })}.c2ln`;
const uidOf = t => { try { return JSON.parse(Buffer.from(String(t).split('.')[1], 'base64url')).sub; } catch { return null; } };
let uidSeq = 0;
function authMock(ctx, { confirm = false, triggerDisc = false } = {}) {
  const st = { confirm, otp: '12345678', calls: [], fail: {}, triggered: 0, users: new Map([['a@b.c', { id: U1, email: 'a@b.c', password: 'dogru-sifre', confirmed: true, meta: {} }]]) };
  const H = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*', 'x-supabase-api-version': '2024-01-01' };
  const byId = id => [...st.users.values()].find(u => u.id === id);
  const userObj = u => ({ id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, email_confirmed_at: u.confirmed ? new Date().toISOString() : null, user_metadata: u.meta || {}, app_metadata: { provider: 'email' }, identities: [{ id: u.id, identity_id: u.id, user_id: u.id, provider: 'email' }], created_at: new Date().toISOString() });
  const sess = u => ({ access_token: tokenFor(u.id), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r-' + u.id, user: userObj(u) });
  st.ready = ctx.route('https://twaptpofhbnnfciowoig.supabase.co/auth/v1/**', r => {
    const req = r.request(), u = new URL(req.url()), path = u.pathname.replace('/auth/v1', ''), method = req.method();
    if (method === 'OPTIONS') return r.fulfill({ status: 200, headers: H });
    let body = {}; try { body = JSON.parse(req.postData() || '{}'); } catch {}
    st.calls.push({ path, method, body, search: u.search, url: req.url() });
    const J = (b, status = 200) => r.fulfill({ status, headers: H, contentType: 'application/json', body: JSON.stringify(b) });
    const E = (status, code, msg) => J({ code, error_code: code, msg, message: msg }, status);
    const mode = st.fail[path];
    if (mode === 'abort') return r.abort('failed');
    if (mode === '500') return E(500, 'unexpected_failure', 'Database error saving new user');
    if (mode === '429') return E(429, 'over_email_send_rate_limit', 'rate limit');
    if (path === '/token') {
      if (u.searchParams.get('grant_type') === 'refresh_token') { const x = byId(String(body.refresh_token).slice(2)); return x ? J(sess(x)) : E(400, 'refresh_token_not_found', 'Invalid Refresh Token'); }
      const x = st.users.get(String(body.email).toLowerCase());
      if (!x || x.password !== body.password) return E(400, 'invalid_credentials', 'Invalid login credentials');
      if (!x.confirmed) return E(400, 'email_not_confirmed', 'Email not confirmed');
      return J(sess(x));
    }
    if (path === '/signup') {
      const mail = String(body.email).toLowerCase(), old = st.users.get(mail);
      if (String(body.password || '').length < 6) return J({ code: 'weak_password', msg: 'Password should be at least 6 characters.', weak_password: { reasons: ['length'], message: 'x' } }, 422);
      if (old && old.confirmed) return st.confirm ? J({ id: 'fake-' + (++uidSeq), aud: 'authenticated', role: '', email: mail, identities: [], user_metadata: {}, app_metadata: {}, created_at: new Date().toISOString() }) : E(422, 'user_already_exists', 'User already registered');
      const id = `cccccccc-0000-4000-8000-${String(++uidSeq).padStart(12, '0')}`;
      const x = { id, email: mail, password: body.password, confirmed: !st.confirm, meta: body.data || {} };
      st.users.set(mail, x);
      // handle_new_user() trigger simülasyonu: profiles satırı sunucuda oluşur
      db.profiles.push({ id, full_name: x.meta.full_name || null, avatar_url: null, profession: null, title: null, certificate_class: null, city: null, current_company: null, about: null, is_discoverable: triggerDisc, show_phone_publicly: false, phone: null, experience_range: null, social_links: null, last_post_at: null });
      st.triggered++;
      return st.confirm ? J(userObj(x)) : J(sess(x));
    }
    if (path === '/verify') {
      const x = st.users.get(String(body.email).toLowerCase());
      if (!x || body.token !== st.otp) return E(403, 'otp_expired', 'Token has expired or is invalid');
      if (body.type === 'signup') x.confirmed = true;
      return J(sess(x));
    }
    if (path === '/recover' || path === '/resend' || path === '/otp') return J({});
    if (path === '/user') {
      if (mode === '401') return E(403, 'session_not_found', 'Session from session_id claim in JWT does not exist');
      const x = byId(uidOf((req.headers()['authorization'] || '').replace(/^Bearer /i, '')));
      if (!x) return E(401, 'no_authorization', 'no user');
      if (method === 'PUT') {
        if (body.password != null) {
          if (body.password === x.password) return E(422, 'same_password', 'New password should be different from the old password.');
          if (String(body.password).length < 6) return J({ code: 'weak_password', msg: 'weak', weak_password: { reasons: ['length'], message: 'x' } }, 422);
          x.password = body.password;
        }
      }
      return J(userObj(x));
    }
    if (path === '/logout') return r.fulfill({ status: 204, headers: H, body: '' });
    return E(404, 'not_found', 'not found');
  });
  return st;
}
async function boot(browser, vp, { loggedIn = false, confirm = false, triggerDisc = false, path = '/', storage } = {}) {
  resetDb(); writes.length = 0;
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch });
  await setup(ctx, loggedIn);
  const auth = authMock(ctx, { confirm, triggerDisc }); await auth.ready;
  if (storage) await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); }, storage);
  const page = await ctx.newPage();
  const rest = []; page.on('request', q => { if (q.url().includes('/rest/v1/profiles')) rest.push({ m: q.method(), url: decodeURIComponent(q.url()), body: q.postData() }); });
  page.on('pageerror', e => errors.push(`auth ${vp.name}: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED|net::|Failed to fetch/.test(m.text())) errors.push(`auth ${vp.name} console: ${m.text()}`); });
  await page.goto('https://isgcalisanplatformu.com' + path); await page.waitForTimeout(900);
  const f = frameOf(page);
  return { ctx, page, f, auth, rest };
}
const acct = page => page.evaluate(() => document.getElementById('kisg-pro-nav')?.shadowRoot.querySelector('.ka-account')?.dataset.state);
const paneOf = f => f.evaluate(() => { const d = document.getElementById('kaLoginDialog'); return d.open ? d.dataset.pane : ''; });
const errOf = (f, pane) => f.evaluate(p => { const el = document.querySelector(`#kaLoginDialog [data-auth-pane="${p}"] .k-form-error`); return el && !el.hidden ? el.textContent : ''; }, pane);
const navLogin = page => page.evaluate(() => document.getElementById('kisg-pro-nav').shadowRoot.querySelector('[data-action="login"]').click());
const go = (f, to) => f.evaluate(t => document.querySelector(`#kaLoginDialog [data-auth-pane]:not([hidden]) [data-auth-go="${t}"], #kaLoginDialog [data-auth-tabs] [data-auth-go="${t}"]`).click(), to);
const submitPane = (f, pane) => f.evaluate(p => { const el = document.querySelector(`#kaLoginDialog [data-auth-pane="${p}"]`); el.tagName === 'FORM' ? el.requestSubmit() : el.querySelector('.ku-submit').click(); }, pane);
async function fillSignup(f, { name = 'Zeynep Kaya', email = 'zeynep@ornek.com', pw = 'GucluSifre1', pw2 = pw, terms = true } = {}) {
  await f.fill('#kaSignupName', name); await f.fill('#kaSignupEmail', email); await f.fill('#kaSignupPassword', pw); await f.fill('#kaSignupPassword2', pw2);
  await f.evaluate(t => { document.getElementById('kaSignupTerms').checked = t; }, terms);
}
const visibleView = f => f.evaluate(() => [...document.querySelectorAll('[data-view]')].filter(v => !v.hidden).map(v => v.dataset.view).join(','));
const navClick = (page, name) => page.evaluate(n => document.getElementById('kisg-pro-nav').shadowRoot.querySelector(`[data-view-link="${n}"]`).click(), name);
const settle = (page, ms = 700) => page.waitForTimeout(ms);
const flag = page => page.evaluate(() => localStorage.getItem('kisg:onboarding:v1'));
const noProfileInsert = rest => !rest.some(r => r.m === 'POST' || /on_conflict|resolution=merge/.test(r.url));

export { b64, tokenFor, uidOf, uidSeq, authMock, boot, acct, paneOf, errOf, navLogin, go, submitPane, fillSignup, visibleView, navClick, settle, flag, noProfileInsert };
