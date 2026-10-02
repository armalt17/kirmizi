// Yayın dosyası koruması: dist/kisg-professional-app.html kaynakla güncel ve Hostinger için güvenli boyutta mı?
// (v4.25.0: ~511 bin karakterlik dosya canlıda her adreste Akış açtı; v4.24.0 ~497 bin karakterle doğruydu.)
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, check } from '../helpers/harness.mjs';
import { buildEmbed, LIMIT } from '../../tools/build-embed.mjs';

const src = fs.readFileSync(path.join(ROOT, 'kisg-professional-app.html'), 'utf8');
const distPath = path.join(ROOT, 'dist', 'kisg-professional-app.html');
const dist = fs.existsSync(distPath) ? fs.readFileSync(distPath, 'utf8') : '';
const { html, version } = buildEmbed(src);   // derleme kendi içinde her çıkarmayı V8 ile denetler
check(dist === html, `dist/kisg-professional-app.html kaynakla güncel (npm run build) — v${version}`);
check(dist.length <= LIMIT && dist.length < 496692, `yayın dosyası ${dist.length} karakter ≤ ${LIMIT} (bilinen çalışan v4.24.0: 496 692)`);
const code = s => s.slice(s.indexOf('<script>') + 8, s.indexOf('</script>'));
let ok = true; try { new Function(code(dist)); } catch (e) { ok = false; console.log(e.message); }
check(ok, 'yayın dosyasının betiği sözdizimsel olarak geçerli');
check(dist.includes(`version: '${version}'`) && /KURULUM:/.test(dist.slice(0, 1200)), 'yayın dosyası sürüm ve KURULUM notunu taşıyor');

// Bağımsız denetim: kaynaktan yalnız boşluk ve yorum düşmüş olmalı. Boşluklar atlanarak iki metin karakter karakter
// eşlenir; uyuşmazlıkta kaynak bir yorum başında (// veya /* … */, HTML'de <!-- … -->) olmalı ve yorum atlanır.
function onlyWhitespaceAndComments(a, b, label) {
  let i = 0, j = 0, dropped = 0;
  const ws = c => c === ' ' || c === '\t' || c === '\n' || c === '\r';
  while (true) {
    while (i < a.length && ws(a[i])) i++;
    while (j < b.length && ws(b[j])) j++;
    if (i >= a.length || j >= b.length) break;
    if (a[i] === b[j]) { i++; j++; continue; }
    const two = a.slice(i, i + 2), four = a.slice(i, i + 4);
    if (two === '//') { const e = a.indexOf('\n', i); i = e < 0 ? a.length : e; dropped++; continue; }
    if (two === '/*') { const e = a.indexOf('*/', i + 2); if (e < 0) break; i = e + 2; dropped++; continue; }
    if (four === '<!--') { const e = a.indexOf('-->', i + 4); if (e < 0) break; i = e + 3; dropped++; continue; }
    console.log(`${label}: kaynak ${i}. karakter ${JSON.stringify(a.slice(i, i + 60))} ≠ yayın ${JSON.stringify(b.slice(j, j + 60))}`);
    return false;
  }
  while (j < b.length && ws(b[j])) j++;
  return j >= b.length && (i >= a.length || /^(\s|\/\/[^\n]*|\/\*[\s\S]*?\*\/)*$/.test(a.slice(i)));
}
const bodyOf = s => s.slice(s.indexOf('-->') + 3);
check(onlyWhitespaceAndComments(bodyOf(src), bodyOf(dist), 'gövde'), 'kaynak ile yayın arasında yalnız boşluk ve yorum farkı var');
