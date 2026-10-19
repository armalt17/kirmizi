// Post'ta ikinci fotoğraf — DB testi (yerel geçici PostgreSQL, production'a bağlanmaz).
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
const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222';
const user = id => ({ sub: id, role: 'authenticated' });
const img = (uid, n = 1, ext = 'webp') => `'${uid}/${'aaaaaaaa-0000-4000-8000-00000000000' + n}-${'bbbbbbbb-0000-4000-8000-00000000000' + n}.${ext}'`;
const ins = (uid, p1, p2) => as('authenticated', user(uid), `insert into public.professional_posts (user_id, content, image_path, image_path_2) values ('${uid}', 'p', ${p1}, ${p2}) returning id`);

let r = runFile(path.join(ROOT, 'tests/helpers/kisg-prod-stub.sql'));
check(ok(r), `production kopyası şema kuruldu ${r.err}`);
const policies = () => psql(`select string_agg(tablename || policyname || coalesce(qual, '') || coalesce(with_check, ''), '|' order by tablename, policyname) from pg_policies`).out;
const pol0 = policies();
r = as('authenticated', user(A), `insert into public.professional_posts (user_id, content, image_path) values ('${A}', 'eski', ${img(A)}) returning id`);
const oldPost = r.out.trim();
check(ok(r) && oldPost, `migration öncesi tek görselli post var ${r.err}`);

r = runFile(MIG('20261009_post_second_image.sql')); check(ok(r), `migration uygulandı ${r.err}`);
r = runFile(MIG('20261009_post_second_image.sql')); check(ok(r), `migration tekrar çalıştırılabilir ${r.err}`);
check(policies() === pol0, 'RLS politikaları DEĞİŞMEDİ');
check(psql(`select image_path_2 is null and image_path is not null from public.professional_posts where id = '${oldPost}'`).out === 't', 'eski post aynen kaldı (tek görsel)');
r = runFile(MIG('20261009_post_second_image.verify.sql'));
const vrows = r.out.split('\n').filter(Boolean);
check(ok(r) && vrows.length === 3 && vrows.every(l => l.endsWith('|t')), `verify: 3 satırın hepsi ok ${vrows.join(' ; ')}`);

// ---- kurallar ----
r = ins(A, img(A, 1), img(A, 2, 'jpg')); check(ok(r), `iki görselli post (webp + jpg) ${r.err}`);
const two = r.out.trim();
check(as('anon', null, `select image_path_2 from public.professional_posts where id = '${two}'`).out.trim().endsWith('.jpg'), 'misafir ikinci görseli okuyabilir');
r = ins(A, 'null', img(A, 2)); check(!ok(r) && /image_path_2_check/.test(r.err), 'birinci görsel olmadan ikinci görsel reddedildi');
r = ins(A, img(A, 1), img(A, 1)); check(!ok(r) && /image_path_2_check/.test(r.err), 'iki görsel aynı dosya olamaz');
r = ins(A, img(A, 1), img(B, 2)); check(!ok(r) && /image_path_2_check/.test(r.err), 'başka kullanıcının klasöründeki görsel reddedildi');
r = ins(A, img(A, 1), `'${A}/../x.webp'`); check(!ok(r), 'geçersiz yol (../) reddedildi');
r = ins(A, img(A, 1), `'${A}/x.png'`); check(!ok(r), 'izin verilmeyen uzantı reddedildi');
r = as('authenticated', user(A), `update public.professional_posts set image_path_2 = ${img(A, 3)} where id = '${oldPost}' returning id`);
check(ok(r) && r.out.trim() === oldPost, `sahip eski postuna ikinci görsel ekleyebilir ${r.err}`);
r = as('authenticated', user(A), `update public.professional_posts set image_path = null where id = '${oldPost}'`);
check(!ok(r) && /image_path_2_check/.test(r.err), 'ikinci varken birinci tek başına silinemez (istemci kaydırır)');
r = as('authenticated', user(A), `update public.professional_posts set image_path = image_path_2, image_path_2 = null where id = '${oldPost}' returning image_path`);
check(ok(r) && r.out.includes('-bbbbbbbb-0000-4000-8000-000000000003'), `birinci kaldırılınca ikinci öne kayar ${r.err}`);
r = as('authenticated', user(B), `update public.professional_posts set image_path_2 = ${img(B, 4)} where id = '${two}' returning id`);
check(ok(r) && r.out.trim() === '', 'başkasının postuna görsel eklenemez (RLS: 0 satır)');

// ---- geri alma ----
r = runFile(MIG('20261009_post_second_image.rollback.sql')); check(ok(r), `rollback uygulandı ${r.err}`);
check(psql(`select count(*) from pg_attribute where attrelid = 'public.professional_posts'::regclass and attname = 'image_path_2' and not attisdropped`).out === '0' && psql(`select count(*) from public.professional_posts`).out === '2', 'rollback: sütun kalktı, postlar duruyor');
r = runFile(MIG('20261009_post_second_image.sql')); check(ok(r), `rollback sonrası yeniden uygulanabilir ${r.err}`);

