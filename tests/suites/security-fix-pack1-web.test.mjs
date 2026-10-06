// Security Fix Pack 1 — Web v4.15: telefon okumaları RPC'ye taşındı, hizmet aramasında sağlayıcı filtresi (id).
// Mock: tests/helpers/harness.mjs handleRpc (get_public_phone / get_my_private_profile; 'missing' = migration yok).
import { chromium, OUT, U1, U2, errors, setup, frameOf, check, LAUNCH, resetDb, db, writes, rpcCalls } from '../helpers/harness.mjs';
import { settle } from '../helpers/auth.mjs';

const SVC_U2 = 'aaaaaaaa-0000-4000-8000-000000000001', SVC_U1 = 'aaaaaaaa-0000-4000-8000-000000000003';
const browser = await chromium.launch(LAUNCH);
const phoneSelects = [];
async function open(loggedIn, mode) {
  resetDb(); rpcCalls.length = 0; phoneSelects.length = 0; writes.length = 0;
  if (mode) db._rpcMode = mode;
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await setup(ctx, loggedIn);
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`${mode || 'rpc'}: ${e.message}`));
  page.on('request', r => { const u = decodeURIComponent(r.url()); if (/\/rest\/v1\/profiles\?/.test(u) && /select=phone(&|$)/.test(u)) phoneSelects.push(u); });
  return { ctx, page };
}
const acts = f => f.evaluate(() => [...document.querySelectorAll('.kh-actions a')].map(a => a.getAttribute('href') || ''));

{
  // Varsayılan: migration uygulanmış (RPC var)
  const { ctx, page } = await open(false);
  await page.goto(`https://isgcalisanplatformu.com/hizmet-detay?id=${SVC_U2}`); await settle(page, 1500);
  let f = frameOf(page); await f.waitForSelector('#khTitle');
  let a = await acts(f);
  const call = rpcCalls.find(c => c.fn === 'get_public_phone');
  check(call && call.body.profile_id === U2 && a.includes('tel:+905324445566') && a.includes('https://wa.me/905324445566'), `hizmet detay (misafir): telefon get_public_phone ile okunur, Ara + WhatsApp var (${JSON.stringify(call?.body)})`);
  check(phoneSelects.length === 0, `hizmet detay: profiles?select=phone doğrudan okuması yok (${phoneSelects.length})`);

  rpcCalls.length = 0;
  await page.goto(`https://isgcalisanplatformu.com/hizmet-detay?id=${SVC_U1}`); await settle(page, 1500);
  f = frameOf(page); await f.waitForSelector('#khTitle');
  a = await acts(f);
  check(!rpcCalls.some(c => c.fn === 'get_public_phone') && !a.some(h => /^tel:|wa\.me/.test(h)), 'telefonu gizli sağlayıcı: RPC çağrılmaz, Ara/WhatsApp yok');

  rpcCalls.length = 0;
  await page.goto(`https://isgcalisanplatformu.com/profil?id=${U2}`); await settle(page, 1800);
  f = frameOf(page); await f.waitForSelector('#kpName');
  const phoneLink = await f.evaluate(() => document.querySelector('.kp-phone')?.getAttribute('href'));
  check(rpcCalls.some(c => c.fn === 'get_public_phone' && c.body.profile_id === U2) && phoneLink === 'tel:+905324445566' && phoneSelects.length === 0, `profil (misafir): açık telefon RPC ile gösterilir (${phoneLink})`);
  await ctx.close();
}

