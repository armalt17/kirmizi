// Onaylı hesap V1 — DB testi (yerel geçici PostgreSQL, production'a bağlanmaz).
// Şema: stub + raporlar + Fix Pack 1 + Admin A/B + storage taklidi + 20261013.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startCluster } from '../helpers/localpg.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MIG = f => path.join(ROOT, 'db/migrations', f);
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) process.exitCode = 1; };
const pg = startCluster({ utf8: true });
if (!pg) { console.log('SKIP PostgreSQL bulunamadı — DB testi çalıştırılmadı'); process.exit(0); }
const { psql, runFile, as } = pg;
const ok = r => r.code === 0;
const A = '11111111-1111-4111-8111-111111111111', M = '22222222-2222-4222-8222-222222222222', P = '33333333-3333-4333-8333-333333333333', X = '99999999-9999-4999-8999-999999999999';
const user = id => ({ sub: id, role: 'authenticated' });
const admin = sql => as('authenticated', user(X), sql);
const BK = 'kisg-verifications';
const upload = (uid, name) => as('authenticated', user(uid), `insert into storage.objects (bucket_id, name, owner_id) values ('${BK}', '${name}', '${uid}')`);
const submit = (uid, name) => as('authenticated', user(uid), `select public.kisg_submit_verification('${name}')`);
const decide = (uid, yes, why = null) => admin(`select public.admin_decide_verification('${uid}', ${yes}, ${why ? `'${why}'` : 'null'})`);
const verified = () => as('anon', null, `select coalesce(string_agg(left(x::text, 4), ',' order by x), '') from public.kisg_verified_users() x`).out.trim();

const SETUP = `
create function auth.role() returns text language sql stable as $f$ select auth.jwt() ->> 'role' $f$;
grant execute on function auth.role() to anon, authenticated, service_role;
create table public.professional_post_likes (post_id uuid not null references public.professional_posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade, created_at timestamptz not null default now(), primary key (post_id, user_id));
create table public.professional_comment_likes (comment_id uuid not null references public.professional_post_comments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade, created_at timestamptz not null default now(), primary key (comment_id, user_id));
alter table public.professional_post_likes enable row level security;
alter table public.professional_comment_likes enable row level security;
create schema storage;
grant usage on schema storage to anon, authenticated, service_role;
create table storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, owner_id text, created_at timestamptz default now());
alter table storage.objects enable row level security;
grant all on storage.objects to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;
create function storage.foldername(name text) returns text[] language plpgsql immutable as $f$
declare _parts text[]; begin select string_to_array(name, '/') into _parts; return _parts[1:array_length(_parts, 1) - 1]; end $f$;
grant execute on function storage.foldername(text) to anon, authenticated, service_role;
create policy "Public can view profile avatars" on storage.objects for select using (bucket_id = 'profile-avatars');
`;
let r = runFile(path.join(ROOT, 'tests/helpers/kisg-prod-stub.sql'));
check(ok(r), `production kopyası şema kuruldu ${r.err}`);
r = psql(SETUP); check(ok(r), `ek tablolar + storage taklidi ${r.err}`);
for (const f of ['20260929_professional_reports.sql', '20260930_security_fix_pack1.sql', '20261002_admin_v1_a.sql', '20261003_admin_v1_b.sql']) {
  r = runFile(MIG(f)); check(ok(r), `${f} kuruldu ${r.err}`);
}
const pol0 = psql(`select string_agg(tablename || policyname, '|' order by tablename, policyname) from pg_policies`).out;
r = runFile(MIG('20261013_verified_accounts.sql')); check(ok(r), `migration uygulandı ${r.err}`);
r = runFile(MIG('20261013_verified_accounts.sql')); check(ok(r), `migration tekrar çalıştırılabilir ${r.err}`);
check(psql(`select string_agg(tablename || policyname, '|' order by tablename, policyname) from pg_policies where tablename <> 'professional_verifications' and policyname not like 'kisg_verifications_%'`).out === pol0, 'diğer RLS politikaları DEĞİŞMEDİ');
r = runFile(MIG('20261013_verified_accounts.verify.sql'));
const vrows = r.out.split('\n').filter(Boolean);
check(ok(r) && vrows.length === 26 && vrows.every(l => l.endsWith('|t')), `verify: ${vrows.length} satırın hepsi ok ${vrows.filter(l => !l.endsWith('|t')).join(' ; ')}`);

// A: abonelikli Pro, M: Pro değil, P: aboneliksiz manuel premium
psql(`update public.profiles set is_premium = true where id = '${A}'`);
psql(`insert into public.user_subscriptions (user_id, platform, product_id, transaction_id, status, expires_at) values ('${A}', 'android', 'pro_monthly', 't1', 'active', now() + interval '20 days')`);
check(psql(`select public.kisg_is_pro('${A}')::text || public.kisg_is_pro('${M}')::text || public.kisg_is_pro('${P}')::text`).out === 'truefalsetrue', 'Pro: abonelikli aktif, Pro değil, manuel premium');

