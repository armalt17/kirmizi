// Tüm tarayıcı regresyon paketlerini sırayla çalıştırır (her paket kendi Chromium'unu açar).
// Kullanım: npm test               → tüm paketler
//           npm test -- --only auth → adı "auth" içeren paketler
// Çıktılar: tests/output/<paket>.log (ekran görüntüleri de tests/output altında)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.env.OUT || path.join(DIR, 'output');
fs.mkdirSync(OUT, { recursive: true });

// Sıra: temel App Shell → özellik paketleri. env: paket için ek ortam değişkenleri.
const SUITES = [
  { name: 'embed-build', file: 'embed-build.test.mjs', note: 'Hostinger yayın dosyası güncel ve boyut sınırında' },
  { name: 'app-shell', file: 'app-shell.test.mjs' },
  { name: 'app-shell-safari', file: 'app-shell.test.mjs', env: { SAFARI: '1' }, note: 'WebKit canvas WebP üretemez simülasyonu' },
  { name: 'comments', file: 'comments.test.mjs' },
  { name: 'realtime-new-posts', file: 'realtime-new-posts.test.mjs' },
  { name: 'auth', file: 'auth.test.mjs' },
  { name: 'feed-comment-preview', file: 'feed-comment-preview.test.mjs' },
  { name: 'post-image-upload', file: 'post-image-upload.test.mjs' },
  { name: 'overlay-guest-auth', file: 'overlay-guest-auth.test.mjs' },
  { name: 'terminology-city-filter', file: 'terminology-city-filter.test.mjs' },
  { name: 'feed-experts-rail', file: 'feed-experts-rail.test.mjs' },
  { name: 'notifications', file: 'notifications.test.mjs' },
  { name: 'comment-likes', file: 'comment-likes.test.mjs' },
  { name: 'services-v2', file: 'services-v2.test.mjs' },
  { name: 'reports-db', file: 'reports-db.test.mjs', note: 'yerel geçici PostgreSQL' },
  { name: 'reports-ui', file: 'reports-ui.test.mjs' },
  { name: 'security-fix-pack1-db', file: 'security-fix-pack1-db.test.mjs', note: 'yerel geçici PostgreSQL' },
  { name: 'security-fix-pack1-web', file: 'security-fix-pack1-web.test.mjs' },
  { name: 'security-fix-pack2-db', file: 'security-fix-pack2-db.test.mjs', note: 'yerel geçici PostgreSQL' },
  { name: 'admin-v1-a-db', file: 'admin-v1-a-db.test.mjs', note: 'yerel geçici PostgreSQL' },
  { name: 'admin-v1-b-db', file: 'admin-v1-b-db.test.mjs', note: 'yerel geçici PostgreSQL' },
  { name: 'pro-admin-ui', file: 'pro-admin-ui.test.mjs', note: '/pro-admin arayüzü' },
  { name: 'legal-db', file: 'legal-db.test.mjs', note: 'yerel geçici PostgreSQL' },
  { name: 'legal-v1-web', file: 'legal-v1-web.test.mjs', note: '/yasal + App Shell' },
  { name: 'service-region-v11', file: 'service-region-v11.test.mjs' },
  { name: 'links-v1', file: 'links-v1.test.mjs' },
  { name: 'small-fixes-pack', file: 'small-fixes-pack.test.mjs', note: 'ad normalizasyonu, placeholder, yasal bağlantılar' },
  { name: 'v425-pack', file: 'v425-pack.test.mjs', note: 'Profil V2, Hizmet Bul V3, Uzmanlar V2, Akış vitrin' },
  { name: 'report-fixes', file: 'report-fixes.test.mjs', note: 'dış test raporu F01–F08' },
  { name: 'skeleton', file: 'skeleton.test.mjs', note: 'yükleme iskeletleri' },
  { name: 'tags-db', file: 'tags-db.test.mjs', note: 'Konular V1 — yerel geçici PostgreSQL' },
  { name: 'tags-admin-db', file: 'tags-admin-db.test.mjs', note: 'Konular V2 admin — yerel geçici PostgreSQL' },
  { name: 'service-categories-admin-db', file: 'service-categories-admin-db.test.mjs', note: 'Hizmet kategorileri admin — yerel geçici PostgreSQL' },
  { name: 'post-images-db', file: 'post-images-db.test.mjs', note: 'İkinci fotoğraf — yerel geçici PostgreSQL' },
  { name: 'post-images-web', file: 'post-images-web.test.mjs', note: 'İkinci fotoğraf — düzenleyici, kart, görüntüleyici' },
  { name: 'v436-pack', file: 'v436-pack.test.mjs', note: 'Sekme ikonları, Hizmet Alanı, Yurtdışı, yan kolon' },
  { name: 'topics-web', file: 'topics-web.test.mjs', note: 'Konular sayfası' },
  { name: 'tags-web', file: 'tags-web.test.mjs', note: 'Konular V1 — şerit, panel, composer' },
  { name: 'code-health-pack', file: 'code-health-pack.test.mjs', note: 'Kod sağlığı raporu düzeltmeleri' },
];
const onlyIdx = process.argv.indexOf('--only');
const only = onlyIdx > -1 ? process.argv[onlyIdx + 1] : null;
const selected = SUITES.filter(s => !only || s.name.includes(only));
if (!selected.length) { console.error(`"${only}" ile eşleşen paket yok. Paketler: ${SUITES.map(s => s.name).join(', ')}`); process.exit(2); }

