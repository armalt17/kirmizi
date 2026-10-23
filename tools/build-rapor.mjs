// Rapor QR sayfası (/r/{kod}) çıktıları (bağımlılıksız): node tools/build-rapor.mjs
//  - dist-rapor/r-worker.js: Cloudflare Worker (production). Sayfa içine gömülü; /r/api deneme sınırlı vekil.
//    Cloudflare → Workers & Pages → Oluştur → bu dosyanın TAMAMI → Rota: isgcalisanplatformu.com/r/* ve www.isgcalisanplatformu.com/r/*
//  - dist-rapor/kisg-rapor-staging.html: tarayıcıda ?k=KOD ile açılıp denenir; doğrudan staging Supabase'e bakar.
// Anahtarlar istemciye açık (publishable) anahtarlardır; gizli anahtar yok.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const PROD = { url: 'https://cglndmbjinzmmbimxqok.supabase.co', key: 'sb_publishable_EeIO-kiSHIhdYotKcew3Vg_E9Qhgsl0' };
const STAGING = { url: 'https://vleellyrhmtjpwgzrqii.supabase.co', key: 'sb_publishable_85NeRUePWMVOCQH4sOISuw_CzdvwlDR' };

const src = readFileSync(new URL('../kisg-rapor.html', import.meta.url), 'utf8');
if (!src.includes("supabaseUrl: ''") || !src.includes("supabaseKey: ''")) throw new Error('kisg-rapor.html yapılandırması beklenen biçimde değil');

const staging = src
  .replace("supabaseUrl: ''", `supabaseUrl: '${STAGING.url}'`)
  .replace("supabaseKey: ''", `supabaseKey: '${STAGING.key}'`);

const worker = `// Cloudflare Worker: isgcalisanplatformu.com/r/* — rapor QR sayfası "İşyeriniz için hazırlanan rapor"
// ÜRETİLMİŞ DOSYA: kaynağı kisg-rapor.html ve tools/build-rapor.mjs (web deposu). Elle düzenlemeyin; yeniden üretin.
// GET  /r/{kod}            → sayfa (arama motorlarına kapalı)
// POST /r/api/report_public, /r/api/report_public_match → Supabase'e iletilir; IP başına dakikalık deneme sınırı.
// IP adresi hiçbir yere yazılmaz; yalnız bu Worker'ın belleğinde, sınır penceresi boyunca sayılır.

const SUPABASE_URL = '${PROD.url}';
const SUPABASE_KEY = '${PROD.key}'; // istemciye açık (publishable) anahtar
const PAGE = ${JSON.stringify(src)};

const LIMITS = { report_public: 20, report_public_match: 30 }; // dakikada, IP başına
const WINDOW_MS = 60 * 1000;
const hits = new Map();

function limited(ip, name) {
  const now = Date.now();
  if (hits.size > 5000) for (const [k, v] of hits) if (now - v.start > WINDOW_MS) hits.delete(k);
  const key = name + '|' + ip;
  const cur = hits.get(key);
  if (!cur || now - cur.start > WINDOW_MS) { hits.set(key, { start: now, n: 1 }); return false; }
  cur.n += 1;
  return cur.n > LIMITS[name];
}

const NOINDEX = { 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };
const reply = (body, status, type, extra) =>
  new Response(body, { status, headers: { 'Content-Type': type, ...NOINDEX, ...extra } });
const json = (body, status = 200) => reply(JSON.stringify(body), status, 'application/json; charset=utf-8', { 'Cache-Control': 'no-store' });

function validBody(name, b) {
  if (!b || typeof b.p_code !== 'string' || b.p_code.length > 40) return null;
  if (name === 'report_public') return { p_code: b.p_code };
  if (typeof b.p_sha256 !== 'string' || !/^[0-9a-fA-F]{64}$/.test(b.p_sha256)) return null;
  return { p_code: b.p_code, p_sha256: b.p_sha256 };
}

export default {
  async fetch(request) {
    const { pathname } = new URL(request.url);
    const api = pathname.match(/^\\/r\\/api\\/([a-z_]+)$/);
    if (api) {
      const name = api[1];
      if (!(name in LIMITS)) return json({ error: 'not_found' }, 404);
      if (request.method !== 'POST') return json({ error: 'method' }, 405);
      const ip = request.headers.get('CF-Connecting-IP') || 'x';
      if (limited(ip, name)) return json({ error: 'limit' }, 429);
      let body = null;
      try { body = validBody(name, await request.json()); } catch (e) { body = null; }
      if (!body) return json({ error: 'bad_request' }, 400);
      const res = await fetch(SUPABASE_URL + '/rest/v1/rpc/' + name, {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) return json({ error: 'upstream' }, 502);
      return reply(await res.text(), 200, 'application/json; charset=utf-8', { 'Cache-Control': 'no-store' });
    }
    if (pathname === '/r' || pathname.startsWith('/r/')) {
      if (request.method !== 'GET' && request.method !== 'HEAD') return reply('', 405, 'text/plain');
      return reply(PAGE, 200, 'text/html; charset=utf-8', { 'Cache-Control': 'public, max-age=300' });
    }
    return fetch(request);
  },
};
`;

mkdirSync(new URL('../dist-rapor/', import.meta.url), { recursive: true });
writeFileSync(new URL('../dist-rapor/kisg-rapor-staging.html', import.meta.url), staging);
writeFileSync(new URL('../dist-rapor/r-worker.js', import.meta.url), worker);
console.log('dist-rapor/r-worker.js\ndist-rapor/kisg-rapor-staging.html');
