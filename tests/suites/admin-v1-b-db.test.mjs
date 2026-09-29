// Admin V1 / Migration B — admin RPC testi (yerel geçici PostgreSQL, production'a bağlanmaz).
// Şema: kisg-prod-stub + professional_reports + Fix Pack 1 + Migration A (production'daki sırayla) + Migration B.
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

const A = '11111111-1111-4111-8111-111111111111', M = '22222222-2222-4222-8222-222222222222';
const P = '33333333-3333-4333-8333-333333333333', X = '99999999-9999-4999-8999-999999999999';
const X2 = '88888888-8888-4888-8888-888888888888';   // ikinci admin
const user = id => ({ sub: id, role: 'authenticated' });
const admin = sql => as('authenticated', user(X), sql);
const CAT = 'cccccccc-0000-4000-8000-000000000001';
const MPOST = 'dddddddd-0000-4000-8000-000000000001', MPOST2 = 'dddddddd-0000-4000-8000-000000000003';
const MCOMMENT = 'dddddddd-0000-4000-8000-000000000002', MSERVICE = 'dddddddd-0000-4000-8000-000000000004';
const APOST = 'dddddddd-0000-4000-8000-000000000005';

const SETUP = `
create function auth.role() returns text language sql stable as $f$ select auth.jwt() ->> 'role' $f$;
grant execute on function auth.role() to anon, authenticated, service_role;
create table public.professional_post_likes (post_id uuid not null references public.professional_posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade, created_at timestamptz not null default now(), primary key (post_id, user_id));
create table public.professional_comment_likes (comment_id uuid not null references public.professional_post_comments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade, created_at timestamptz not null default now(), primary key (comment_id, user_id));
alter table public.professional_post_likes enable row level security;
alter table public.professional_comment_likes enable row level security;
create policy "Users can like posts" on public.professional_post_likes for insert to authenticated with check (user_id = auth.uid());
alter table public.profiles add constraint profiles_experience_range_check check (experience_range is null or experience_range = any (array['1 yıldan az', '1-3 yıl', '3-5 yıl', '5-10 yıl', '10-15 yıl', '15+ yıl']));
create function public.get_professional_admin_overview() returns jsonb language plpgsql security definer set search_path = public as $f$
begin
  if not exists (select 1 from public.user_roles where id = auth.uid() and role = 'admin') then raise exception 'Yetkisiz erişim'; end if;
  return jsonb_build_object('users_total', (select count(*) from public.profiles));
end $f$;
insert into auth.users (id, email) values ('${X2}', 'admin2@ornek.com');
insert into public.user_roles values ('${X2}', 'admin');
insert into public.professional_posts (id, user_id, content) values ('${MPOST}', '${M}', 'M postu spam'), ('${MPOST2}', '${M}', 'M ikinci post'), ('${APOST}', '${A}', 'A postu');
insert into public.professional_post_comments (id, post_id, user_id, content) values ('${MCOMMENT}', '${APOST}', '${M}', 'M yorumu');
insert into public.professional_services (id, user_id, title, description) values ('${MSERVICE}', '${M}', 'M hizmeti', 'danışmanlık');
`;
const rpc = (name, args = '') => `select public.${name}(${args})`;
const one = r => r.out.trim();
const audits = () => Number(psql('select count(*) from public.professional_admin_audit_log').out);
const lastAudit = () => psql(`select action || '|' || target_type || '|' || target_id || '|' || coalesce(admin_id::text, '-') || '|' || coalesce(reason, '-') from public.professional_admin_audit_log order by created_at desc, id desc limit 1`).out;
const postStatus = id => psql(`select status || '|' || coalesce(moderation_reason, '-') || '|' || coalesce(moderated_by::text, '-') from public.professional_posts where id = '${id}'`).out;

