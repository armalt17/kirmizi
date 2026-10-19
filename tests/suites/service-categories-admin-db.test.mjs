// Hizmet kategorileri admin yönetimi — DB testi (yerel geçici PostgreSQL, production'a bağlanmaz).
// Şema: stub + raporlar + Fix Pack 1 + Admin A/B + Etiketler (audit listesi) + kategori tablosu (production'daki sütunlar) + 20261010.
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
const A = '11111111-1111-4111-8111-111111111111', X = '99999999-9999-4999-8999-999999999999';
const user = id => ({ sub: id, role: 'authenticated' });
const admin = sql => as('authenticated', user(X), sql);
const q = s => `'${String(s).replace(/'/g, "''")}'`;
const cat = name => psql(`select id from public.professional_service_categories where name = ${q(name)}`).out;
const names = () => admin(`select string_agg(name || ':' || is_active::int || ':' || services, ',' order by ord) from (select *, row_number() over () ord from public.admin_list_service_categories()) x`).out.trim();
const site = () => as('anon', null, `select string_agg(name, ',' order by sort_order, id) from public.professional_service_categories where is_active`).out.trim();
const audits = () => Number(psql(`select count(*) from public.professional_admin_audit_log where target_type = 'service_category'`).out);

const SETUP = `
create function auth.role() returns text language sql stable as $f$ select auth.jwt() ->> 'role' $f$;
grant execute on function auth.role() to anon, authenticated, service_role;
create table public.professional_post_likes (post_id uuid not null references public.professional_posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade, created_at timestamptz not null default now(), primary key (post_id, user_id));
create table public.professional_comment_likes (comment_id uuid not null references public.professional_post_comments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade, created_at timestamptz not null default now(), primary key (comment_id, user_id));
alter table public.professional_post_likes enable row level security;
alter table public.professional_comment_likes enable row level security;
create table public.professional_service_categories (id uuid primary key default gen_random_uuid(), name text not null, slug text not null unique,
  sort_order integer not null default 0, is_active boolean not null default true, created_at timestamptz not null default now());
alter table public.professional_service_categories enable row level security;
create policy "Public can read active categories" on public.professional_service_categories for select to anon, authenticated using (is_active);
grant select on public.professional_service_categories to anon, authenticated;
insert into public.professional_service_categories (name, slug, sort_order) values
  ('İş Güvenliği Uzmanlığı', 'is-guvenligi-uzmanligi', 1), ('İSG Danışmanlığı', 'isg-danismanligi', 2), ('Risk Değerlendirmesi', 'risk-degerlendirmesi', 3), ('Diğer', 'diger', 99);
`;
let r = runFile(path.join(ROOT, 'tests/helpers/kisg-prod-stub.sql'));
check(ok(r), `production kopyası şema kuruldu ${r.err}`);
r = psql(SETUP); check(ok(r), `ek tablolar + kategoriler ${r.err}`);
for (const f of ['20260929_professional_reports.sql', '20260930_security_fix_pack1.sql', '20261002_admin_v1_a.sql', '20261003_admin_v1_b.sql', '20261005_tags_v1.sql', '20261006_tags_admin_v2.sql']) {
  r = runFile(MIG(f)); check(ok(r), `${f} kuruldu ${r.err}`);
}
r = psql(`alter table public.professional_services add constraint professional_services_category_fk foreign key (category_id) references public.professional_service_categories (id)`);
check(ok(r), `hizmet → kategori bağı ${r.err}`);
const pol0 = psql(`select string_agg(tablename || policyname, '|' order by tablename, policyname) from pg_policies`).out;
r = runFile(MIG('20261010_service_categories_admin.sql')); check(ok(r), `migration uygulandı ${r.err}`);
r = runFile(MIG('20261010_service_categories_admin.sql')); check(ok(r), `migration tekrar çalıştırılabilir ${r.err}`);
check(psql(`select string_agg(tablename || policyname, '|' order by tablename, policyname) from pg_policies`).out === pol0, 'RLS politikaları DEĞİŞMEDİ');
r = runFile(MIG('20261010_service_categories_admin.verify.sql'));
const vrows = r.out.split('\n').filter(Boolean);
check(ok(r) && vrows.length === 17 && vrows.every(l => l.endsWith('|t')), `verify: ${vrows.length} satırın hepsi ok ${vrows.filter(l => !l.endsWith('|t')).join(' ; ')}`);