// ---- yükleme ----
r = upload(M, `${M}/belge.jpg`); check(!ok(r) && /row-level security/.test(r.err), 'Pro olmayan belge yükleyemez');
r = upload(A, `${M}/belge.jpg`); check(!ok(r) && /row-level security/.test(r.err), 'başkasının klasörüne yüklenemez');
r = upload(A, `${A}/belge.jpg`); check(ok(r), `Pro kendi klasörüne yükledi ${r.err}`);
r = as('authenticated', user(M), `select count(*) from storage.objects where bucket_id = '${BK}'`); check(ok(r) && r.out.trim() === '0', 'başka kullanıcı belgeyi okuyamaz');
r = as('authenticated', user(A), `select count(*) from storage.objects where bucket_id = '${BK}'`); check(ok(r) && r.out.trim() === '1', 'sahibi yalnız kendi belgesini görür');
r = as('anon', null, `select count(*) from storage.objects where bucket_id = '${BK}'`); check(ok(r) && r.out.trim() === '0', 'misafir belgeyi okuyamaz');
check(admin(`select count(*) from storage.objects where bucket_id = '${BK}'`).out.trim() === '1', 'admin belgeyi okuyabilir (imzalı bağlantı)');
check(psql(`select public::text from storage.buckets where id = '${BK}'`).out === 'false', 'depo herkese kapalı');

// ---- gönderme ----
r = submit(M, `${M}/x.jpg`); check(!ok(r) && /KISG_PRO_ONLY/.test(r.err), 'Pro olmayan onaya gönderemez');
r = submit(A, `${A}/yok.jpg`); check(!ok(r) && /KISG_VERIFY_FILE/.test(r.err), 'olmayan dosya gönderilemez');
r = submit(A, `${M}/belge.jpg`); check(!ok(r) && /KISG_VERIFY_FILE/.test(r.err), 'başkasının yolu gönderilemez');
r = submit(A, `${A}/belge.jpg`); check(ok(r) && r.out.trim() === 'pending', `onaya gönderildi ${r.err}`);
r = submit(A, `${A}/belge.jpg`); check(!ok(r) && /KISG_VERIFY_PENDING/.test(r.err), 'inceleniyorken tekrar gönderilemez');
r = as('authenticated', user(A), `select status from public.professional_verifications`); check(ok(r) && r.out.trim() === 'pending', 'kullanıcı kendi durumunu görür');
r = as('authenticated', user(M), `select count(*) from public.professional_verifications`); check(ok(r) && r.out.trim() === '0', 'başkasının başvurusu görünmez');
r = as('anon', null, `select count(*) from public.professional_verifications`); check(!ok(r), 'misafir tabloyu okuyamaz');
r = as('authenticated', user(A), `update public.professional_verifications set status = 'approved'`); check(!ok(r) && /permission denied/.test(r.err), 'kullanıcı kendini onaylayamaz (UPDATE yok)');
r = as('authenticated', user(A), `insert into public.professional_verifications (user_id, status, verified_name) values ('${A}', 'approved', 'x')`); check(!ok(r) && /permission denied/.test(r.err), 'kullanıcı doğrudan satır ekleyemez');
check(verified() === '', 'beklerken rozet yok');

// ---- admin ----
r = as('authenticated', user(A), `select * from public.admin_list_verifications()`); check(!ok(r) && /KISG_ADMIN_ONLY/.test(r.err), 'admin olmayan kuyruğu göremez');
r = as('authenticated', user(A), `select public.admin_decide_verification('${A}', true)`); check(!ok(r) && /KISG_ADMIN_ONLY/.test(r.err), 'admin olmayan karar veremez');
r = admin(`select full_name || '|' || status || '|' || doc_path || '|' || is_pro::text || '|' || (pro_until is not null)::text from public.admin_list_verifications()`);
check(ok(r) && r.out.trim() === `Ayşe Yılmaz|pending|${A}/belge.jpg|true|true`, `kuyruk: ad, belge yolu, Pro bitişi ${r.out.trim()} ${r.err}`);
r = decide(A, false); check(!ok(r) && /KISG_ADMIN_INPUT/.test(r.err), 'sebepsiz ret yok');
r = decide(A, true); check(ok(r) && r.out.trim() === `${A}/belge.jpg`, `onaylandı; silinecek belge yolu döndü ${r.err}`);
check(psql(`select status || '|' || verified_name || '|' || (doc_path is null)::text || '|' || (decided_by = '${X}')::text from public.professional_verifications`).out === 'approved|Ayşe Yılmaz|true|true', 'onay kaydı: ad saklandı, belge yolu silindi, karar veren');
check(psql(`select count(*) from public.professional_admin_audit_log where target_type = 'verification' and action = 'verification.approve'`).out === '1', 'onay denetim kaydında');
r = decide(A, true); check(!ok(r) && /KISG_VERIFY_STATE/.test(r.err), 'ikinci karar verilemez');
r = admin(`delete from storage.objects where bucket_id = '${BK}' and name = '${A}/belge.jpg' returning 1`); check(ok(r) && r.out.trim() === '1', 'admin belgeyi silebilir');
check(verified() === A.slice(0, 4), 'rozet: onaylı + Pro');
r = submit(A, `${A}/belge.jpg`); check(!ok(r), 'onaylıyken tekrar gönderilemez');