{
  // Sahip: editörde kendi gizli telefonu get_my_private_profile ile gelir; kaydetme telefonu bozmaz
  const { ctx, page } = await open(true);
  await page.goto(`https://isgcalisanplatformu.com/profil?id=${U1}`); await settle(page, 1800);
  const f = frameOf(page); await f.waitForSelector('#kpName');
  const card = await f.textContent('[data-view="profile"] .kp-card');
  check(!card.includes('5551112233') && !rpcCalls.some(c => c.fn === 'get_public_phone'), 'kendi profil kartı: gizli telefon kartta görünmez, public RPC çağrılmaz');
  await f.click('.kp-card [data-profile-action="edit"] >> nth=0');
  await f.waitForSelector('#kaProfileDialog[open]');
  check(rpcCalls.some(c => c.fn === 'get_my_private_profile') && await f.inputValue('#kaPe_phone') === '+905551112233' && phoneSelects.length === 0, 'editör: gizli telefon get_my_private_profile ile sahibine gösterilir');
  await f.selectOption('#kaPe_city', 'Ankara');
  await f.click('#kaProfileDialog [type="submit"]'); await settle(page, 1200);
  const w = writes.filter(x => x.table === 'profiles').pop();
  check(w && w.body.city === 'Ankara' && !('phone' in w.body) && !('is_premium' in w.body) && !('email' in w.body), `editör kaydı yalnız değişen alanı yazar (${JSON.stringify(w?.body)})`);
  await ctx.close();
}

{
  // Migration henüz uygulanmamışken (veya rollback sonrası) web v4.15 eski okumaya döner
  const { ctx, page } = await open(true, 'missing');
  await page.goto(`https://isgcalisanplatformu.com/hizmet-detay?id=${SVC_U2}`); await settle(page, 1500);
  let f = frameOf(page); await f.waitForSelector('#khTitle');
  const a = await acts(f);
  check(a.includes('tel:+905324445566') && phoneSelects.some(u => /show_phone_publicly=eq\.true/.test(u)), 'RPC yok (PGRST202) → hizmet detayı eski filtreli okumayla telefonu gösterir');
  await page.goto(`https://isgcalisanplatformu.com/profil?id=${U1}`); await settle(page, 1800);
  f = frameOf(page); await f.waitForSelector('#kpName');
  await f.click('.kp-card [data-profile-action="edit"] >> nth=0');
  await f.waitForSelector('#kaProfileDialog[open]');
  check(await f.inputValue('#kaPe_phone') === '+905551112233', 'RPC yok → editör eski okumayla sahibin telefonunu gösterir');
  await ctx.close();
}

{
  // RPC hata verirse (ör. ağ/500): telefon gösterilmez, sayfa çalışır, eski okumaya düşmez
  const { ctx, page } = await open(false, 'error');
  await page.goto(`https://isgcalisanplatformu.com/hizmet-detay?id=${SVC_U2}`); await settle(page, 1500);
  const f = frameOf(page); await f.waitForSelector('#khTitle');
  const a = await acts(f);
  check(!a.some(h => /^tel:|wa\.me/.test(h)) && a.some(h => h.includes('/profil?id=')) && phoneSelects.length === 0, 'RPC 500 → telefon gösterilmez, Profili Gör çalışır, doğrudan okuma yok');
  await ctx.close();
}

{
  // Hizmet araması: sağlayıcı filtresi profiles'tan yalnız (id) ister
  const { ctx, page } = await open(false);
  const reqs = [];
  page.on('request', r => { const u = decodeURIComponent(r.url()); if (/\/rest\/v1\/professional_services\?/.test(u)) reqs.push(u); });
  await page.goto('https://isgcalisanplatformu.com/hizmetler'); await settle(page, 1500);
  const f = frameOf(page); await f.waitForSelector('[data-view="services"] .ks-card');
  await f.fill('#ksSearch', 'Mehmet'); await settle(page, 1200);
  const q = reqs.filter(u => /search_provider/.test(u)).pop() || '';
  check(/search_provider:profiles!professional_services_user_id_fkey\(id\)/.test(q) && !/fkey\(\)/.test(q) && /search_provider\.full_name=ilike/.test(q), `arama: sağlayıcı gömülü okuması (id) (${(q.match(/search_provider:[^,&]*/) || [''])[0]})`);
  check(await f.locator('[data-view="services"] .ks-card').count() > 0, 'arama sonuçları listeleniyor');
  const ver = await f.evaluate(() => document.documentElement.outerHTML.includes("version: '4.39.0'") || !!document.querySelector('script')?.textContent.includes("'4.39.0'"));
  check(ver, 'sürüm 4.39.0');
  await ctx.close();
}

await browser.close();
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO PAGE ERRORS');
