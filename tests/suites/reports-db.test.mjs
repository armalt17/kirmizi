// Şikâyet / Bildir V1 — DB migration doğrulaması (yerel, geçici PostgreSQL kümesi).
// db/migrations/20260929_professional_reports.sql, tests/helpers/supabase-stub.sql üzerine uygulanır ve
// anon / authenticated / service_role davranışı gerçek PostgreSQL (RLS + kolon yetkisi + tetikleyici) ile sınanır.
// Production/staging Supabase'e bağlanmaz. Supabase'in birebir şeması değil: yalnız yetki modelinin taklidi.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) process.exitCode = 1; };
const BIN = (() => {
  const base = '/usr/lib/postgresql';
  try { const v = fs.readdirSync(base).sort((a, b) => b - a)[0]; if (v && fs.existsSync(`${base}/${v}/bin/initdb`)) return `${base}/${v}/bin`; } catch {}
  return process.env.PG_BIN || '';
})();
if (!BIN) { console.log('SKIP PostgreSQL bulunamadı (PG_BIN ile yol verilebilir) — DB testi çalıştırılmadı'); process.exit(0); }

const asRoot = process.getuid?.() === 0;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kisg-pg-'));
fs.chmodSync(dir, 0o777);
const sh = (cmd, args, opts = {}) => {
  const r = asRoot ? spawnSync('runuser', ['-u', 'postgres', '--', cmd, ...args], { encoding: 'utf8', ...opts }) : spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  return { code: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
};
const PORT = String(55432 + Math.floor(Math.random() * 1000));
const data = path.join(dir, 'data');
let r = sh(`${BIN}/initdb`, ['-D', data, '-U', 'postgres', '-A', 'trust', '--no-sync']);
if (r.code) { console.log('FAIL initdb: ' + r.err); process.exit(1); }
r = sh(`${BIN}/pg_ctl`, ['-D', data, '-o', `-k ${dir} -p ${PORT} -c listen_addresses=''`, '-l', path.join(dir, 'log'), '-w', 'start']);
if (r.code) { console.log('FAIL pg_ctl start: ' + r.err + fs.readFileSync(path.join(dir, 'log'), 'utf8')); process.exit(1); }
const stop = () => { sh(`${BIN}/pg_ctl`, ['-D', data, '-m', 'fast', 'stop']); try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} };
process.on('exit', stop);

const copy = f => { const t = path.join(dir, path.basename(f)); fs.copyFileSync(f, t); fs.chmodSync(t, 0o644); return t; };
const psql = (sql, file) => sh(`${BIN}/psql`, ['-h', dir, '-p', PORT, '-U', 'postgres', '-d', 'postgres', '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', ...(file ? ['-f', file] : ['-c', sql])]);

