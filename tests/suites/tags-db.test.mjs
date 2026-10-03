// Konular V1 — etiket sistemi DB testi (yerel geçici PostgreSQL, production'a bağlanmaz).
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
const q = s => `'${String(s).replace(/'/g, "''")}'`;
const resolve = (uid, name) => as('authenticated', user(uid), `select id || '|' || name from public.kisg_tag_resolve(${q(name)})`);
const tagId = name => psql(`select id from public.professional_tags where normalized_name = public.kisg_tag_normalize(${q(name)})`).out;
const post = (uid, tag, ago = '0 minutes', extra = '') => as('authenticated', user(uid), `insert into public.professional_posts (user_id, content, tag_id${extra ? ', ' + extra.split('=')[0] : ''}, created_at) values ('${uid}', 'p', ${tag ? q(tag) : 'null'}${extra ? ', ' + extra.split('=')[1] : ''}, now() - interval ${q(ago)}) returning id`);
const trending = (role = 'anon', claims = null) => as(role, claims, `select string_agg(slot || ':' || name, ',' order by ord) from (select *, row_number() over () ord from public.kisg_tags_trending()) x`).out.trim();

let r = runFile(path.join(ROOT, 'tests/helpers/kisg-prod-stub.sql'));
check(ok(r), `production kopyası şema kuruldu ${r.err}`);
const policies = () => psql(`select string_agg(tablename || policyname || coalesce(qual, '') || coalesce(with_check, ''), '|' order by tablename, policyname) from pg_policies where tablename <> 'professional_tags'`).out;
const pol0 = policies();
r = as('authenticated', user(A), `insert into public.professional_posts (user_id, content) values ('${A}', 'eski') returning id`); check(ok(r), `migration öncesi bir post var (eski post) ${r.err}`);
const oldPost = r.out.trim();

r = runFile(MIG('20261005_tags_v1.sql'));
check(ok(r), `migration uygulandı ${r.err}`);
r = runFile(MIG('20261005_tags_v1.sql'));
check(ok(r), `migration tekrar çalıştırılabilir ${r.err}`);
check(policies() === pol0, 'diğer tabloların RLS politikaları DEĞİŞMEDİ');
check(psql(`select tag_id is null from public.professional_posts where id = '${oldPost}'`).out === 't', 'eski post etiketsiz kaldı');
r = runFile(MIG('20261005_tags_v1.verify.sql'));
const vrows = r.out.split('\n').filter(Boolean);
check(ok(r) && vrows.length >= 20 && vrows.every(l => l.endsWith('|t')), `verify: ${vrows.length} satırın hepsi ok ${vrows.filter(l => !l.endsWith('|t')).join(' ; ')}`);

// ---- normalize ----
const N = s => psql(`select public.kisg_tag_normalize(${q(s)})`).out;
check(N('Yüksekte Çalışma') === 'yuksektecalisma' && N('YÜKSEKTE  ÇALIŞMA') === 'yuksektecalisma' && N('yuksekte calisma') === 'yuksektecalisma' && N('İŞ KAZALARI') === 'iskazalari' && N('IŞIK') === 'isik', 'normalize: büyük/küçük harf, boşluk ve Türkçe karakter farkı yok');
const seed = psql(`select name || '|' || pinned from public.professional_tags`).out;
check(seed === 'Bakanlığa Şikayet|true', `ilk sabit etiket: Bakanlığa Şikayet (${seed})`);

