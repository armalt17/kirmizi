// Legal V1 — legal_acceptances DB testi (yerel geçici PostgreSQL, production'a bağlanmaz).
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
const A = '11111111-1111-4111-8111-111111111111', M = '22222222-2222-4222-8222-222222222222';
const user = id => ({ sub: id, role: 'authenticated' });
// Web'in gönderdiği PostgREST INSERT biçimi (iki satır, tek istek)
const lit = v => `'${JSON.stringify(v).replace(/'/g, "''")}'::json`;
const webInsert = rows => `WITH pgrst_source AS (INSERT INTO "public"."legal_acceptances"("document_type", "document_version", "source") SELECT "pgrst_body"."document_type", "pgrst_body"."document_version", "pgrst_body"."source" FROM (SELECT ${lit(rows)} AS json_data) pgrst_payload, LATERAL (SELECT "document_type", "document_version", "source" FROM json_to_recordset(pgrst_payload.json_data) AS _("document_type" text, "document_version" text, "source" text) ) pgrst_body RETURNING 1) SELECT count(*) FROM pgrst_source`;
const ROWS = [{ document_type: 'terms_of_use', document_version: '2026-09-30', source: 'web_signup' }, { document_type: 'kvkk_notice_informed', document_version: '2026-09-30', source: 'web_signup' }];
const count = where => psql(`select count(*) from public.legal_acceptances ${where ? 'where ' + where : ''}`).out;

let r = runFile(path.join(ROOT, 'tests/helpers/kisg-prod-stub.sql'));
check(ok(r), `production kopyası şema kuruldu ${r.err}`);
const signupDef = () => psql(`select md5(pg_get_functiondef('public.handle_new_user()'::regprocedure)) || md5(string_agg(pg_get_triggerdef(oid), '' order by tgname)) from pg_trigger where tgname = 'on_auth_user_created'`).out;
const policies = () => psql(`select string_agg(tablename || policyname || coalesce(qual, '') || coalesce(with_check, ''), '|' order by tablename, policyname) from pg_policies where tablename <> 'legal_acceptances'`).out;
const sig0 = signupDef(), pol0 = policies();

r = runFile(MIG('20261004_legal_acceptances.sql'));
check(ok(r), `migration uygulandı ${r.err}`);
r = runFile(MIG('20261004_legal_acceptances.sql'));
check(ok(r), `migration tekrar çalıştırılabilir ${r.err}`);
check(signupDef() === sig0, 'signup trigger (on_auth_user_created → handle_new_user) DEĞİŞMEDİ');
check(policies() === pol0, 'diğer tabloların RLS politikaları DEĞİŞMEDİ');

// kullanıcı kendi kayıtlarını oluşturur
r = as('authenticated', user(A), webInsert(ROWS));
check(ok(r) && r.out.trim() === '2', `web kayıt biçimi: iki satır (terms_of_use + kvkk_notice_informed) yazıldı ${r.err}`);
check(count(`user_id = '${A}'`) === '2' && psql(`select bool_and(accepted_at > now() - interval '1 minute') from public.legal_acceptances`).out === 't', 'user_id ve accepted_at sunucuda belirlendi');
check(psql(`select string_agg(document_type, ',' order by document_type) from public.legal_acceptances`).out === 'kvkk_notice_informed,terms_of_use', 'KVKK kaydı "kvkk_notice_informed" (bilgilendirme) türünde, açık rıza/kabul değil');
r = as('authenticated', user(A), webInsert(ROWS));
check(!ok(r) && /23505|duplicate key/.test(r.err) && count() === '2', 'aynı sürüm tekrar gönderilirse 23505 (web bunu başarı sayar), çift kayıt oluşmaz');
r = as('authenticated', user(A), webInsert([{ document_type: 'terms_of_use', document_version: '2027-01-01', source: 'web' }]));
check(ok(r) && count(`user_id = '${A}'`) === '3', 'yeni doküman sürümü ayrı satır olarak eklenir (geçmiş korunur)');

