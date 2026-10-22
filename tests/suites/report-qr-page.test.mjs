// Rapor QR sayfası (/r/{kod}) + Cloudflare Worker (dist-rapor/r-worker.js). Sayfa Worker üzerinden açılır; Worker'ın
// Supabase'e giden istekleri sahte Supabase'e bağlanır. Firma adı yok, noindex, iki "aslıyla aynı" metni, geri çekilen
// ve bulunamayan rapor, deneme sınırı, staging kopyası güncel. v2.0.0 (2026-10-22): uzman kartı yok, sakin ton, alt satır.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { chromium, ROOT, OUT, check, LAUNCH } from '../helpers/harness.mjs';

const src = fs.readFileSync(path.join(ROOT, 'kisg-rapor.html'), 'utf8');
const workerFile = path.join(ROOT, 'dist-rapor', 'r-worker.js');
const stagingFile = path.join(ROOT, 'dist-rapor', 'kisg-rapor-staging.html');
const worker = fs.readFileSync(workerFile, 'utf8');
const staging = fs.readFileSync(stagingFile, 'utf8');

// Üretilmiş dosyalar kaynakla güncel mi
check(worker.includes(`const PAGE = ${JSON.stringify(src)};`), 'r-worker.js kaynakla güncel (node tools/build-rapor.mjs)');
check(staging === src.replace("supabaseUrl: ''", "supabaseUrl: 'https://vleellyrhmtjpwgzrqii.supabase.co'").replace("supabaseKey: ''", "supabaseKey: 'sb_publishable_85NeRUePWMVOCQH4sOISuw_CzdvwlDR'"), 'staging kopyası kaynakla güncel');
check(!/service_role|sb_secret_/.test(worker + src), 'gizli anahtar yok');
check(/<meta name="robots" content="noindex/.test(src), 'sayfa noindex');
// Yeni metinlerde kaçınılan kelimeler (ürün sahibi 2026-10-20, 2026-10-22)
const visible = src.replace(/<!--[\s\S]*?-->/, '');
check(!/doğrula|onaylı belge|resm[iî]|e-imza|mühür|kaşe/i.test(visible), 'sayfa metninde doğrula/resmî/e-imza/mühür/kaşe yok');

const CODE = 'ABCDEFGHJKLMNPQRSTUV', GONE = 'BBBBBBBBBBBBBBBBBBBB', NOFILE = 'CCCCCCCCCCCCCCCCCCCC';
const PDF = Buffer.from('%PDF-1.4 deneme raporu\n');
const SHA = crypto.createHash('sha256').update(PDF).digest('hex');
const steps = [{ title: 'Bu rapor nedir?', body: 'Saha incelemesi.' }, { title: 'Önce acil maddeler', body: 'Önce bunlar.' }];
const rec = (status, hasFile) => ({
  status, report_no: '2026-0007', rev: 2, issued_at: '2026-10-20T09:00:00Z', visited_on: '2026-10-19', findings: 5, urgent: 2,
  has_file: hasFile, steps,
  expert: { id: '11111111-1111-4111-8111-111111111111', name: 'Ayşe Yılmaz', title: null, class: 'A', avatar_url: null, verified: true },
});
const calls = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (!u.startsWith('https://twaptpofhbnnfciowoig.supabase.co/rest/v1/rpc/')) throw new Error('beklenmeyen istek ' + u);
  const name = u.split('/').pop(), body = JSON.parse(init.body);
  calls.push({ name, body, apikey: init.headers.apikey });
  let out = null;
  if (name === 'report_public') out = body.p_code === CODE ? rec('ok', true) : body.p_code === GONE ? rec('withdrawn', true) : body.p_code === NOFILE ? { ...rec('ok', false), steps: [] } : null;
  if (name === 'report_public_match') out = body.p_code === CODE ? (body.p_sha256 === SHA ? 'same' : 'different') : null;
  return new Response(JSON.stringify(out), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
const W = (await import(workerFile + '?t=' + Date.now())).default;

// Worker doğrudan
{
  const r = await W.fetch(new Request(`https://isgcalisanplatformu.com/r/${CODE}`));
  check(r.status === 200 && /noindex/.test(r.headers.get('X-Robots-Tag') || '') && (await r.text()).includes('İşyeriniz için hazırlanan rapor'), 'Worker: sayfa + X-Robots-Tag noindex');
  const bad = await W.fetch(new Request('https://isgcalisanplatformu.com/r/api/report_public_match', { method: 'POST', body: JSON.stringify({ p_code: CODE, p_sha256: 'x' }) }));
  check(bad.status === 400, 'Worker: geçersiz istek 400');
  const other = await W.fetch(new Request('https://isgcalisanplatformu.com/r/api/admin_overview', { method: 'POST', body: '{}' }));
  check(other.status === 404, 'Worker: yalnız iki çağrı iletilir');
  const get = await W.fetch(new Request('https://isgcalisanplatformu.com/r/api/report_public'));
  check(get.status === 405, 'Worker: api yalnız POST');
  let last = null;
  for (let i = 0; i < 21; i++) {
    last = await W.fetch(new Request('https://isgcalisanplatformu.com/r/api/report_public', { method: 'POST', headers: { 'CF-Connecting-IP': '203.0.113.9' }, body: JSON.stringify({ p_code: 'ZZZZZZZZZZZZZZZZZZZZ' }) }));
  }
  check(last.status === 429, 'Worker: dakikada 20 denemeden sonra 429');
  check(calls.every(c => c.apikey === 'sb_publishable_PbG6v6BuhMVwVyRdCxHUMw_JscAAhVs'), 'Worker: Supabase\'e publishable anahtarla');
}

const browser = await chromium.launch(LAUNCH);
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route('**/*', async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    if (u.hostname !== 'isgcalisanplatformu.com') return route.fulfill({ status: 404, body: '' });
    const res = await W.fetch(new Request(req.url(), { method: req.method(), headers: req.headers(), body: req.method() === 'POST' ? req.postData() : undefined }));
    return route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: Buffer.from(await res.arrayBuffer()) });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));

  await page.goto(`https://isgcalisanplatformu.com/r/${CODE}`);
  await page.waitForSelector('h1');
  const text = await page.locator('main').innerText();
  check(/İşyeriniz için hazırlanan rapor/.test(text) && /bir kısmını bu raporda topladı/.test(text), 'başlık ve giriş');
  check(/2026-0007 · Rev\. 2/.test(text) && /20 Ekim 2026/.test(text) && /19 Ekim 2026/.test(text) && /5 madde/.test(text) && !/acil/i.test(await page.locator('.kr-row').allInnerTexts().then(a => a.join(' '))), 'özet: no, Rev, tarih, ziyaret, madde (acil vurgusu yok)');
  check(/Bu rapor nedir\?/.test(text) && /Önce acil maddeler/.test(text) && await page.locator('.kr-step').count() === 2, 'adımlar sırayla (admin adımları)');
  check(!/Ayşe Yılmaz|Uzmanın profili|RAPORU HAZIRLAYAN|sorumludur/.test(text) && await page.locator('[aria-label="Onaylı hesap"]').count() === 0, 'uzman kartı ve sorumluluk metni yok');
  check(/tüm eksiklerin listesi değildir/.test(text) && /firmanızın adı ve raporun maddeleri gösterilmez/.test(text), 'alt notlar');
  const links = await page.locator('.kr-links a').evaluateAll(a => a.map(x => x.textContent + '=' + x.href).join('|'));
  check(links === 'Akış=https://isgcalisanplatformu.com/|Hizmet Bul=https://isgcalisanplatformu.com/hizmetler|İş İlanları=https://isgcalisanplatformu.com/isg-is-ilanlari', `alt satır bağlantıları ${links}`);
  check(await page.locator('.kr-foot img').getAttribute('src') === 'https://twaptpofhbnnfciowoig.supabase.co/storage/v1/object/public/general/logo.jpg', 'alt satır: özgün logo');
  check(!/Firma/.test(text), 'firma adı yok');
  check(await page.locator('details#asli').evaluate(d => !d.open), '"aslıyla aynı mı?" kapalı başlar');
  await page.click('#asli summary');

  await page.setInputFiles('#krFile', { name: 'rapor.pdf', mimeType: 'application/pdf', buffer: PDF });
  await page.waitForSelector('.kr-result.same');
  check((await page.locator('.kr-result').innerText()).trim() === "Bu dosya Kırmızı İSG'de üretilen dosyayla birebir aynı.", 'aynı dosya metni');
  const sent = calls.filter(c => c.name === 'report_public_match').pop();
  check(sent && sent.body.p_sha256 === SHA && Object.keys(sent.body).length === 2, 'dosya gönderilmez, yalnız SHA-256');
  await page.setInputFiles('#krFile', { name: 'rapor.pdf', mimeType: 'application/pdf', buffer: Buffer.concat([PDF, Buffer.from(' ')]) });
  await page.waitForSelector('.kr-result.diff');
  check((await page.locator('.kr-result').innerText()).trim() === "Bu dosya Kırmızı İSG'de üretilen dosyayla birebir aynı değil; değiştirilmiş ya da yeniden kaydedilmiş olabilir.", 'farklı dosya metni');
  const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(ov <= 1, 'mobilde yatay taşma yok');
  await page.screenshot({ path: path.join(OUT, 'report-qr-page.png'), fullPage: true });

  await page.goto(`https://isgcalisanplatformu.com/r/${GONE}`);
  await page.waitForSelector('.kr-msg');
  const gone = await page.locator('main').innerText();
  check(/Bu rapor güncellendi ya da geri çekildi; elinizdeki nüsha eski olabilir\. Güncelini uzmanınızdan isteyin\./.test(gone) && !/Bu rapor nedir/.test(gone) && /2026-0007/.test(gone), 'geri çekilen: mesaj, özet var, adım yok');

  await page.goto(`https://isgcalisanplatformu.com/r/${NOFILE}`);
  await page.waitForSelector('h1');
  check(await page.locator('#asli').count() === 0, 'dosya kaydı yoksa "Aslıyla aynı mı?" yok');
  const t3 = await page.locator('main').innerText();
  check(/Raporu okuyun/.test(t3) && /Sorumlu ve tarih belirleyin/.test(t3) && /Sorularınızı uzmanınıza sorun/.test(t3) && await page.locator('.kr-step').count() === 3, 'admin adımı yoksa kısa üç adım');

  await page.goto('https://isgcalisanplatformu.com/r/YYYYYYYYYYYYYYYYYYYY');
  await page.waitForSelector('.kr-msg');
  check(/Kayıt bulunamadı/.test(await page.locator('main').innerText()), 'bilinmeyen kod: Kayıt bulunamadı');
  const before = calls.length;
  await page.goto('https://isgcalisanplatformu.com/r/kisa');
  await page.waitForSelector('.kr-msg');
  check(/Kayıt bulunamadı/.test(await page.locator('main').innerText()) && calls.length === before, 'biçimsiz kod: istek atmadan Kayıt bulunamadı');
  check(!errors.length, `sayfa hatası yok ${errors.join(' | ')}`);
  await ctx.close();
} finally {
  await browser.close();
  globalThis.fetch = realFetch;
}