// ---- seç / oluştur ----
r = as('anon', null, `select * from public.kisg_tag_resolve('ATEX')`);
check(!ok(r) && /permission denied/.test(r.err), 'misafir etiket oluşturamaz');
r = resolve(A, '  Yüksekte   Çalışma ');
check(ok(r) && r.out.trim().endsWith('|Yüksekte Çalışma'), `yeni etiket: boşluklar toparlandı (${r.out.trim()})`);
const YC = tagId('Yüksekte Çalışma');
r = resolve(M, 'YÜKSEKTE ÇALIŞMA');
check(ok(r) && r.out.trim() === `${YC}|Yüksekte Çalışma`, 'aynı etiket farklı yazımla: var olana yönlendirildi, yeni kayıt yok');
check(psql(`select count(*) from public.professional_tags`).out === '2', 'toplam 2 etiket');
r = resolve(A, 'Bu etiket yirmi karakterden uzun');
check(!ok(r) && /22023|1-20/.test(r.err), '20 karakterden uzun etiket reddedildi');
r = resolve(A, '  !!! ');
check(!ok(r), 'yalnız sembolden oluşan etiket reddedildi');
r = as('authenticated', user(A), `insert into public.professional_tags (name, normalized_name) values ('X', 'x')`);
check(!ok(r) && /permission denied/.test(r.err), 'istemci etiket tablosuna doğrudan yazamaz');
r = as('authenticated', user(A), `update public.professional_tags set pinned = true`);
check(!ok(r) && /permission denied/.test(r.err), 'istemci etiketi sabitleyemez');
for (let i = 1; i <= 10; i++) resolve(P, `Deneme ${i}`);
r = resolve(P, 'Deneme 11');
check(!ok(r) && /tag_rate|fazla yeni/.test(r.err), 'günde en fazla 10 yeni etiket (11. reddedildi)');
r = resolve(P, 'yüksekte çalışma');
check(ok(r), 'sınırdaki kullanıcı var olan etiketi seçebilir');
psql(`delete from public.professional_tags where name like 'Deneme %'`);

// ---- post + etiket ----
r = post(A, YC);
check(ok(r), 'etiketli post paylaşıldı');
const p1 = r.out.trim();
check(psql(`select last_post_at is not null from public.professional_tags where id = '${YC}'`).out === 't', 'etiketin son aktivitesi güncellendi');
resolve(A, 'ATEX'); const AT = tagId('ATEX');
r = as('authenticated', user(A), `update public.professional_posts set tag_id = '${AT}', content = 'düzenlendi' where id = '${p1}'`);
check(ok(r) && psql(`select tag_id || '|' || content from public.professional_posts where id = '${p1}'`).out === `${YC}|düzenlendi`, 'paylaşılmış postun etiketi değişmedi, içerik düzenlemesi çalıştı');
r = as('authenticated', user(A), `update public.professional_posts set tag_id = null where id = '${p1}'`);
check(ok(r) && psql(`select tag_id from public.professional_posts where id = '${p1}'`).out === YC, 'paylaşılmış postun etiketi kaldırılamaz');
psql(`update public.professional_tags set blocked = true where id = '${AT}'`);
r = post(A, AT);
check(!ok(r) && /tag_blocked|kullanilamiyor/.test(r.err), 'engellenmiş etikete yeni post eklenemez');
r = resolve(M, 'atex');
check(!ok(r) && /tag_blocked/.test(r.err), 'engellenmiş etiket seçilemez');
psql(`update public.professional_tags set blocked = false where id = '${AT}'`);
r = post(A, AT, '1 hour');
psql(`update public.professional_tags set blocked = true where id = '${AT}'`);
check(psql(`select count(*) from public.professional_posts where tag_id = '${AT}'`).out === '1', 'engellemeden önceki post etiketini korur');