const A = '11111111-1111-4111-8111-111111111111', M = '22222222-2222-4222-8222-222222222222';
const POST = 'aaaaaaaa-0000-4000-8000-000000000001', SVC = 'cccccccc-0000-4000-8000-000000000001';
// Rol + JWT iddiası altında tek işlem; PostgREST'in yaptığı gibi set local role + request.jwt.claims
const as = (role, sub, sql) => psql(`begin; set local role ${role}; select set_config('request.jwt.claims', '${JSON.stringify(sub ? { sub, role } : { role })}', true); ${sql}; commit;`);
const ins = (sub, cols) => as('authenticated', sub, `insert into public.professional_reports (${Object.keys(cols).join(',')}) values (${Object.values(cols).map(v => v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`).join(',')})`);
const rows = () => psql(`select reporter_id||'|'||target_type||'|'||target_id||'|'||reason||'|'||coalesce(details,'-')||'|'||status from public.professional_reports order by created_at, target_type`).out.split('\n').filter(Boolean);

r = psql(null, copy(path.join(ROOT, 'tests/helpers/supabase-stub.sql')));
check(r.code === 0, `stub şema kuruldu ${r.err}`);
r = psql(null, copy(path.join(ROOT, 'db/migrations/20260929_professional_reports.sql')));
check(r.code === 0, `migration hatasız uygulandı ${r.err}`);
r = psql(null, copy(path.join(ROOT, 'db/migrations/20260929_professional_reports.sql')));
check(r.code === 0, `migration tekrar çalıştırılabilir (idempotent) ${r.err}`);

// --- anon: hiçbir işlem yok
for (const [name, sql] of [['INSERT', `insert into public.professional_reports (target_type,target_id,reason) values ('post','${POST}','spam')`], ['SELECT', 'select count(*) from public.professional_reports'], ['UPDATE', "update public.professional_reports set status='resolved'"], ['DELETE', 'delete from public.professional_reports']]) {
  r = as('anon', null, sql);
  check(r.code !== 0 && /permission denied/.test(r.err), `anon ${name} reddedildi (${r.err.split('\n')[0]})`);
}

// --- authenticated: 4 hedef türü doğru kimlikle kaydolur (Mehmet → Ayşe'nin içerikleri)
const cid = psql(`select id from public.professional_post_comments where user_id='${A}'`).out;
r = ins(M, { target_type: 'post', target_id: POST, reason: 'spam', details: '  Reklam içeriyor  ' });
check(r.code === 0, `Post bildirimi kaydedildi ${r.err}`);
r = ins(M, { target_type: 'comment', target_id: cid, reason: 'harassment' });
check(r.code === 0, `Yorum bildirimi (bigint kimlik ${cid}) kaydedildi ${r.err}`);
r = ins(M, { target_type: 'profile', target_id: A, reason: 'fake_profile' });
check(r.code === 0, `Profil bildirimi (sahte profil) kaydedildi ${r.err}`);
r = ins(M, { target_type: 'service', target_id: SVC.toUpperCase(), reason: 'misleading' });
check(r.code === 0, `Hizmet bildirimi (büyük harfli kimlik) kaydedildi ${r.err}`);
let got = rows();
check(JSON.stringify(got) === JSON.stringify([`${M}|post|${POST}|spam|Reklam içeriyor|pending`, `${M}|comment|${cid}|harassment|-|pending`, `${M}|profile|${A}|fake_profile|-|pending`, `${M}|service|${SVC}|misleading|-|pending`]), `kayıtlar: reporter=auth.uid, kanonik target_id, details kırpıldı, status=pending\n  ${got.join('\n  ')}`);

// --- tekrar bildirme DB'de engelli (kanonik kimlik sayesinde büyük/küçük harf farkı da)
r = ins(M, { target_type: 'post', target_id: POST, reason: 'other' });
check(r.code !== 0 && /professional_reports_once_per_reporter/.test(r.err), 'aynı hedef ikinci kez → unique ihlali');
r = ins(M, { target_type: 'post', target_id: POST.toUpperCase(), reason: 'spam' });
check(r.code !== 0 && /professional_reports_once_per_reporter/.test(r.err), 'büyük harfli kimlikle tekrar → yine unique ihlali');

// --- kendi içeriği / profili / hizmeti / yorumu
for (const [t, id] of [['post', POST], ['comment', cid], ['profile', A], ['service', SVC]]) {
  r = ins(A, { target_type: t, target_id: id, reason: 'other' });
  check(r.code !== 0 && /KISG_REPORT_OWN/.test(r.err), `kendi ${t} bildirimi reddedildi`);
}
r = ins(A, { target_type: 'comment', target_id: psql(`select id from public.professional_post_comments where user_id='${M}'`).out, reason: 'spam' });
check(r.code === 0, `Ayşe, Mehmet'in yorumunu bildirebilir ${r.err}`);

// --- spoof / yetki yükseltme denemeleri
r = ins(M, { target_type: 'profile', target_id: A, reason: 'spam', reporter_id: A });
check(r.code !== 0 && /permission denied/.test(r.err), 'reporter_id istemciden yazılamaz (kolon yetkisi)');
r = ins(M, { target_type: 'service', target_id: SVC, reason: 'spam', status: 'resolved' });
check(r.code !== 0 && /permission denied/.test(r.err), 'status istemciden yazılamaz');
r = ins(M, { target_type: 'service', target_id: SVC, reason: 'spam', created_at: '2000-01-01' });
check(r.code !== 0 && /permission denied/.test(r.err), 'created_at istemciden yazılamaz');
r = as('authenticated', null, `insert into public.professional_reports (target_type,target_id,reason) values ('post','${POST}','spam')`);
check(r.code !== 0 && /KISG_REPORT_AUTH/.test(r.err), 'JWT sub yoksa reddedildi');

