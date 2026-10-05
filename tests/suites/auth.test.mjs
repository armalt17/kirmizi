// Kaynak: geçici /tmp/claude-0/pkg/auth.mjs — v4.12.0 güvenlik ağı olarak kalıcılaştırıldı.
import { chromium, fs, ROOT, APP, NM, OUT, U1, U2, now, iso, db, writes, uploads, IMG, DB0, resetDb, cursorOr, filterRows, seq, orderRows, withEmbeds, handleRest, libs, HOSTINGER_BASE_CSS, hostPage, errors, realtimeMock, postSeq, makePost, setup, frameOf, check, DEFAULT_CHROMIUM, LAUNCH } from '../helpers/harness.mjs';
import { b64, tokenFor, uidOf, uidSeq, authMock, boot, acct, paneOf, errOf, navLogin, go, submitPane, fillSignup, visibleView, navClick, settle, flag, noProfileInsert } from '../helpers/auth.mjs';

const browser = await chromium.launch(LAUNCH);
const VPS = [{ name: 'desktop', width: 1366, height: 900 }, { name: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true }];
for (const vp of VPS.slice(0, +(process.env.NVP || 2))) {
  const N = vp.name;
  // --- 1. Yeni kayıt (doğrulama kapalı) + 2 adımlı onboarding + Akış ---
  {
    const { ctx, page, f, auth, rest } = await boot(browser, vp, { path: '/uzmanlar' });
    await f.waitForSelector('[data-view="experts"] .ke-card');
    check(await acct(page) === 'guest', `${N} kayıt: misafir başlangıç`);
    await navLogin(page); await settle(page, 300);
    check(await paneOf(f) === 'login' && await f.isVisible('#kaLoginEmail'), `${N} kayıt: tek pencere Giriş sekmesiyle açıldı`);
    const geo = await f.evaluate(() => { const r = document.getElementById('kaLoginDialog').getBoundingClientRect(); return { place: document.getElementById('kaLoginDialog').dataset.place, w: Math.round(r.width) }; });
    const pgeo = await page.evaluate(() => { const fr = document.querySelector('iframe').getBoundingClientRect(); return { top: fr.top, vh: innerHeight }; });
    const drect = await f.evaluate(() => { const r = document.getElementById('kaLoginDialog').getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; });
    const onTop = pgeo.top + drect.top, onBottom = pgeo.top + drect.bottom;
    check(N === 'mobile' ? geo.w === vp.width && Math.abs(onBottom - pgeo.vh) < 3 : geo.w <= 440 && onTop > 60 && onBottom < pgeo.vh, `${N} kayıt: ${N === 'mobile' ? 'alt sayfa (bottom sheet)' : 'ortalanmış modal'} ${JSON.stringify({ w: geo.w, top: Math.round(onTop), bottom: Math.round(onBottom), vh: pgeo.vh })}`);
    await go(f, 'signup'); await settle(page, 200);
    check(await paneOf(f) === 'signup' && await f.isVisible('#kaSignupName') && await f.locator('#kaSignupDialog, #kaLoginDialog input[type="tel"]').count() === 0, `${N} kayıt: Kayıt Ol sekmesi, telefon alanı yok`);
    await page.screenshot({ path: `${OUT}/auth-signup-${N}.png` });
    // doğrulama hataları
    const cases = [
      [{ name: 'Zeynep' }, 'Adını ve soyadını yaz.'],
      [{ email: 'zeynep@' }, 'Geçerli bir e-posta adresi gir.'],
      [{ pw: 'kisa1', pw2: 'kisa1' }, 'Şifre en az 8 karakter olmalı.'],
      [{ pw2: 'Baska12345' }, 'Şifreler birbiriyle eşleşmiyor.'],
      [{ terms: false }, 'onaylamalısın']
    ];
    for (const [c, msg] of cases) { await fillSignup(f, c); await submitPane(f, 'signup'); await settle(page, 150); const m = await errOf(f, 'signup'); if (!m.includes(msg)) check(false, `${N} kayıt doğrulama: ${JSON.stringify(c)} → "${m}"`); }
    check(!auth.calls.some(c => c.path === '/signup'), `${N} kayıt: geçersiz formlar Supabase'e gitmedi (5 kural)`);
    await fillSignup(f); await submitPane(f, 'signup'); await settle(page, 1200);
    const su = auth.calls.find(c => c.path === '/signup');
    check(su && su.body.email === 'zeynep@ornek.com' && su.body.data?.full_name === 'Zeynep Kaya' && !('phone' in su.body) && !su.url.includes('redirect_to'), `${N} kayıt: signUp e-posta+şifre+full_name (telefon/redirect yok) ${JSON.stringify(su?.body.data)}`);
    check(auth.triggered === 1 && noProfileInsert(rest), `${N} kayıt: profil satırını trigger oluşturdu, web insert/upsert yapmadı`);
    check(await paneOf(f) === 'onboard' && await acct(page) === 'user', `${N} onboarding: Adım 1 açıldı, oturum açık`);
    check(await f.locator('#kaObCity option').count() === 82 && await f.locator('#kaObExp option').count() === 7 && await f.locator('#kaObCert option').count() === 6, `${N} onboarding: 81 il, 6 deneyim, 5 statü seçeneği`);
    await page.screenshot({ path: `${OUT}/auth-onboard-${N}.png` });
    await submitPane(f, 'onboard'); await settle(page, 150);
    check((await errOf(f, 'onboard')).includes('Meslek'), `${N} onboarding: meslek zorunlu`);
    await f.fill('#kaObProfession', 'İş Güvenliği Uzmanı'); await submitPane(f, 'onboard'); await settle(page, 150);
    check((await errOf(f, 'onboard')).includes('Şehrini'), `${N} onboarding: şehir zorunlu`);
    await f.selectOption('#kaObCity', 'Ankara'); await f.selectOption('#kaObCert', 'B'); await f.selectOption('#kaObExp', '3-5 yıl');
    writes.length = 0;
    await submitPane(f, 'onboard'); await settle(page, 900);
    const patch = writes.find(w => w.table === 'profiles' && w.body);
    check(patch && JSON.stringify(Object.keys(patch.body).sort()) === JSON.stringify(['certificate_class', 'city', 'experience_range', 'is_discoverable', 'profession']) && patch.body.is_discoverable === true && patch.q.includes('id=eq.cccccccc'), `${N} onboarding: 4 alan + is_discoverable (varsayılan açık) PATCH (title/specialties/job_role/full_name yok) ${JSON.stringify(patch?.body)}`);
    check(await paneOf(f) === 'photo', `${N} onboarding: Adım 2 fotoğraf`);
    await page.screenshot({ path: `${OUT}/auth-photo-${N}.png` });
    // fotoğraf ekle → avatar penceresi → kapat → Adım 2'ye döner
    await f.click('[data-auth-photo]'); await settle(page, 500);
    check(await f.evaluate(() => document.getElementById('kaAvatarDialog').open) && !(await f.evaluate(() => document.getElementById('kaLoginDialog').open)), `${N} onboarding: Fotoğraf ekle → avatar penceresi`);
    await f.click('#kaAvatarDialog [data-close]'); await settle(page, 500);
    check(await paneOf(f) === 'photo' && await flag(page) !== null, `${N} onboarding: avatar penceresi kapanınca Adım 2'ye dönüldü`);
    await f.click('[data-auth-finish]'); await settle(page, 700);
    check(page.url() === 'https://isgcalisanplatformu.com/' && await visibleView(f) === 'works' && await paneOf(f) === '' && await flag(page) === null, `${N} onboarding: Akış'a Git → / Akış, işaret temizlendi (${page.url()})`);
    check(await page.evaluate(() => document.getElementById('kisg-pro-nav').shadowRoot.querySelector('[data-me-name]').textContent) === 'Zeynep', `${N} onboarding: nav'da ad (trigger full_name)`);
    await page.reload(); await settle(page, 1200);
    const g = frameOf(page);
    check(await acct(page) === 'user' && await paneOf(g) === '', `${N} kayıt: refresh → oturum geri yüklendi, onboarding tekrar açılmadı`);
    await ctx.close();
  }
  // --- 2. Kayıt (e-posta doğrulaması açık): kod → onboarding; duplicate e-posta ---
  {
    const { ctx, page, f, auth } = await boot(browser, vp, { confirm: true });
    await navLogin(page); await settle(page, 300); await go(f, 'signup');
    await fillSignup(f, { email: 'a@b.c' }); await submitPane(f, 'signup'); await settle(page, 800);
    check((await errOf(f, 'signup')).includes('zaten bir hesap') && await f.isVisible('[data-auth-exists]') && await paneOf(f) === 'signup', `${N} duplicate (doğrulama açık, sahte kullanıcı): mesaj + Giriş/Şifremi unuttum (${await errOf(f, 'signup')} | ${await paneOf(f)} | ${JSON.stringify(auth.calls.slice(-1))})`);
    check(auth.triggered === 0 && await flag(page) === null, `${N} duplicate: yeni profil/işaret yok`);
    await fillSignup(f, { email: 'Yeni.Kisi@Ornek.com', name: 'Yeni  Kişi' }); await submitPane(f, 'signup'); await settle(page, 900);
    check(await paneOf(f) === 'verify' && (await f.textContent('[data-auth-lead]')).includes('yeni.kisi@ornek.com') && await acct(page) === 'guest', `${N} doğrulama: kod adımı, e-posta küçük harf, henüz oturum yok`);
    check(await f.isDisabled('#kaVerifyForm [data-auth-resend]') && /\(\d+ sn\)/.test(await f.textContent('#kaVerifyForm [data-auth-resend]')), `${N} doğrulama: tekrar gönder 60 sn bekletiliyor`);
    await f.fill('#kaVerifyCode', '1111 1111'); await submitPane(f, 'verify'); await settle(page, 700);
    check((await errOf(f, 'verify')).includes('Kod hatalı'), `${N} doğrulama: yanlış kod mesajı`);
    await f.fill('#kaVerifyCode', '1234 5678'); await submitPane(f, 'verify'); await settle(page, 1000);
    const v = auth.calls.find(c => c.path === '/verify' && c.body.token === '12345678');
    check(v?.body.type === 'signup' && v.body.email === 'yeni.kisi@ornek.com' && await paneOf(f) === 'onboard' && await acct(page) === 'user', `${N} doğrulama: verifyOtp(signup) → oturum → onboarding`);
    // pencereyi kapat → onboarding atlandı, tekrar zorlanmaz
    await page.keyboard.press('Escape'); await settle(page, 400);
    check(await paneOf(f) === '' && await flag(page) === null, `${N} onboarding: kapatınca atlandı, işaret silindi`);
    await page.reload(); await settle(page, 1200);
    check(await paneOf(frameOf(page)) === '' && await acct(page) === 'user', `${N} onboarding: atlandıktan sonra refresh'te zorlanmıyor`);
    await ctx.close();
  }
  // --- 3. Doğrulanmamış hesapla giriş → kodu yeniden gönder → doğrula; bağlantıyla doğrulayıp giriş → onboarding ---
  {
    const { ctx, page, f, auth } = await boot(browser, vp, { confirm: true });
    await navLogin(page); await settle(page, 300); await go(f, 'signup');
    await fillSignup(f, { email: 'bekleyen@ornek.com', name: 'Bekleyen Kişi' }); await submitPane(f, 'signup'); await settle(page, 800);
    await go(f, 'login'); await settle(page, 200);
    check(await f.inputValue('#kaLoginEmail') === 'bekleyen@ornek.com', `${N} doğrulanmamış: giriş e-postası dolu`);
    await f.fill('#kaLoginPassword', 'GucluSifre1'); await submitPane(f, 'login'); await settle(page, 800);
    check((await errOf(f, 'login')).includes('doğrulayın') && await f.isVisible('[data-auth-confirm]'), `${N} doğrulanmamış giriş: mesaj + "E-postamı şimdi doğrula"`);
    await f.click('[data-auth-confirm]'); await settle(page, 800);
    const rs = auth.calls.find(c => c.path === '/resend');
    check(rs?.body.type === 'signup' && rs.body.email === 'bekleyen@ornek.com' && await paneOf(f) === 'verify', `${N} doğrulanmamış: resend(signup) → kod adımı`);
    // kullanıcı e-postadaki bağlantıyla doğruladı (sunucu tarafı), sonra giriş yapıyor
    auth.users.get('bekleyen@ornek.com').confirmed = true;
    await go(f, 'login'); await f.fill('#kaLoginPassword', 'GucluSifre1'); await submitPane(f, 'login'); await settle(page, 1200);
    check(await paneOf(f) === 'onboard' && await acct(page) === 'user', `${N} bağlantıyla doğrulayıp giriş: bu tarayıcıdaki yeni kullanıcıya onboarding`);
    await ctx.close();
  }
  // --- 4. Mevcut kullanıcı: giriş/çıkış, onboarding yok, route korunur, işlem devam eder ---
  {
    const { ctx, page, f, auth, rest } = await boot(browser, vp, { path: `/profil?id=${U2}` });
    db.profiles.find(p => p.id === U1).profession = null; // profil eksik olsa bile onboarding'e zorlanmaz
    await f.waitForSelector('#kpName');
    await navLogin(page); await settle(page, 300);
    await f.fill('#kaLoginEmail', 'a@b.c'); await f.fill('#kaLoginPassword', 'yanlis'); await submitPane(f, 'login'); await settle(page, 700);
    check((await errOf(f, 'login')).includes('E-posta ve şifrenizi kontrol edin'), `${N} mevcut: yanlış şifre mesajı`);
    auth.fail['/token'] = 'abort';
    await f.fill('#kaLoginPassword', 'dogru-sifre'); await submitPane(f, 'login'); await settle(page, 900);
    check((await errOf(f, 'login')).includes('Bağlantı kurulamadı') && await acct(page) === 'guest', `${N} mevcut: ağ hatası mesajı (kimlik hatası sanılmaz)`);
    delete auth.fail['/token'];
    await f.fill('#kaLoginPassword', 'dogru-sifre'); await submitPane(f, 'login'); await settle(page, 1000);
    check(await acct(page) === 'user' && await paneOf(f) === '' && page.url().endsWith(`/profil?id=${U2}`) && await visibleView(f) === 'profile', `${N} mevcut: giriş → onboarding yok, aynı profil sayfasında kalındı`);
    check(noProfileInsert(rest) && !writes.some(w => w.table === 'profiles'), `${N} mevcut: profiles'a hiçbir yazma yok`);
    // çıkış: route korunur
    await page.evaluate(() => { const n = document.getElementById('kisg-pro-nav').shadowRoot; n.querySelector('[data-popover-trigger]').click(); n.querySelector('[data-action="signout"]').click(); }); await settle(page, 800);
    check(await acct(page) === 'guest' && page.url().endsWith(`/profil?id=${U2}`) && await visibleView(f) === 'profile', `${N} mevcut: çıkış → misafir, aynı sayfa`);
    check(await page.evaluate(() => !localStorage.getItem('sb-twaptpofhbnnfciowoig-auth-token') && !localStorage.getItem('kisg:me:v1')), `${N} mevcut: çıkışta oturum ve "ben" önbelleği temizlendi`);
    // auth gerektiren işlem: beğeni → giriş → işlem devam eder
    await navClick(page, 'works'); await f.waitForSelector('[data-view="works"] [data-post-id]'); await settle(page, 300);
    const pid = await f.evaluate(([u]) => [...document.querySelectorAll('[data-view="works"] [data-post-id]')].find(c => !c.querySelector(`a[href*="${u}"]`))?.dataset.postId, [U1]);
    await f.evaluate(id => document.querySelector(`[data-view="works"] [data-post-id="${id}"] [data-post-action="like"]`).click(), pid); await settle(page, 400);
    check(await paneOf(f) === 'login', `${N} auth aksiyonu: misafir beğeni → Giriş penceresi`);
    await go(f, 'signup'); await settle(page, 100); await go(f, 'login'); await settle(page, 100);
    writes.length = 0;
    await f.fill('#kaLoginEmail', 'a@b.c'); await f.fill('#kaLoginPassword', 'dogru-sifre'); await submitPane(f, 'login'); await settle(page, 1200);
    check(writes.some(w => w.table === 'professional_post_likes' && w.body?.post_id === pid && w.body?.user_id === U1) && page.url() === 'https://isgcalisanplatformu.com/', `${N} auth aksiyonu: sekme değişse de girişten sonra beğeni tamamlandı, route korundu`);
    await ctx.close();
  }
  // --- 5. Şifremi unuttum: e-posta → 8 haneli kod → yeni şifre ---
  {
    const { ctx, page, f, auth } = await boot(browser, vp, { path: '/hizmetler' });
    await navLogin(page); await settle(page, 300);
    await f.fill('#kaLoginEmail', 'A@B.c'); await go(f, 'forgot'); await settle(page, 200);
    check(await paneOf(f) === 'forgot' && await f.inputValue('#kaForgotEmail') === 'a@b.c', `${N} reset: Şifremi unuttum, e-posta taşındı`);
    await f.fill('#kaForgotEmail', 'yok'); await submitPane(f, 'forgot'); await settle(page, 150);
    check((await errOf(f, 'forgot')).includes('Geçerli'), `${N} reset: geçersiz e-posta`);
    auth.fail['/recover'] = '429';
    await f.fill('#kaForgotEmail', 'a@b.c'); await submitPane(f, 'forgot'); await settle(page, 700);
    check((await errOf(f, 'forgot')).includes('Çok fazla deneme'), `${N} reset: rate limit mesajı (${await errOf(f, 'forgot')} | ${await paneOf(f)})`);
    delete auth.fail['/recover'];
    await submitPane(f, 'forgot'); await settle(page, 800);
    const rc = auth.calls.filter(c => c.path === '/recover').pop();
    check(rc && rc.body.email === 'a@b.c' && !rc.url.includes('redirect_to') && !rc.body.code_challenge && await paneOf(f) === 'code', `${N} reset: resetPasswordForEmail (redirect/PKCE yok) → kod adımı`);
    await f.fill('#kaResetCode', '00000000'); await submitPane(f, 'code'); await settle(page, 700);
    check((await errOf(f, 'code')).includes('Kod hatalı') && await acct(page) === 'guest', `${N} reset: yanlış kod`);
    await f.fill('#kaResetCode', '12345678'); await submitPane(f, 'code'); await settle(page, 1000);
    const vr = auth.calls.find(c => c.path === '/verify' && c.body.type === 'recovery' && c.body.token === '12345678');
    check(vr && await paneOf(f) === 'newpass', `${N} reset: verifyOtp(recovery) → yeni şifre adımı`);
    await f.fill('#kaNewPassword', 'YeniSifre99'); await f.fill('#kaNewPassword2', 'YeniSifre98'); await submitPane(f, 'newpass'); await settle(page, 150);
    check((await errOf(f, 'newpass')).includes('eşleşmiyor'), `${N} reset: şifre tekrar uyuşmazlığı`);
    await f.fill('#kaNewPassword', 'dogru-sifre'); await f.fill('#kaNewPassword2', 'dogru-sifre'); await submitPane(f, 'newpass'); await settle(page, 800);
    check((await errOf(f, 'newpass')).includes('eski şifrenden farklı'), `${N} reset: aynı şifre reddi`);
    await f.fill('#kaNewPassword', 'YeniSifre99'); await f.fill('#kaNewPassword2', 'YeniSifre99'); await submitPane(f, 'newpass'); await settle(page, 1000);
    check(auth.users.get('a@b.c').password === 'YeniSifre99' && await paneOf(f) === '' && await acct(page) === 'user' && page.url().endsWith('/hizmetler'), `${N} reset: updateUser(password) → giriş yapılmış, /hizmetler korundu`);
    check(await flag(page) === null, `${N} reset: mevcut kullanıcı onboarding'e alınmadı`);
    // yeni şifreyle giriş
    await page.evaluate(() => { const n = document.getElementById('kisg-pro-nav').shadowRoot; n.querySelector('[data-popover-trigger]').click(); n.querySelector('[data-action="signout"]').click(); }); await settle(page, 700);
    await navLogin(page); await settle(page, 300); await f.fill('#kaLoginEmail', 'a@b.c'); await f.fill('#kaLoginPassword', 'YeniSifre99'); await submitPane(f, 'login'); await settle(page, 1000);
    check(await acct(page) === 'user', `${N} reset: yeni şifreyle giriş`);
    await ctx.close();
  }
  // --- 6. verified(): geçici hata oturumu düşürmez; gerçek red düşürür ---
  {
    const { ctx, page, f, auth } = await boot(browser, vp, { loggedIn: true, path: `/profil?id=${U1}` });
    await f.waitForSelector('#kpName'); await settle(page, 400);
    check(await acct(page) === 'user', `${N} verified: girişli başlangıç`);
    auth.fail['/user'] = 'abort';
    await f.evaluate(() => document.querySelector('.kp-card [data-profile-action="edit"]').click()); await settle(page, 1200);
    check(await acct(page) === 'user' && await paneOf(f) === '', `${N} verified: ağ hatasında kullanıcı çıkış yapmış görünmedi`);
    await f.evaluate(() => { const d = document.getElementById('kaProfileDialog'); if (d.open) d.close(); });
    auth.fail['/user'] = '500';
    await f.evaluate(() => document.querySelector('.kp-card [data-profile-action="edit"]').click()); await settle(page, 1200);
    check(await acct(page) === 'user', `${N} verified: 5xx hatasında oturum korundu`);
    await f.evaluate(() => { const d = document.getElementById('kaProfileDialog'); if (d.open) d.close(); });
    auth.fail['/user'] = '401';
    await f.evaluate(() => document.querySelector('.kp-card [data-profile-action="edit"]').click()); await settle(page, 1500);
    check(await acct(page) === 'guest' && await page.evaluate(() => !localStorage.getItem('sb-twaptpofhbnnfciowoig-auth-token')), `${N} verified: sunucu oturumu reddedince çıkış + yerel oturum temizlendi`);
    await ctx.close();
  }
  // --- 7. E-posta bağlantısı dönüşü: hash işlenir ve adresten silinir ---
  {
    const { ctx, page, f, auth } = await boot(browser, vp, { path: `/profil?id=${U2}#access_token=${tokenFor(U1)}&expires_in=3600&refresh_token=r-${U1}&token_type=bearer&type=signup` });
    await settle(page, 800);
    check(!page.url().includes('access_token') && page.url().endsWith(`/profil?id=${U2}`) && await acct(page) === 'user', `${N} bağlantı dönüşü: token'lar adresten silindi, oturum açıldı (${page.url()} ${await acct(page)} ${JSON.stringify(auth.calls.map(c => c.path))})`);
    check(await page.evaluate(() => !JSON.stringify(history.state || {}).includes('access_token')), `${N} bağlantı dönüşü: geçmiş durumunda token yok`);
    await page.goto(`https://isgcalisanplatformu.com/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid`); await settle(page, 1200);
    const toastTxt = await frameOf(page).evaluate(() => document.querySelector('[data-toast]')?.textContent || '');
    check(page.url() === 'https://isgcalisanplatformu.com/' && /süresi dolmuş/.test(toastTxt), `${N} bağlantı dönüşü: hata hash'i silindi + açıklama (${toastTxt})`);
    await page.goto(`https://isgcalisanplatformu.com/profil?id=${U2}#hizmetler`); await settle(page, 900);
    check(page.url().endsWith('#hizmetler') && await frameOf(page).getAttribute('[data-profile-tab="hizmetler"]', 'aria-selected') === 'true', `${N} bağlantı dönüşü: normal sekme hash'lerine dokunulmadı`);
    await ctx.close();
  }
  // --- 8. Kayıt: sunucu hataları ve doğrulama kapalıyken duplicate ---
  {
    const { ctx, page, f, auth } = await boot(browser, vp);
    await navLogin(page); await settle(page, 300); await go(f, 'signup');
    await fillSignup(f, { email: 'a@b.c' }); await submitPane(f, 'signup'); await settle(page, 800);
    check((await errOf(f, 'signup')).includes('zaten bir hesap') && await acct(page) === 'guest', `${N} duplicate (doğrulama kapalı, 422): mesaj, oturum yok`);
    auth.fail['/signup'] = '500';
    await fillSignup(f, { email: 'hata@ornek.com' }); await submitPane(f, 'signup'); await settle(page, 800);
    check((await errOf(f, 'signup')).includes('biraz sonra') && await flag(page) === null, `${N} kayıt: sunucu hatası (ör. trigger) → anlaşılır mesaj, işaret yok`);
    auth.fail['/signup'] = 'abort';
    await submitPane(f, 'signup'); await settle(page, 800);
    check((await errOf(f, 'signup')).includes('Bağlantı kurulamadı'), `${N} kayıt: ağ hatası mesajı`);
    check(await f.inputValue('#kaSignupName') === 'Zeynep Kaya' && await f.inputValue('#kaSignupEmail') === 'hata@ornek.com', `${N} kayıt: hata sonrası form verisi korunuyor`);
    await page.keyboard.press('Escape'); await settle(page, 300);
    check(await paneOf(f) === '' && await page.evaluate(() => getComputedStyle(document.body).position) !== 'fixed', `${N} pencere: Esc kapatır, scroll kilidi kalkar`);
    await ctx.close();
  }
}
// ===== v4.9.1: "Uzmanlarda Görün" =====
const expertNames = f => f.evaluate(() => [...document.querySelectorAll('[data-view="experts"] .ke-card')].map(c => c.textContent));
const hasExpert = async (f, name) => (await expertNames(f)).some(t => t.includes(name));
const discPatches = () => writes.filter(w => w.table === 'profiles' && w.body && 'is_discoverable' in w.body);
async function signupFlow(page, f, { email, name, disc, onboard = true }) {
  await navLogin(page); await settle(page, 300); await go(f, 'signup'); await settle(page, 150);
  if (!disc) await f.click('label[for="kaSignupDiscoverable"]');
  await fillSignup(f, { email, name }); await submitPane(f, 'signup'); await settle(page, 1200);
  if (!onboard) return;
  await f.fill('#kaObProfession', 'İş Güvenliği Uzmanı'); await f.selectOption('#kaObCity', 'Bursa');
  await submitPane(f, 'onboard'); await settle(page, 1000);
}
for (const vp of VPS.slice(0, +(process.env.NVP || 2))) {
  const N = vp.name;
  // A. Açık (varsayılan) kayıt, trigger varsayılanı false → true yazılır, Uzmanlar'da görünür
  {
    const { ctx, page, f, auth, rest } = await boot(browser, vp, { path: '/uzmanlar' });
    await f.waitForSelector('[data-view="experts"] .ke-card');
    await navLogin(page); await settle(page, 300); await go(f, 'signup'); await settle(page, 150);
    const ui = await f.evaluate(() => { const i = document.getElementById('kaSignupDiscoverable'), l = i.closest('label'); return { on: i.checked, role: i.getAttribute('role'), title: l.querySelector('strong').textContent, hint: l.querySelector('small').textContent, vis: l.getBoundingClientRect().height > 0 }; });
    check(ui.on && ui.role === 'switch' && ui.title === 'Uzmanlarda Görün' && ui.vis && ui.hint === 'Profiliniz Kırmızı İSG Uzmanlar bölümünde görüntülenir. Görünmek istemiyorsanız kapatabilirsiniz. Bu ayarı daha sonra profilinizden değiştirebilirsiniz.', `${N} görünür: kayıt formunda anahtar, varsayılan açık, açıklama metni birebir`);
    await page.screenshot({ path: `${OUT}/auth-disc-${N}.png` });
    await page.keyboard.press('Escape'); await settle(page, 300);
    writes.length = 0;
    await signupFlow(page, f, { email: 'acik@ornek.com', name: 'Açık Kayıt', disc: true });
    const su = auth.calls.find(c => c.path === '/signup');
    check(!('is_discoverable' in (su?.body.data || {})) && !JSON.stringify(su?.body || {}).includes('discoverable'), `${N} görünür: tercih signUp'a gönderilmedi`);
    const pt = discPatches();
    check(pt.length === 1 && pt[0].body.is_discoverable === true && pt[0].q.includes('id=eq.cccccccc') && noProfileInsert(rest), `${N} görünür (açık): onboarding UPDATE is_discoverable=true, insert/upsert yok ${JSON.stringify(pt.map(p => p.body))}`);
    check(db.profiles.find(p => p.full_name === 'Açık Kayıt')?.is_discoverable === true, `${N} görünür (açık): profil satırı true`);
    await f.click('[data-auth-finish]'); await settle(page, 600);
    await navClick(page, 'experts'); await settle(page, 1000);
    check(await hasExpert(f, 'Açık Kayıt'), `${N} görünür (açık): Uzmanlar listesinde (açık liste tazelendi)`);
    check(!(await f.isVisible('[data-view="experts"] [data-discovery]').catch(() => false)), `${N} görünür (açık): "Profilin burada görünmüyor" uyarısı yok`);
    // E. v4.25.0: görünürlük Profili Düzenle'de değil, Hesap & Gizlilik'te yönetilir (aynı profiles.is_discoverable alanı)
    const uid = db.profiles.find(p => p.full_name === 'Açık Kayıt').id;
    const ACCOUNT = 'https://isgcalisanplatformu.com/hesaplar-ve-gizlilik';
    const accountReady = g => g.waitForSelector('[data-view="account"] [data-account-main]:not([hidden])', { timeout: 8000 });
    const toggleDisc = async g => { await g.click('.kg-switch:has(#kgDiscoverable)'); await g.waitForSelector('[data-account-note="is_discoverable"][data-tone="ok"]'); };
    await page.goto(`https://isgcalisanplatformu.com/profil?id=${uid}`); await settle(page, 1200);
    let g = frameOf(page); await g.waitForSelector('#kpName');
    await g.evaluate(() => document.querySelector('.kp-card [data-profile-action="edit"]').click()); await g.waitForSelector('#kaProfileDialog[open]');
    check(await g.locator('#kaPeDiscoverable, #kaPePhonePublic').count() === 0 && await g.isVisible('#kaProfileDialog .kpe-privacy a[data-view-link="account"]'), `${N} profil düzenle: görünürlük anahtarı yok, Hesap & Gizlilik bağlantısı var`);
    writes.length = 0;
    // pencere alanları sunucudan gelen profille doldurulur; yazmadan önce dolmasını bekle (yoksa gelen veri yazılanı ezer)
    await g.waitForFunction(() => document.getElementById('kaPe_profession')?.value === 'İş Güvenliği Uzmanı', null, { timeout: 5000 }).catch(() => {});
    // pencere açılınca odak 30 ms sonra Ad Soyad'a taşınır; yazma o anla yarışmasın (metin yanlış alana düşer)
    await g.waitForFunction(() => document.activeElement?.id === 'kaPe_full_name', null, { timeout: 2000 }).catch(() => {});
    await g.fill('#kaPe_profession', 'İSG Uzmanı'); await g.evaluate(() => document.getElementById('kaProfileForm').requestSubmit());
    for (let i = 0; i < 50 && !writes.some(w => w.table === 'profiles' && w.body?.profession === 'İSG Uzmanı'); i++) await settle(page, 100);   // sabit bekleme yerine kayıt gelene kadar
    await settle(page, 300);
    check(discPatches().length === 0 && writes.some(w => w.table === 'profiles' && w.body?.profession === 'İSG Uzmanı') && db.profiles.find(p => p.id === uid).is_discoverable === true, `${N} profil düzenle: kayıt is_discoverable göndermez, mevcut değer korunur ${JSON.stringify(discPatches().map(p => p.body))} ${db.profiles.find(p => p.id === uid).is_discoverable}`);
    await page.goto(ACCOUNT); await settle(page, 1000); g = frameOf(page); await accountReady(g);
    check(await g.isChecked('#kgDiscoverable'), `${N} Hesap & Gizlilik: kayıttaki tercih (açık) okunuyor`);
    writes.length = 0;
    await toggleDisc(g);
    check(discPatches().length === 1 && discPatches()[0].body.is_discoverable === false && db.profiles.find(p => p.id === uid).is_discoverable === false, `${N} Hesap & Gizlilik: kapatınca is_discoverable=false yazıldı`);
    await navClick(page, 'experts'); await settle(page, 1200);
    check(!(await hasExpert(g, 'Açık Kayıt')), `${N} Hesap & Gizlilik: kapalıyken Uzmanlar listesinde yok`);
    await page.goto(ACCOUNT); await settle(page, 1000); g = frameOf(page); await accountReady(g);
    check(!(await g.isChecked('#kgDiscoverable')), `${N} Hesap & Gizlilik: kapalı değer okunuyor`);
    await toggleDisc(g);
    await navClick(page, 'experts'); await settle(page, 1200);
    check(db.profiles.find(p => p.id === uid).is_discoverable === true && await hasExpert(g, 'Açık Kayıt'), `${N} Hesap & Gizlilik: yeniden açınca Uzmanlar listesinde`);
    await ctx.close();
  }
  // B. Kapalı kayıt, trigger varsayılanı true → false yazılır, Uzmanlar'da görünmez
  {
    const { ctx, page, f, rest } = await boot(browser, vp, { triggerDisc: true });
    writes.length = 0;
    await signupFlow(page, f, { email: 'kapali@ornek.com', name: 'Kapalı Kayıt', disc: false });
    const pt = discPatches();
    check(pt.length === 1 && pt[0].body.is_discoverable === false && noProfileInsert(rest), `${N} görünür (kapalı): onboarding UPDATE is_discoverable=false ${JSON.stringify(pt.map(p => p.body))}`);
    await f.click('[data-auth-finish]'); await settle(page, 600);
    await navClick(page, 'experts'); await settle(page, 1200);
    check(!(await hasExpert(f, 'Kapalı Kayıt')) && await hasExpert(f, 'Mehmet Şahin Öztürk'), `${N} görünür (kapalı): Uzmanlar listesinde yok, diğer uzmanlar duruyor`);
    await ctx.close();
  }
  // C. Kapalı kayıt, onboarding 1. adımda atlanıyor → yine de yalnız is_discoverable=false
  {
    const { ctx, page, f } = await boot(browser, vp, { triggerDisc: true });
    writes.length = 0;
    await signupFlow(page, f, { email: 'atla@ornek.com', name: 'Atlayan Kişi', disc: false, onboard: false });
    check(await paneOf(f) === 'onboard', `${N} görünür (atlama): onboarding açık`);
    await f.click('[data-auth-skip]'); await settle(page, 1000);
    const pw = writes.filter(w => w.table === 'profiles' && w.body);
    check(pw.length === 1 && JSON.stringify(pw[0].body) === '{"is_discoverable":false}' && db.profiles.find(p => p.full_name === 'Atlayan Kişi').is_discoverable === false, `${N} görünür (atlama): yalnız is_discoverable=false yazıldı ${JSON.stringify(pw.map(p => p.body))}`);
    await ctx.close();
  }
  // D. Açık kayıt, trigger zaten true → gereksiz yazma yok; mevcut kullanıcı girişinde hiç yazma yok
  {
    const { ctx, page, f } = await boot(browser, vp, { triggerDisc: true });
    writes.length = 0;
    await signupFlow(page, f, { email: 'zatenacik@ornek.com', name: 'Zaten Açık', disc: true });
    check(discPatches().length === 0 && writes.some(w => w.table === 'profiles' && w.body?.profession), `${N} görünür: değer zaten true ise is_discoverable yazılmadı`);
    await f.click('[data-auth-finish]'); await settle(page, 500);
    await page.evaluate(() => { const n = document.getElementById('kisg-pro-nav').shadowRoot; n.querySelector('[data-popover-trigger]').click(); n.querySelector('[data-action="signout"]').click(); }); await settle(page, 700);
    writes.length = 0;
    await navLogin(page); await settle(page, 300); await f.fill('#kaLoginEmail', 'a@b.c'); await f.fill('#kaLoginPassword', 'dogru-sifre'); await submitPane(f, 'login'); await settle(page, 1200);
    check(!writes.some(w => w.table === 'profiles') && db.profiles.find(p => p.id === U1).is_discoverable === true, `${N} görünür: mevcut kullanıcı girişinde profile dokunulmadı`);
    await ctx.close();
  }
}

await browser.close();
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO PAGE ERRORS');
