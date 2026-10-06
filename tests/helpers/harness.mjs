// Kırmızı İSG Professional — ortak test altyapısı (fake Supabase REST/Auth/Storage, fake Realtime,
// Hostinger üst sayfa + srcdoc iframe simülasyonu, CDN kitaplıkları yerelden). Tüm paketler bunu kullanır.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const APP = fs.readFileSync(process.env.APPFILE || path.join(ROOT, 'kisg-professional-app.html'), 'utf8');
const NM = path.join(ROOT, 'node_modules') + '/';
const OUT = process.env.OUT || path.join(ROOT, 'tests', 'output');
fs.mkdirSync(OUT, { recursive: true });
const U1 = '11111111-1111-4111-8111-111111111111', U2 = '22222222-2222-4222-8222-222222222222';
const now = Date.now();
const iso = m => new Date(now - m * 60000).toISOString();
const db = {
  profiles: [
    { id: U1, full_name: 'Ayşe Yılmaz', avatar_url: null, profession: 'İş Güvenliği Uzmanı', title: 'A Sınıfı İş Güvenliği Uzmanı', certificate_class: null, city: 'İstanbul', current_company: 'Kırmızı Yapı A.Ş.', about: 'Şantiye ve üretim tesislerinde 8 yıllık saha deneyimi.', social_links: [{ platform: 'linkedin', url: 'https://linkedin.com/in/ayse' }], linkedin_url: 'https://linkedin.com/in/ayse', instagram_url: null, website_url: null, is_discoverable: true, show_phone_publicly: false, phone: '+905551112233', experience_range: '5-10 yıl', specialties: ['Yüksekte çalışma'], job_role: 'x', last_post_at: iso(5) },
    { id: U2, full_name: 'Mehmet Şahin Öztürk', avatar_url: null, profession: 'İşyeri Hekimi', title: null, certificate_class: 'İşyeri Hekimi', city: 'Kocaeli', current_company: 'Körfez OSB Sağlık Birimi', about: 'Sanayi tesislerinde işyeri hekimliği.\nPeriyodik muayene, ilk yardım eğitimleri ve meslek hastalıkları takibi üzerine çalışıyorum. '.repeat(3), social_links: [{ platform: 'website', url: 'https://ornek.com' }, { platform: 'instagram', url: 'https://instagram.com/mehmet' }], linkedin_url: null, instagram_url: null, website_url: null, is_discoverable: true, show_phone_publicly: true, phone: '05324445566', experience_range: '10-15 yıl', last_post_at: iso(1) }
  ],
  professional_posts: [],
  professional_services: [
    { id: 'aaaaaaaa-0000-4000-8000-000000000001', user_id: U2, title: 'İşyeri Hekimliği Hizmeti', category_id: 1, description: 'OSB içindeki işletmelere tam kapsamlı işyeri hekimliği.', service_region: 'Kocaeli', service_mode: 'onsite', status: 'active', created_at: iso(100), category: { id: 1, name: 'Sağlık' } },
    { id: 'aaaaaaaa-0000-4000-8000-000000000002', user_id: U2, title: 'İlk Yardım Eğitimi', category_id: 2, description: 'Sertifikalı temel ilk yardım eğitimi.', service_region: 'Marmara', service_mode: 'both', status: 'active', created_at: iso(200), category: { id: 2, name: 'Eğitim' } }
  ]
};
for (let i = 0; i < 14; i++) {
  const uid = i % 3 === 0 ? U2 : U1, a = db.profiles.find(p => p.id === uid);
  db.professional_posts.push({ id: `bbbbbbbb-0000-4000-8000-${String(i).padStart(12, '0')}`, user_id: uid, content: `Çalışma #${i}: sahada risk değerlendirmesi ve düzeltici faaliyet takibi yapıldı.`, image_path: i === 0 || i === 2 ? `${uid}/p${i}.png` : null, profile_featured_order: uid === U2 && i === 9 ? 1 : null, created_at: iso(10 + i * 30), updated_at: iso(10 + i * 30), status: 'active', category: { id: 1, name: 'Risk Değerlendirmesi' }, author: { id: a.id, full_name: a.full_name, avatar_url: null, profession: a.profession, title: a.title, certificate_class: a.certificate_class, current_company: a.current_company }, _baseLikes: i % 4 });
}
db.professional_post_comments = [
  { id: 'cccccccc-0000-4000-8000-000000000001', post_id: 'bbbbbbbb-0000-4000-8000-000000000001', user_id: U2, content: 'Harika saha çalışması, elinize sağlık.', status: 'active', created_at: iso(50), updated_at: iso(50) },
  { id: 'cccccccc-0000-4000-8000-000000000002', post_id: 'bbbbbbbb-0000-4000-8000-000000000001', user_id: U2, content: 'Kontrol listesini paylaşır mısınız?', status: 'active', created_at: iso(40), updated_at: iso(40) }
];
db.professional_comment_likes = [];
// Gerçekçi yorum verisi: #5 (U2'nin) bigint kimlikli 3 yorum + sayaç dizisi boş; #6 sayaç bayat 0 ama 1 yorum var
db.professional_post_comments.push(
  { id: 11, post_id: 'bbbbbbbb-0000-4000-8000-000000000005', user_id: U1, content: 'Tatbikat planını paylaşır mısınız?', status: 'active', created_at: iso(120), updated_at: iso(120) },
  { id: 12, post_id: 'bbbbbbbb-0000-4000-8000-000000000005', user_id: U2, content: 'Tabii, profilime ekleyeceğim.', status: 'active', created_at: iso(110), updated_at: iso(110) },
  { id: 13, post_id: 'bbbbbbbb-0000-4000-8000-000000000005', user_id: U1, content: 'Silinmiş yorum', status: 'deleted', created_at: iso(100), updated_at: iso(100) },
  { id: 14, post_id: 'bbbbbbbb-0000-4000-8000-000000000005', user_id: U1, content: 'Teşekkürler, çok faydalı oldu.', status: 'active', created_at: iso(90), updated_at: iso(90) },
  { id: 'cccccccc-0000-4000-8000-000000000009', post_id: 'bbbbbbbb-0000-4000-8000-000000000006', user_id: U2, content: 'Sayaçta görünmeyen mevcut yorum.', status: 'active', created_at: iso(60), updated_at: iso(60) }
);
db.professional_posts.find(x => x.id === 'bbbbbbbb-0000-4000-8000-000000000005')._embedEmpty = true;
db.professional_posts.find(x => x.id === 'bbbbbbbb-0000-4000-8000-000000000006')._embedStaleZero = true;
db.professional_service_categories = [{ id: 1, name: 'Sağlık', slug: 'saglik', sort_order: 1, is_active: true }, { id: 2, name: 'Eğitim', slug: 'egitim', sort_order: 2, is_active: true }, { id: 3, name: 'Risk Değerlendirmesi', slug: 'risk', sort_order: 3, is_active: true }, { id: 4, name: 'Ölçüm & Analiz', slug: 'olcum', sort_order: 4, is_active: true }];
db.professional_services.push(
  { id: 'aaaaaaaa-0000-4000-8000-000000000003', user_id: U1, title: 'Şantiye Risk Değerlendirmesi ve Acil Durum Planı', category_id: 3, description: 'İnşaat sahalarına özel risk analizi, acil durum planı ve çalışan bilgilendirmesi.', service_region: 'İstanbul', service_mode: 'onsite', status: 'active', created_at: iso(20), category: { id: 3, name: 'Risk Değerlendirmesi' } },
  { id: 'aaaaaaaa-0000-4000-8000-000000000004', user_id: U1, title: 'Uzaktan İSG Danışmanlığı', category_id: 3, description: 'Küçük işletmeler için aylık uzaktan danışmanlık ve mevzuat takibi.', service_region: null, service_mode: 'remote', status: 'active', created_at: iso(300), category: { id: 3, name: 'Risk Değerlendirmesi' } },
  { id: 'aaaaaaaa-0000-4000-8000-000000000005', user_id: U2, title: 'Gürültü ve Toz Ölçümü', category_id: 4, description: 'Akredite cihazlarla ortam ölçümü ve raporlama.', service_region: 'Kocaeli, Sakarya', service_mode: 'onsite', status: 'active', created_at: iso(400), category: { id: 4, name: 'Ölçüm & Analiz' } },
  { id: 'aaaaaaaa-0000-4000-8000-000000000006', user_id: U1, title: 'Yüksekte Çalışma Eğitimi', category_id: 2, description: 'Uygulamalı yüksekte çalışma eğitimi ve sertifika.', service_region: 'Ankara', service_mode: 'both', status: 'active', created_at: iso(500), category: { id: 2, name: 'Eğitim' } }
);
db.professional_services.forEach(v => { const a = db.profiles.find(p => p.id === v.user_id); v.provider = { id: a.id, full_name: a.full_name, avatar_url: null, profession: a.profession, title: a.title, certificate_class: a.certificate_class, current_company: a.current_company, city: a.city, show_phone_publicly: a.show_phone_publicly }; });
const writes = [], uploads = [];
const IMG = fs.readFileSync(NM + '@expo-google-fonts/inter/Inter_400Regular.ttf.png');
db.professional_post_likes = []; db.professional_comment_likes ||= [];
const DB0 = JSON.stringify(db);
const resetDb = () => { for (const k of Object.keys(db)) delete db[k]; Object.assign(db, JSON.parse(DB0)); };

