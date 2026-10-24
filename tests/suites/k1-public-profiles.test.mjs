// K1 (v4.48.0): başkasının profili yalnız public_profiles görünümünden okunur; profiles tablosuna yalnız kendi satırı için gidilir.
import { chromium, U1, U2, errors, setup, frameOf, check, LAUNCH, resetDb, rpcCalls } from '../helpers/harness.mjs';
import { settle } from '../helpers/auth.mjs';

const SVC_U2 = 'aaaaaaaa-0000-4000-8000-000000000001';
const PAGES = ['/', '/uzmanlar', '/hizmetler', `/hizmet-detay?id=${SVC_U2}`, `/profil?id=${U2}`];
const browser = await chromium.launch(LAUNCH);

async function visit(loggedIn) {
  resetDb(); rpcCalls.length = 0;
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await setup(ctx, loggedIn);
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`${loggedIn ? 'üye' : 'misafir'}: ${e.message}`));
  const table = [], view = [];
  page.on('request', r => {
    const u = decodeURIComponent(r.url());
    if (/\/rest\/v1\/profiles\?/.test(u) || /[:(,]profiles!/.test(u)) table.push(u);
    if (/\/rest\/v1\/public_profiles\?/.test(u) || /public_profiles!/.test(u)) view.push(u);
  });
  for (const p of PAGES) { await page.goto(`https://isgcalisanplatformu.com${p}`); await settle(page, 1500); }
  return { ctx, page, table, view };
}

{
  const { ctx, table, view } = await visit(false);
  check(table.length === 0, `misafir: profiles tablosuna hiç istek yok (${table.length})`);
  check(view.length > 0, `misafir: profiller public_profiles'tan okunur (${view.length})`);
  await ctx.close();
}

{
  const { ctx, page, table, view } = await visit(true);
  const foreign = table.filter(u => !u.includes(`id=eq.${U1}`));
  check(foreign.length === 0, `üye: profiles tablosuna yalnız kendi satırı için gidilir (${foreign.slice(0, 2).join(' | ')})`);
  check(view.some(u => /\/public_profiles\?.*id=eq\./.test(u) && u.includes(U2)), 'üye: başkasının profil sayfası public_profiles\'tan');
  const f = frameOf(page); await f.waitForSelector('#kpName');
  check(!!(await f.textContent('#kpName')).trim(), 'başkasının profil sayfası açılır, ad görünür');
  check(rpcCalls.some(c => c.fn === 'get_public_phone' && c.body.profile_id === U2), 'başkasının telefonu yalnız get_public_phone ile sorulur');
  await page.goto(`https://isgcalisanplatformu.com/profil?id=${U1}`); await settle(page, 1500);
  check(table.some(u => u.includes(`id=eq.${U1}`)), 'kendi profili profiles tablosundan okunur');
  await ctx.close();
}

await browser.close();
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO PAGE ERRORS');
