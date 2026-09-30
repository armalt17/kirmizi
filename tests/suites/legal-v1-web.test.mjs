// Legal V1 — hedefli tarayıcı testi: bağımsız /yasal sayfası (hash navigasyonu, hafiflik, mobil) ve
// Professional App Shell entegrasyonu (kayıt onay metni + bağlantılar, kabul kaydı, Post/Hizmet Topluluk Kuralları notu).
import { chromium, fs, ROOT, OUT, writes, check, LAUNCH, setup, frameOf } from '../helpers/harness.mjs';
import { boot, navLogin, go, submitPane, fillSignup, paneOf, settle, acct } from '../helpers/auth.mjs';
import path from 'node:path';

const LEGAL = fs.readFileSync(path.join(ROOT, 'kisg-yasal.html'), 'utf8');
const APPSRC = fs.readFileSync(path.join(ROOT, 'kisg-professional-app.html'), 'utf8');
const SITE = 'https://isgcalisanplatformu.com';
const IDS = ['kvkk', 'gizlilik', 'kullanim-kosullari', 'topluluk-kurallari'];
const legalHost = () => `<!doctype html><html><head><meta charset="utf-8"><title>/yasal</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{height:100%}body{margin:0}header{height:64px;background:#222}footer{height:200px;background:#eee}</style></head><body><header></header><section><div class="block-layout"><div><iframe style="width:100%;border:0" srcdoc="${LEGAL.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"></iframe></div></div></section><footer>footer</footer></body></html>`;
const until = async (fn, ms = 4000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await new Promise(r => setTimeout(r, 50)); } return false; };
const legalRows = () => writes.filter(w => w.table === 'legal_acceptances' && !w.del);
const PENDING = 'kisg:legal-pending:v1';

// ---------------- statik ----------------
check(Buffer.byteLength(LEGAL) < 80 * 1024 && !/supabase-js|createClient|<script[^>]+src=/.test(LEGAL) && !/kisgApp|PROFESSIONAL APP SHELL/.test(LEGAL), `/yasal hafif ve bağımsız (${Math.round(Buffer.byteLength(LEGAL) / 1024)} KB, SDK / harici script / App Shell yok)`);
check(!/Topluluk Kuralları\s*<\/h2>[\s\S]{2000,}/.test(APPSRC) && !/KVKK Aydınlatma Metni<\/h2>/.test(APPSRC) && !/id="kvkk"/.test(APPSRC), 'App Shell\'de hukuki metinlerin kendisi yok (yalnız bağlantılar)');
check(!/KVKK'y[ıi] kabul|açık rıza veriyorum|KVKK.{0,40}kabul ediyorum/i.test(APPSRC.replace(/kabul ediyorum; /g, '')), 'App Shell\'de "KVKK\'yı kabul ediyorum / açık rıza" ifadesi yok');

