// Konular V2 — admin etiket yönetimi DB testi (yerel geçici PostgreSQL, production'a bağlanmaz).
// Şema: stub + raporlar + Fix Pack 1 + Admin A/B + Etiket V1 (production sırası) + 20261006.
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
const admin = sql => as('authenticated', user(X), sql);
const q = s => `'${String(s).replace(/'/g, "''")}'`;
const tagId = name => psql(`select id from public.professional_tags where normalized_name = public.kisg_tag_normalize(${q(name)})`).out;
const resolve = (uid, name) => as('authenticated', user(uid), `select id from public.kisg_tag_resolve(${q(name)})`).out.trim();
const post = (uid, tag, ago = '0 minutes') => as('authenticated', user(uid), `insert into public.professional_posts (user_id, content, tag_id, created_at) values ('${uid}', 'p', ${tag ? q(tag) : 'null'}, now() - interval ${q(ago)}) returning id`);
const list = (args = '') => admin(`select string_agg(name || ':' || post_count || ':' || pinned::int || blocked::int || ':' || total_count, ',' order by ord) from (select *, row_number() over () ord from public.admin_list_tags(${args})) x`);
const audits = () => Number(psql(`select count(*) from public.professional_admin_audit_log where target_type = 'tag'`).out);

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
let r = runFile(path.join(ROOT, 'tests/helpers/kisg-prod-stub.sql'));
check(ok(r), `production kopyası şema kuruldu ${r.err}`);
r = psql(SETUP); check(ok(r), `ek tablolar ${r.err}`);
for (const f of ['20260929_professional_reports.sql', '20260930_security_fix_pack1.sql', '20261002_admin_v1_a.sql', '20261003_admin_v1_b.sql', '20261005_tags_v1.sql']) {
  r = runFile(MIG(f)); check(ok(r), `${f} kuruldu ${r.err}`);
}
r = runFile(MIG('20261006_tags_admin_v2.sql')); check(ok(r), `migration uygulandı ${r.err}`);
r = runFile(MIG('20261006_tags_admin_v2.sql')); check(ok(r), `migration tekrar çalıştırılabilir ${r.err}`);
r = runFile(MIG('20261006_tags_admin_v2.verify.sql'));
const vrows = r.out.split('\n').filter(Boolean);
check(ok(r) && vrows.length === 11 && vrows.every(l => l.endsWith('|t')), `verify: ${vrows.length} satırın hepsi ok ${vrows.filter(l => !l.endsWith('|t')).join(' ; ')}`);

// ---- veri ----
const YC = resolve(A, 'Yüksekte Çalışma'), YC2 = resolve(M, 'Yuksekte calismalar'), KKD = resolve(A, 'KKD');
for (const [u, t, ago] of [[A, YC, '2 hours'], [M, YC, '1 hour'], [A, YC, '3 days'], [M, YC2, '30 minutes'], [A, KKD, '5 minutes']]) {
  r = post(u, t, ago); if (!ok(r)) check(false, `post ${r.err}`);
}

// ---- yetki ----
r = as('authenticated', user(A), `select * from public.admin_list_tags()`);
check(!ok(r) && /KISG_ADMIN_ONLY/.test(r.err), 'admin olmayan listeyi göremez');
r = as('anon', null, `select * from public.admin_list_tags()`);
check(!ok(r) && /permission denied/.test(r.err), 'misafir çağıramaz');
r = as('authenticated', user(A), `select public.admin_update_tag('${KKD}', '{"blocked":true}', 'x')`);
check(!ok(r) && /KISG_ADMIN_ONLY/.test(r.err), 'admin olmayan engelleyemez');
r = as('authenticated', user(A), `select public.admin_merge_tags('${YC2}', '${YC}', 'x')`);
check(!ok(r) && /KISG_ADMIN_ONLY/.test(r.err), 'admin olmayan birleştiremez');

// ---- liste, arama, sıralama ----
r = list();
check(ok(r) && r.out.trim() === 'Yüksekte Çalışma:3:00:4,KKD:1:00:4,Yuksekte calismalar:1:00:4,Bakanlığa Şikayet:0:10:4' || r.out.trim().startsWith('Yüksekte Çalışma:3:00:4,'), `varsayılan sıralama: en çok post (${r.out.trim()})`);
r = list(`p_sort => 'az'`);
check(r.out.trim().split(',').map(x => x.split(':')[0]).join('|') === 'Bakanlığa Şikayet|KKD|Yüksekte Çalışma|Yuksekte calismalar', `alfabetik (${r.out.trim()})`);
r = list(`p_sort => 'new'`);
check(r.out.trim().split(',')[3].startsWith('Bakanlığa Şikayet'), `en yeni: seed en sonda (${r.out.trim()})`);
r = list(`p_q => 'YÜKSEKTE'`);
check(r.out.trim().split(',').length === 2 && r.out.trim().endsWith(':2'), `arama Türkçe/büyük harf bağımsız (${r.out.trim()})`);
r = list(`p_filter => 'pinned'`);
check(r.out.trim() === 'Bakanlığa Şikayet:0:10:1', `filtre: sabit (${r.out.trim()})`);
r = list(`p_limit => 1, p_offset => 1`);
check(r.out.trim().split(',').length === 1 && r.out.trim().endsWith(':4'), `sayfalama + total_count (${r.out.trim()})`);
r = admin(`select * from public.admin_list_tags(p_sort => 'x')`);
check(!ok(r) && /KISG_ADMIN_INPUT/.test(r.err), 'geçersiz sıralama reddedilir');
r = admin(`select created_at is not null and last_post_at is not null from public.admin_list_tags() where id = '${YC}'`);
check(r.out.trim() === 't', 'oluşturma ve son aktivite döner');