// ---- skor ----
psql(`update public.professional_tags set blocked = false where id = '${AT}'`);
resolve(M, 'İş Kazaları'); const IK = tagId('İş Kazaları');
// Yüksekte Çalışma: 3 farklı kullanıcı son 24 saatte (A zaten 1), A aynı gün 6 post daha (günlük sayım sınırı 3)
post(M, YC, '2 hours'); post(P, YC, '3 hours');
for (let i = 0; i < 6; i++) post(A, YC, `${i + 1} minutes`);
// İş Kazaları: 2 kullanıcı ama 3 gün önce (7g terimi)
post(M, IK, '3 days'); post(P, IK, '3 days');
// ATEX: 1 kullanıcı son 24 saatte (yukarıda 1 saat önce)
r = as('anon', null, `select count(*) from public.kisg_tags_trending()`);
check(ok(r), `misafir gündem şeridini okuyabilir ${r.err}`);
const sc = name => psql(`select round(score, 3) || '|' || users_24h || '|' || users_7d || '|' || posts_7d from public.professional_tag_scores s join public.professional_tags t on t.id = s.tag_id where t.name = ${q(name)}`).out;
const exp = (u24, u7, p7) => (3 * u24 + u7 + 0.5 * Math.log(p7 + 1)).toFixed(3);
check(sc('Yüksekte Çalışma') === `${exp(3, 3, 5)}|3|3|5`, `Yüksekte Çalışma skoru: 3×3 + 3 + 0.5·ln(5+1); A'nın aynı gündeki 7 postundan 3'ü sayıldı (${sc('Yüksekte Çalışma')})`);
check(sc('İş Kazaları') === `${exp(0, 2, 2)}|0|2|2`, `İş Kazaları skoru: 0 + 2 + 0.5·ln(3) (${sc('İş Kazaları')})`);
check(trending() === 'pinned:Bakanlığa Şikayet,trending:Yüksekte Çalışma,trending:ATEX,trending:İş Kazaları', `şerit sırası: sabit → skora göre (${trending()})`);
// saatlik önbellek: yeni post skoru hemen değiştirmez
for (const u of [M, P, X, A]) post(u, IK, '10 minutes');
check(sc('İş Kazaları') === `${exp(0, 2, 2)}|0|2|2` && trending().startsWith('pinned:Bakanlığa Şikayet,trending:Yüksekte Çalışma'), 'skor o saat boyunca sabit (önbellek)');
psql(`update public.professional_tag_score_runs set computed_at = now() - interval '61 minutes'`);
trending();
check(sc('İş Kazaları') === `${exp(4, 4, 6)}|4|4|6`, `1 saat sonra skor yeniden hesaplandı (${sc('İş Kazaları')})`);
// engellenen etiket şeritten düşer, sabit her zaman başta
psql(`update public.professional_tags set blocked = true where id = '${AT}'`); psql(`update public.professional_tag_score_runs set computed_at = now() - interval '2 hours'`);
check(!trending().includes('ATEX'), 'engellenmiş etiket şeritte yok');
// en yeni slot: top 8 dışında, son 24 saatte açılmış, aktif postu olan
r = as('anon', null, `select string_agg(slot || ':' || name, ',') from public.kisg_tags_trending(1)`);
check(ok(r) && r.out.trim() === 'pinned:Bakanlığa Şikayet,trending:İş Kazaları,new:Yüksekte Çalışma', `limit 1: sabit + en yüksek skor + en yeni (skordan bağımsız 9. slot) (${r.out.trim()})`);
resolve(M, 'Postsuz Etiket');
r = as('anon', null, `select string_agg(slot || ':' || name, ',') from public.kisg_tags_trending(0)`);
check(ok(r) && !r.out.includes('Postsuz') && r.out.includes('new:'), `postu olmayan etiket "yeni" slotuna girmez (${r.out.trim()})`);

// ---- arama ----
const search = s => as('anon', null, `select string_agg(name || ':' || exact, ',') from public.kisg_tags_search(${q(s)})`).out.trim();
check(search('yük') === 'Yüksekte Çalışma:false', `arama: "yük" → ${search('yük')}`);
check(search('YUKSEKTE CALISMA') === 'Yüksekte Çalışma:true', 'arama: farklı yazım tam eşleşme (exact=true)');
check(search('kaza') === 'İş Kazaları:false', 'arama: kelime içi eşleşme');
check(search('atex') === '' && search('') === '', 'arama: engellenmiş etiket ve boş sorgu sonuç vermez');

// ---- yetkiler ----
r = as('anon', null, `select count(*) from public.professional_tag_scores`);
check(!ok(r) && /permission denied/.test(r.err), 'skor önbelleği istemciye kapalı');
r = as('authenticated', user(A), `select public.kisg_tag_refresh_scores()`);
check(!ok(r) && /permission denied/.test(r.err), 'skor yenileme istemciye kapalı');
r = as('anon', null, `select count(*) from public.professional_tags`);
check(ok(r) && +r.out.trim() >= 4, 'etiketler herkese okunur');

// ---- geri alma ----
r = runFile(MIG('20261005_tags_v1.rollback.sql'));
check(ok(r) && psql(`select to_regclass('public.professional_tags') is null and not exists (select 1 from information_schema.columns where table_name = 'professional_posts' and column_name = 'tag_id')`).out === 't'
  && +psql(`select count(*) from public.professional_posts`).out >= 15 && policies() === pol0, 'geri alma: etiket nesneleri kalktı, postlar ve politikalar duruyor');
r = runFile(MIG('20261005_tags_v1.sql'));
check(ok(r), 'geri almadan sonra migration yeniden uygulanabilir');
