// Doğrulama sayfasının staging deneme kopyası (bağımlılıksız): node tools/build-dogrula-staging.mjs
// Kaynak kisg-dogrula.html production'a bakar; bu kopya staging projesine (wztoupambatmvhwdhjmy) bakar. Hostinger'a
// yapıştırılmaz; tarayıcıda ?k=KOD ile açılıp denenir.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync(new URL('../kisg-dogrula.html', import.meta.url), 'utf8');
const out = src
  .replace("supabaseUrl: 'https://twaptpofhbnnfciowoig.supabase.co'", "supabaseUrl: 'https://wztoupambatmvhwdhjmy.supabase.co'")
  .replace("supabaseKey: 'sb_publishable_PbG6v6BuhMVwVyRdCxHUMw_JscAAhVs'", "supabaseKey: 'sb_publishable_Y6R46tlz81eROsk3vh3iuw_S0KaDuPH'");
if (!out.includes('wztoupambatmvhwdhjmy') || !out.includes('sb_publishable_Y6R46')) throw new Error('staging yapılandırması yazılamadı');
mkdirSync(new URL('../dist-dogrula/', import.meta.url), { recursive: true });
writeFileSync(new URL('../dist-dogrula/kisg-dogrula-staging.html', import.meta.url), out);
console.log('dist-dogrula/kisg-dogrula-staging.html');