// ---- yaşam döngüsü ----
psql(`update public.user_subscriptions set expires_at = now() - interval '1 day' where user_id = '${A}'`);
check(verified() === '', 'abonelik süresi dolunca rozet kendiliğinden kalkar (is_premium hâlâ true olsa da)');
psql(`update public.user_subscriptions set expires_at = now() + interval '30 days' where user_id = '${A}'`);
check(verified() === A.slice(0, 4), 'Pro yenilenince rozet yeni belge olmadan geri gelir');
psql(`update public.profiles set is_premium = false where id = '${A}'`);
check(verified() === '', 'is_premium false olunca rozet yok');
psql(`update public.profiles set is_premium = true where id = '${A}'`);
psql(`update public.profiles set full_name = '  AYSE   YILMAZ ' where id = '${A}'`);
check(verified() === A.slice(0, 4), 'boşluk / büyük harf / Türkçe karakter farkı rozeti düşürmez');
psql(`update public.profiles set full_name = 'Ayşe Demir' where id = '${A}'`);
check(verified() === '', 'ad değişince rozet düşer');
r = upload(A, `${A}/yeni.jpg`); r = submit(A, `${A}/yeni.jpg`); check(ok(r), `ad değişince yeniden gönderilebilir ${r.err}`);
r = decide(A, false, 'Ad uyuşmuyor'); check(ok(r), `reddedildi ${r.err}`);
check(psql(`select status || '|' || reason || '|' || verified_name || '|' || (doc_path is null)::text from public.professional_verifications`).out === 'rejected|Ad uyuşmuyor|Ayşe Yılmaz|true', 'ret: sebep yazıldı, belge yolu silindi');
psql(`update public.profiles set full_name = 'Ayşe Yılmaz' where id = '${A}'`);
check(verified() === '', 'reddedilmiş başvuru rozet vermez');

// manuel premium P: onay + geri alma
r = upload(P, `${P}/k.png`); r = submit(P, `${P}/k.png`); check(ok(r), 'manuel premium başvurdu');
psql(`update public.profiles set is_premium = false where id = '${P}'`);
r = decide(P, true); check(!ok(r) && /KISG_NOT_PRO/.test(r.err), 'Pro bitmişse onaylanamaz');
r = decide(P, false, 'Pro üyelik aktif değil'); check(ok(r), 'Pro bitmişse reddedilebilir');
psql(`update public.profiles set is_premium = true where id = '${P}'`);
r = upload(P, `${P}/k2.png`); r = submit(P, `${P}/k2.png`); r = decide(P, true); check(ok(r), 'manuel premium onaylandı');
check(verified() === P.slice(0, 4), 'aboneliksiz manuel premium rozet alır');
r = admin(`select public.admin_revoke_verification('${P}', '')`); check(!ok(r) && /KISG_ADMIN_INPUT/.test(r.err), 'sebepsiz geri alma yok');
r = admin(`select public.admin_revoke_verification('${P}', 'Şikâyet')`); check(ok(r) && verified() === '', 'onay geri alındı, rozet kalktı');
check(psql(`select count(*) from public.professional_admin_audit_log where target_type = 'verification'`).out === '5', 'tüm kararlar denetim kaydında');

// sahibi kendi bekleyen dosyasını silebilir; başkası silemez
r = upload(A, `${A}/z.jpg`);
r = as('authenticated', user(M), `delete from storage.objects where name = '${A}/z.jpg' returning 1`); check(ok(r) && r.out.trim() === '', 'başkası belgeyi silemez');
r = as('authenticated', user(A), `delete from storage.objects where name = '${A}/z.jpg' returning 1`); check(ok(r) && r.out.trim() === '1', 'sahibi kendi belgesini silebilir (yükleme yarıda kalırsa)');

// kullanıcı silinince
psql(`delete from public.profiles where id = '${P}'`);
check(psql(`select count(*) from public.professional_verifications where user_id = '${P}'`).out === '0', 'kullanıcı silinince onay kaydı silinir');

// ---- geri alma ----
r = runFile(MIG('20261013_verified_accounts.rollback.sql')); check(ok(r), `rollback uygulandı ${r.err}`);
check(psql(`select (to_regclass('public.professional_verifications') is null)::text || (select count(*) from pg_policies where policyname like 'kisg_verifications_%')`).out === 'true0', 'rollback: tablo ve depo politikaları kalktı');
r = runFile(MIG('20261013_verified_accounts.sql')); check(ok(r), `rollback sonrası yeniden uygulanabilir ${r.err}`);