// --- doğrulama kısıtları
r = ins(M, { target_type: 'post', target_id: 'aaaaaaaa-0000-4000-8000-00000000dead', reason: 'spam' });
check(r.code !== 0 && /KISG_REPORT_TARGET/.test(r.err), 'var olmayan hedef reddedildi');
r = ins(M, { target_type: 'user', target_id: A, reason: 'spam' });
check(r.code !== 0 && /target_type_check|KISG_REPORT_TARGET/.test(r.err), 'geçersiz target_type reddedildi');
r = ins(A, { target_type: 'post', target_id: POST, reason: 'fake_profile' });
check(r.code !== 0 && /fake_profile_check|KISG_REPORT_OWN/.test(r.err), 'fake_profile yalnız profil için');
r = ins(A, { target_type: 'profile', target_id: M, reason: 'hate' });
check(r.code !== 0 && /reason_check/.test(r.err), 'geçersiz reason reddedildi');
r = ins(A, { target_type: 'profile', target_id: M, reason: 'other', details: 'x'.repeat(1001) });
check(r.code !== 0 && /details_check/.test(r.err), 'details 1000 karakter sınırı');
r = ins(A, { target_type: 'profile', target_id: M, reason: 'other', details: 'x'.repeat(1000) });
check(r.code === 0, `1000 karakter details kabul (gizli profil de bildirilebilir) ${r.err}`);

// --- normal kullanıcı okuyamaz / değiştiremez / silemez (kendisininkiler dahil)
for (const [name, sql] of [['SELECT', 'select count(*) from public.professional_reports'], ['UPDATE', "update public.professional_reports set status='resolved'"], ['DELETE', 'delete from public.professional_reports']]) {
  r = as('authenticated', M, sql);
  check(r.code !== 0 && /permission denied/.test(r.err), `authenticated ${name} reddedildi`);
}
r = as('authenticated', M, 'insert into public.professional_reports (target_type,target_id,reason) values (\'profile\',\'' + A + '\',\'spam\') on conflict do nothing returning id');
check(r.code !== 0 && /permission denied/.test(r.err), 'INSERT … RETURNING (okuma) reddedildi');

// --- içerik gizlenmez/silinmez; service_role kuyruğu okuyabilir (admin sonraki iş)
check(psql(`select status||'|'||(select count(*) from public.professional_post_comments) from public.professional_posts where id='${POST}'`).out === 'active|2', 'bildirilen Post ve yorumlar yerinde (otomatik gizleme/silme yok)');
r = as('service_role', null, 'select count(*) from public.professional_reports');
check(r.code === 0 && r.out.split('\n').pop() === '6', `service_role kuyruğu okuyabilir (${r.out.split('\n').pop()} kayıt)`);
const pol = psql("select string_agg(policyname||':'||cmd||':'||array_to_string(roles, '+'), ',') from pg_policies where tablename='professional_reports'").out;
check(pol === 'professional_reports_insert_own:INSERT:authenticated', `yalnız INSERT politikası var (${pol})`);
const grants = psql("select string_agg(grantee||':'||privilege_type, ',' order by grantee, privilege_type) from information_schema.role_table_grants where table_name='professional_reports' and grantee in ('anon','authenticated')").out;
check(grants === '', `anon/authenticated tablo düzeyinde yetkisiz (${grants || 'yok'})`);
const cols = psql("select string_agg(column_name||':'||privilege_type, ',' order by column_name) from information_schema.column_privileges where table_name='professional_reports' and grantee='authenticated'").out;
check(cols === 'details:INSERT,reason:INSERT,target_id:INSERT,target_type:INSERT', `authenticated yalnız 4 kolona INSERT (${cols})`);

// --- rollback betiği temiz kaldırır
r = psql(null, copy(path.join(ROOT, 'db/migrations/20260929_professional_reports.rollback.sql')));
check(r.code === 0 && psql("select to_regclass('public.professional_reports') is null").out === 't', `rollback tabloyu kaldırdı ${r.err}`);
