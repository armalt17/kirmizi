// Admin panelinin staging (test) kopyası: node tools/build-admin-staging.mjs
// Kaynak kisg-pro-admin.html canlıya (kirmizi) bağlıdır ve Hostinger'daki /pro-admin sayfasına aynen yapıştırılır.
// Bu araç aynı dosyanın yalnız bağlantısını staging projesine çevirir ve üst bara "TEST · staging" etiketi koyar;
// çıktı dist-admin/kisg-pro-admin-staging-v{sürüm}.html ayrı, gizli bir Hostinger sayfasına yapıştırılır.
// Yalnız publishable (herkese açık) anahtar kullanılır. Her değiştirme tam bir kez yapılmalı; olmazsa çıkış kodu 1.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'kisg-pro-admin.html');
export const DIST = path.join(ROOT, 'dist-admin');
export const STAGING = Object.freeze({
  url: 'https://vleellyrhmtjpwgzrqii.supabase.co',
  key: 'sb_publishable_85NeRUePWMVOCQH4sOISuw_CzdvwlDR'
});
const PROD_URL = 'https://cglndmbjinzmmbimxqok.supabase.co';

export function buildStaging(src) {
  let out = src;
  const once = (from, to, what) => {
    const n = out.split(from).length - 1;
    if (n !== 1) throw new Error(`${what}: ${n} kez bulundu (1 bekleniyordu)`);
    out = out.replace(from, to);
  };
  once(`supabaseUrl: '${PROD_URL}'`, `supabaseUrl: '${STAGING.url}'`, 'supabaseUrl');
  once(/supabaseKey: '(sb_publishable_[A-Za-z0-9_-]+)'/.exec(out)?.[0] ?? 'supabaseKey: <yok>', `supabaseKey: '${STAGING.key}'`, 'supabaseKey');
  once('<span class="pa-pill">Yönetim</span>', '<span class="pa-pill" style="background:#e30a17">TEST · staging</span>', 'etiket');
  once('<!--\nKIRMIZI İSG — PROFESSIONAL ADMIN', '<!--\nTEST KOPYASI (STAGING) — canlı /pro-admin sayfasına YAPIŞTIRMAYIN.\nKIRMIZI İSG — PROFESSIONAL ADMIN', 'başlık');
  const js = out.split('<script>')[1]?.split('</script>')[0] ?? '';
  new Function(js);
  if (/sb_secret_|service_role/.test(out.replace(/service_role YOKTUR/g, ''))) throw new Error('gizli anahtar izi');
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const src = fs.readFileSync(SRC, 'utf8');
    const version = /version: '([0-9.]+)'/.exec(src)?.[1];
    if (!version) throw new Error('sürüm bulunamadı');
    const out = buildStaging(src);
    fs.mkdirSync(DIST, { recursive: true });
    for (const f of fs.readdirSync(DIST)) if (/^kisg-pro-admin-staging-v.*\.html$/.test(f)) fs.unlinkSync(path.join(DIST, f));
    const file = path.join(DIST, `kisg-pro-admin-staging-v${version}.html`);
    fs.writeFileSync(file, out);
    console.log(`${path.relative(ROOT, file)} (${out.length} karakter)`);
  } catch (e) {
    console.error(`Staging kopyası üretilemedi: ${e.message}`);
    process.exit(1);
  }
}