// PostgREST imleç ifadeleri: or=(created_at.gt."X",and(created_at.eq."X",id.gt."Y")) (gt/lt). Diğer or'lar yok sayılır.
function cursorOr(expr) {
  const m = /^\(?(?:and\()?\(?created_at\.(gt|lt)\."([^"]+)",and\(created_at\.eq\."([^"]+)",id\.(gt|lt)\."([^"]+)"\)\)?\)?$/.exec(expr.replace(/^and\(|\)$/g, m => m));
  if (!m) return null;
  const [, op, t, t2, op2, id] = m, cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const T = Date.parse(t);
  return r => { const rt = Date.parse(r.created_at); const c = rt < T ? -1 : rt > T ? 1 : 0; return op === 'gt' ? (c > 0 || (c === 0 && (op2 === 'gt' ? cmp(String(r.id), id) > 0 : cmp(String(r.id), id) < 0))) : (c < 0 || (c === 0 && (op2 === 'lt' ? cmp(String(r.id), id) < 0 : cmp(String(r.id), id) > 0))); };
}
function filterRows(rows, sp) {
  let out = rows.slice();
  for (const v of sp.getAll('or')) { const fn = cursorOr(v.replace(/^\(|\)$/g, '')); if (fn) out = out.filter(fn); }
  for (const [k, v] of sp) {
    if (['select', 'order', 'limit', 'or', 'offset'].includes(k) || k.includes('.')) continue;
    if (v.startsWith('eq.')) { const x = v.slice(3); out = out.filter(r => String(r[k]) === x); }
    else if (v.startsWith('in.(')) { const xs = v.slice(4, -1).split(','); out = out.filter(r => xs.includes(String(r[k]))); }
    else if (v.startsWith('not.is.null')) out = out.filter(r => r[k] != null);
    else if (v.startsWith('neq.')) { const x = v.slice(4); out = out.filter(r => String(r[k]) !== x); }
  }
  const lim = sp.get('limit'); if (lim) out = out.slice(0, +lim);
  return out;
}
let seq = 1000;
function orderRows(rows, sp) {
  const o = sp.get('order'); if (!o) return rows;
  // Postgres gibi NULL sırası: varsayılan asc → nulls last, desc → nulls first; .nullsfirst/.nullslast uyulur.
  const keys = o.split(',').map(x => { const [k, ...m] = x.split('.'), d = m.includes('desc') ? -1 : 1; return [k, d, m.includes('nullsfirst') ? true : m.includes('nullslast') ? false : d === -1]; });
  return rows.slice().sort((a, b) => { for (const [k, d, nf] of keys) { const an = a[k] == null, bn = b[k] == null; if (an !== bn) return an === nf ? -1 : 1; if (an) continue; if (a[k] < b[k]) return -d; if (a[k] > b[k]) return d; } return 0; });
}
// Gerçek PostgREST gibi: gömülü sayaçlar satırlardan canlı hesaplanır (comments.status filtresiyle).
function withEmbeds(table, rows, sp) {
  if (table !== 'professional_posts') return rows;
  const sel = sp.get('select') || '', cst = sp.get('comments.status');
  return rows.map(r => {
    const x = { ...r };
    if (/likes:professional_post_likes\(count\)/.test(sel)) x.likes = [{ count: (db.professional_post_likes || []).filter(l => l.post_id === r.id).length + (r._baseLikes || 0) }];
    if (/comments:professional_post_comments\(count\)/.test(sel)) {
      if (r._embedEmpty) x.comments = [];                         // üretimde görülebilen: sayaç dizisi boş
      else if (r._embedStaleZero) x.comments = [{ count: 0 }];   // sayaç satırlarla uyuşmuyor
      else x.comments = [{ count: (db.professional_post_comments || []).filter(c => c.post_id === r.id && (!cst || c.status === cst.slice(3))).length }];
    } else delete x.comments;
    delete x._baseLikes; delete x._embedEmpty; delete x._embedStaleZero;
    return x;
  });
}
// PostgREST RPC mock'u (Security Fix Pack 1): get_public_phone / get_my_private_profile.
// db._rpcMode: 'missing' → PGRST202 (migration uygulanmamış), 'error' → 500.
const rpcCalls = [];
function handleRpc(route, fn) {
  const req = route.request(), H = { 'access-control-allow-origin': '*' };
  const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: H, body: JSON.stringify(body) });
  const body = JSON.parse(req.postData() || '{}'), auth = (req.headers()['authorization'] || '').replace(/^Bearer\s+/i, '');
  rpcCalls.push({ fn, body, auth });
  if (db._rpcMode === 'missing') return json({ code: 'PGRST202', message: `Could not find the function public.${fn} in the schema cache` }, 404);
  if (db._rpcMode === 'error') return json({ code: 'XX000', message: 'boom' }, 500);
  if (fn === 'get_public_phone') { const p = db.profiles.find(x => x.id === body.profile_id); return json(p && p.show_phone_publicly && p.phone ? p.phone : null); }
  if (fn === 'get_my_private_profile') {
    if (!auth || auth.startsWith('sb_publishable_')) return json({ code: '42501', message: 'permission denied for function get_my_private_profile' }, 401);
    let sub = null; try { sub = JSON.parse(Buffer.from(auth.split('.')[1], 'base64url').toString()).sub; } catch {}
    const p = db.profiles.find(x => x.id === sub) || db.profiles.find(x => x.id === U1);
    return json(p ? [{ id: p.id, email: 'a@b.c', phone: p.phone ?? null, show_phone_publicly: !!p.show_phone_publicly, is_premium: !!p.is_premium, daily_reports_used: 0, monthly_reports_used: 0, last_report_date: null, onesignal_notification_id: null }] : []);
  }
  // Onaylı hesap (v4.41.0): db._verified tanımlıysa migration uygulanmış sayılır.
  if (fn === 'kisg_verified_users' && db._verified) return json(db._verified);
  if (fn === 'kisg_submit_verification' && db._verified) return db._submitErr ? json({ code: '42501', message: db._submitErr }, 400) : json('pending');
  return json({ code: 'PGRST202', message: 'unknown' }, 404);
}
async function handleRest(route) {
  const req = route.request(), u = new URL(req.url()), table = u.pathname.split('/').pop();
  if (u.pathname.includes('/rest/v1/rpc/')) return handleRpc(route, table);
  const method = req.method(), accept = req.headers()['accept'] || '';
  const rows = db[table] || (db[table] = []);
  const json = (body, status = 200, headers = {}) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', ...headers }, body: JSON.stringify(body) });
  if (method === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  if (method === 'HEAD') { const n = filterRows(rows, u.searchParams).length; return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range', 'content-range': `0-0/${n}` } }); }
  if (method === 'PATCH') {
    const body = JSON.parse(req.postData() || '{}'); writes.push({ table, body, q: u.search });
    const hit = filterRows(rows, u.searchParams); hit.forEach(r => Object.assign(r, body));
    return json(accept.includes('pgrst.object') ? hit[0] : hit);
  }
  if (method === 'POST') {
    const body = JSON.parse(req.postData() || '{}'); writes.push({ table, body });
    const list = (Array.isArray(body) ? body : [body]).map(b => ({ id: table === 'professional_post_comments' && b.post_id === 'bbbbbbbb-0000-4000-8000-000000000005' ? ++seq : (b.id || `dddddddd-0000-4000-8000-${String(++seq).padStart(12, '0')}`), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...b }));
    if (!['professional_post_likes', 'professional_comment_likes', 'professional_post_comments', 'professional_posts', 'professional_services', 'professional_saved_items'].includes(table)) return json([], 201);
    rows.push(...list);
    return json(accept.includes('pgrst.object') ? list[0] : list, 201);
  }
  if (method === 'DELETE') { writes.push({ table, del: u.search }); const hit = new Set(filterRows(rows, u.searchParams)); db[table] = rows.filter(r => !hit.has(r)); return json([]); }
  let out = orderRows(filterRows(rows.filter(r => r), new URLSearchParams([...u.searchParams].filter(([k]) => k !== 'limit'))), u.searchParams);
  const lim = u.searchParams.get('limit'); if (lim) out = out.slice(0, +lim);
  out = withEmbeds(table, out, u.searchParams);
  if (table === 'profiles' && u.searchParams.get('select') === 'phone') out = out.map(r => ({ phone: r.phone }));
  else if (table === 'profiles') out = out.map(({ phone, ...r }) => r); // telefon public select'te yok
  if (accept.includes('pgrst.object')) return out.length ? json(out[0]) : json({ code: 'PGRST116', message: 'no rows' }, 406);
  return json(out);
}
const libs = {
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/dist/umd/supabase.min.js': NM + '@supabase/supabase-js/dist/umd/supabase.js',
  'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js': NM + 'jspdf/dist/jspdf.umd.min.js',
  'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js': NM + 'qrcode-generator/qrcode.js',
  'https://cdn.jsdelivr.net/npm/@expo-google-fonts/inter@0.2.3/Inter_400Regular.ttf': NM + '@expo-google-fonts/inter/Inter_400Regular.ttf',
  'https://cdn.jsdelivr.net/npm/@expo-google-fonts/inter@0.2.3/Inter_700Bold.ttf': NM + '@expo-google-fonts/inter/Inter_700Bold.ttf'
};
// Gerçek Hostinger sayfaları html,body{height:100%} kullanır (v4.9.4 beyaz alan hatası bu farktan kaçmıştı).
// Eski davranışla karşılaştırmak için: HOSTINGER_HEIGHT=0
const HOSTINGER_BASE_CSS = process.env.HOSTINGER_HEIGHT === '0' ? '' : 'html,body{height:100%}';
const hostPage = path => `<!doctype html><html><head><meta charset="utf-8"><title>${path} | Kırmızı İSG</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>${HOSTINGER_BASE_CSS}body{margin:0;font-family:sans-serif}header{height:64px;background:#222;color:#fff;display:flex;align-items:center;padding:0 16px}footer{height:200px;background:#eee}</style></head><body><header>Hostinger header</header><section><div class="block-layout"><div><iframe style="width:100%;border:0" srcdoc="${APP.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"></iframe></div></div></section><footer>footer</footer><script>window.__bootMark = Math.random();</script></body></html>`;

const errors = [];
// Supabase Realtime sahte sunucusu (Phoenix vsn 1.0.0 JSON protokolü: phx_join/phx_reply/heartbeat/postgres_changes/phx_leave)
// anon rolünün Realtime filtresi kuramadığı tablolar (gerçek RLS/kolon yetkisi: yalnız authenticated).
const ANON_DENIED_TABLES = ['professional_notifications'];
function realtimeMock(ctx) {
  const rt = { conns: new Set(), joins: 0, leaves: 0, down: false, bindId: 0, joinLog: [], rejects: [] };
  rt.ready = ctx.routeWebSocket(/\/realtime\/v1\/websocket/, ws => {
    if (rt.down) { ws.close({ code: 1011, reason: 'down' }); return; }
    const conn = { ws, topics: new Map() };
    rt.conns.add(conn);
    ws.onMessage(raw => {
      let m; try { m = JSON.parse(String(raw)); } catch { return; }
      const reply = (payload = {}) => ws.send(JSON.stringify({ topic: m.topic, event: 'phx_reply', payload: { status: 'ok', response: payload }, ref: m.ref, join_ref: m.join_ref }));
      if (m.topic === 'phoenix' && m.event === 'heartbeat') return reply();
      if (m.event === 'phx_join') {
        const raw = m.payload?.config?.postgres_changes || [];
        const token = m.payload?.access_token || null, anon = !token || String(token).startsWith('sb_publishable');
        rt.joinLog.push({ topic: m.topic, token, anon, bindings: raw.map(b => ({ ...b })) });
        // Üretimdeki realtime.subscription_check_filters gibi: filtre kolonu katılan rolün SELECT yetkisiyle doğrulanır.
        // anon rolünün professional_notifications üzerinde yetkisi yok → sunucu join'i reddeder.
        const denied = anon && raw.find(b => ANON_DENIED_TABLES.includes(b.table) && b.filter);
        if (denied) {
          const reason = `invalid column for filter ${String(denied.filter).split('=')[0]}`;
          rt.rejects.push({ topic: m.topic, reason });
          return ws.send(JSON.stringify({ topic: m.topic, event: 'phx_reply', payload: { status: 'error', response: { reason } }, ref: m.ref, join_ref: m.join_ref }));
        }
        const pcs = raw.map(b => ({ ...b, id: ++rt.bindId }));
        conn.topics.set(m.topic, { join_ref: m.join_ref, bindings: pcs });
        rt.joins++;
        return reply({ postgres_changes: pcs });
      }
      if (m.event === 'phx_leave') { conn.topics.delete(m.topic); rt.leaves++; return reply(); }
      if (m.event === 'access_token') return;
    });
    ws.onClose(() => rt.conns.delete(conn));
  });
  rt.channels = () => [...rt.conns].reduce((n, c) => n + c.topics.size, 0);
  // Belirli bir tabloyu dinleyen kanal sayısı (v4.11.0'dan beri giriş yapmış kullanıcıda ayrıca bildirim kanalı açılır).
  rt.channelsFor = table => [...rt.conns].reduce((n, c) => n + [...c.topics.values()].filter(t => t.bindings.some(b => b.table === table)).length, 0);
  rt.insert = row => {
    db.professional_posts.push(row);
    for (const c of rt.conns) for (const [topic, t] of c.topics) {
      const b = t.bindings.find(b => b.table === 'professional_posts' && b.event === 'INSERT' && (!b.filter || b.filter === `status=eq.${row.status}`));
      if (!b) continue;
      const record = { id: row.id, user_id: row.user_id, status: row.status, created_at: row.created_at, content: row.content };
      c.ws.send(JSON.stringify({ topic, event: 'postgres_changes', ref: null, payload: { ids: [b.id], data: { schema: 'public', table: 'professional_posts', commit_timestamp: row.created_at, type: 'INSERT', record, columns: [{ name: 'id', type: 'uuid' }, { name: 'user_id', type: 'uuid' }, { name: 'status', type: 'text' }, { name: 'created_at', type: 'timestamptz' }, { name: 'content', type: 'text' }], errors: null } } }));
    }
  };
  rt.dropAll = () => { for (const c of rt.conns) c.ws.close({ code: 1006, reason: 'drop' }); };
  return rt;
}
let postSeq = 900;
function makePost(uid, extra = {}) {
  const a = db.profiles.find(p => p.id === uid), n = ++postSeq;
  return { id: `eeeeeeee-0000-4000-8000-${String(n).padStart(12, '0')}`, user_id: uid, content: `Realtime Çalışma #${n}`, image_path: null, profile_featured_order: null, created_at: new Date(Date.now() + n).toISOString(), updated_at: new Date().toISOString(), status: 'active', category: null, author: { id: a.id, full_name: a.full_name, avatar_url: null, profession: a.profession, title: a.title, certificate_class: a.certificate_class, current_company: a.current_company }, ...extra };
}
async function setup(ctx, loggedIn) {
  ctx._rt = realtimeMock(ctx); await ctx._rt.ready;
  await ctx.route('https://isgcalisanplatformu.com/**', r => r.fulfill({ contentType: 'text/html', body: hostPage(new URL(r.request().url()).pathname) }));
  await ctx.route('https://twaptpofhbnnfciowoig.supabase.co/rest/v1/**', handleRest);
  await ctx.route('https://twaptpofhbnnfciowoig.supabase.co/auth/v1/**', r => {
    const req = r.request(), H = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 200, headers: H });
    const user = { id: U1, aud: 'authenticated', email: 'a@b.c', role: 'authenticated' };
    if (req.url().includes('/token')) { const body = JSON.parse(req.postData() || '{}'); if (body.password !== 'dogru-sifre') return r.fulfill({ status: 400, headers: H, contentType: 'application/json', body: JSON.stringify({ code: 'invalid_credentials', message: 'Invalid login credentials' }) }); return r.fulfill({ headers: H, contentType: 'application/json', body: JSON.stringify({ access_token: 'x.eyJzdWIiOiIxIn0.y', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r', user }) }); }
    if (req.url().includes('/logout')) return r.fulfill({ status: 204, headers: H, body: '' });
    return r.fulfill({ headers: H, contentType: 'application/json', body: JSON.stringify(user) });
  });
  await ctx.route('https://twaptpofhbnnfciowoig.supabase.co/storage/**', r => {
    const req = r.request(), u = new URL(req.url()), H = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 200, headers: H });
    if (req.method() === 'GET' && /\/object\/public\/(professional-posts|general|profile-avatars)\//.test(u.pathname)) return r.fulfill({ headers: H, contentType: 'image/png', body: IMG });
    if (req.method() === 'POST' || req.method() === 'PUT') { uploads.push({ path: u.pathname, ct: req.headers()['content-type'], body: req.postDataBuffer(), headers: req.headers() }); return r.fulfill({ headers: H, contentType: 'application/json', body: JSON.stringify({ Key: u.pathname }) }); }
    if (req.method() === 'DELETE') { uploads.push({ del: true, path: u.pathname, body: req.postData() }); return r.fulfill({ headers: H, contentType: 'application/json', body: '[]' }); }
    return r.fulfill({ status: 404, headers: H, body: '' });
  });
  await ctx.route('https://cdn.jsdelivr.net/**', r => { const f = libs[r.request().url()]; return f ? r.fulfill({ headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) }) : r.fulfill({ status: 404 }); });
  if (process.env.SAFARI) await ctx.addInitScript(() => { const o = HTMLCanvasElement.prototype.toBlob; HTMLCanvasElement.prototype.toBlob = function (cb, type, q) { return o.call(this, cb, type === 'image/webp' ? 'image/png' : type, q); }; });
  if (loggedIn) await ctx.addInitScript(([uid]) => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    localStorage.setItem('sb-twaptpofhbnnfciowoig-auth-token', JSON.stringify({ access_token: 'x.eyJzdWIiOiIxIn0.y', token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'r', user: { id: uid, aud: 'authenticated', email: 'a@b.c' } }));
  }, [U1]);
}
const frameOf = page => page.frames().find(f => f !== page.mainFrame());
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) process.exitCode = 1; };



// Chromium: ortamdaki önceden kurulu tarayıcı (CHROMIUM_PATH ile değiştirilebilir).
const DEFAULT_CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const LAUNCH = fs.existsSync(process.env.CHROMIUM_PATH || DEFAULT_CHROMIUM) ? { executablePath: process.env.CHROMIUM_PATH || DEFAULT_CHROMIUM } : {};

export { rpcCalls, handleRpc, chromium, fs, ROOT, ANON_DENIED_TABLES, APP, NM, OUT, U1, U2, now, iso, db, writes, uploads, IMG, DB0, resetDb, cursorOr, filterRows, seq, orderRows, withEmbeds, handleRest, libs, HOSTINGER_BASE_CSS, hostPage, errors, realtimeMock, postSeq, makePost, setup, frameOf, check, DEFAULT_CHROMIUM, LAUNCH };