function run(s) {
  return new Promise(resolve => {
    const t0 = Date.now(), log = fs.createWriteStream(path.join(OUT, `${s.name}.log`));
    const child = spawn(process.execPath, [path.join(DIR, 'suites', s.file)], { env: { ...process.env, OUT, ...(s.env || {}) } });
    let buf = '', pass = 0, fail = 0, pageErrors = false, fails = [];
    const onData = d => {
      log.write(d); buf += d;
      let i; while ((i = buf.indexOf('\n')) > -1) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        if (line.startsWith('PASS ')) pass++;
        else if (line.startsWith('FAIL ')) { fail++; fails.push(line); }
        else if (line.startsWith('ERRORS:')) pageErrors = true;
      }
    };
    child.stdout.on('data', onData); child.stderr.on('data', onData);
    const timer = setTimeout(() => child.kill('SIGKILL'), +(process.env.SUITE_TIMEOUT_MS || 20 * 60000));
    child.on('close', code => { clearTimeout(timer); log.end(); resolve({ ...s, pass, fail, fails, pageErrors, code, secs: Math.round((Date.now() - t0) / 1000) }); });
  });
}

const results = [];
for (const s of selected) {
  process.stdout.write(`▶ ${s.name}${s.note ? ` (${s.note})` : ''} … `);
  const r = await run(s); results.push(r);
  const ok = r.code === 0 && r.fail === 0 && !r.pageErrors && r.pass > 0;
  console.log(`${ok ? 'OK' : 'HATA'}  ${r.pass} PASS / ${r.fail} FAIL  (${r.secs} sn)${r.code ? `  çıkış kodu ${r.code}` : ''}${r.pageErrors ? '  sayfa hatası var' : ''}`);
  r.fails.forEach(l => console.log('   ' + l));
}
const total = results.reduce((a, r) => ({ pass: a.pass + r.pass, fail: a.fail + r.fail }), { pass: 0, fail: 0 });
const bad = results.filter(r => r.code !== 0 || r.fail > 0 || r.pageErrors || r.pass === 0);
console.log(`\nToplam: ${results.length} paket, ${total.pass} PASS / ${total.fail} FAIL${bad.length ? `, sorunlu paket: ${bad.map(r => r.name).join(', ')}` : ''}. Loglar: ${path.relative(process.cwd(), OUT) || OUT}`);
process.exit(bad.length ? 1 : 0);