// hizmet verisi: Risk Değerlendirmesi'nde 2 aktif + 1 arşiv, Danışmanlık'ta 1 aktif
const RISK = cat('Risk Değerlendirmesi'), DAN = cat('İSG Danışmanlığı'), UZM = cat('İş Güvenliği Uzmanlığı'), DIG = cat('Diğer');
for (const [c, st] of [[RISK, 'active'], [RISK, 'active'], [RISK, 'archived'], [DAN, 'active']]) {
  r = psql(`insert into public.professional_services (user_id, title, description, category_id, status) values ('${A}', 'h', 'd', '${c}', '${st}')`); if (!ok(r)) check(false, `hizmet ${r.err}`);
}

// ---- yetki ----
for (const [label, sql] of [['listeyi göremez', 'select * from public.admin_list_service_categories()'], ['ekleyemez', `select public.admin_create_service_category('Yeni', null)`],
  ['güncelleyemez', `select public.admin_update_service_category('${RISK}', '{"is_active":false}', null)`], ['sıralayamaz', `select public.admin_reorder_service_categories(array['${RISK}']::uuid[], null)`],
  ['silemez', `select public.admin_delete_service_category('${DIG}', null)`]]) {
  r = as('authenticated', user(A), sql); check(!ok(r) && /KISG_ADMIN_ONLY/.test(r.err), `admin olmayan ${label}`);
}
r = as('anon', null, 'select * from public.admin_list_service_categories()'); check(!ok(r) && /permission denied/.test(r.err), 'misafir çağıramaz');
r = as('authenticated', user(A), `update public.professional_service_categories set is_active = false`);
check(!ok(r) || !/UPDATE [1-9]/.test(r.out), 'istemci tabloya doğrudan yazamaz');

// ---- liste ----
check(names() === 'İş Güvenliği Uzmanlığı:1:0,İSG Danışmanlığı:1:1,Risk Değerlendirmesi:1:2,Diğer:1:0', `liste: sıra + aktif hizmet sayısı (${names()})`);

// ---- ekle ----
const a0 = audits();
r = admin(`select public.admin_create_service_category('  Yangın   Güvenliği ', 'yeni alan')`);
const made = ok(r) ? JSON.parse(r.out) : {};
check(ok(r) && made.name === 'Yangın Güvenliği' && made.slug === 'yangin-guvenligi' && made.is_active === true && made.sort_order === 109, `ekle: boşluk toparlandı, slug Türkçe karaktersiz, sona eklendi ${r.out}${r.err}`);
check(site().endsWith(',Diğer,Yangın Güvenliği'), `site listesinde sonda görünür (${site()})`);
r = admin(`select public.admin_create_service_category('YANGIN guvenligi', null)`);
check(!ok(r) && /KISG_CATEGORY_EXISTS/.test(r.err), 'aynı ad (büyük/küçük, Türkçe karakter farkıyla) reddedildi');
r = admin(`select public.admin_create_service_category('x', null)`);
check(!ok(r) && /KISG_ADMIN_INPUT/.test(r.err), '2 karakterden kısa ad reddedildi');
r = admin(`select public.admin_create_service_category('İSG — Yazılım', null)`);
check(ok(r) && JSON.parse(r.out).slug === 'isg-yazilim', `slug: İ ve işaretler sadeleşir (${r.out})`);

