// Hostinger yayın dosyası üretici (bağımlılıksız): node tools/build-embed.mjs
// Kaynak (kisg-professional-app.html) yorumlarıyla repoda kalır; Hostinger'a dist/kisg-professional-app.html yapıştırılır.
// Neden: v4.25.0'da dosya ~511 bin karaktere çıkınca canlıda her adres Akış açtı (v4.24.0, ~497 bin karakter, doğruydu).
// Gömme kodu büyüyünce Hostinger'ın onu farklı servis ettiği, uygulamanın üst sayfa adresini okuyamadığı düşünülüyor.
// Davranış değişmez; yalnız şu çıkarılır:
//   1) baştaki uzun sürüm geçmişi yorumu (kısa başlık + KURULUM korunur; geçmiş kaynakta durur)
//   2) <script> içindeki yalnız yorumdan oluşan satırlar (`// ...`)
// Boyut sınırı aşılırsa çıkış kodu 1 (sessizce büyük dosya yayınlanmasın).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'kisg-professional-app.html');
const OUT = path.join(ROOT, 'dist', 'kisg-professional-app.html');
export const LIMIT = 490000;   // karakter; bilinen çalışan en büyük dosya 496 692 karakterdi (v4.24.0) — altında kalınır

export function buildEmbed(src) {
  const end = src.indexOf('-->');
  if (!src.startsWith('<!--') || end < 0) throw new Error('Başlık yorumu bulunamadı');
  const head = src.slice(0, end), version = (head.match(/PROFESSIONAL APP SHELL v([\d.]+)/) || [])[1];
  const install = (head.match(/KURULUM:[\s\S]*?\n\n/) || [''])[0].trimEnd();
  if (!version || !install) throw new Error('Başlıkta sürüm veya KURULUM satırı yok');
  const header = `<!--\nKIRMIZI İSG — PROFESSIONAL APP SHELL v${version} (yayın dosyası — kaynak ve sürüm geçmişi: kisg-professional-app.html)\n\n${install}\n-->`;
  let body = src.slice(end + 3);
  body = body.replace(/(<script>)([\s\S]*?)(<\/script>)/g, (m, a, code, b) => a + code.split('\n').filter(l => !/^\s*\/\/(?!\S*:\/\/)/.test(l)).join('\n') + b);
  return { html: header + body, version };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const src = fs.readFileSync(SRC, 'utf8');
  const { html, version } = buildEmbed(src);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, html);
  const chars = html.length, bytes = Buffer.byteLength(html);
  console.log(`v${version}: kaynak ${src.length} → yayın ${chars} karakter (${bytes} bayt), sınır ${LIMIT}`);
  if (chars > LIMIT) { console.error(`HATA: yayın dosyası ${chars} karakter > ${LIMIT}`); process.exit(1); }
}
