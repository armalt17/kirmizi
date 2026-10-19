// Küçük Düzeltmeler Paketi — hedefli tarayıcı testi: Ad Soyad normalizasyonu (kayıt + profil düzenleme),
// composer placeholder dönüşümü, Post alt microcopy'si, Hesap & Gizlilik > Yasal & Politikalar ve alt yasal satır.
import { chromium, fs, ROOT, OUT, U1, writes, check, LAUNCH, setup, frameOf, resetDb } from '../helpers/harness.mjs';
import { boot, navLogin, go, submitPane, fillSignup, settle } from '../helpers/auth.mjs';
import path from 'node:path';

const SRC = fs.readFileSync(path.join(ROOT, 'kisg-professional-app.html'), 'utf8');
const SITE = 'https://isgcalisanplatformu.com', Y = `${SITE}/yasal`;
const LEGAL = [['KVKK Aydınlatma Metni', `${Y}#kvkk`], ['Gizlilik Politikası', `${Y}#gizlilik`], ['Kullanım Koşulları', `${Y}#kullanim-kosullari`], ['Topluluk Kuralları', `${Y}#topluluk-kurallari`]];
const until = async (fn, ms = 5000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await new Promise(r => setTimeout(r, 50)); } return false; };
const NAMES = [
  ['İBRAHİM ÖZTÜRK', 'İbrahim Öztürk'], ['ışık şen', 'Işık Şen'], ['AHMET YILMAZ', 'Ahmet Yılmaz'], ['irem ılgaz', 'İrem Ilgaz'],
  ['GÜLŞEN IŞIK', 'Gülşen Işık'], ['  ayşe-nur   çiftçi ', 'Ayşe-Nur Çiftçi'], ['Zeynep Kaya', 'Zeynep Kaya'],
  ['McAllister Doğan', 'McAllister Doğan'], ['ahmet Yılmaz', 'ahmet Yılmaz'], ['', '']
];

