// Admin V1 / Migration A — DB regression testi (yerel geçici PostgreSQL, production'a bağlanmaz).
// Şema: tests/helpers/kisg-prod-stub.sql + professional_reports + Fix Pack 1 + production kanıtındaki
// (2026-10-02) beğeni / ilan / duyuru / abonelik tabloları ve politikaları.
// Yazma kalıpları production pg_stat_statements'taki PostgREST biçimiyle birebir tekrarlanır.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startCluster } from '../helpers/localpg.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MIG = f => path.join(ROOT, 'db/migrations', f);
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) process.exitCode = 1; };
const pg = startCluster();
if (!pg) { console.log('SKIP PostgreSQL bulunamadı — DB testi çalıştırılmadı'); process.exit(0); }
const { psql, runFile, as } = pg;
const ok = r => r.code === 0;
const errOf = r => (r.err.match(/ERROR:\s+(.*)/) || [, r.err])[1];

// Kullanıcılar: A normal, M normal (hedef içerik sahibi), X admin (stub) + yaptırım senaryoları
const A = '11111111-1111-4111-8111-111111111111', M = '22222222-2222-4222-8222-222222222222', X = '99999999-9999-4999-8999-999999999999';
const U = {
  warned:   'aaaaaaa1-0000-4000-8000-000000000001', suspended: 'aaaaaaa2-0000-4000-8000-000000000002',
  banned:   'aaaaaaa3-0000-4000-8000-000000000003', bannedTimed: 'aaaaaaa4-0000-4000-8000-000000000004',
  expired:  'aaaaaaa5-0000-4000-8000-000000000005', revoked: 'aaaaaaa6-0000-4000-8000-000000000006',
  future:   'aaaaaaa7-0000-4000-8000-000000000007'
};
const user = id => ({ sub: id, role: 'authenticated' });
const CAT = 'cccccccc-0000-4000-8000-000000000001';
const MPOST = 'dddddddd-0000-4000-8000-000000000001', MCOMMENT = 'dddddddd-0000-4000-8000-000000000002';
const own = (id, n) => `${id.slice(0, 8)}-0000-4000-9000-00000000000${n}`;   // kullanıcının kendi post/yorum/hizmet id'leri

