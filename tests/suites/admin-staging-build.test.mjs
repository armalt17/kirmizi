// Admin paneli test kopyası (v1.9.0): dist-admin/kisg-pro-admin-staging-v{sürüm}.html kaynakla güncel mi ve yalnız
// bağlantı (staging adresi + publishable anahtar), etiket ve başlık notu mu farklı? Canlı adres/anahtar kalmamalı.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, check } from '../helpers/harness.mjs';
import { buildStaging, DIST, STAGING } from '../../tools/build-admin-staging.mjs';

const src = fs.readFileSync(path.join(ROOT, 'kisg-pro-admin.html'), 'utf8');
const version = /version: '([0-9.]+)'/.exec(src)[1];
const name = `kisg-pro-admin-staging-v${version}.html`, file = path.join(DIST, name);
const dist = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
const others = fs.existsSync(DIST) ? fs.readdirSync(DIST).filter(f => f !== name) : [];
check(dist === buildStaging(src) && !others.length, `dist-admin/${name} kaynakla güncel ve tek dosya (node tools/build-admin-staging.mjs) ${others.join(',')}`);
check(dist.includes(`supabaseUrl: '${STAGING.url}'`) && dist.includes(`supabaseKey: '${STAGING.key}'`) && /^sb_publishable_/.test(STAGING.key), 'test kopyası staging adresine ve publishable anahtara bağlı');
check(!/supabaseUrl: 'https:\/\/twaptpofhbnnfciowoig/.test(dist) && !dist.includes(/supabaseKey: '([^']+)'/.exec(src)[1]), 'test kopyasında canlı adres ve anahtar yok');
check(/TEST · staging/.test(dist) && /TEST KOPYASI \(STAGING\)/.test(dist.slice(0, 200)), 'üst barda TEST etiketi, başta uyarı notu');
const strip = s => s.replace(/supabaseUrl: '[^']+'/, '').replace(/supabaseKey: '[^']+'/, '').replace(/<span class="pa-pill"[^>]*>[^<]*<\/span>/, '').replace(/^<!--\n(TEST KOPYASI[^\n]*\n)?/, '');
check(strip(dist) === strip(src), 'başka hiçbir fark yok');