// ---- yeniden adlandır ----
let a0 = audits();
r = admin(`select public.admin_update_tag('${KKD}', '{"name":"  Kişisel   Koruyucu "}', 'netlik')`);
check(ok(r) && psql(`select name || '|' || normalized_name from public.professional_tags where id = '${KKD}'`).out === 'Kişisel Koruyucu|kisiselkoruyucu', `yeniden adlandırıldı ${r.err}`);
check(psql(`select count(*) from public.professional_posts where tag_id = '${KKD}'`).out === '1', 'postlar etkilenmedi (id ile bağlı)');
check(audits() === a0 + 1 && psql(`select action || '|' || reason || '|' || (before->>'name') || '|' || (after->>'name') from public.professional_admin_audit_log where target_type = 'tag' order by created_at desc limit 1`).out === 'tag.update|netlik|KKD|Kişisel Koruyucu', 'audit yazıldı');
r = admin(`select public.admin_update_tag('${KKD}', '{"name":"YÜKSEKTE çalışma"}', 'x')`);
check(!ok(r) && /KISG_TAG_EXISTS/.test(r.err), 'var olan adla çakışma → birleştirme öner');
r = admin(`select public.admin_update_tag('${KKD}', '{"name":"bu ad yirmi karakterden uzun"}', 'x')`);
check(!ok(r) && /KISG_ADMIN_INPUT/.test(r.err), '20 karakter sınırı');
r = admin(`select public.admin_update_tag('${KKD}', '{"name":"kişisel koruyucu"}', 'yazım')`);
check(ok(r) && psql(`select name from public.professional_tags where id = '${KKD}'`).out === 'kişisel koruyucu', 'aynı etiketin yazımı değişebilir');
r = admin(`select public.admin_update_tag('${KKD}', '{"score":1}', 'x')`);
check(!ok(r) && /KISG_ADMIN_INPUT/.test(r.err), 'izinsiz alan reddedilir');
r = admin(`select public.admin_update_tag('${KKD}', '{"pinned":"evet"}', 'x')`);
check(!ok(r) && /KISG_ADMIN_INPUT/.test(r.err), 'pinned boolean olmalı');

// ---- sabitle / engelle ----
r = admin(`select public.admin_update_tag('${KKD}', '{"pinned":true}', null)`);
check(ok(r) && as('anon', null, `select string_agg(name, ',') from public.kisg_tags_trending() where slot = 'pinned'`).out.includes('kişisel koruyucu'), `sabitlenen etiket gündemde sabit slotta ${r.err}`);
a0 = audits();
r = admin(`select public.admin_update_tag('${KKD}', '{"pinned":true}', null)`);
check(ok(r) && audits() === a0, 'değişiklik yoksa audit yazılmaz');
r = admin(`select public.admin_update_tag('${YC2}', '{"blocked":true}', 'spam')`);
check(ok(r), `engellendi ${r.err}`);
r = post(A, YC2);
check(!ok(r) && /etiket kullanilamiyor/.test(r.err), 'engelli etikete yeni post eklenemez');
check(psql(`select count(*) from public.professional_posts where tag_id = '${YC2}' and status = 'active'`).out === '1', 'engelli etiketin eski postu duruyor');
r = admin(`select public.admin_update_tag('${YC2}', '{"blocked":false}', 'hata')`);
check(ok(r) && ok(post(A, YC2)), 'engel kaldırılınca yeniden post eklenebilir');

// ---- birleştir ----
a0 = audits();
r = admin(`select public.admin_merge_tags('${YC2}', '${YC}', 'yinelenen')`);
check(ok(r) && JSON.parse(r.out).moved_posts === 2, `birleştirildi: 2 post taşındı (${r.out.trim()} ${r.err})`);
check(psql(`select count(*) from public.professional_posts where tag_id = '${YC}'`).out === '5', 'hedefte tüm postlar');
check(psql(`select count(*) from public.professional_tags where id = '${YC2}'`).out === '0', 'kaynak etiket silindi');
check(audits() === a0 + 1 && psql(`select action || '|' || target_id || '|' || (after->>'moved_posts') from public.professional_admin_audit_log where target_type = 'tag' order by created_at desc limit 1`).out === `tag.merge|${YC}|2`, 'birleştirme audit');
r = admin(`select public.admin_merge_tags('${YC}', '${YC}', 'x')`);
check(!ok(r) && /KISG_ADMIN_INPUT/.test(r.err), 'kendisiyle birleştirilemez');
r = admin(`select public.admin_merge_tags('${YC2}', '${YC}', 'x')`);
check(!ok(r) && /KISG_ADMIN_NOT_FOUND/.test(r.err), 'olmayan kaynak');
r = as('authenticated', user(A), `update public.professional_posts set tag_id = '${KKD}' where user_id = '${A}' and tag_id = '${YC}'`);
check(ok(r) && psql(`select count(*) from public.professional_posts where tag_id = '${YC}'`).out === '5', 'kullanıcı postun etiketini hâlâ değiştiremez (guard)');
r = admin(`select count(*) from public.admin_list_audit_log(p_target_type => 'tag')`);
check(ok(r) && Number(r.out) >= 4, `audit listesinde etiket kayıtları (${r.out.trim()})`);

// ---- geri alma ----
r = runFile(MIG('20261006_tags_admin_v2.rollback.sql'));
check(ok(r) && psql(`select count(*) from pg_proc where proname in ('admin_list_tags', 'admin_update_tag', 'admin_merge_tags')`).out === '0', `geri alma ${r.err}`);
check(psql(`select count(*) from public.professional_tags`).out === '3', 'etiketler yerinde');
check(Number(psql(`select count(*) from public.professional_admin_audit_log where target_type = 'tag'`).out) >= 4, 'etiket audit kayıtları korundu (append-only)');
pg.stop?.();