const SETUP = `
create function auth.role() returns text language sql stable as $f$ select auth.jwt() ->> 'role' $f$;
grant execute on function auth.role() to anon, authenticated, service_role;
create table public.professional_post_likes (post_id uuid not null references public.professional_posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade, created_at timestamptz not null default now(), primary key (post_id, user_id));
create table public.professional_comment_likes (comment_id uuid not null references public.professional_post_comments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade, created_at timestamptz not null default now(), primary key (comment_id, user_id));
alter table public.professional_post_likes enable row level security;
alter table public.professional_comment_likes enable row level security;
create policy "Public can read post likes" on public.professional_post_likes for select using (true);
create policy "Users can like posts" on public.professional_post_likes for insert to authenticated with check (user_id = auth.uid());
create policy "Users can remove own likes" on public.professional_post_likes for delete to authenticated using (user_id = auth.uid());
create policy "Public can read comment likes" on public.professional_comment_likes for select using (true);
create policy "Users can like comments" on public.professional_comment_likes for insert to authenticated with check (user_id = auth.uid());
create policy "Users can unlike comments" on public.professional_comment_likes for delete to authenticated using (user_id = auth.uid());

create table public.job_postings (id uuid primary key default gen_random_uuid(), user_id uuid, city text, company_name text, contact_info text,
  description text, expires_at timestamptz, image_url text, is_active boolean, position text, urgency text, work_type text);
alter table public.job_postings enable row level security;
create policy "Allow authenticated users to insert job_postings" on public.job_postings for insert to authenticated with check (auth.uid() = user_id);
create policy "Allow everyone to select job_postings" on public.job_postings for select to anon, authenticated using (true);
create policy "Allow only admins to manage job_postings" on public.job_postings for all to authenticated
  using (exists (select 1 from user_roles where user_roles.id = auth.uid() and user_roles.role = 'admin'));
create policy "Giriş yapanlar ilan verebilir" on public.job_postings for insert with check (auth.role() = 'authenticated');
create table public.announcements (id uuid primary key default gen_random_uuid(), title text, content text, category text, category_id uuid,
  image_url text, is_pinned boolean, send_push_notification boolean);
alter table public.announcements enable row level security;
create policy "Everyone can view announcements" on public.announcements for select using (true);
create policy "Only Admins can modify announcements" on public.announcements for all
  using (auth.uid() in (select user_roles.id from user_roles where user_roles.role = 'admin'))
  with check (auth.uid() in (select user_roles.id from user_roles where user_roles.role = 'admin'));
alter table public.user_subscriptions alter column id drop default;
alter table public.user_subscriptions alter column id type uuid using gen_random_uuid();
alter table public.user_subscriptions alter column id set default gen_random_uuid();
alter table public.user_subscriptions enable row level security;
create policy "Kullanıcı kendi aboneliğini ekleyebilir" on public.user_subscriptions for insert with check (auth.uid() = user_id);
create policy "Kullanıcı kendi aboneliğini güncelleyebilir" on public.user_subscriptions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Kullanıcı kendi aboneliğini okuyabilir" on public.user_subscriptions for select using (auth.uid() = user_id);

insert into auth.users (id, email) select v, 'u' || left(v::text, 8) || '@ornek.com' from unnest(array[${Object.values(U).map(v => `'${v}'::uuid`).join(', ')}]) v;
insert into public.professional_posts (id, user_id, content) values ('${MPOST}', '${M}', 'M postu');
insert into public.professional_post_comments (id, post_id, user_id, content) values ('${MCOMMENT}', '${MPOST}', '${M}', 'M yorumu');
`;
// Her kullanıcı için kendi post / yorum / hizmet / beğeni (dashboard ile, kontrolden muaf)
const seedOwn = id => `
insert into public.professional_posts (id, user_id, content, profile_featured_order) values ('${own(id, 1)}', '${id}', 'kendi postu', 1), ('${own(id, 4)}', '${id}', 'silinecek post', 2);
insert into public.professional_post_comments (id, post_id, user_id, content) values ('${own(id, 2)}', '${MPOST}', '${id}', 'kendi yorumu');
insert into public.professional_services (id, user_id, title, description) values ('${own(id, 3)}', '${id}', 'kendi hizmeti', 'açıklama');
insert into public.professional_post_likes (post_id, user_id) values ('${MPOST}', '${id}');`;
const SANCTIONS = `
insert into public.professional_user_sanctions (user_id, type, reason, created_by) values ('${U.warned}', 'warning', 'uyarı', '${X}');
insert into public.professional_user_sanctions (user_id, type, reason, ends_at, created_by) values ('${U.suspended}', 'suspension', 'askı', now() + interval '7 days', '${X}');
insert into public.professional_user_sanctions (user_id, type, reason, created_by) values ('${U.banned}', 'ban', 'süresiz ban', '${X}');
insert into public.professional_user_sanctions (user_id, type, reason, ends_at, created_by) values ('${U.bannedTimed}', 'ban', 'süreli ban', now() + interval '30 days', '${X}');
insert into public.professional_user_sanctions (user_id, type, reason, starts_at, ends_at, created_by) values ('${U.expired}', 'suspension', 'süresi doldu', now() - interval '10 days', now() - interval '1 minute', '${X}');
insert into public.professional_user_sanctions (user_id, type, reason, ends_at, created_by, revoked_at, revoked_by) values ('${U.revoked}', 'suspension', 'iptal', now() + interval '7 days', '${X}', now(), '${X}');
insert into public.professional_user_sanctions (user_id, type, reason, starts_at, ends_at, created_by) values ('${U.future}', 'suspension', 'ileri tarihli', now() + interval '1 day', now() + interval '8 days', '${X}');
insert into public.professional_user_sanctions (user_id, type, reason, created_by) values ('${U.suspended}', 'warning', 'ek uyarı', '${X}');
`;

