// Hostinger yayın dosyası üretici (bağımlılıksız): node tools/build-embed.mjs  (npm run build)
// Kaynak (kisg-professional-app.html) yorumlarıyla repoda kalır; Hostinger'a dist/kisg-professional-app.html yapıştırılır.
// Neden: v4.25.0'da dosya ~511 bin karaktere çıkınca canlıda her adres Akış açtı (v4.24.0, ~497 bin karakter, doğruydu).
// Gömme kodu büyüyünce Hostinger'ın onu farklı servis ettiği, uygulamanın üst sayfa adresini okuyamadığı düşünülüyor.
// Davranış değişmez; yalnız şunlar çıkarılır:
//   1) baştaki uzun sürüm geçmişi yorumu (kısa başlık + KURULUM korunur; geçmiş kaynakta durur)
//   2) <style>: CSS yorumları ve satır başı girintileri
//   3) HTML işaretlemesi: satır başı girintileri (çok satırlı <pre>/<textarea> içeriği yok)
//   4) <script>: satır başında başlayan yorumlar (// ve /* */) ile satır başı girintileri — yalnız V8 o noktanın bir
//      metin/şablon dizisinin DIŞINDA olduğunu doğruladıysa. Denetim: satırın/yorumun başına '@' eklenir; betik yine
//      ayrıştırılabiliyorsa '@' bir dizinin içine düşmüştür ve o satıra dokunulmaz (ör. CSS/HTML şablonları).
// Boyut sınırı aşılırsa çıkış kodu 1 (sessizce büyük dosya yayınlanmasın).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'kisg-professional-app.html');
const OUT = path.join(ROOT, 'dist', 'kisg-professional-app.html');
export const LIMIT = 490000;   // karakter; bilinen çalışan en büyük dosya 496 692 karakterdi (v4.24.0) — altında kalınır

const parses = code => { try { new Function(code); return true; } catch { return false; } };
const INDENT = /^[ \t]+/;
const LINE_COMMENT = /^[ \t]*\/\/(?!\S*:\/\/)/;

// Bir satırın başı (sütun 0) bir metin/şablon dizisinin içinde mi?
function startsInsideString(lines, i) { const c = lines.slice(); c[i] = '@' + c[i]; return parses(c.join('\n')); }

function minifyScript(code) {
  if (!parses(code)) throw new Error('Kaynak betik ayrıştırılamadı');
  let L = code.split('\n');
  // a) satır başında başlayan /* … */ yorumları (tek ya da çok satırlı) — yorum açılışı dizi dışındaysa
  for (let i = 0; i < L.length; i++) {
    if (!/^[ \t]*\/\*/.test(L[i])) continue;
    let j = i; while (j < L.length && !L[j].includes('*/')) j++;
    if (j >= L.length || !/\*\/[ \t]*$/.test(L[j]) || L[j].indexOf('*/') !== L[j].lastIndexOf('*/')) continue;   // sonra kod gelen yorumlara dokunulmaz
    if (startsInsideString(L, i)) continue;
    const next = L.slice(0, i).concat(L.slice(j + 1));
    if (!parses(next.join('\n'))) continue;
    L = next; i--;
  }
  // b) yalnız yorumdan oluşan // satırları
  L = L.filter((l, i, all) => !(LINE_COMMENT.test(l) && !startsInsideString(all, i)));
  // c) satır başı girintileri
  const keep = new Set(); L.forEach((l, i) => { if (INDENT.test(l) && startsInsideString(L, i)) keep.add(i); });
  L = L.map((l, i) => (keep.has(i) ? l : l.replace(INDENT, '')));
  const out = L.join('\n');
  if (!parses(out)) throw new Error('Küçültülmüş betik ayrıştırılamadı');
  return out;
}
const minifyCss = css => css.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map(l => l.replace(INDENT, '')).filter(l => l.trim()).join('\n');
const minifyHtml = html => html.split('\n').map(l => l.replace(INDENT, '')).join('\n');

export function buildEmbed(src) {
  const end = src.indexOf('-->');
  if (!src.startsWith('<!--') || end < 0) throw new Error('Başlık yorumu bulunamadı');
  const head = src.slice(0, end), version = (head.match(/PROFESSIONAL APP SHELL v([\d.]+)/) || [])[1];
  const install = (head.match(/KURULUM:[\s\S]*?\n\n/) || [''])[0].trimEnd();
  if (!version || !install) throw new Error('Başlıkta sürüm veya KURULUM satırı yok');
  const header = `<!--\nKIRMIZI İSG — PROFESSIONAL APP SHELL v${version} (yayın dosyası — kaynak ve sürüm geçmişi: kisg-professional-app.html)\n\n${install}\n-->`;
  const body = src.slice(end + 3);
  // <style> ve <script> blokları ayrı işlenir; aradaki işaretlemenin yalnız girintisi alınır
  const parts = body.split(/(<style>[\s\S]*?<\/style>|<script>[\s\S]*?<\/script>)/);
  const out = parts.map(p => (p.startsWith('<style>') ? `<style>${minifyCss(p.slice(7, -8))}</style>`
    : p.startsWith('<script>') ? `<script>${minifyScript(p.slice(8, -9))}</script>` : minifyHtml(p))).join('');
  return { html: header + out, version };
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
