// Kaynak: geçici /tmp/claude-0/pkg/feedcm.mjs — v4.12.0 güvenlik ağı olarak kalıcılaştırıldı.
import { chromium, fs, ROOT, APP, NM, OUT, U1, U2, now, iso, db, writes, uploads, IMG, DB0, resetDb, cursorOr, filterRows, seq, orderRows, withEmbeds, handleRest, libs, HOSTINGER_BASE_CSS, hostPage, errors, realtimeMock, postSeq, makePost, setup, frameOf, check, DEFAULT_CHROMIUM, LAUNCH } from '../helpers/harness.mjs';
import { b64, tokenFor, uidOf, uidSeq, authMock, boot, acct, paneOf, errOf, navLogin, go, submitPane, fillSignup, visibleView, navClick, settle, flag, noProfileInsert } from '../helpers/auth.mjs';

// ===== Akış yorum önizlemesi: 0 / 1 / 2 / 15 yorum =====
const PX = n => `bbbbbbbb-0000-4000-8000-${String(n).padStart(12, '0')}`;
const SC = { zero: PX(3), one: PX(4), two: PX(7), many: PX(8) };
function seed() {
  db.professional_post_comments = db.professional_post_comments.filter(c => ![SC.zero, SC.one, SC.two, SC.many].includes(c.post_id));
  const add = (pid, n, who = i => (i % 2 ? U1 : U2)) => { for (let i = 0; i < n; i++) db.professional_post_comments.push({ id: `c${pid.slice(-2)}-${i}`, post_id: pid, user_id: who(i), content: i === n - 1 ? `En güncel yorum (${n})` + (n === 15 ? ' — bu yorum oldukça uzun bir metin; saha ekibinin raporlarını, fotoğraflarını ve düzeltici faaliyet takvimini birlikte değerlendirip kalan eksikleri bir sonraki denetime kadar kapatmayı hedefliyoruz. Ayrıca eğitim kayıtlarını da güncelleyeceğiz.' : '') : `Eski yorum ${i + 1}`, status: 'active', created_at: new Date(now - (n - i) * 60000).toISOString(), updated_at: new Date(now - (n - i) * 60000).toISOString() }); };
  add(SC.one, 1, () => U2); add(SC.two, 2); add(SC.many, 15);
  db.professional_post_comments.push({ id: 'c08-del', post_id: SC.many, user_id: U2, content: 'Silinmiş en yeni', status: 'deleted', created_at: new Date(now).toISOString(), updated_at: new Date(now).toISOString() });
}
const cardInfo = (f, pid) => f.evaluate(id => {
  const c = document.querySelector(`[data-view="works"] [data-post-id="${id}"]`), th = c.querySelector('[data-thread]');
  const cs = th && !th.hidden ? getComputedStyle(th) : null, cp = c.querySelector('.cp');
  const txt = c.querySelector('.cp-text');
  return { h: Math.round(c.getBoundingClientRect().height), thread: !!th && !th.hidden, threadH: th && !th.hidden ? Math.round(th.getBoundingClientRect().height) : 0, n: c.querySelectorAll('.cp').length, text: txt?.textContent || '', lines: txt ? Math.round(txt.getBoundingClientRect().height / parseFloat(getComputedStyle(txt).lineHeight)) : 0, all: c.querySelector('.cp-all')?.textContent.trim() || '', allHref: c.querySelector('.cp-all')?.getAttribute('href') || '', count: c.querySelector('[data-comment-count]')?.textContent || '', countLink: c.querySelector('[data-comment-count-link]')?.getAttribute('href') || '', more: c.querySelectorAll('[data-comment-more],.cm-show').length, border: cs ? cs.borderTopWidth : '', bg: cp ? getComputedStyle(cp).backgroundColor : '', bubble: c.querySelectorAll('.cm-bubble').length };
}, pid);
const browser = await chromium.launch(LAUNCH);
for (const vp of [{ name: 'desktop', width: 1366, height: 900 }, { name: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true }, { name: 'mobile320', width: 320, height: 700, isMobile: true, hasTouch: true }]) {
  const N = vp.name;
  resetDb(); seed();
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch });
  await setup(ctx, true);
  const page = await ctx.newPage();
  const cmReq = []; page.on('request', q => { if (q.url().includes('/rest/v1/professional_post_comments')) cmReq.push({ m: q.method(), url: decodeURIComponent(q.url()) }); });
  page.on('pageerror', e => errors.push(`feedcm ${N}: ${e.message}`));
  await page.goto('https://isgcalisanplatformu.com/'); await settle(page, 1500);
  const f = frameOf(page); await f.waitForSelector('[data-view="works"] [data-post-id]'); await settle(page, 600);
  const I = {}; for (const [k, pid] of Object.entries(SC)) I[k] = await cardInfo(f, pid);
  const base = I.zero.h;
  console.log(N, JSON.stringify(Object.fromEntries(Object.entries(I).map(([k, v]) => [k, { h: v.h, threadH: v.threadH, lines: v.lines }]))));
  check(!I.zero.thread && I.zero.n === 0 && I.zero.count === '' && !I.zero.countLink, `${N} 0 yorum: önizleme alanı hiç oluşmadı, sayaç/bağlantı yok`);
  check(I.one.n === 1 && I.one.text === 'En güncel yorum (1)' && !I.one.all && I.one.count === '1', `${N} 1 yorum: yalnız yorum, "tümünü gör" yok`);
  check(I.two.n === 1 && I.two.text === 'En güncel yorum (2)' && I.two.all.startsWith('2 yorumun tümünü gör') && I.two.all.endsWith('→'), `${N} 2 yorum: en güncel yorum + "2 yorumun tümünü gör →"`);
  check(I.many.n === 1 && I.many.text.startsWith('En güncel yorum (15)') && I.many.all.startsWith('15 yorumun tümünü gör') && I.many.count === '15', `${N} 15 yorum: silinmiş yorum sayılmadı, en güncel aktif yorum + "15 yorumun tümünü gör →"`);
  check([I.one, I.two, I.many].every(x => x.more === 0 && x.bubble === 0), `${N} önizleme: akışta "daha fazla yorum yükle" yok, balon yok`);
  check([I.one, I.two, I.many].every(x => x.border === '0px' && /rgba\(0, 0, 0, 0\)|transparent/.test(x.bg)), `${N} önizleme: kenarlık/gri zemin yok`);
  check(I.many.lines <= 2, `${N} 15 yorum: uzun yorum en fazla 2 satır (${I.many.lines})`);
  const maxThread = Math.max(I.one.threadH, I.two.threadH, I.many.threadH);
  check(I.one.threadH <= 96 && maxThread <= 152 && I.many.h - base <= 165, `${N} kart yüksekliği: önizleme kompakt — v4.34.3 gri baloncuk dahil (1:${I.one.threadH}px, 2:${I.two.threadH}px, 15:${I.many.threadH}px; 15 yorumlu kart +${I.many.h - base}px)`);
  check(Math.abs(I.many.threadH - I.two.threadH) <= 22 + 34, `${N} kart yüksekliği: 15 yorum ile 2 yorum kartı aynı ölçüde (yorum sayısıyla uzamıyor)`);
  const bulk = cmReq.filter(r => r.m === 'GET' && r.url.includes('post_id=in.'));
  check(bulk.length === 1 && !cmReq.some(r => r.m === 'GET' && /limit=1[01]\b/.test(r.url)), `${N} önizleme: sayfa başına tek toplu sorgu, akışta liste yüklenmedi (${bulk.length})`);
  await page.screenshot({ path: `${OUT}/feedcm-${N}.png`, fullPage: false });
  await f.locator(`[data-view="works"] [data-post-id="${SC.many}"]`).screenshot({ path: `${OUT}/feedcm-${N}-15.png` });
  // "tümünü gör" → Çalışma Detay (shell içi), tüm yorumlar orada
  const mark = await page.evaluate(() => window.__bootMark);
  await f.evaluate(id => document.querySelector(`[data-view="works"] [data-post-id="${id}"]`).scrollIntoView({ block: 'center' }), SC.many); await settle(page, 200);
  const y0 = await page.evaluate(() => scrollY);
  await f.evaluate(id => document.querySelector(`[data-view="works"] [data-post-id="${id}"] .cp-all`).click(), SC.many);
  await f.waitForSelector(`[data-view="work"] [data-post-id="${SC.many}"] .cm-item`); await settle(page, 600);
  const det = await f.evaluate(() => ({ items: document.querySelectorAll('[data-view="work"] .cm-item').length, preview: document.querySelectorAll('[data-view="work"] .cp').length, more: document.querySelector('[data-view="work"] [data-comment-more]')?.textContent || '' }));
  check(page.url().endsWith(`/calisma-detay?id=${SC.many}`) && await page.evaluate(() => window.__bootMark) === mark, `${N} tümünü gör → /calisma-detay?id=… (reload yok)`);
  check(det.preview === 0 && det.items >= 10, `${N} detay: tam yorum sistemi (önizleme değil) ${JSON.stringify(det)}`);
  if (det.more) { await f.click('[data-view="work"] [data-comment-more]'); await settle(page, 800); }
  check(await f.locator('[data-view="work"] .cm-item').count() === 15, `${N} detay: 15 yorumun tamamı görüntülendi`);
  await page.goBack(); await settle(page, 600);
  check(page.url() === 'https://isgcalisanplatformu.com/' && Math.abs(await page.evaluate(() => scrollY) - y0) < 4 && (await cardInfo(f, SC.many)).n === 1, `${N} detaydan geri: Akış scroll ve önizleme korundu`);
  // üstteki yorum sayısı → detay
  await f.evaluate(id => document.querySelector(`[data-view="works"] [data-post-id="${id}"] [data-comment-count-link]`).click(), SC.two);
  await f.waitForSelector(`[data-view="work"] [data-post-id="${SC.two}"]`); await settle(page, 500);
  check(page.url().endsWith(`/calisma-detay?id=${SC.two}`) && await f.locator('[data-view="work"] .cm-item').count() === 2, `${N} yorum sayısı → Çalışma Detay, 2 yorum`);
  await page.goBack(); await settle(page, 600);
  // Yorum Yap → hızlı yanıt, liste yüklemez; gönderilen yorum en güncel olarak görünür
  cmReq.length = 0;
  await f.evaluate(id => document.querySelector(`[data-view="works"] [data-post-id="${id}"] [data-post-action="comment"]`).click(), SC.zero); await settle(page, 400);
  check(await f.isVisible(`[data-view="works"] [data-post-id="${SC.zero}"] [data-comment-form] textarea`) && !cmReq.some(r => r.m === 'GET'), `${N} Yorum Yap (0 yorum): yanıt alanı açıldı, liste sorgusu yok`);
  await f.fill(`[data-view="works"] [data-post-id="${SC.zero}"] [data-comment-form] textarea`, 'İlk yorum');
  await f.evaluate(id => document.querySelector(`[data-view="works"] [data-post-id="${id}"] [data-comment-form]`).requestSubmit(), SC.zero); await settle(page, 800);
  let z = await cardInfo(f, SC.zero);
  check(z.n === 1 && z.text === 'İlk yorum' && !z.all && z.count === '1', `${N} yorum yazma: yeni yorum önizlemede, sayaç 1`);
  await f.evaluate(id => document.querySelector(`[data-view="works"] [data-post-id="${id}"] [data-post-action="comment"]`).click(), SC.two); await settle(page, 300);
  await f.fill(`[data-view="works"] [data-post-id="${SC.two}"] [data-comment-form] textarea`, 'Üçüncü yorum');
  await f.evaluate(id => document.querySelector(`[data-view="works"] [data-post-id="${id}"] [data-comment-form]`).requestSubmit(), SC.two); await settle(page, 800);
  let t2 = await cardInfo(f, SC.two);
  check(t2.n === 1 && t2.text === 'Üçüncü yorum' && t2.all.startsWith('3 yorumun tümünü gör') && t2.count === '3', `${N} yorum yazma: 2→3, yalnız en güncel gösteriliyor`);
  // kendi yorumunu düzenle
  const own = `[data-view="works"] [data-post-id="${SC.two}"] .cp`;
  await f.evaluate(sel => document.querySelector(`${sel} [data-popover-trigger]`).click(), own);
  await f.evaluate(sel => document.querySelector(`${sel} [data-comment-act="edit"]`).click(), own); await settle(page, 200);
  await f.fill(`${own} [data-comment-edit] textarea`, 'Üçüncü yorum (düzenlendi)');
  await f.evaluate(sel => document.querySelector(`${sel} [data-comment-edit]`).requestSubmit(), own); await settle(page, 700);
  const ed = await cardInfo(f, SC.two); check(ed.text === 'Üçüncü yorum (düzenlendi)' && writes.some(w => w.table === 'professional_post_comments' && w.body?.content === 'Üçüncü yorum (düzenlendi)'), `${N} yorum düzenleme önizlemede çalışıyor (${ed.text})`);
  // sil → sıradaki en güncel yorum gelir
  await f.evaluate(sel => document.querySelector(`${sel} [data-popover-trigger]`).click(), own);
  await f.evaluate(sel => document.querySelector(`${sel} [data-comment-act="delete"]`).click(), own); await settle(page, 300);
  await f.click('#kaConfirmOk'); await settle(page, 900);
  t2 = await cardInfo(f, SC.two);
  check(t2.n === 1 && t2.text === 'En güncel yorum (2)' && t2.all.startsWith('2 yorumun tümünü gör') && t2.count === '2', `${N} yorum silme: sıradaki en güncel yorum gösterildi, sayaç 2`);
  // başkasının yorumunu beğen
  writes.length = 0;
  await f.evaluate(id => document.querySelector(`[data-view="works"] [data-post-id="${id}"] .cp [data-comment-like]`).click(), SC.one); await settle(page, 600);
  check(writes.some(w => w.table === 'professional_comment_likes' && w.body?.comment_id === 'c04-0' && w.body?.user_id === U1) && await f.getAttribute(`[data-view="works"] [data-post-id="${SC.one}"] .cp [data-comment-like]`, 'aria-pressed') === 'true', `${N} önizlemede yorum beğenme çalışıyor`);
  // yatay taşma yok
  const o = await page.evaluate(() => { const fd = document.querySelector('iframe').contentDocument; return fd.documentElement.scrollWidth - fd.documentElement.clientWidth; });
  check(o <= 1, `${N} yatay taşma yok (${o})`);
  await ctx.close();
}
await browser.close();
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO PAGE ERRORS');