// ---- güncelle ----
r = admin(`select public.admin_update_service_category('${RISK}', '{"name":"Risk Analizi"}', null)`);
check(ok(r) && psql(`select name || '|' || slug from public.professional_service_categories where id = '${RISK}'`).out === 'Risk Analizi|risk-degerlendirmesi', 'yeniden adlandır: ad değişti, slug korunur (ikon/bağlantı bozulmaz)');
r = admin(`select public.admin_update_service_category('${RISK}', '{"name":"İSG Danışmanlığı"}', null)`);
check(!ok(r) && /KISG_CATEGORY_EXISTS/.test(r.err), 'başka kategorinin adına çevrilemez');
r = admin(`select public.admin_update_service_category('${RISK}', '{"is_active":false}', 'geçici')`);
check(ok(r) && !site().includes('Risk Analizi'), `gizle: sitede (Hizmet Bul + Hizmet Yayınla) görünmez (${site()})`);
check(psql(`select count(*) from public.professional_services where category_id = '${RISK}' and status = 'active'`).out === '2', 'gizlenen kategorinin hizmetleri silinmedi');
r = admin(`select public.admin_update_service_category('${RISK}', '{"is_active":true}', null)`); check(ok(r) && site().includes('Risk Analizi'), 'tekrar göster');
r = admin(`select public.admin_update_service_category('${RISK}', '{"sort_order":1}', null)`); check(!ok(r) && /KISG_ADMIN_INPUT/.test(r.err), 'izinsiz alan reddedildi');
r = admin(`select public.admin_update_service_category('${RISK}', '{"is_active":true}', null)`);
const a1 = audits(); check(ok(r), 'değişmeyen güncelleme sorunsuz');

// ---- sırala ----
const all = psql(`select string_agg(id::text, ',' order by sort_order desc, id) from public.professional_service_categories`).out.split(',');
r = admin(`select public.admin_reorder_service_categories(array[${all.map(q).join(',')}]::uuid[], 'ters sıra')`);
check(ok(r) && r.out.trim() === String(all.length) && site().startsWith('İSG — Yazılım,Yangın Güvenliği,Diğer'), `sırala: site yeni sırayla okur (${site()})`);
check(psql(`select string_agg(sort_order::text, ',' order by sort_order) from public.professional_service_categories`).out === all.map((_, i) => (i + 1) * 10).join(','), 'sıra numaraları 10, 20, 30…');
r = admin(`select public.admin_reorder_service_categories(array[${all.slice(1).map(q).join(',')}]::uuid[], null)`);
check(!ok(r) && /KISG_ADMIN_INPUT/.test(r.err), 'eksik liste reddedildi');
r = admin(`select public.admin_reorder_service_categories(array[${[all[0], ...all.slice(0, -1)].map(q).join(',')}]::uuid[], null)`);
check(!ok(r) && /KISG_ADMIN_INPUT/.test(r.err), 'tekrar eden kimlik reddedildi');

// ---- sil ----
r = admin(`select public.admin_delete_service_category('${RISK}', null)`);
check(!ok(r) && /KISG_CATEGORY_IN_USE/.test(r.err), 'hizmeti olan kategori silinemez (gizle önerilir)');
r = admin(`select public.admin_delete_service_category('${DIG}', 'boş')`);
check(ok(r) && !psql(`select 1 from public.professional_service_categories where id = '${DIG}'`).out, 'hizmeti olmayan kategori silindi');

// ---- audit ----
const rows = psql(`select string_agg(action, ',' order by created_at, action) from public.professional_admin_audit_log where target_type = 'service_category'`).out;
check(a1 - a0 === 5 && audits() === a1 + 2 && /service_category.create/.test(rows) && /service_category.reorder/.test(rows) && /service_category.delete/.test(rows), `her değişiklik denetim kaydına yazıldı, değişmeyen güncelleme yazılmadı (${audits() - a0})`);

// ---- geri alma ----
r = runFile(MIG('20261010_service_categories_admin.rollback.sql')); check(ok(r), `rollback uygulandı ${r.err}`);
check(psql(`select count(*) from pg_proc where proname like 'admin_%service_categor%'`).out === '0' && Number(psql(`select count(*) from public.professional_service_categories`).out) === 5, 'rollback: fonksiyonlar kalktı, kategoriler duruyor');
r = runFile(MIG('20261010_service_categories_admin.sql')); check(ok(r), `rollback sonrası yeniden uygulanabilir ${r.err}`);