// ---------------- kurulum ----------------
let r = runFile(path.join(ROOT, 'tests/helpers/kisg-prod-stub.sql'));
check(ok(r), `production kopyası şema kuruldu ${r.err}`);
r = psql(SETUP);
check(ok(r), `beğeni tabloları ve test verisi kuruldu ${r.err}`);
for (const f of ['20260929_professional_reports.sql', '20260930_security_fix_pack1.sql', '20261002_admin_v1_a.sql']) {
  r = runFile(MIG(f)); check(ok(r), `${f} (production'da) kuruldu ${r.err}`);
}
r = as('authenticated', user(A), `insert into public.professional_reports (target_type, target_id, reason, details) values ('post', '${MPOST}', 'spam', 'reklam')`);
const r2 = as('authenticated', user(P), `insert into public.professional_reports (target_type, target_id, reason) values ('post', '${MPOST}', 'inappropriate')`);
const r3 = as('authenticated', user(A), `insert into public.professional_reports (target_type, target_id, reason) values ('profile', '${M}', 'fake_profile')`);
const r4 = as('authenticated', user(A), `insert into public.professional_reports (target_type, target_id, reason) values ('comment', '${MCOMMENT}', 'harassment')`);
check([r, r2, r3, r4].every(ok), `kullanıcı şikâyetleri eklendi (mevcut akış) ${[r, r2, r3, r4].map(errOf).join(' ')}`);

const snapshot = () => psql(`select string_agg(x, ' || ' order by x) from (
  select 'pol:' || schemaname || '.' || tablename || ':' || policyname || ':' || cmd || ':' || coalesce(qual, '') || ':' || coalesce(with_check, '') as x from pg_policies
  union all select 'tg:' || tgrelid::regclass::text || ':' || tgname from pg_trigger where not tgisinternal
  union all select 'tp:' || table_name || ':' || grantee || ':' || privilege_type from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon', 'authenticated')
  union all select 'fn:' || p.oid::regprocedure::text || ':' || md5(pg_get_functiondef(p.oid)) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f') s`).out;
