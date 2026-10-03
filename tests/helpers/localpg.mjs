// Geçici yerel PostgreSQL kümesi (DB migration testleri için). Production'a bağlanmaz.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function pgBin() {
  const base = '/usr/lib/postgresql';
  try { const v = fs.readdirSync(base).sort((a, b) => b - a)[0]; if (v && fs.existsSync(`${base}/${v}/bin/initdb`)) return `${base}/${v}/bin`; } catch {}
  return process.env.PG_BIN || '';
}

export function startCluster({ utf8 = false } = {}) {
  const BIN = pgBin(); if (!BIN) return null;
  const asRoot = process.getuid?.() === 0;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kisg-pg-')); fs.chmodSync(dir, 0o777);
  const sh = (cmd, args) => {
    const r = asRoot ? spawnSync('runuser', ['-u', 'postgres', '--', cmd, ...args], { encoding: 'utf8', env: { ...process.env, PGOPTIONS: '-c client_min_messages=warning' } })
      : spawnSync(cmd, args, { encoding: 'utf8', env: { ...process.env, PGOPTIONS: '-c client_min_messages=warning' } });
    return { code: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
  };
  const port = String(56000 + Math.floor(Math.random() * 900)), data = path.join(dir, 'data');
  // utf8: production (Supabase) gibi UTF8 veritabanı — çok baytlı Türkçe karakter işlemleri (translate vb.) için
  let r = sh(`${BIN}/initdb`, ['-D', data, '-U', 'postgres', '-A', 'trust', '--no-sync', ...(utf8 ? ['-E', 'UTF8', '--locale=C.UTF-8'] : [])]);
  if (r.code) throw new Error('initdb: ' + r.err);
  r = sh(`${BIN}/pg_ctl`, ['-D', data, '-o', `-k ${dir} -p ${port} -c listen_addresses=''`, '-l', path.join(dir, 'log'), '-w', 'start']);
  if (r.code) throw new Error('pg_ctl: ' + r.err);
  const stop = () => { sh(`${BIN}/pg_ctl`, ['-D', data, '-m', 'fast', 'stop']); try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} };
  process.on('exit', stop);
  const psql = (sql, file) => sh(`${BIN}/psql`, ['-h', dir, '-p', port, '-U', 'postgres', '-d', 'postgres', '-X', '-q', '-t', '-A', '-F', '|', '-v', 'ON_ERROR_STOP=1', ...(file ? ['-f', file] : ['-c', sql])]);
  const runFile = f => { const t = path.join(dir, path.basename(f)); fs.copyFileSync(f, t); fs.chmodSync(t, 0o644); return psql(null, t); };
  // PostgREST gibi: tek işlem içinde set local role + request.jwt.claims
  const as = (role, claims, sql) => {
    const c = JSON.stringify({ role, ...(claims || {}) }).replace(/'/g, "''");
    const r = psql(`begin; set local role ${role}; select set_config('request.jwt.claims', '${c}', true); ${sql}; commit;`);
    r.out = r.out.split('\n').slice(1).join('\n');   // set_config satırını at
    return r;
  };
  return { psql, runFile, as, stop };
}
