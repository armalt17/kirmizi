// Alan açıklaması: alanı açan da yazabilir — DB testi (yerel geçici PostgreSQL, production'a bağlanmaz).
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
const A = '11111111-1111-4111-8111-111111111111', M = '22222222-2222-4222-8222-222222222222', X = '99999999-9999-4999-8999-999999999999';
const user = id => ({ sub: id, role: 'authenticated' });
const q = s => `'${String(s).replace(/'/g, "''")}'`;
const setNote = (uid, id, note) => as('authenticated', user(uid), `select public.kisg_tag_set_note('${id}', ${note === null ? 'null' : q(note)})`);
const note = id => psql(`select coalesce(note, '∅') from public.professional_tags where id = '${id}'`).out;
const SETUP = `
create function auth.role() returns text language sql stable as $f$ select auth.jwt() ->> 'role' $f$;
grant execute on function auth.role() to anon, authenticated, service_role;
create table public.professional_post_likes (post_id uuid not null references public.professional_posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade, created_at timestamptz not null default now(), primary key (post_id, user_id));
create table public.professional_comment_likes (comment_id uuid not null references public.professional_post_comments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade, created_at timestamptz not null default now(), primary key (comment_id, user_id));
alter table public.professional_post_likes enable row level security;
alter table public.professional_comment_likes enable row level security;
`;
let r = runFile(path.join(ROOT, 'tests/helpers/kisg-prod-stub.sql')); check(ok(r), `production kopyası şema ${r.err}`);
r = psql(SETUP); check(ok(r), `ek tablolar ${r.err}`);
for (const f of ['20260929_professional_reports.sql', '20260930_security_fix_pack1.sql', '20261002_admin_v1_a.sql', '20261003_admin_v1_b.sql', '20261005_tags_v1.sql', '20261006_tags_admin_v2.sql', '20261007_tags_trending_v2.sql', '20261008_tags_pinned_note.sql']) {
  r = runFile(MIG(f)); check(ok(r), `${f} kuruldu ${r.err}`);
}
r = runFile(MIG('20261012_tag_note_owner.sql')); check(ok(r), `migration uygulandı ${r.err}`);
r = runFile(MIG('20261012_tag_note_owner.sql')); check(ok(r), `migration tekrar çalıştırılabilir ${r.err}`);
r = runFile(MIG('20261012_tag_note_owner.verify.sql'));
const vrows = r.out.split('\n').filter(Boolean);
check(ok(r) && vrows.length === 4 && vrows.every(l => l.endsWith('|t')), `verify: ${vrows.length} satırın hepsi ok ${vrows.filter(l => !l.endsWith('|t')).join(' ; ')}`);

const T = as('authenticated', user(A), `select id from public.kisg_tag_resolve('Yangın Tatbikatı')`).out.trim();
const PIN = psql(`select id from public.professional_tags where pinned limit 1`).out;
check(psql(`select created_by from public.professional_tags where id = '${T}'`).out === A, 'alanı açan created_by olarak kayıtlı');

r = setNote(A, T, '  İtfaiye ile   ortak tatbikat deneyimleri  '); check(ok(r) && note(T) === 'İtfaiye ile ortak tatbikat deneyimleri', `alanı açan açıklama yazdı, boşluklar toparlandı (${note(T)})`);
r = setNote(A, T, 'Güncel açıklama'); check(ok(r) && note(T) === 'Güncel açıklama', 'alanı açan açıklamayı değiştirdi');
r = setNote(M, T, 'Başkası'); check(!ok(r) && /KISG_TAG_NOT_OWNER/.test(r.err) && note(T) === 'Güncel açıklama', 'başka kullanıcı yazamaz');
r = as('anon', null, `select public.kisg_tag_set_note('${T}', 'x')`); check(!ok(r) && /permission denied/.test(r.err), 'misafir çağıramaz');
r = setNote(A, T, 'x'.repeat(161)); check(!ok(r) && /160/.test(r.err), '160 karakter sınırı');
r = setNote(A, PIN, 'Sabit'); check(!ok(r) && /KISG_TAG_PINNED/.test(r.err), 'sabit alanın açıklaması yalnız yönetimde');
r = as('authenticated', user(A), `update public.professional_tags set note = 'doğrudan' where id = '${T}'`); check(!ok(r) && /permission denied/.test(r.err), 'tabloya doğrudan yazılamaz');
// admin her alanın açıklamasını değiştirebilir (mevcut admin_update_tag)
r = as('authenticated', user(X), `select public.admin_update_tag('${T}', '{"note":"Yönetim açıklaması"}', null)`); check(ok(r) && note(T) === 'Yönetim açıklaması', `admin sabit olmayan alanın açıklamasını değiştirdi ${r.err}`);
// yaptırım
psql(`insert into public.professional_user_sanctions (user_id, type, reason, created_by, starts_at, ends_at) values ('${A}', 'suspension', 'test', '${X}', now() - interval '1 hour', now() + interval '1 day')`);
r = setNote(A, T, 'Askıdayken'); check(!ok(r) && /KISG_USER_SUSPENDED/.test(r.err), 'askıdaki kullanıcı yazamaz');
psql(`update public.professional_user_sanctions set revoked_at = now() where user_id = '${A}'`);
r = setNote(A, T, null); check(ok(r) && note(T) === '∅', 'boş bırakınca açıklama kalkar (zorunlu değil)');
psql(`update public.professional_tags set blocked = true where id = '${T}'`);
r = setNote(A, T, 'Engelliyken'); check(!ok(r) && /KISG_TAG_NOT_FOUND/.test(r.err), 'engelli alana yazılamaz');
r = runFile(MIG('20261012_tag_note_owner.rollback.sql')); check(ok(r) && psql(`select count(*) from pg_proc where proname = 'kisg_tag_set_note'`).out === '0', `rollback ${r.err}`);
r = runFile(MIG('20261012_tag_note_owner.sql')); check(ok(r), `rollback sonrası yeniden uygulanabilir ${r.err}`);