// ---------------- statik: tek ortak yardımcı, yasal hedefler /yasal'daki gerçek bölüm kimlikleri ----------------
const YASAL = fs.readFileSync(path.join(ROOT, 'kisg-yasal.html'), 'utf8');
check(LEGAL.every(([, u]) => YASAL.includes(`id="${u.split('#')[1]}"`)), 'yasal bağlantı hedefleri /yasal sayfasındaki bölüm kimlikleriyle eşleşiyor');
check((SRC.match(/const personName = /g) || []).length === 1 && (SRC.match(/personName\(/g) || []).length === 2, 'Ad Soyad normalizasyonu tek yardımcıda (kayıt + profil düzenleme)');
const PERSON_NAME = SRC.match(/const personName = (v => \{[\s\S]*?\n\});/)[1];

const browser = await chromium.launch(LAUNCH);
try {
  // ---------------- 1) Kayıt: büyük harf → düzgün ad signUp'a gider ----------------
  const vp = { name: 'desktop', width: 1366, height: 900 };
  {
    const { ctx, page, f, auth } = await boot(browser, vp);
    // Uygulamadaki yardımcı (kaynaktan birebir) gerçek Chromium'un tr-TR yerel ayarıyla çalıştırılır.
    const got = await f.evaluate(([src, cases]) => { const clean = v => (typeof v === 'string' ? v.trim() : ''); const fn = new Function('clean', `return (${src});`)(clean); return cases.map(([a]) => fn(a)); }, [PERSON_NAME, NAMES]);
    check(NAMES.every(([, b], i) => got[i] === b), `personName tr-TR: ${JSON.stringify(got)}`);
    await navLogin(page); await settle(page, 300); await go(f, 'signup');
    await fillSignup(f, { name: 'İBRAHİM ÖZTÜRK', email: 'ibrahim@ornek.com' }); await submitPane(f, 'signup');
    check(await until(() => auth.calls.some(c => c.path === '/signup')), 'kayıt isteği gönderildi');
    const su = auth.calls.find(c => c.path === '/signup');
    check(su?.body?.data?.full_name === 'İbrahim Öztürk', `kayıt: "İBRAHİM ÖZTÜRK" → "${su?.body?.data?.full_name}"`);
    await ctx.close();
  }
  {
    const { ctx, page, f, auth } = await boot(browser, vp);
    await navLogin(page); await settle(page, 300); await go(f, 'signup');
    await fillSignup(f, { name: 'ışık şen', email: 'isik@ornek.com' }); await submitPane(f, 'signup');
    await until(() => auth.calls.some(c => c.path === '/signup'));
    const n = auth.calls.find(c => c.path === '/signup')?.body?.data?.full_name;
    check(n === 'Işık Şen', `kayıt: "ışık şen" → "${n}"`);
    await ctx.close();
  }

  for (const vp of [{ name: 'desktop', width: 1366, height: 900 }, { name: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true }]) {
    const N = vp.name, opts = { viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch };
    resetDb();
    const ctx = await browser.newContext(opts); await setup(ctx, true);
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(String(e)));

    // ---------------- 2) Akış: placeholder dönüşümü + Post microcopy ----------------
    await page.goto(`${SITE}/`); await settle(page, 800);
    let f = frameOf(page); await f.waitForSelector('[data-view="works"] [data-post-id]');
    const PROMPTS = JSON.parse(SRC.match(/const PROMPTS = (\[[^\]]+\]);/)[1].replace(/'/g, '"'));
    check(PROMPTS.length === 6 && !PROMPTS.some(p => /Verdiğin eğitimden|Ne düşünüyorsun/.test(p)), `${N}: 6 yeni placeholder ${JSON.stringify(PROMPTS)}`);
    if (N === 'desktop') {
      const t0 = await f.textContent('.kw-composer-desktop');
      check(PROMPTS.includes(t0), `${N}: placeholder listeden: "${t0}"`);
      const changed = await until(async () => { const t = await f.textContent('.kw-composer-desktop'); return t !== t0 && PROMPTS.includes(t); }, 9000);
      check(changed, `${N}: placeholder dönüşümü çalışıyor (→ "${await f.textContent('.kw-composer-desktop')}")`);
      const fit = await f.evaluate(() => { const s = document.querySelector('.kw-composer-desktop'); return s.scrollWidth <= s.clientWidth + 1; });
      check(fit, `${N}: placeholder kesilmeden sığıyor`);
    }
    await f.click('[data-view="works"] .kw-composer-main'); await f.waitForSelector('#kaPostDialog[open]');
    const hint = (await f.textContent('#kaPostDialog .k-hint')).trim();
    check(hint === 'Sahadan bir uygulama, bulgu ya da ders; kısa bir not da yeterli.' && await f.isVisible('#kaPostDialog .k-hint'), `${N}: Post microcopy: "${hint}"`);
    check((await f.getAttribute('#kaPostContent', 'placeholder')) === 'Bugün sahada ne yaptın, ne gördün, ne öğrendin?', `${N}: Post metin alanı placeholder'ı korunuyor`);
    await f.click('#kaPostDialog [data-close]'); await settle(page, 300);

    // ---------------- 3) Alt yasal satır ----------------
    const bar = await f.evaluate(() => {
      const b = document.querySelector('#kisgApp > .ka-legalbar'), r = b.getBoundingClientRect(), main = document.querySelector('.ka-main').getBoundingClientRect();
      return { text: [...b.children].map(c => c.textContent.trim()).join(' · '), sep: getComputedStyle(b.children[1], '::before').content, h: Math.round(r.height), below: r.top >= main.bottom - 1,
        links: [...b.querySelectorAll('a')].map(a => [a.textContent, a.href, a.target]),
        minH: Math.min(...[...b.querySelectorAll('a,button')].map(a => a.getBoundingClientRect().height)),
        over: [...b.children].some(c => c.getBoundingClientRect().right > document.documentElement.clientWidth + 1),
        sw: document.documentElement.scrollWidth - document.documentElement.clientWidth, fs: parseFloat(getComputedStyle(b).fontSize) };
    });
    check(bar.sep === (N === 'mobile' ? 'none' : '"·"') && bar.text === '© Kırmızı İSG · Tüm hakları saklıdır · Gizlilik Politikası · KVKK Aydınlatma Metni · Kullanım Koşulları · Topluluk Kuralları · Destek', `${N}: alt satır içeriği "${bar.text}"`);
    const want = [LEGAL[1], LEGAL[0], LEGAL[2], LEGAL[3]].map(([t, u]) => [t, u, '_top']);
    check(JSON.stringify(bar.links) === JSON.stringify(want), `${N}: alt satır bağlantıları /yasal bölümlerine ${JSON.stringify(bar.links)}`);
    check(bar.below && bar.fs <= 13 && bar.h <= (N === 'mobile' ? 180 : 70), `${N}: küçük ve içeriğin altında (yükseklik ${bar.h}px, ${bar.fs}px)`);
    check(bar.minH >= 32 && !bar.over && bar.sw <= 0, `${N}: tıklama alanı ≥32px (${bar.minH}), taşma yok (${bar.sw})`);
    await f.evaluate(() => document.querySelector('#kisgApp > .ka-legalbar').scrollIntoView({ block: 'center' }));
    await page.evaluate(() => { const fr = document.querySelector('iframe'); window.scrollTo(0, fr.getBoundingClientRect().top + window.scrollY + fr.contentDocument.querySelector('.ka-legalbar').getBoundingClientRect().top - 300); });
    await settle(page, 300);
    await page.screenshot({ path: path.join(OUT, `small-fixes-footer-${N}.png`) });
    await f.click('#kisgApp > .ka-legalbar [data-action="support"]');
    check(await until(() => f.evaluate(() => document.getElementById('kaSupportDialog').open)), `${N}: "Destek" mevcut Destek & Geri Bildirim formunu açar`);
    await f.click('#kaSupportDialog [data-close]'); await settle(page, 300);
    await Promise.all([page.waitForURL(`${Y}#gizlilik`, { timeout: 5000 }).catch(() => {}), f.click('#kisgApp > .ka-legalbar a[data-legal-link="privacy"]')]);
    check(page.url() === `${Y}#gizlilik`, `${N}: Gizlilik Politikası tıklaması üst sayfayı /yasal#gizlilik'e götürür (${page.url()})`);

    // ---------------- 4) Hesap & Gizlilik → Yasal & Politikalar ----------------
    await page.goto(`${SITE}/hesaplar-ve-gizlilik`); await settle(page, 1000);
    f = frameOf(page); await f.waitForSelector('[data-view="account"] [data-account-main]:not([hidden])');
    const kg = await f.evaluate(() => {
      const n = document.querySelector('[data-view="account"] .kg-legal'), h = n.querySelector('h2'), g = document.querySelector('.kg-group h2');
      return { title: h.textContent, links: [...n.querySelectorAll('a')].map(a => [a.textContent, a.href]), visible: n.getBoundingClientRect().height > 0,
        last: n === n.parentElement.lastElementChild, dim: getComputedStyle(h).color !== getComputedStyle(g).color && !n.querySelector('.k-btn') };
    });
    check(kg.title === 'Yasal & Politikalar' && kg.visible && kg.last, `${N}: Hesap & Gizlilik'te "Yasal & Politikalar" en altta`);
    check(JSON.stringify(kg.links) === JSON.stringify(LEGAL), `${N}: dört bağlantı mevcut /yasal bölümlerine ${JSON.stringify(kg.links)}`);
    check(kg.dim, `${N}: bölüm ana hesap aksiyonlarından daha sade (soluk başlık, buton yok)`);
    const sw = await f.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(sw <= 0, `${N}: Hesap & Gizlilik yatay taşma yok (${sw})`);
    await f.evaluate(() => document.querySelector('.kg-legal').scrollIntoView({ block: 'center' }));
    await page.screenshot({ path: path.join(OUT, `small-fixes-account-${N}.png`), fullPage: true });
    for (const [t, u] of LEGAL) {
      await page.goto(`${SITE}/hesaplar-ve-gizlilik`); await settle(page, 800);
      f = frameOf(page); await f.waitForSelector('[data-view="account"] [data-account-main]:not([hidden])');
      await Promise.all([page.waitForURL(u, { timeout: 5000 }).catch(() => {}), f.click(`.kg-legal a:text-is("${t}")`)]);
      check(page.url() === u, `${N}: "${t}" → ${page.url()}`);
    }

    // ---------------- 5) Profil düzenleme: aynı normalizasyon ----------------
    await page.goto(`${SITE}/profil?id=${U1}`); await settle(page, 1000);
    f = frameOf(page); await f.waitForSelector('.kp-card [data-profile-action="edit"]');
    for (const [raw, want] of [['ışık şen', 'Işık Şen'], ['AHMET YILMAZ', 'Ahmet Yılmaz'], ['Ahmet Yılmaz', null]]) {
      await f.evaluate(() => document.querySelector('.kp-card [data-profile-action="edit"]').click()); await f.waitForSelector('#kaProfileDialog[open]');
      writes.length = 0;
      await f.fill('#kaPe_full_name', raw); await f.click('#kaPeSave');
      await f.waitForSelector('#kaProfileDialog:not([open])', { state: 'attached' });
      const patch = writes.find(w => w.table === 'profiles');
      if (want) check(patch?.body?.full_name === want && (await f.textContent('#kpName')) === want, `${N} profil düzenle: "${raw}" → "${patch?.body?.full_name}"`);
      else check(!patch, `${N} profil düzenle: değişmeyen ad için yazma yok`);
    }
    check(errs.length === 0, `${N}: sayfa hatası yok ${errs.join(' ')}`);
    await ctx.close();
  }

  // ---------------- 6) Misafir: Destek önce girişi açar ----------------
  {
    resetDb();
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await setup(ctx, false);
    const page = await ctx.newPage(); await page.goto(`${SITE}/uzmanlar`); await settle(page, 1200);
    const f = frameOf(page);
    await f.click('#kisgApp > .ka-legalbar [data-action="support"]');
    check(await until(() => f.evaluate(() => document.getElementById('kaLoginDialog').open)), 'misafir: alt satırdaki "Destek" giriş penceresini açar (mevcut davranış)');
    await ctx.close();
  }
} finally {
  await browser.close();
}