const browser = await chromium.launch(LAUNCH);
try {
  // ---------------- 1) /yasal ----------------
  for (const vp of [{ name: 'desktop', width: 1366, height: 900 }, { name: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true }]) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch });
    const ext = [];
    await ctx.route('https://isgcalisanplatformu.com/**', r => r.fulfill({ contentType: 'text/html', body: legalHost() }));
    await ctx.route(/supabase\.co|jsdelivr|googleapis/, r => { ext.push(r.request().url()); return r.fulfill({ status: 404, body: '' }); });
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.goto(`${SITE}/yasal#kullanim-kosullari`);
    const f = await until(() => !!frameOf(page)) && frameOf(page);
    await f.waitForSelector('#kisgLegal[data-ready]');
    const top = id => page.evaluate(i => { const fr = document.querySelector('iframe'); const el = fr.contentDocument.getElementById(i); return Math.round(fr.getBoundingClientRect().top + el.getBoundingClientRect().top); }, id);
    check(await until(async () => Math.abs(await top('kullanim-kosullari')) < 40), `${vp.name} /yasal#kullanim-kosullari doğrudan açılır (bölüm üstte: ${await top('kullanim-kosullari')}px)`);
    check((await f.getAttribute('.lg-nav a[data-section="kullanim-kosullari"]', 'aria-current')) === 'true', `${vp.name} menüde aktif bölüm işaretli`);
    const ids = await f.evaluate(() => [...document.querySelectorAll('.lg-doc')].map(s => s.id + ':' + s.querySelector('h2').textContent));
    check(JSON.stringify(ids) === JSON.stringify(['kvkk:KVKK Aydınlatma Metni', 'gizlilik:Gizlilik Politikası', 'kullanim-kosullari:Kullanım Koşulları', 'topluluk-kurallari:Topluluk Kuralları']) && (await f.textContent('h1')) === 'Yasal & Gizlilik', `${vp.name} başlık ve dört bölüm doğru sırada`);
    await f.click('.lg-nav a[data-section="topluluk-kurallari"]');
    check(await until(async () => new URL(page.url()).hash === '#topluluk-kurallari' && Math.abs(await top('topluluk-kurallari')) < 40), `${vp.name} menü tıklaması: üst adres #topluluk-kurallari ve bölüme kayar`);
    await page.evaluate(() => { location.hash = 'kvkk'; });
    check(await until(async () => Math.abs(await top('kvkk')) < 40), `${vp.name} adres #kvkk olunca bölüme gider (hashchange)`);
    await page.goBack();
    check(await until(async () => new URL(page.url()).hash === '#topluluk-kurallari' && Math.abs(await top('topluluk-kurallari')) < 40), `${vp.name} geri tuşu önceki bölüme döner`);
    const fh = await page.evaluate(() => document.querySelector('iframe').getBoundingClientRect().height);
    check(fh > 900, `${vp.name} iframe yüksekliği içeriğe göre (${Math.round(fh)}px)`);
    const ov = await f.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    check(ov.sw <= ov.cw + 1, `${vp.name} yatay taşma yok (${ov.sw}/${ov.cw})`);
    check(ext.every(u => u.includes('/storage/v1/object/public/general/logo.jpg')), `${vp.name} logo dışında dış istek yok (${ext.length})`);
    check(errs.length === 0, `${vp.name} sayfa hatası yok ${errs.join(' ')}`);
    await page.screenshot({ path: path.join(OUT, `legal-yasal-${vp.name}.png`) });
    await ctx.close();
  }

  // ---------------- 2) Kayıt formu: metin, bağlantılar, bağımsız tercih ----------------
  const vp = { name: 'desktop', width: 1366, height: 900 };
  {
    const { ctx, page, f, auth } = await boot(browser, vp);
    await navLogin(page); await settle(page, 300); await go(f, 'signup');
    const text = (await f.textContent('[data-auth-terms]')).trim();
    check(text === "Kullanım Koşulları'nı okudum ve kabul ediyorum; KVKK Aydınlatma Metni hakkında bilgilendirildim.", `kayıt onay metni birebir: "${text}"`);
    const links = await f.$$eval('[data-auth-terms] a', as => as.map(a => [a.textContent, a.getAttribute('href'), a.target]));
    check(JSON.stringify(links) === JSON.stringify([['Kullanım Koşulları', `${SITE}/yasal#kullanim-kosullari`, '_blank'], ['KVKK Aydınlatma Metni', `${SITE}/yasal#kvkk`, '_blank']]), `iki bağlantı doğru adreslere, yeni sekmede ${JSON.stringify(links)}`);
    await fillSignup(f, { terms: false });
    for (const i of [0, 1]) {
      const [popup] = await Promise.all([ctx.waitForEvent('page', { timeout: 3000 }).catch(() => null), f.click(`[data-auth-terms] a >> nth=${i}`)]);
      await settle(page, 200);
      if (popup) await popup.close();
    }
    const st = await f.evaluate(() => ({ terms: document.getElementById('kaSignupTerms').checked, disc: document.getElementById('kaSignupDiscoverable').checked }));
    check(!st.terms && st.disc && !auth.calls.some(c => c.path === '/signup') && await paneOf(f) === 'signup', `bağlantıya tıklamak onayı değiştirmez, formu göndermez, pencere açık kalır ${JSON.stringify(st)}`);
    await f.click('#kaSignupDiscoverable');
    check(await f.evaluate(() => !document.getElementById('kaSignupDiscoverable').checked && !document.getElementById('kaSignupTerms').checked), '"Uzmanlarda Görün" hukuki onaydan bağımsız');
    await submitPane(f, 'signup'); await settle(page, 200);
    check((await f.textContent('#kaLoginDialog [data-auth-pane="signup"] .k-form-error')).includes('onaylamalısın') && !auth.calls.some(c => c.path === '/signup'), 'onay yoksa kayıt gönderilmez');
    // Kayıt (e-posta doğrulaması kapalı → hemen oturum) → iki kabul satırı
    await fillSignup(f, { terms: true });
    await submitPane(f, 'signup');
    check(await until(() => paneOf(f).then(p => p === 'onboard')), 'kayıt başarılı, onboarding açıldı');
    check(await until(() => legalRows().length === 1), 'oturum açılınca legal_acceptances yazıldı');
    const body = legalRows()[0]?.body || [];
    check(Array.isArray(body) && JSON.stringify(body) === JSON.stringify([{ document_type: 'terms_of_use', document_version: '2026-09-30', source: 'web_signup' }, { document_type: 'kvkk_notice_informed', document_version: '2026-09-30', source: 'web_signup' }]), `iki satır: Kullanım Koşulları kabulü + KVKK bilgilendirmesi (user_id ve zaman istemciden gönderilmez) ${JSON.stringify(body)}`);
    check(await page.evaluate(k => localStorage.getItem(k), PENDING) === null, 'bekleyen kayıt temizlendi');
    const su = auth.calls.find(c => c.path === '/signup');
    check(su && JSON.stringify(Object.keys(su.body.data || {})) === '["full_name"]', 'signUp isteği değişmedi (yalnız full_name)');
    await ctx.close();
  }
  // ---------------- 3) Kabul kaydı yazılamazsa: kayıt yine başarılı, sonraki oturumda tekrar ----------------
  {
    const { ctx, page, f } = await boot(browser, vp);
    let fail = true;
    await ctx.route('https://twaptpofhbnnfciowoig.supabase.co/rest/v1/legal_acceptances*', r => {
      if (r.request().method() === 'OPTIONS') return r.fallback();
      if (fail) return r.fulfill({ status: 500, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify({ code: 'XX000', message: 'boom' }) });
      return r.fallback();
    });
    await navLogin(page); await settle(page, 300); await go(f, 'signup');
    await fillSignup(f, { email: 'hata@ornek.com' }); await submitPane(f, 'signup');
    check(await until(() => paneOf(f).then(p => p === 'onboard')) && await acct(page) === 'user', 'kabul kaydı hata verse de hesap oluşturma ve oturum etkilenmedi');
    check(await page.evaluate(k => !!localStorage.getItem(k), PENDING) && legalRows().length === 0, 'kayıt bekletildi (kaybolmadı)');
    fail = false;
    await page.reload(); await settle(page, 1200);
    check(await until(() => legalRows().length === 1) && await until(() => page.evaluate(k => localStorage.getItem(k) === null, PENDING)), 'sonraki oturumda kayıt yazıldı ve bekleyen temizlendi');
    await ctx.close();
  }
  // ---------------- 4) E-posta doğrulaması açık: kayıt doğrulamadan sonra yazılır ----------------
  {
    const { ctx, page, f } = await boot(browser, vp, { confirm: true });
    await navLogin(page); await settle(page, 300); await go(f, 'signup');
    await fillSignup(f, { email: 'dogrula@ornek.com' }); await submitPane(f, 'signup');
    check(await until(() => paneOf(f).then(p => p === 'verify')) && legalRows().length === 0, 'doğrulama bekleniyor: henüz kabul kaydı yazılmadı (oturum yok)');
    await f.fill('#kaVerifyCode', '1234 5678'); await submitPane(f, 'verify');
    check(await until(() => legalRows().length === 1), 'kod doğrulanıp oturum açılınca kabul kaydı yazıldı');
    await ctx.close();
  }
  // ---------------- 5) Başka kullanıcının oturumu bekleyen kaydı kullanmaz ----------------
  {
    const { ctx, page } = await boot(browser, vp, { loggedIn: true, storage: { [PENDING]: JSON.stringify({ email: 'baskasi@ornek.com', uid: null, version: '2026-09-30', t: Date.now() }) } });
    await settle(page, 800);
    check(legalRows().length === 0 && await page.evaluate(k => !!localStorage.getItem(k), PENDING), 'farklı hesabın oturumunda bekleyen kayıt yazılmaz');
    await ctx.close();
  }
  // ---------------- 6) Post ve Hizmet formları: Topluluk Kuralları notu ----------------
  {
    // app-shell testleriyle aynı kurulum (harness auth: oturum sunucuda doğrulanır)
    writes.length = 0;
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    await setup(ctx, true);
    const page = await ctx.newPage();
    await page.goto(`${SITE}/`); await settle(page, 900);
    const f = frameOf(page);
    await f.evaluate(() => document.querySelector('[data-view="works"] [data-composer]').click());
    await f.waitForSelector('#kaPostDialog[open]');
    const note = await f.evaluate(() => { const p = document.querySelector('#kaPostDialog .k-legal-note'); const a = p?.querySelector('a'); return p && { text: p.textContent.trim(), href: a.getAttribute('href'), target: a.target }; });
    check(note?.text === "Paylaşımlar Kırmızı İSG Topluluk Kuralları'na tabidir." && note.href === `${SITE}/yasal#topluluk-kurallari` && note.target === '_blank', `Post formu notu ve bağlantısı ${JSON.stringify(note)}`);
    await f.fill('#kaPostContent', 'Taslak metin');
    const [popup] = await Promise.all([ctx.waitForEvent('page', { timeout: 3000 }).catch(() => null), f.click('#kaPostDialog .k-legal-note a')]);
    if (popup) await popup.close();
    await settle(page, 300);
    check(await f.evaluate(() => document.getElementById('kaPostDialog').open) && await f.inputValue('#kaPostContent') === 'Taslak metin' && !writes.some(w => w.table === 'professional_posts'), 'bağlantı Post formunu göndermez / kapatmaz, taslak korunur');
    await f.click('#kaPostDialog [data-close] >> nth=0'); await settle(page, 300);
    await page.evaluate(() => document.getElementById('kisg-pro-nav').shadowRoot.querySelector('[data-view-link="services"]').click()); await settle(page, 800);
    await f.evaluate(() => document.querySelector('[data-view="services"] [data-publish]').click());
    await f.waitForSelector('#kaServiceDialog[open]');
    const snote = await f.evaluate(() => { const a = document.querySelector('#kaServiceDialog .k-legal-note a'); return a && a.getAttribute('href'); });
    check(snote === `${SITE}/yasal#topluluk-kurallari`, 'Hizmet formunda aynı Topluluk Kuralları notu');
    const [p2] = await Promise.all([ctx.waitForEvent('page', { timeout: 3000 }).catch(() => null), f.click('#kaServiceDialog .k-legal-note a')]);
    if (p2) await p2.close();
    await settle(page, 300);
    check(await f.evaluate(() => document.getElementById('kaServiceDialog').open) && !writes.some(w => w.table === 'professional_services'), 'bağlantı Hizmet formunu göndermez');
    await ctx.close();
  }
} finally {
  await browser.close();
}
