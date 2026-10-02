// Yayın dosyası koruması: dist/kisg-professional-app.html kaynakla güncel ve Hostinger için güvenli boyutta mı?
// (v4.25.0: ~511 bin karakterlik dosya canlıda her adreste Akış açtı; v4.24.0 ~497 bin karakterle doğruydu.)
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, check } from '../helpers/harness.mjs';
import { buildEmbed, LIMIT } from '../../tools/build-embed.mjs';

const src = fs.readFileSync(path.join(ROOT, 'kisg-professional-app.html'), 'utf8');
const distPath = path.join(ROOT, 'dist', 'kisg-professional-app.html');
const dist = fs.existsSync(distPath) ? fs.readFileSync(distPath, 'utf8') : '';
const { html, version } = buildEmbed(src);
check(dist === html, `dist/kisg-professional-app.html kaynakla güncel (npm run build) — v${version}`);
check(dist.length <= LIMIT && dist.length < 496692, `yayın dosyası ${dist.length} karakter ≤ ${LIMIT} (bilinen çalışan v4.24.0: 496 692)`);
const code = s => s.slice(s.indexOf('<script>') + 8, s.indexOf('</script>'));
let ok = true; try { new Function(code(dist)); } catch (e) { ok = false; console.log(e.message); }
check(ok, 'yayın dosyasının betiği sözdizimsel olarak geçerli');
check(dist.includes(`version: '${version}'`) && /KURULUM:/.test(dist.slice(0, 1200)), 'yayın dosyası sürüm ve KURULUM notunu taşıyor');
// Çıkarılan her satır yalnız yorumdur: yorum satırları atılınca kaynak ve yayın betiği aynı satırları içerir
const strip = s => code(s).split('\n').filter(l => !/^\s*\/\/(?!\S*:\/\/)/.test(l)).join('\n');
check(strip(src) === code(dist), 'betikte yorum satırları dışında fark yok');
// Kesin denetim: atılan her satır gerçekten yorum mu (metin/template dizisinin içinde değil mi)? Satır ')' yapılınca
// betik sözdizimi bozulmalı; bozulmuyorsa satır bir dizinin parçasıdır ve atılmamalıydı.
{
  const L = code(src).split('\n'), RE = /^\s*\/\/(?!\S*:\/\/)/, inside = [];
  L.forEach((l, i) => { if (!RE.test(l)) return; const c = L.slice(); c[i] = ')'; try { new Function(c.join('\n')); inside.push(i + 1); } catch {} });
  check(inside.length === 0, `atılan ${L.filter(l => RE.test(l)).length} satırın hepsi gerçek yorum (dizi içinde olan: ${inside.join(',') || 'yok'})`);
}