const before = snapshot();
const B_FNS = /^fn:(kisg_admin_guard|kisg_admin_audit|kisg_admin_limit|kisg_admin_apply_moderation|admin_overview|admin_list_users|admin_get_user|admin_list_content|admin_list_reports|admin_list_audit_log|admin_update_profile|admin_moderate_content|admin_sanction_user|admin_revoke_sanction|admin_resolve_report|get_my_sanctions)\(/;
const existingOnly = s => s.split(' || ').filter(x => !B_FNS.test(x)).join(' || ');

r = runFile(MIG('20261003_admin_v1_b.sql'));
check(ok(r), `Migration B uygulandı ${r.err}`);
r = runFile(MIG('20261003_admin_v1_b.sql'));
check(ok(r), `Migration B tekrar çalıştırılabilir ${r.err}`);
check(existingOnly(snapshot()) === before, 'mevcut politikalar, trigger\'lar, tablo yetkileri ve mevcut fonksiyonlar (get_professional_admin_overview dahil) DEĞİŞMEDİ');

// ---------------- yetki: anon ve normal kullanıcı ----------------
const CALLS = [
  ['admin_overview', ''], ['admin_list_users', ''], ['admin_get_user', `'${M}'`], ['admin_list_content', `'post'`],
  ['admin_list_reports', ''], ['admin_list_audit_log', ''], ['admin_update_profile', `'${M}', '{"city":"X"}', 'r'`],
  ['admin_moderate_content', `'post', '${MPOST}', 'hide', 'r'`], ['admin_sanction_user', `'${M}', 'ban', 'r'`],
  ['admin_revoke_sanction', `gen_random_uuid(), 'r'`], ['admin_resolve_report', `gen_random_uuid(), 'resolved'`]];
const sel = ([n, a]) => ['admin_list_users', 'admin_list_content', 'admin_list_reports', 'admin_list_audit_log'].includes(n) ? `select count(*) from public.${n}(${a})` : rpc(n, a);
const anonRes = CALLS.map(c => [c[0], as('anon', {}, sel(c))]).filter(([, x]) => ok(x) || !/permission denied/.test(x.err));
check(anonRes.length === 0, `anon: 11 admin RPC'nin hepsi → izin yok ${anonRes.map(([n]) => n).join(' ')}`);
check(!ok(as('anon', {}, 'select * from public.get_my_sanctions()')), 'anon: get_my_sanctions → izin yok');
const userRes = CALLS.map(c => [c[0], as('authenticated', user(A), sel(c))]).filter(([, x]) => ok(x) || !/KISG_ADMIN_ONLY/.test(x.err));
check(userRes.length === 0, `normal kullanıcı: 11 admin RPC'nin hepsi → KISG_ADMIN_ONLY (42501) ${userRes.map(([n, x]) => `${n}: ${errOf(x) || 'GEÇTİ'}`).join(' ; ')}`);
check(audits() === 0 && postStatus(MPOST).startsWith('active|') && psql(`select count(*) from public.professional_user_sanctions`).out === '0',
  'reddedilen çağrılar hiçbir veri ve audit kaydı bırakmadı');
for (const f of ['kisg_admin_guard()', `kisg_admin_audit('x', 'post', 'x', null, null, null)`, 'kisg_admin_limit(5)', `kisg_admin_apply_moderation('post', '${MPOST}', 'hide', 'r')`]) {
  const x = as('authenticated', user(X), `select public.${f}`);
  check(!ok(x) && /permission denied/.test(x.err), `iç yardımcı ${f.split('(')[0]} istemciye (admin dahil) kapalı`);
}

// ---------------- okuma RPC'leri ----------------
r = admin(`select public.admin_overview()`);
const ov = ok(r) ? JSON.parse(one(r)) : {};
check(ok(r) && ov.users_total === 5 && ov.posts.active === 3 && ov.reports.pending === 4 && ov.active_bans === 0, `admin_overview: sayılar doğru ${one(r)} ${errOf(r)}`);
r = admin(`select id || '|' || coalesce(email, '-') || '|' || open_report_count || '|' || total_count from public.admin_list_users('mehmet')`);
check(ok(r) && one(r) === `${M}|mehmet@ornek.com|4|1`, `admin_list_users: arama, e-posta, açık şikâyet sayısı (${one(r)}) ${errOf(r)}`);
r = admin(`select count(*) || '|' || max(total_count) from public.admin_list_users(null, 'reported')`);
check(ok(r) && one(r) === '1|1', `admin_list_users: filtre=reported (${one(r)})`);
r = admin(`select count(*) from public.admin_list_users(null, 'all', 2, 0)`);
check(ok(r) && one(r) === '2', 'admin_list_users: sayfalama (limit)');
r = admin(`select count(*) from public.admin_list_users(null, 'all', 100000, 0)`);
check(ok(r) && Number(one(r)) <= 100, 'admin_list_users: limit en fazla 100');
r = admin(`select public.admin_list_users(null, 'hepsi')`);
check(!ok(r) && /KISG_ADMIN_INPUT/.test(r.err), 'admin_list_users: geçersiz filtre reddedilir');
r = admin(`select public.admin_get_user('${M}')`);
const gu = ok(r) ? JSON.parse(one(r)) : {};
check(ok(r) && gu.profile.email === 'mehmet@ornek.com' && gu.profile.phone === '+905324445566' && gu.reports_against.length === 4
  && gu.counts.posts.active === 2 && !('onesignal_notification_id' in gu.profile) && gu.is_admin === false,
  `admin_get_user: özel alanlar, sayılar, hakkındaki şikâyetler (OneSignal/sayaçlar hariç) ${errOf(r)}`);
r = admin(`select public.admin_get_user(gen_random_uuid())`);
check(!ok(r) && /KISG_ADMIN_NOT_FOUND/.test(r.err), 'admin_get_user: olmayan kullanıcı → NOT_FOUND');
r = admin(`select string_agg(kind || ':' || status || ':' || open_report_count, ',' order by id) from public.admin_list_content('post')`);
check(ok(r) && one(r) === 'post:active:2,post:active:0,post:active:0', `admin_list_content(post): durum ve açık şikâyet sayısı (${one(r)})`);
r = admin(`select count(*) from public.admin_list_content('comment', 'active', null, '${M}')`);
check(ok(r) && one(r) === '1', 'admin_list_content(comment): durum + kullanıcı filtresi');
r = admin(`select title || '|' || author_name from public.admin_list_content('service', null, 'danışman')`);
check(ok(r) && one(r) === 'M hizmeti|Mehmet Öztürk', `admin_list_content(service): arama (${one(r)})`);
r = admin(`select public.admin_list_content('job')`);
check(!ok(r) && /KISG_ADMIN_INPUT/.test(r.err), 'admin_list_content: geçersiz tür reddedilir');
r = admin(`select string_agg(target_type || ':' || coalesce(target_owner_id::text, '-') || ':' || same_target_pending, ',' order by target_type) from public.admin_list_reports()`);
check(ok(r) && one(r) === `comment:${M}:1,post:${M}:2,post:${M}:2,profile:${M}:1`, `admin_list_reports: hedef sahibi ve aynı hedefteki bekleyen şikâyetler (${one(r)})`);

// ---------------- profil düzenleme ----------------
let n0 = audits();
r = admin(`select public.admin_update_profile('${M}', '{"city":"Ankara","about":"Düzenlendi","is_discoverable":false,"specialties":["yangın","kkd"]}', 'uygunsuz içerik')`);
check(ok(r) && psql(`select city || '|' || about || '|' || is_discoverable || '|' || array_to_string(specialties, ',') from public.profiles where id = '${M}'`).out === 'Ankara|Düzenlendi|false|yangın,kkd',
  `admin_update_profile: izinli alanlar güncellendi ${errOf(r)}`);
check(audits() === n0 + 1 && lastAudit() === `profile.update|profile|${M}|${X}|uygunsuz içerik`, `admin_update_profile: audit kaydı (admin, hedef, gerekçe) ${lastAudit()}`);
check(psql(`select (before ? 'city') and (after ->> 'city') = 'Ankara' and not (after ? 'phone') and not (after ? 'full_name') from public.professional_admin_audit_log where action = 'profile.update'`).out === 't',
  'audit before/after yalnız değişen alanları içeriyor');
for (const [label, patch] of [['e-posta', '{"email":"x@y.com"}'], ['premium', '{"is_premium":true}'], ['telefon', '{"phone":"+90"}'], ['sayaç', '{"daily_reports_used":0}'], ['izinli + izinsiz karışık', '{"city":"İzmir","is_premium":true}']]) {
  n0 = audits();
  r = admin(`select public.admin_update_profile('${M}', '${patch}', 'x')`);
  check(!ok(r) && /KISG_ADMIN_FIELD/.test(r.err) && audits() === n0, `admin_update_profile: ${label} alanı reddedilir, hiçbir şey değişmez`);
}
check(psql(`select city from public.profiles where id = '${M}'`).out === 'Ankara', 'karışık istekte izinli alan da yazılmadı (bütün ya da hiç)');
r = admin(`select public.admin_update_profile('${M}', '{"city":"Bursa"}', '  ')`);
check(!ok(r) && /reason/.test(r.err), 'admin_update_profile: gerekçe zorunlu');
r = admin(`select public.admin_update_profile('${M}', '{"experience_range":"99 yıl"}', 'x')`);
check(!ok(r), 'admin_update_profile: mevcut profil kısıtları (experience_range) geçerli');
n0 = audits();
r = admin(`select public.admin_update_profile('${M}', '{"city":"Ankara"}', 'aynı değer')`);
check(ok(r) && one(r) === '{"changed": []}' && audits() === n0, 'admin_update_profile: değişiklik yoksa audit yazılmaz');

// ---------------- içerik moderasyonu ----------------
n0 = audits();
r = admin(`select public.admin_moderate_content('post', '${MPOST2}', 'hide', 'spam içerik')`);
check(ok(r) && postStatus(MPOST2) === `hidden|spam içerik|${X}` && lastAudit() === `post.hide|post|${MPOST2}|${X}|spam içerik` && audits() === n0 + 1,
  `admin_moderate_content: post gizlendi, moderasyon alanları + audit ${errOf(r)}`);
r = as('authenticated', user(M), `update public.professional_posts set status = 'active' where id = '${MPOST2}'`);
check(!ok(r) && /KISG_STATUS_LOCKED/.test(r.err), 'sahip admin\'in gizlediği postu geri açamaz (Fix Pack 1, değişmedi)');
r = admin(`select public.admin_moderate_content('post', '${MPOST2}', 'restore', 'itiraz kabul')`);
check(ok(r) && postStatus(MPOST2) === `active|-|${X}` && lastAudit().startsWith('post.restore|'), `admin_moderate_content: restore ${errOf(r)}`);
r = admin(`select public.admin_moderate_content('post', '${MPOST2}', 'restore', 'x')`);
check(!ok(r) && /KISG_ADMIN_STATE/.test(r.err), 'restore yalnız gizlenmiş içerikte');
r = admin(`select public.admin_moderate_content('post', '${MPOST2}', 'hide', '')`);
check(!ok(r) && /reason/.test(r.err), 'gizleme gerekçesiz yapılamaz');
r = admin(`select public.admin_moderate_content('post', '${MPOST2}', 'delete', 'kural ihlali')`);
check(ok(r) && postStatus(MPOST2).startsWith('deleted|') && psql(`select count(*) from public.professional_posts where id = '${MPOST2}'`).out === '1',
  'delete: hard delete yok, status = deleted');
r = admin(`select public.admin_moderate_content('post', '${MPOST2}', 'restore', 'x')`);
check(!ok(r) && /KISG_ADMIN_STATE/.test(r.err), 'silinmiş içerik geri açılamaz');
r = admin(`select public.admin_moderate_content('comment', '${MCOMMENT}', 'hide', 'hakaret')`);
check(ok(r) && psql(`select status from public.professional_post_comments where id = '${MCOMMENT}'`).out === 'hidden', `yorum gizleme ${errOf(r)}`);
r = admin(`select public.admin_moderate_content('service', '${MSERVICE}', 'hide', 'yanıltıcı')`);
check(ok(r) && psql(`select status || '|' || moderation_reason from public.professional_services where id = '${MSERVICE}'`).out === 'hidden|yanıltıcı', `hizmet gizleme ${errOf(r)}`);
r = admin(`select public.admin_moderate_content('service', '${MSERVICE}', 'delete', 'x')`);
check(!ok(r) && /hizmet silinmez/.test(r.err), 'hizmet silinmez (yalnız gizlenir)');
r = admin(`select public.admin_moderate_content('service', '${MSERVICE}', 'restore', 'düzeltildi')`);
check(ok(r) && psql(`select status from public.professional_services where id = '${MSERVICE}'`).out === 'active', 'hizmet geri açma');
r = admin(`select public.admin_moderate_content('post', gen_random_uuid(), 'hide', 'x')`);
check(!ok(r) && /KISG_ADMIN_NOT_FOUND/.test(r.err), 'olmayan içerik → NOT_FOUND');

// ---------------- yaptırımlar ----------------
r = admin(`select public.admin_sanction_user('${A}', 'warning', 'dil uyarısı')`);
check(ok(r) && lastAudit().startsWith('sanction.create|sanction|'), `warning verildi + audit ${errOf(r)}`);
r = as('authenticated', user(A), `insert into public.professional_posts (user_id, content) values ('${A}', 'uyarı sonrası')`);
check(ok(r), `warning alan kullanıcı paylaşmaya devam ediyor ${errOf(r)}`);
r = as('authenticated', user(A), `select type || '|' || reason || '|' || is_active from public.get_my_sanctions()`);
check(ok(r) && one(r) === 'warning|dil uyarısı|true', `get_my_sanctions: kullanıcı kendi uyarısını görür (${one(r)})`);
r = as('authenticated', user(P), `select count(*) from public.get_my_sanctions()`);
check(ok(r) && one(r) === '0', 'get_my_sanctions: başkasının yaptırımını görmez');
r = admin(`select public.admin_sanction_user('${M}', 'suspension', 'spam', now() + interval '3 days', true)`);
const suspId = one(r);
check(ok(r) && psql(`select count(*) from public.professional_posts where user_id = '${M}' and status = 'active'`).out === '0'
  && psql(`select moderation_reason from public.professional_posts where id = '${MPOST}'`).out === 'Yaptirim: spam',
  `suspension + içerik gizleme: M'nin aktif postları gizlendi ${errOf(r)}`);
check(psql(`select after -> 'content_hidden' ->> 'posts' from public.professional_admin_audit_log where target_id = '${suspId}'`).out === '1', 'audit gizlenen içerik sayısını tutuyor');
r = as('authenticated', user(M), `insert into public.professional_posts (user_id, content) values ('${M}', 'askıdayken')`);
check(!ok(r) && /KISG_USER_SUSPENDED/.test(r.err), 'askıya alınan kullanıcı paylaşamıyor (Migration A trigger)');
r = admin(`select public.admin_get_user('${M}') -> 'sanctions' -> 0 ->> 'type'`);
check(ok(r) && one(r) === 'suspension', 'admin_get_user yaptırım geçmişini gösteriyor');
r = admin(`select active_sanction from public.admin_list_users(null, 'sanctioned')`);
check(ok(r) && one(r) === 'suspension', 'admin_list_users(sanctioned) aktif askıyı listeliyor');
r = admin(`select public.admin_revoke_sanction('${suspId}', 'itiraz kabul')`);
check(ok(r) && lastAudit().startsWith(`sanction.revoke|sanction|${suspId}|`), `yaptırım iptali + audit ${errOf(r)}`);
r = as('authenticated', user(M), `insert into public.professional_posts (user_id, content) values ('${M}', 'iptal sonrası')`);
check(ok(r), `iptal sonrası kullanıcı tekrar paylaşabiliyor ${errOf(r)}`);
check(postStatus(MPOST).startsWith('hidden|'), 'iptal gizlenen içeriği otomatik geri açmaz (admin ayrıca restore eder)');
r = admin(`select public.admin_revoke_sanction('${suspId}', 'tekrar')`);
check(!ok(r) && /KISG_ADMIN_STATE/.test(r.err), 'aynı yaptırım iki kez iptal edilemez');
r = admin(`select public.admin_sanction_user('${P}', 'ban', 'dolandırıcılık')`);
check(ok(r) && psql(`select ends_at is null from public.professional_user_sanctions where user_id = '${P}' and type = 'ban'`).out === 't', `süresiz ban ${errOf(r)}`);
r = as('authenticated', user(P), `insert into public.professional_reports (target_type, target_id, reason) values ('post', '${APOST}', 'spam')`);
check(!ok(r) && /KISG_USER_BANNED/.test(r.err), 'banlı kullanıcı şikâyet de gönderemiyor');
for (const [label, args, re] of [
  ['admin hesabına', `'${X2}', 'ban', 'x'`, /KISG_ADMIN_TARGET/], ['kendine', `'${X}', 'warning', 'x'`, /KISG_ADMIN_TARGET/],
  ['bitişsiz suspension', `'${A}', 'suspension', 'x'`, /suspension/], ['geçmiş bitişli suspension', `'${A}', 'suspension', 'x', now() - interval '1 day'`, /suspension/],
  ['süreli warning', `'${A}', 'warning', 'x', now() + interval '1 day'`, /warning/], ['içerik gizleyen warning', `'${A}', 'warning', 'x', null, true`, /warning/],
  ['gerekçesiz', `'${A}', 'ban', ' '`, /reason/], ['geçersiz tür', `'${A}', 'mute', 'x'`, /type/], ['olmayan kullanıcı', `gen_random_uuid(), 'ban', 'x'`, /NOT_FOUND/]]) {
  n0 = audits();
  const x = admin(`select public.admin_sanction_user(${args})`);
  check(!ok(x) && re.test(x.err) && audits() === n0, `yaptırım reddedilir: ${label}`);
}

// ---------------- şikâyet sonuçlandırma ----------------
const repId = psql(`select id from public.professional_reports where target_type = 'comment'`).out;
r = admin(`select public.admin_resolve_report('${repId}', 'resolved', 'hakaret doğrulandı', 'delete')`);
check(ok(r) && psql(`select status from public.professional_post_comments where id = '${MCOMMENT}'`).out === 'deleted'
  && psql(`select status || '|' || action_taken || '|' || reviewed_by || '|' || resolution_note from public.professional_reports where id = '${repId}'`).out === `resolved|content_deleted|${X}|hakaret doğrulandı`,
  `şikâyet + içerik silme tek işlemde, çözüm alanları dolu ${errOf(r)}`);
check(psql(`select count(*) from public.professional_admin_audit_log where action = 'comment.delete' and target_id = '${MCOMMENT}'`).out === '1'
  && psql(`select count(*) from public.professional_admin_audit_log where action = 'report.resolve' and target_id = '${repId}' and admin_id = '${X}'`).out === '1',
  'audit: içerik işlemi ve şikâyet sonucu ayrı kayıtlar');
r = admin(`select public.admin_resolve_report('${repId}', 'dismissed')`);
check(!ok(r) && /KISG_ADMIN_STATE/.test(r.err), 'sonuçlanmış şikâyet tekrar sonuçlandırılamaz');
const postRep = psql(`select id from public.professional_reports where target_type = 'post' order by created_at limit 1`).out;
r = admin(`select public.admin_resolve_report('${postRep}', 'dismissed', 'ihlal yok')`);
check(ok(r) && JSON.parse(one(r)).reports_closed === 2 && psql(`select count(*) from public.professional_reports where target_id = '${MPOST}' and status = 'dismissed' and action_taken = 'none'`).out === '2',
  `aynı hedefteki bekleyen şikâyetler birlikte kapatıldı (2) ${errOf(r)}`);
const profRep = psql(`select id from public.professional_reports where target_type = 'profile'`).out;
r = admin(`select public.admin_resolve_report('${profRep}', 'resolved', 'x', 'hide')`);
check(!ok(r) && /profil/.test(r.err) && psql(`select status from public.professional_reports where id = '${profRep}'`).out === 'pending', 'profil şikâyetinde içerik işlemi reddedilir, şikâyet değişmez');
r = admin(`select public.admin_resolve_report('${profRep}', 'reviewed', 'takipte')`);
check(ok(r), `profil şikâyeti incelendi olarak işaretlenir ${errOf(r)}`);
r = admin(`select public.admin_resolve_report('${profRep}', 'bekliyor')`);
check(!ok(r) && /KISG_ADMIN_INPUT/.test(r.err), 'geçersiz şikâyet durumu reddedilir');

// ---------------- audit log okuma + bütünlük ----------------
r = admin(`select count(*) || '|' || max(total_count) from public.admin_list_audit_log()`);
check(ok(r) && one(r).split('|')[0] === String(Math.min(audits(), 50)) && one(r).split('|')[1] === String(audits()), `admin_list_audit_log: tüm kayıtlar (${one(r)})`);
r = admin(`select string_agg(action, ',') from public.admin_list_audit_log('sanction')`);
check(ok(r) && /sanction.create/.test(one(r)) && /sanction.revoke/.test(one(r)), 'admin_list_audit_log: hedef türü filtresi');
check(psql(`select count(*) from public.professional_admin_audit_log where admin_id is distinct from '${X}'`).out === '0', 'her audit kaydında işlemi yapan admin kimliği var');
r = as('authenticated', user(X), `update public.professional_admin_audit_log set reason = 'x'`);
check(!ok(r), 'admin bile audit log kaydını doğrudan değiştiremez');
r = as('authenticated', user(X2), `select count(*) from public.admin_list_audit_log(null, null, '${X}')`);
check(ok(r) && Number(one(r)) > 0, 'ikinci admin, diğer adminin işlemlerini görebiliyor');

// ---------------- mevcut akışlar ----------------
r = as('authenticated', user(A), `update public.professional_posts set content = 'düzenledim' where id = '${APOST}'`);
check(ok(r), `normal kullanıcının kendi postunu düzenlemesi aynı ${errOf(r)}`);
r = as('authenticated', user(A), `select count(*) from public.professional_reports`);
check(!ok(r) && /permission denied/.test(r.err), 'kullanıcı şikâyet tablosunu okuyamaz (değişmedi)');

// ---------------- rollback + verify ----------------
const auditBefore = audits();
r = runFile(MIG('20261003_admin_v1_b.rollback.sql'));
check(ok(r), `rollback çalıştı ${r.err}`);
check(snapshot() === before, 'rollback: şema Migration B öncesiyle birebir aynı');
check(audits() === auditBefore, 'rollback audit log ve yaptırım verisine dokunmadı');
r = runFile(MIG('20261003_admin_v1_b.sql'));
check(ok(r), `rollback sonrası yeniden uygulanabilir ${r.err}`);
r = runFile(MIG('20261003_admin_v1_b.verify.sql'));
const rows = r.out.split('\n').filter(Boolean);
const bad = rows.filter(l => !l.endsWith('|t'));
check(ok(r) && rows.length >= 30 && bad.length === 0, `verify: ${rows.length} satırın hepsi ok ${bad.join(' ; ')} ${r.err}`);