// başkası adına / sahte alanlar
r = as('authenticated', user(A), `insert into public.legal_acceptances (user_id, document_type, document_version) values ('${M}', 'terms_of_use', '2026-09-30')`);
check(!ok(r) && /permission denied/.test(r.err), 'başkası adına (user_id) yazılamaz');
r = as('authenticated', user(A), `insert into public.legal_acceptances (document_type, document_version, accepted_at) values ('terms_of_use', '2025-01-01', '2020-01-01')`);
check(!ok(r) && /permission denied/.test(r.err), 'accepted_at istemciden verilemez');
r = as('authenticated', user(A), `insert into public.legal_acceptances (document_type, document_version) values ('kvkk_consent', '2026-09-30')`);
check(!ok(r) && /document_type_check/.test(r.err), 'tanımsız doküman türü (ör. kvkk_consent) reddedilir');
r = as('authenticated', user(A), `insert into public.legal_acceptances (document_type, document_version) values ('terms_of_use', 'v1')`);
check(!ok(r) && /document_version_check/.test(r.err), 'sürüm YYYY-AA-GG biçiminde olmalı');

// okuma: yalnız kendi
r = as('authenticated', user(M), webInsert(ROWS));
check(ok(r), 'ikinci kullanıcı kendi kayıtlarını yazar');
check(as('authenticated', user(A), 'select count(*) from public.legal_acceptances').out.trim() === '3', 'kullanıcı yalnız kendi kayıtlarını okur (3)');
check(as('authenticated', user(M), `select count(*) from public.legal_acceptances where user_id = '${A}'`).out.trim() === '0', 'başkasının kayıtlarını göremez');

// değiştirme / silme yok
for (const [label, sql] of [['UPDATE', `update public.legal_acceptances set document_version = '2020-01-01'`], ['DELETE', 'delete from public.legal_acceptances']]) {
  r = as('authenticated', user(A), sql);
  check(!ok(r) && /permission denied/.test(r.err), `istemci ${label} yapamaz`);
}
r = as('authenticated', user(A), `select count(*) from public.legal_acceptances`);
check(r.out.trim() === '3', 'kayıtlar korunuyor');
for (const sql of ['select count(*) from public.legal_acceptances', webInsert(ROWS)]) {
  r = as('anon', {}, sql);
  check(!ok(r) && /permission denied/.test(r.err), `anon erişemez: ${sql.slice(0, 30)}…`);
}
// sunucu tarafı (dashboard / service_role) KVKK silme talepleri için silebilir; trigger istemci rolünü ayrıca reddeder
r = psql(`delete from public.legal_acceptances where user_id = '${M}'`);
check(ok(r) && count(`user_id = '${M}'`) === '0', 'dashboard (sunucu) gerektiğinde silebilir (ör. KVKK silme talebi)');
// İkinci savunma hattı: yetki ve politika yanlışlıkla açılsa bile trigger istemci UPDATE/DELETE'ini reddeder
psql(`grant update, delete on public.legal_acceptances to authenticated; create policy tmp_all on public.legal_acceptances for all to authenticated using (true) with check (true)`);
for (const sql of [`delete from public.legal_acceptances`, `update public.legal_acceptances set source = 'web'`]) {
  r = as('authenticated', user(A), sql);
  check(!ok(r) && /KISG_LEGAL_APPEND_ONLY/.test(r.err), `yetki açılsa bile trigger reddeder: ${sql.split(' ')[0].toUpperCase()}`);
}
psql(`drop policy tmp_all on public.legal_acceptances; revoke update, delete on public.legal_acceptances from authenticated`);
check(count(`user_id = '${A}'`) === '3', 'kayıtlar değişmedi');

// signup (handle_new_user) etkilenmedi
r = psql(`insert into auth.users (id, email, raw_user_meta_data) values ('33333333-aaaa-4333-8333-333333333333', 'yeni@ornek.com', '{"full_name":"Yeni Kişi"}')`);
check(ok(r) && psql(`select full_name from public.profiles where id = '33333333-aaaa-4333-8333-333333333333'`).out === 'Yeni Kişi', 'kayıt: profil satırını handle_new_user oluşturmaya devam ediyor');

// rollback + verify
r = runFile(MIG('20261004_legal_acceptances.rollback.sql'));
check(ok(r) && psql(`select to_regclass('public.legal_acceptances') is null`).out === 't' && policies() === pol0 && signupDef() === sig0, `rollback: tablo ve fonksiyonlar kaldırıldı, başka hiçbir şey değişmedi ${r.err}`);
r = runFile(MIG('20261004_legal_acceptances.sql'));
check(ok(r), 'rollback sonrası yeniden uygulanabilir');
r = runFile(MIG('20261004_legal_acceptances.verify.sql'));
const rows = r.out.split('\n').filter(Boolean), bad = rows.filter(l => !l.endsWith('|t'));
check(ok(r) && rows.length >= 18 && bad.length === 0, `verify: ${rows.length} satırın hepsi ok ${bad.join(' ; ')} ${r.err}`);
