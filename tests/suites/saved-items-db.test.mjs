// Kaydedilenler V1 — DB testi (yerel geçici PostgreSQL, production'a bağlanmaz).
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
const A = '11111111-1111-4111-8111-111111111111', M = '22222222-2222-4222-8222-222222222222';
const user = id => ({ sub: id, role: 'authenticated' });
const save = (uid, t, id) => as('authenticated', user(uid), `insert into public.professional_saved_items (target_type, target_id) values ('${t}', '${id}')`);
const mine = uid => as('authenticated', user(uid), `select string_agg(target_type || ':' || left(target_id::text, 4), ',' order by created_at, target_id) from public.professional_saved_items`).out.trim();

let r = runFile(path.join(ROOT, 'tests/helpers/kisg-prod-stub.sql'));
check(ok(r), `production kopyası şema kuruldu ${r.err}`);
const mk = (sql) => psql(sql + ' returning id').out.trim();
const P1 = mk(`insert into public.professional_posts (user_id, content) values ('${M}', 'aktif post')`);
const P2 = mk(`insert into public.professional_posts (user_id, content, status) values ('${M}', 'gizli post', 'hidden')`);
const S1 = mk(`insert into public.professional_services (user_id, title, description) values ('${M}', 'Hizmet', 'd')`);
const S2 = mk(`insert into public.professional_services (user_id, title, description, status) values ('${M}', 'Arşiv', 'd', 'archived')`);
const pol0 = psql(`select string_agg(tablename || policyname, '|' order by tablename, policyname) from pg_policies`).out;

r = runFile(MIG('20261011_saved_items.sql')); check(ok(r), `migration uygulandı ${r.err}`);
r = runFile(MIG('20261011_saved_items.sql')); check(ok(r), `migration tekrar çalıştırılabilir ${r.err}`);
check(psql(`select string_agg(tablename || policyname, '|' order by tablename, policyname) from pg_policies where tablename <> 'professional_saved_items'`).out === pol0, 'diğer tabloların RLS politikaları DEĞİŞMEDİ');
r = runFile(MIG('20261011_saved_items.verify.sql'));
const vrows = r.out.split('\n').filter(Boolean);
check(ok(r) && vrows.length === 12 && vrows.every(l => l.endsWith('|t')), `verify: ${vrows.length} satırın hepsi ok ${vrows.filter(l => !l.endsWith('|t')).join(' ; ')}`);

// ---- kaydet ----
r = save(A, 'post', P1); check(ok(r), `aktif post kaydedildi ${r.err}`);
r = save(A, 'service', S1); check(ok(r), `aktif hizmet kaydedildi ${r.err}`);
check(psql(`select user_id from public.professional_saved_items limit 1`).out === A, 'user_id oturumdan (auth.uid()) dolduruldu');
r = save(A, 'post', P1); check(!ok(r) && /duplicate key|23505/.test(r.err), 'aynı içerik iki kez kaydedilemez');
r = save(A, 'post', P2); check(!ok(r) && /row-level security/.test(r.err), 'gizli post kaydedilemez');
r = save(A, 'service', S2); check(!ok(r) && /row-level security/.test(r.err), 'arşivlenmiş hizmet kaydedilemez');
r = save(A, 'post', S1); check(!ok(r), 'tür/kimlik uyuşmazlığı (hizmet kimliği post olarak) reddedildi');
r = save(A, 'profile', M); check(!ok(r), 'V1 dışı tür (profil) reddedildi');
r = as('authenticated', user(A), `insert into public.professional_saved_items (user_id, target_type, target_id) values ('${M}', 'post', '${P1}')`);
check(!ok(r) && /row-level security/.test(r.err), 'başkası adına kayıt eklenemez');

// ---- gizlilik ----
r = save(M, 'post', P1); check(ok(r), 'ikinci kullanıcı da kaydetti');
check(mine(A) === `post:${P1.slice(0, 4)},service:${S1.slice(0, 4)}` && mine(M) === `post:${P1.slice(0, 4)}`, `herkes yalnız kendi kayıtlarını görür (A: ${mine(A)} | M: ${mine(M)})`);
r = as('anon', null, `select count(*) from public.professional_saved_items`); check(!ok(r) && /permission denied/.test(r.err), 'misafir okuyamaz (public kaydetme sayısı yok)');
r = as('anon', null, `insert into public.professional_saved_items (user_id, target_type, target_id) values ('${A}', 'post', '${P1}')`); check(!ok(r), 'misafir kaydedemez');
r = as('authenticated', user(M), `delete from public.professional_saved_items where user_id = '${A}' returning 1`);
check(ok(r) && r.out.trim() === '' && mine(A).includes('post:'), 'başkasının kaydı silinemez (0 satır)');
r = as('authenticated', user(A), `update public.professional_saved_items set created_at = now()`); check(!ok(r) && /permission denied/.test(r.err), 'güncelleme yetkisi yok');

// ---- yayından kalkan içerik ----
psql(`update public.professional_posts set status = 'hidden' where id = '${P1}'`);
check(mine(A).includes('post:'), 'post gizlenince kayıt durur (sahibi "artık yayında değil" görür)');
check(as('authenticated', user(A), `select count(*) from public.professional_posts where id = '${P1}'`).out.trim() === '0', 'gizli postun içeriği kayıt sahibine de okunmaz (RLS)');
r = as('authenticated', user(A), `delete from public.professional_saved_items where target_id = '${P1}' returning 1`);
check(ok(r) && r.out.trim() === '1' && !mine(A).includes('post:'), 'sahibi yayından kalkan içeriğin kaydını silebilir');
psql(`delete from public.professional_posts where id = '${P2}'`);

// ---- kullanıcı silinince ----
psql(`delete from public.profiles where id = '${M}'`);
check(psql(`select count(*) from public.professional_saved_items where user_id = '${M}'`).out === '0', 'kullanıcı silinince kayıtları da silinir');

// ---- sınır ----
psql(`alter table public.professional_saved_items disable trigger kisg_saved_items_limit`);
psql(`insert into public.professional_saved_items (user_id, target_type, target_id) select '${A}', 'post', gen_random_uuid() from generate_series(1, 999)`);
psql(`alter table public.professional_saved_items enable trigger kisg_saved_items_limit`);
const P3 = mk(`insert into public.professional_posts (user_id, content) values ('${A}', 'yeni')`);
r = save(A, 'post', P3); check(!ok(r) && /KISG_SAVED_LIMIT/.test(r.err), 'kullanıcı başına 1000 kayıt sınırı');

// ---- geri alma ----
r = runFile(MIG('20261011_saved_items.rollback.sql')); check(ok(r), `rollback uygulandı ${r.err}`);
check(psql(`select to_regclass('public.professional_saved_items') is null`).out === 't', 'rollback: tablo kalktı');
r = runFile(MIG('20261011_saved_items.sql')); check(ok(r), `rollback sonrası yeniden uygulanabilir ${r.err}`);