// PostgREST ile aynı SQL biçimi
const TYPES = { category_id: 'uuid', content: 'text', id: 'uuid', image_path: 'text', status: 'text', user_id: 'uuid', post_id: 'uuid', comment_id: 'uuid',
  description: 'text', service_mode: 'text', service_region: 'text', title: 'text', details: 'text', reason: 'text', target_id: 'text', target_type: 'text',
  profile_featured_order: 'smallint', email: 'text', full_name: 'text', is_premium: 'boolean', onesignal_notification_id: 'text', city: 'text',
  company_name: 'text', contact_info: 'text', expires_at: 'timestamptz', is_active: 'boolean', position: 'text', urgency: 'text', work_type: 'text',
  category: 'text', image_url: 'text', send_push_notification: 'boolean', platform: 'text', product_id: 'text', raw_payload: 'jsonb',
  transaction_id: 'text', will_renew: 'boolean', reviewed_by: 'uuid', phone: 'text' };
const lit = v => `'${JSON.stringify(v).replace(/'/g, "''")}'::json`;
const q = s => `"${s}"`;
const rec = cols => `json_to_record(pgrst_payload.json_data) AS _(${cols.map(c => `${q(c)} ${TYPES[c]}`).join(', ')})`;
const pgInsert = (table, body, conflict) => {
  const cols = Object.keys(body);
  return `WITH pgrst_source AS (INSERT INTO "public".${q(table)}(${cols.map(q).join(', ')}) SELECT ${cols.map(c => `"pgrst_body".${q(c)}`).join(', ')} FROM (SELECT ${lit(body)} AS json_data) pgrst_payload, LATERAL (SELECT ${cols.map(q).join(', ')} FROM ${rec(cols)} ) pgrst_body ${conflict ? `ON CONFLICT(${q(conflict)}) DO UPDATE SET ${cols.map(c => `${q(c)} = EXCLUDED.${q(c)}`).join(', ')} ` : ''}RETURNING 1) SELECT count(*) FROM pgrst_source`;
};
const pgUpdate = (table, body, where) => {
  const cols = Object.keys(body);
  return `WITH pgrst_source AS (UPDATE "public".${q(table)} SET ${cols.map(c => `${q(c)} = "pgrst_body".${q(c)}`).join(', ')} FROM (SELECT ${lit(body)} AS json_data) pgrst_payload, LATERAL (SELECT ${cols.map(q).join(', ')} FROM ${rec(cols)} ) pgrst_body WHERE ${where} RETURNING 1) SELECT count(*) FROM pgrst_source`;
};
const pgDelete = (table, where) => `WITH pgrst_source AS (DELETE FROM "public".${q(table)} WHERE ${where} RETURNING 1) SELECT count(*) FROM pgrst_source`;
const eq = (table, col, v) => `"public".${q(table)}.${q(col)} = '${v}'`;
let seq = 0;
const newId = () => `eeeeeeee-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

// Professional yazımları (web kalıpları)
const proWrites = id => [
  ['Post ekleme', pgInsert('professional_posts', { category_id: CAT, content: 'yeni', id: newId(), image_path: null, status: 'active', user_id: id })],
  ['Yorum ekleme', pgInsert('professional_post_comments', { content: 'yorum', post_id: MPOST, status: 'active', user_id: id })],
  ['Hizmet ekleme', pgInsert('professional_services', { category_id: CAT, description: 'd', service_mode: 'remote', service_region: 'İstanbul', status: 'active', title: 't', user_id: id })],
  ['Post beğenme', pgInsert('professional_post_likes', { post_id: own(id, 1), user_id: id })],
  ['Yorum beğenme', pgInsert('professional_comment_likes', { comment_id: MCOMMENT, user_id: id })],
  ['Şikâyet', pgInsert('professional_reports', { details: null, reason: 'spam', target_id: MPOST, target_type: 'post' })],
  ['Post düzenleme', pgUpdate('professional_posts', { content: 'düzenlendi' }, `${eq('professional_posts', 'id', own(id, 1))} AND ${eq('professional_posts', 'user_id', id)}`)],
  ['Öne çıkarma sırası', pgUpdate('professional_posts', { profile_featured_order: 3 }, `${eq('professional_posts', 'id', own(id, 1))} AND ${eq('professional_posts', 'user_id', id)}`)],
  ['Hizmet düzenleme', pgUpdate('professional_services', { title: 'yeni başlık' }, `${eq('professional_services', 'id', own(id, 3))} AND ${eq('professional_services', 'user_id', id)}`)]
];
// Kendi içeriğini kaldırma (her zaman serbest)
const removals = id => [
  ['Post silme (web: sıra + status)', pgUpdate('professional_posts', { profile_featured_order: null, status: 'deleted' }, `${eq('professional_posts', 'id', own(id, 4))} AND ${eq('professional_posts', 'user_id', id)}`)],
  ['Yorum silme', pgUpdate('professional_post_comments', { status: 'deleted' }, `${eq('professional_post_comments', 'id', own(id, 2))} AND ${eq('professional_post_comments', 'user_id', id)}`)],
  ['Hizmet arşivleme', pgUpdate('professional_services', { status: 'archived' }, `${eq('professional_services', 'id', own(id, 3))} AND ${eq('professional_services', 'user_id', id)}`)],
  ['Beğeni geri alma', pgDelete('professional_post_likes', `${eq('professional_post_likes', 'post_id', MPOST)} AND ${eq('professional_post_likes', 'user_id', id)}`)]
];
// Professional dışı mobil / web yazma yolları (yaptırımdan etkilenmemeli)
const otherWrites = id => [
  ['Profil upsert (mobil kayıt)', pgInsert('profiles', { email: `u${id.slice(0, 8)}@ornek.com`, full_name: 'Ad', id, is_premium: false, title: 'Uzman' }, 'id')],
  ['OneSignal kimliği (mobil)', pgUpdate('profiles', { onesignal_notification_id: 'os-x' }, eq('profiles', 'id', id))],
  ['Profil düzenleme (web)', pgUpdate('profiles', { full_name: 'Yeni Ad', phone: '+905550000000' }, eq('profiles', 'id', id))],
  ['İlan verme (mobil)', pgInsert('job_postings', { city: 'Ankara', company_name: 'F', contact_info: 'c', description: 'd', expires_at: '2099-01-01T00:00:00Z', is_active: true, position: 'İSG', urgency: 'normal', user_id: id, work_type: 'tam' })],
  ['Abonelik satırı (Android)', pgInsert('user_subscriptions', { expires_at: '2099-01-01T00:00:00Z', platform: 'android', product_id: 'p', raw_payload: {}, status: 'active', transaction_id: `GPA.${id}`, user_id: id, will_renew: true })],
  ['sync_my_premium_status', `select public.sync_my_premium_status() is not null`]
];

// ---------------- kurulum ----------------
let r = runFile(path.join(ROOT, 'tests/helpers/kisg-prod-stub.sql'));
check(ok(r), `production kopyası şema kuruldu ${r.err}`);
for (const f of ['20260929_professional_reports.sql', '20260930_security_fix_pack1.sql']) { r = runFile(MIG(f)); check(ok(r), `${f} (production'da) kuruldu ${r.err}`); }
r = psql(SETUP);
check(ok(r), `beğeni / ilan / duyuru / abonelik tabloları kuruldu ${r.err}`);
r = psql([A, ...Object.values(U)].map(seedOwn).join('\n'));
check(ok(r), `kullanıcı içerikleri kuruldu ${r.err}`);

const snapshot = () => psql(`select string_agg(x, ' || ' order by x) from (
  select 'pol:' || schemaname || '.' || tablename || ':' || policyname || ':' || cmd || ':' || array_to_string(roles, ',') || ':' || coalesce(qual, '') || ':' || coalesce(with_check, '') as x from pg_policies
  union all select 'tg:' || tgrelid::regclass::text || ':' || tgname || ':' || tgenabled from pg_trigger where not tgisinternal
  union all select 'col:' || attrelid::regclass::text || '.' || attname from pg_attribute where attrelid = 'public.professional_reports'::regclass and attnum > 0 and not attisdropped
  union all select 'cp:' || table_name || '.' || column_name || ':' || grantee || ':' || privilege_type from information_schema.column_privileges where table_schema = 'public' and table_name = 'professional_reports' and grantee in ('anon', 'authenticated')
  union all select 'tp:' || table_name || ':' || grantee || ':' || privilege_type from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon', 'authenticated')
  union all select 'fn:' || p.oid::regprocedure::text from pg_proc p where p.pronamespace = 'public'::regnamespace) s`).out;
const existingOnly = s => s.split(' || ').filter(x => !/kisg_block_sanctioned_write|kisg_audit_log|professional_admin_audit_log|professional_user_sanctions|kisg_is_admin|kisg_my_active_sanction|kisg_block_sanctioned_professional_write|kisg_audit_log_append_only|reviewed_by|reviewed_at|resolution_note|action_taken/.test(x)).join(' || ');
const before = snapshot();

r = runFile(MIG('20261002_admin_v1_a.sql'));
check(ok(r), `Migration A uygulandı ${r.err}`);
r = runFile(MIG('20261002_admin_v1_a.sql'));
check(ok(r), `Migration A tekrar çalıştırılabilir ${r.err}`);
check(existingOnly(snapshot()) === before, 'mevcut RLS politikaları, trigger\'lar, tablo/kolon yetkileri ve fonksiyonlar DEĞİŞMEDİ (yalnız ekleme)');
r = psql(SANCTIONS);
check(ok(r), `yaptırım senaryoları kuruldu (dashboard) ${r.err}`);

// ---------------- yaptırım davranışı ----------------
const allowedUsers = [['normal kullanıcı', A], ['warning alan', U.warned], ['süresi dolmuş suspension', U.expired], ['iptal edilmiş suspension', U.revoked], ['henüz başlamamış suspension', U.future]];
for (const [label, id] of allowedUsers) {
  const fails = proWrites(id).map(([n, sql]) => [n, as('authenticated', user(id), sql)]).filter(([, x]) => !ok(x) || x.out.trim() !== '1');
  check(fails.length === 0, `${label}: tüm Professional yazımları çalışıyor (9/9) ${fails.map(([n, x]) => `${n}: ${errOf(x) || x.out}`).join(' ; ')}`);
}
const blockedUsers = [['suspended', U.suspended, 'KISG_USER_SUSPENDED'], ['süresiz ban', U.banned, 'KISG_USER_BANNED'], ['süreli ban', U.bannedTimed, 'KISG_USER_BANNED']];
for (const [label, id, code] of blockedUsers) {
  const res = proWrites(id).map(([n, sql]) => [n, as('authenticated', user(id), sql)]);
  const leaked = res.filter(([, x]) => ok(x) || !x.err.includes(code));
  check(leaked.length === 0, `${label}: 9 Professional yazımının hepsi ${code} ile engellendi ${leaked.map(([n, x]) => `${n}: ${errOf(x) || 'GEÇTİ'}`).join(' ; ')}`);
}
r = as('authenticated', user(U.suspended), proWrites(U.suspended)[0][1]);
check(/42501/.test(r.err) || /KISG_USER_SUSPENDED/.test(r.err), 'engelleme hatası 42501 (PostgREST 403) ve kodlu mesaj taşıyor');
check(psql(`select count(*) from public.professional_posts where user_id = '${U.suspended}' and content = 'yeni'`).out === '0', 'engellenen yazım veriye hiçbir şey eklemedi');
for (const [label, id] of [...blockedUsers, ['normal kullanıcı', A]]) {
  const fails = removals(id).map(([n, sql]) => [n, as('authenticated', user(id), sql)]).filter(([, x]) => !ok(x) || x.out.trim() !== '1');
  check(fails.length === 0, `${label}: kendi içeriğini kaldırabiliyor (post sil, yorum sil, hizmet arşivle, beğeni geri al) ${fails.map(([n, x]) => `${n}: ${errOf(x) || x.out}`).join(' ; ')}`);
}
r = as('authenticated', user(U.suspended), pgUpdate('professional_services', { status: 'active' }, eq('professional_services', 'id', own(U.suspended, 3))));
check(!ok(r) && r.err.includes('KISG_USER_SUSPENDED'), 'suspended: arşivlediği hizmeti yeniden yayına alamaz');
for (const [label, id] of [['suspended', U.suspended], ['süresiz ban', U.banned]]) {
  const fails = otherWrites(id).map(([n, sql]) => [n, as('authenticated', user(id), sql)]).filter(([, x]) => !ok(x));
  check(fails.length === 0, `${label}: profil, OneSignal, ilan, abonelik ve premium senkronu ETKİLENMEDİ (6/6) ${fails.map(([n, x]) => `${n}: ${errOf(x)}`).join(' ; ')}`);
}

// süre dolunca otomatik etkisiz (cleanup yok): askının bitişini geçmişe çek
psql(`update public.professional_user_sanctions set starts_at = now() - interval '8 days', ends_at = now() - interval '1 second' where user_id = '${U.suspended}' and type = 'suspension'`);
r = as('authenticated', user(U.suspended), pgInsert('professional_posts', { category_id: CAT, content: 'askı bitti', id: newId(), image_path: null, status: 'active', user_id: U.suspended }));
check(ok(r) && r.out.trim() === '1', `suspension süresi dolunca kullanıcı otomatik olarak yeniden yazabiliyor ${errOf(r)}`);
check(psql(`select count(*) from public.professional_user_sanctions where user_id = '${U.suspended}'`).out === '2', 'süresi dolan kayıt silinmedi / değiştirilmedi (geçmiş korunur)');

// admin ve yetkili yollar
psql(`insert into public.professional_user_sanctions (user_id, type, reason) values ('${X}', 'ban', 'test: admin kendine ban')`);
const adminFails = proWrites(X).filter(([n]) => !['Post düzenleme', 'Öne çıkarma sırası', 'Hizmet düzenleme', 'Post beğenme', 'Şikâyet'].includes(n))
  .map(([n, sql]) => [n, as('authenticated', user(X), sql)]).filter(([, x]) => !ok(x));
check(adminFails.length === 0, `admin: yaptırım kaydı olsa bile Professional yazımları engellenmez ${adminFails.map(([n, x]) => `${n}: ${errOf(x)}`).join(' ; ')}`);
r = as('authenticated', user(X), pgUpdate('professional_posts', { status: 'hidden' }, eq('professional_posts', 'id', own(U.banned, 1))));
check(ok(r) && r.out.trim() === '1', `admin: banlı kullanıcının postunu gizleyebiliyor (mevcut moderasyon RLS) ${errOf(r)}`);
psql(`update public.professional_posts set status = 'hidden' where id = '${own(A, 1)}'`);
r = as('authenticated', user(A), pgUpdate('professional_posts', { status: 'active' }, eq('professional_posts', 'id', own(A, 1))));
check(!ok(r) && /KISG_STATUS_LOCKED/.test(r.err), 'mevcut moderasyon davranışı aynı: sahip gizlenen postu geri açamaz (Fix Pack 1)');
r = as('authenticated', user(X), pgInsert('announcements', { category: 'genel', category_id: null, content: 'c', image_url: null, send_push_notification: false, title: 'Duyuru' }));
check(ok(r), `harici admin paneli: duyuru ekleme çalışıyor ${errOf(r)}`);
r = as('authenticated', user(X), pgUpdate('profiles', { is_premium: true }, eq('profiles', 'id', U.banned)));
check(ok(r) && psql(`select is_premium from public.profiles where id = '${U.banned}'`).out === 't', `harici admin paneli: banlı kullanıcıya manuel premium verme çalışıyor ${errOf(r)}`);
r = as('service_role', { role: 'service_role' }, pgInsert('professional_posts', { category_id: CAT, content: 'sunucu', id: newId(), image_path: null, status: 'active', user_id: U.banned }));
check(ok(r), `service_role yaptırımdan muaf ${errOf(r)}`);

// ---------------- yardımcı fonksiyonlar ----------------
check(as('authenticated', user(X), 'select public.kisg_is_admin()').out.trim() === 't', 'kisg_is_admin(): admin → true');
check(as('authenticated', user(A), 'select public.kisg_is_admin()').out.trim() === 'f', 'kisg_is_admin(): normal kullanıcı → false');
r = as('anon', {}, 'select public.kisg_is_admin()');
check(!ok(r) && /permission denied/.test(r.err), 'kisg_is_admin(): anon çağıramaz');
r = as('authenticated', user(U.banned), 'select sanction_type, ends_at is null from public.kisg_my_active_sanction()');
check(r.out.trim() === 'ban|t', `kisg_my_active_sanction(): banlı kullanıcı kendi süresiz banını görür (${r.out.trim()})`);
check(as('authenticated', user(U.warned), 'select count(*) from public.kisg_my_active_sanction()').out.trim() === '0', 'kisg_my_active_sanction(): warning engelleyen yaptırım sayılmaz');
r = as('anon', {}, 'select * from public.kisg_my_active_sanction()');
check(!ok(r) && /permission denied/.test(r.err), 'kisg_my_active_sanction(): anon çağıramaz');

// ---------------- yeni tablolar istemcilere kapalı ----------------
for (const [role, claims] of [['anon', {}], ['authenticated', user(A)], ['authenticated', user(X)]]) {
  const who = claims.sub === X ? 'admin (doğrudan tablo)' : role;
  for (const [t, extra] of [['professional_user_sanctions', `(user_id, type, reason) values ('${A}', 'warning', 'x')`], ['professional_admin_audit_log', `(admin_id, action, target_type, target_id) values ('${X}', 'x', 'profile', 'x')`]]) {
    const res = [as(role, claims, `select count(*) from public.${t}`), as(role, claims, `insert into public.${t} ${extra}`),
      as(role, claims, `update public.${t} set created_at = now()`), as(role, claims, `delete from public.${t}`)];
    check(res.every(x => !ok(x) && /permission denied/.test(x.err)), `${who}: ${t} SELECT/INSERT/UPDATE/DELETE → izin yok`);
  }
}
r = as('authenticated', user(U.banned), `delete from public.professional_user_sanctions where user_id = '${U.banned}'`);
check(!ok(r) && /permission denied/.test(r.err), 'banlı kullanıcı kendi banını silemez');

// audit log append-only
r = as('service_role', { role: 'service_role' }, `insert into public.professional_admin_audit_log (admin_id, action, target_type, target_id, reason) values ('${X}', 'test', 'profile', '${U.warned}', 'test')`);
check(ok(r), `audit log: sunucu tarafı ekleme çalışıyor ${errOf(r)}`);
for (const [label, sql] of [['service_role UPDATE', ['service_role', `update public.professional_admin_audit_log set reason = 'x'`]], ['service_role DELETE', ['service_role', 'delete from public.professional_admin_audit_log']]]) {
  const x = as(sql[0], { role: 'service_role' }, sql[1]);
  check(!ok(x) && /KISG_AUDIT_APPEND_ONLY/.test(x.err), `audit log append-only: ${label} reddedildi`);
}
for (const sql of [`update public.professional_admin_audit_log set reason = 'x'`, 'delete from public.professional_admin_audit_log', 'truncate public.professional_admin_audit_log']) {
  const x = psql(sql);
  check(!ok(x) && /KISG_AUDIT_APPEND_ONLY/.test(x.err), `audit log append-only: dashboard "${sql.split(' ')[0]}" reddedildi`);
}

// ---------------- yaptırım tablosu kısıtları ----------------
r = psql(`insert into public.professional_user_sanctions (user_id, type, reason) values ('${A}', 'suspension', 'bitişsiz askı')`);
check(!ok(r) && /suspension_end_check/.test(r.err), 'suspension bitiş tarihi olmadan oluşturulamaz');
r = psql(`insert into public.professional_user_sanctions (user_id, type, reason) values ('${A}', 'mute', 'x')`);
check(!ok(r) && /type_check/.test(r.err), 'geçersiz yaptırım türü reddedilir');
r = psql(`insert into public.professional_user_sanctions (user_id, type, reason) values ('${A}', 'warning', '   ')`);
check(!ok(r) && /reason_check/.test(r.err), 'gerekçesiz yaptırım reddedilir');

// ---------------- professional_reports mevcut davranış ----------------
r = as('authenticated', user(M), pgInsert('professional_reports', { details: 'x', reason: 'spam', target_id: own(A, 4), target_type: 'post' }));
check(ok(r) && psql(`select status || '|' || coalesce(reviewed_by::text, '-') || coalesce(reviewed_at::text, '-') || coalesce(resolution_note, '-') || coalesce(action_taken, '-') from public.professional_reports where reporter_id = '${M}'`).out === 'pending|----',
  `şikâyet ekleme aynı: status pending, yeni çözüm alanları boş ${errOf(r)}`);
r = as('authenticated', user(M), pgInsert('professional_reports', { details: null, reason: 'spam', target_id: own(A, 2), target_type: 'comment', reviewed_by: M }));
check(!ok(r) && /permission denied/.test(r.err), 'kullanıcı çözüm alanlarını (reviewed_by) yazamaz');
r = as('authenticated', user(M), `select count(*) from public.professional_reports`);
check(!ok(r) && /permission denied/.test(r.err), 'kullanıcı şikâyetleri okuyamaz (değişmedi)');
r = as('authenticated', user(A), pgInsert('professional_reports', { details: null, reason: 'spam', target_id: own(A, 1), target_type: 'post' }));
check(!ok(r) && /KISG_REPORT_OWN/.test(r.err), 'kendi içeriğini bildirme hâlâ reddediliyor (mevcut trigger)');
r = psql(`update public.professional_reports set action_taken = 'silindi' where reporter_id = '${M}'`);
check(!ok(r) && /action_taken_check/.test(r.err), 'action_taken yalnız tanımlı değerleri kabul eder');

// ---------------- kullanıcı silinince ----------------
psql(`insert into public.professional_admin_audit_log (admin_id, action, target_type, target_id) values ('${X}', 'sanction.create', 'sanction', '${U.warned}')`);
r = psql(`delete from public.profiles where id = '${U.warned}'`);
check(ok(r) && psql(`select count(*) from public.professional_admin_audit_log where target_id = '${U.warned}'`).out === '2',
  `profil silme (harici panel, service_role) engellenmez; audit kayıtları kalır ${errOf(r)}`);
check(psql(`select count(*) from pg_constraint where confrelid = 'public.profiles'::regclass and conrelid in ('public.professional_user_sanctions'::regclass, 'public.professional_admin_audit_log'::regclass)`).out === '0',
  'yeni tablolar profiles tablosuna foreign key vermiyor (profiles\'a kilit/yetki bağımlılığı yok)');

// ---------------- rollback + verify ----------------
r = runFile(MIG('20261002_admin_v1_a.rollback.sql'));
check(ok(r), `rollback çalıştı ${r.err}`);
check(snapshot() === before, 'rollback: şema migration öncesiyle birebir aynı');
r = runFile(MIG('20261002_admin_v1_a.sql'));
check(ok(r), `rollback sonrası migration yeniden uygulanabilir ${r.err}`);
r = runFile(MIG('20261002_admin_v1_a.verify.sql'));
const rows = r.out.split('\n').filter(Boolean);
const bad = rows.filter(l => !l.endsWith('|t'));
check(ok(r) && rows.length >= 20 && bad.length === 0, `verify: ${rows.length} satırın hepsi ok ${bad.join(' ; ')} ${r.err}`);
