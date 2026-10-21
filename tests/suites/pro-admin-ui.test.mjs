// Professional Admin UI v1 (/pro-admin) — hedefli tarayıcı testi.
// Hostinger üst sayfa + srcdoc iframe simülasyonu; Supabase Auth ve RPC sahte sunucu ile karşılanır.
// Doğrulananlar: giriş / yetki kapısı, yalnız admin RPC kullanımı (tablo isteği yok), bölümler, aksiyonların
// RPC argümanları, gerekçe zorunluluğu, hata eşleme, mobil yerleşim.
import { chromium, fs, ROOT, OUT, libs, check, LAUNCH, IMG } from '../helpers/harness.mjs';
import path from 'node:path';

const ADMIN_HTML = fs.readFileSync(path.join(ROOT, 'kisg-pro-admin.html'), 'utf8');
const X = '99999999-9999-4999-8999-999999999999', A = '11111111-1111-4111-8111-111111111111', M = '22222222-2222-4222-8222-222222222222';
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const tokenFor = uid => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: uid, exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated', aud: 'authenticated' })}.c2ln`;
const uidOf = t => { try { return JSON.parse(Buffer.from(String(t).split('.')[1], 'base64url')).sub; } catch { return null; } };
const H = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' };
const iso = m => new Date(Date.now() - m * 60000).toISOString();

const hostPage = p => `<!doctype html><html><head><meta charset="utf-8"><title>${p}</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{height:100%}body{margin:0;font-family:sans-serif}header{height:64px;background:#222;color:#fff}footer{height:200px;background:#eee}</style></head><body><header>Hostinger header</header><section><div class="block-layout"><div><iframe style="width:100%;border:0" srcdoc="${ADMIN_HTML.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"></iframe></div></div></section><footer>footer</footer></body></html>`;

function server(ctx) {
  const st = { rpc: [], table: [], fail: {}, words: [{ word: 'orospu', norm: 'orospu', prefix: true, created_at: '2026-10-20T10:00:00Z' }], phrases: [{ phrase: 'eleman aranıyor', norm: 'eleman araniyor', strong: true, created_at: '2026-10-20T10:00:00Z' }], support: [
    { id: 'cccccccc-0000-4000-8000-000000000001', user_id: A, category: 'technical', message: 'Fotoğraf yüklenmiyor.\nAndroid telefondayım.', status: 'open', created_at: iso(15), updated_at: iso(15) },
    { id: 'cccccccc-0000-4000-8000-000000000002', user_id: M, category: 'suggestion', message: 'Karanlık tema olsa iyi olur.', status: 'resolved', created_at: iso(300), updated_at: iso(100) }] };
  const users = [
    { id: M, full_name: 'Mehmet Öztürk', email: 'mehmet@ornek.com', title: 'İSG Uzmanı', city: 'Kocaeli', avatar_url: null, is_discoverable: true, is_premium: false, created_at: iso(5000), post_count: 2, service_count: 1, open_report_count: 2, active_sanction: null, active_sanction_ends_at: null },
    { id: A, full_name: 'Ayşe Yılmaz', email: 'ayse@ornek.com', title: null, city: 'İstanbul', avatar_url: null, is_discoverable: false, is_premium: true, created_at: iso(9000), post_count: 1, service_count: 0, open_report_count: 0, active_sanction: 'suspension', active_sanction_ends_at: iso(-3000) }];
  const posts = [
    { kind: 'post', id: 'bbbbbbbb-0000-4000-8000-000000000001', user_id: M, author_name: 'Mehmet Öztürk', title: null, body: 'Spam içerikli post', status: 'active', created_at: iso(30), moderated_at: null, moderation_reason: null, parent_id: null, open_report_count: 2 },
    { kind: 'post', id: 'bbbbbbbb-0000-4000-8000-000000000002', user_id: M, author_name: 'Mehmet Öztürk', title: null, body: 'Gizlenmiş post', status: 'hidden', created_at: iso(60), moderated_at: iso(20), moderation_reason: 'spam', parent_id: null, open_report_count: 0 }];
  const reports = [
    { id: 'rrrrrrrr-0000-4000-8000-000000000001'.replace(/r/g, 'a'), reporter_id: A, reporter_name: 'Ayşe Yılmaz', target_type: 'post', target_id: posts[0].id, reason: 'spam', details: 'reklam yapıyor', status: 'pending', created_at: iso(10), reviewed_by: null, reviewed_at: null, resolution_note: null, action_taken: null, target_owner_id: M, target_owner_name: 'Mehmet Öztürk', target_preview: 'Spam içerikli post', target_status: 'active', same_target_pending: 2 },
    { id: 'aaaaaaaa-0000-4000-8000-000000000002', reporter_id: A, reporter_name: 'Ayşe Yılmaz', target_type: 'profile', target_id: M, reason: 'fake_profile', details: null, status: 'pending', created_at: iso(5), reviewed_by: null, reviewed_at: null, resolution_note: null, action_taken: null, target_owner_id: M, target_owner_name: 'Mehmet Öztürk', target_preview: 'Mehmet Öztürk - İSG Uzmanı', target_status: null, same_target_pending: 1 }];
  const T1 = 'tttttttt-0000-4000-8000-000000000001'.replace(/t/g, 'f'), T2 = 'eeeeeeee-0000-4000-8000-000000000002', T3 = 'eeeeeeee-0000-4000-8000-000000000003';
  st.tags = [
    { id: T1, name: 'Yüksekte Çalışma', pinned: false, blocked: false, created_at: iso(9000), last_post_at: iso(30), post_count: 12 },
    { id: T2, name: 'Yuksekte calisma2', pinned: false, blocked: false, created_at: iso(500), last_post_at: iso(60), post_count: 2 },
    { id: T3, name: 'Bakanlığa Şikayet', note: 'Mevzuat sorunlarını paylaş.', pinned: true, blocked: false, created_at: iso(20000), last_post_at: null, post_count: 0 }];
  st.T = { T1, T2, T3 };
  const C1 = 'c1c1c1c1-0000-4000-8000-000000000001', C2 = 'c2c2c2c2-0000-4000-8000-000000000002', C3 = 'c3c3c3c3-0000-4000-8000-000000000003';
  st.cats = [
    { id: C1, name: 'İş Güvenliği Uzmanlığı', slug: 'is-guvenligi-uzmanligi', sort_order: 10, is_active: true, services: 4, all_services: 5 },
    { id: C2, name: 'Risk Değerlendirmesi', slug: 'risk-degerlendirmesi', sort_order: 20, is_active: true, services: 2, all_services: 2 },
    { id: C3, name: 'Diğer', slug: 'diger', sort_order: 30, is_active: false, services: 0, all_services: 0 }];
  st.C = { C1, C2, C3 };
  // v1.8.0 Onaylar: A bekliyor (Pro), M bekliyor (Pro değil), P onaylı
  const P = '33333333-3333-4333-8333-333333333333';
  st.verif = [
    { user_id: A, full_name: 'Ayşe Yılmaz', role: 'İSG Uzmanı', city: 'İstanbul', status: 'pending', doc_path: `${A}/1.jpg`, verified_name: null, reason: null, submitted_at: iso(30), decided_at: null, is_pro: true, pro_until: iso(-30000) },
    { user_id: M, full_name: 'Mehmet Öztürk', role: 'İSG Uzmanı', city: 'Kocaeli', status: 'pending', doc_path: `${M}/2.png`, verified_name: null, reason: null, submitted_at: iso(20), decided_at: null, is_pro: false, pro_until: null },
    { user_id: P, full_name: 'Can Demir', role: null, city: null, status: 'approved', doc_path: null, verified_name: 'Can Demir', reason: null, submitted_at: iso(900), decided_at: iso(800), is_pro: true, pro_until: null }];
  st.removed = [];
  // v1.9.0 Saha Raporu: admin_report_config tek çağrıda ayarlar; yazma RPC'leri sunucu kurallarını taklit eder
  const Q1 = 'a1a1a1a1-0000-4000-8000-000000000001', Q2 = 'a2a2a2a2-0000-4000-8000-000000000002';
  st.fr = {
    models: [
      { key: 'anthropic:claude-haiku-5-5', provider: 'anthropic', model: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', supports_vision: true, enabled: true, input_usd_per_mtok: '0.1000', output_usd_per_mtok: '0.5000', sort: 3 },
      { key: 'anthropic:claude-sonnet-5-5', provider: 'anthropic', model: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', supports_vision: true, enabled: true, input_usd_per_mtok: '2.0000', output_usd_per_mtok: '10.0000', sort: 2 },
      { key: 'openai:gpt-4o', provider: 'openai', model: 'gpt-4o', label: 'ChatGPT · GPT-4o', supports_vision: true, enabled: true, input_usd_per_mtok: '2.5000', output_usd_per_mtok: '10.0000', sort: 10 },
      { key: 'openai:gpt-6-luna', provider: 'openai', model: 'gpt-6-luna', label: 'ChatGPT · GPT-6 Luna', supports_vision: false, enabled: true, input_usd_per_mtok: '0.2000', output_usd_per_mtok: '1.2000', sort: 13 }],
    settings: { report_model_text: 'anthropic:claude-haiku-5-5', report_model: 'anthropic:claude-sonnet-5-5', report_model_complex: 'anthropic:claude-sonnet-5-5', report_complex_photos: '4', report_fallback_model: '', rewrite_model: '', report_style: 'dengeli' },
    prompts: [
      { target: 'default', purpose: 'report_analyze', prompt: 'Sen deneyimli bir iş güvenliği uzmanısın. Tespitleri nesnel yaz; öneriler ...sağlanmalıdır diliyle.', updated_at: iso(600) },
      { target: 'default', purpose: 'finding_rewrite', prompt: 'Bulguyu hukuki dille yeniden yaz; öneri ...sağlanmalıdır.', updated_at: iso(600) },
      { target: 'openai', purpose: 'report_analyze', prompt: 'ChatGPT için özel analiz talimatı: kısa ve nesnel yaz.', updated_at: iso(100) }],
    texts: {
      report_ledger_template: JSON.stringify({ note: 'Tespitleri onaylı deftere yazın ve imzalatın.', header: '{ziyaret_tarihi} tarihinde {isyeri} işyerinde:', urgent_label: 'ACİL', footer: 'Ayrıntılar {rapor_no} Rev.{rev} raporundadır.' }),
      report_notice_template: JSON.stringify({ title: 'TASLAK', subject: 'm.11/3 kapsamında bildirim', closing: 'Arz ederim.', info: '6331 m.8 bilgisi', province_note: 'SGK ili.', address_note: 'Adres saklanmaz.',
        recipients: [{ key: 'il_mudurlugu', label: 'İl Müdürlüğü', to: '{il} Çalışma ve İş Kurumu İl Müdürlüğüne' }],
        reasons: [{ key: 'durdurma', label: 'Acil durdurma', text: 'acil durdurmayı gerektiren bir hâl' }],
        channels: [{ key: 'elden', label: 'Elden', note: 'Evrak kayıt numarasını alın.' }], attachments: ['Rapor', 'Fotoğraflar'] }),
      report_guides: JSON.stringify({ ledger: { title: 'Defter', steps: [{ title: 'Metni aç', body: 'Dokun.' }], final: 'Bildirilmiş sayılır.' }, notice: { title: 'Bildirim', steps: [{ title: 'Madde seç', body: 'Seç.' }], final: 'Kopyasını sakla.' } }),
      report_receiver_steps: JSON.stringify([{ title: 'Önce acil maddeler', body: 'ACİL işaretli maddeler önce.' }, { title: 'Onaylı deftere yazdırın', body: 'Rapor onaylı defterin yerine geçmez.' }]) },
    limits: { ai_budget_free_month_microusd: '250000', ai_budget_pro_month_microusd: '10000000', ai_budget_max_month_microusd: '30000000', ai_daily_factor: '3',
      report_max_analyses: '5', report_rewrite_daily_limit: '40', report_max_photos: '8', report_max_drafts: '5',
      spam_posts_per_hour: '10', spam_posts_per_day: '30', spam_comments_per_minute: '5', spam_comments_per_hour: '60', spam_likes_per_hour: '200',
      spam_services_per_day: '10', spam_reports_per_day: '20', spam_new_account_link_hours: '24', spam_max_links: '3',
      new_account_hours: '24', new_posts_per_day: '3', new_comments_per_day: '20', new_chats_per_day: '3' },
    checklist: [
      { id: Q1, deficiency_title: 'Uyarı levhaları eksik', finding_text: 'Levha yok.', recommendation_text: 'Levha asılmalıdır.', default_priority: 'onemli', explanation: null, is_active: true, order_index: 1, question: 'Uyarı levhaları var mı?' },
      { id: Q2, deficiency_title: 'Yangın tüpü dolum tarihi geçmiş', finding_text: null, recommendation_text: null, default_priority: 'iyilestirme', explanation: null, is_active: true, order_index: 2, question: 'Yangın tüpü kontrol edildi mi?' }]
  };
  st.Q = { Q1, Q2 };
  const frUsed = () => ['report_model_text', 'report_model', 'report_model_complex', 'rewrite_model', 'report_fallback_model', 'free_report_model'].map(k => st.fr.settings[k]).filter(Boolean);
  const bad = m => { throw { code: '22023', message: `KISG_ADMIN_INPUT: ${m}` }; };
  const withTotal = rows => rows.map(r => ({ ...r, total_count: rows.length }));
  const ADMIN_RPC = {
    admin_overview: () => ({ users_total: 1296, users_new_7d: 12, posts: { active: 14, hidden: 1, deleted: 3 }, comments: { active: 9, deleted: 3 }, services: { active: 3, archived: 1 }, reports: { pending: 2 }, active_suspensions: 1, active_bans: 0, warnings_30d: 2, admin_actions_7d: 4 }),
    admin_list_audit_log: () => withTotal([{ id: 'l1', admin_id: X, admin_name: 'Admin', action: 'post.hide', target_type: 'post', target_id: posts[1].id, reason: 'spam', before: {}, after: {}, created_at: iso(20) }]),
    admin_list_users: a => withTotal(users.filter(u => !a.p_q || u.full_name.toLowerCase().includes(String(a.p_q).toLowerCase()) || u.email.includes(a.p_q))),
    admin_get_user: a => { const u = users.find(x => x.id === a.p_user_id); return { profile: { id: u.id, full_name: u.full_name, email: u.email, phone: '+905324445566', show_phone_publicly: false, title: u.title, city: u.id === A ? 'istanbul' : u.city, profession: 'İş Güvenliği Uzmanı', current_company: null, experience_range: '5-10 yıl', about: 'Hakkında metni', is_discoverable: u.is_discoverable, is_premium: u.is_premium, created_at: u.created_at, avatar_url: null, linkedin_url: null, instagram_url: null, website_url: null, certificate_class: u.id === A ? 'A Sınıfı' : 'Uzman Hekim' }, is_admin: false, counts: { posts: { active: 1, hidden: 1 }, comments: {}, services: { active: 1 }, reports_made: 0 }, reports_against: reports.filter(r => r.target_owner_id === u.id).map(r => ({ id: r.id, target_type: r.target_type, target_id: r.target_id, reason: r.reason, status: r.status, created_at: r.created_at })), sanctions: u.id === A ? [{ id: 'ssssssss-0000-4000-8000-000000000001'.replace(/s/g, 'e'), user_id: A, type: 'suspension', reason: 'spam', starts_at: iso(100), ends_at: iso(-3000), revoked_at: null, created_at: iso(100) }] : [], recent_admin_actions: [] }; },
    admin_list_content: a => withTotal(a.p_kind === 'post' ? posts.filter(p => !a.p_status || p.status === a.p_status) : []),
    admin_list_reports: a => withTotal(reports.filter(r => !a.p_status || r.status === a.p_status).filter(r => !a.p_target_type || r.target_type === a.p_target_type)),
    admin_list_tags: a => withTotal(st.tags.filter(t => (!a.p_q || t.name.toLowerCase().includes(String(a.p_q).toLowerCase())) && (!a.p_filter || t[a.p_filter]))
      .sort((x, y) => a.p_sort === 'az' ? x.name.localeCompare(y.name, 'tr') : a.p_sort === 'new' ? y.created_at.localeCompare(x.created_at) : y.post_count - x.post_count)),
    admin_update_tag: a => { if (a.p_patch.name === 'Yüksekte Çalışma') throw { code: '23505', message: 'KISG_TAG_EXISTS: bu adda etiket var, birlestirmeyi kullan' }; const t = st.tags.find(x => x.id === a.p_id); Object.assign(t, a.p_patch); return { name: t.name, pinned: t.pinned, blocked: t.blocked }; },
    admin_merge_tags: a => { const s = st.tags.find(x => x.id === a.p_source), t = st.tags.find(x => x.id === a.p_target); t.post_count += s.post_count; st.tags = st.tags.filter(x => x !== s); return { target_id: t.id, moved_posts: s.post_count }; },
    admin_list_service_categories: () => st.cats.slice().sort((x, y) => x.sort_order - y.sort_order),
    admin_create_service_category: a => { if (a.p_name === 'Diğer') throw { code: '23505', message: 'KISG_CATEGORY_EXISTS: bu adda kategori var' }; const c = { id: 'c4c4c4c4-0000-4000-8000-000000000004', name: a.p_name, slug: 'yeni', sort_order: 40, is_active: true, services: 0, all_services: 0 }; st.cats.push(c); return c; },
    admin_update_service_category: a => { const c = st.cats.find(x => x.id === a.p_id); Object.assign(c, a.p_patch); return { name: c.name, is_active: c.is_active, icon: c.icon ?? null }; },
    admin_service_category_icons: () => st.cats.map(c => ({ id: c.id, icon: c.icon ?? null })),
    admin_reorder_service_categories: a => { a.p_ids.forEach((id, i) => { st.cats.find(x => x.id === id).sort_order = (i + 1) * 10; }); return a.p_ids.length; },
    admin_delete_service_category: a => { if (st.cats.find(x => x.id === a.p_id).all_services) throw { code: '23503', message: 'KISG_CATEGORY_IN_USE' }; st.cats = st.cats.filter(x => x.id !== a.p_id); return {}; },
    admin_list_verifications: a => st.verif.filter(v => !a.p_status || v.status === a.p_status),
    admin_decide_verification: a => { const v = st.verif.find(x => x.user_id === a.p_user); if (a.p_approve && !v.is_pro) throw { code: '55000', message: 'KISG_NOT_PRO: kullanicinin Pro uyeligi aktif degil' }; const d = v.doc_path; Object.assign(v, { status: a.p_approve ? 'approved' : 'rejected', reason: a.p_approve ? null : a.p_reason, doc_path: null, decided_at: iso(0), verified_name: a.p_approve ? v.full_name : v.verified_name }); return d; },
    admin_revoke_verification: a => { Object.assign(st.verif.find(x => x.user_id === a.p_user), { status: 'rejected', reason: a.p_reason }); return null; },
    admin_update_profile: a => ({ changed: Object.keys(a.p_patch) }),
    admin_report_config: () => JSON.parse(JSON.stringify(st.fr)),
    // v1.15.0 yasaklı kelimeler: sunucu kuralı (2–40 harf) taklit edilir; liste her yazmada geri döner.
    admin_blocked_words: () => st.words.map(w => ({ ...w })),
    admin_job_phrases: () => st.phrases.map(w => ({ ...w })),
    admin_set_report_assist: a => {
      if (!['report_ledger_template', 'report_notice_template', 'report_guides'].includes(a.p_key) || !a.p_value || typeof a.p_value !== 'object' || Array.isArray(a.p_value)) bad('value');
      st.fr.texts[a.p_key] = JSON.stringify(a.p_value); return a.p_value;
    },
    admin_set_report_steps: a => {
      const steps = a.p_steps;
      if (!Array.isArray(steps) || !steps.length || steps.length > 10 || steps.some(x => !x.title || !x.body || x.title.length > 80 || x.body.length > 600)) bad('steps');
      st.fr.texts.report_receiver_steps = JSON.stringify(steps); return steps;
    },
    admin_set_job_phrase: a => {
      const norm = String(a.p_phrase || '').trim().toLocaleLowerCase('tr-TR');
      if (norm.length < 3) bad('phrase');
      st.phrases = st.phrases.filter(w => w.phrase !== a.p_phrase.trim());
      if (a.p_on) st.phrases.push({ phrase: a.p_phrase.trim(), norm, strong: !!a.p_strong, created_at: iso(0) });
      return st.phrases.map(w => ({ ...w }));
    },
    admin_set_blocked_word: a => {
      const norm = String(a.p_word || '').trim().toLocaleLowerCase('tr-TR');
      if (!/^[a-zçığüöş]{2,40}$/.test(norm)) bad('word');
      st.words = st.words.filter(w => w.norm !== norm);
      if (a.p_on) st.words.push({ word: a.p_word.trim(), norm, prefix: !!a.p_prefix, created_at: iso(0) });
      return st.words.map(w => ({ ...w })).sort((x, y) => x.word.localeCompare(y.word));
    },
    // v1.13.0: rapor başına gerçek maliyet (kota ayarı için ölçüm).
    admin_report_unit_stats: a => ({ days: a.p_days, budgets: { free: 0.25, pro: 10, max: 30 },
      reports: { count: 12, avg_usd: 0.025, p50_usd: 0.02, p90_usd: 0.07, max_usd: 0.11, avg_analyses: 1.3, avg_rewrites: 2.1 },
      month_by_plan: [{ plan: 'free', users: 4, avg_usd: 0.08, max_usd: 0.25, budget_full: 1 }, { plan: 'pro', users: 2, avg_usd: 1.4, max_usd: 2.2, budget_full: 0 }] }),
    admin_report_usage: a => ({ days: a.p_days, totals: { calls: 40, analyze: 30, rewrite: 10, charged: 26, errors: 3, fallback: 2, cost_usd: 1.2345, users: 6, avg_ms: 5400 },
      by_day: [{ day: '2026-10-18', calls: 12, errors: 1, cost_usd: 0.41 }, { day: '2026-10-17', calls: 28, errors: 2, cost_usd: 0.8245 }],
      by_model: [{ model: 'anthropic:claude-sonnet-5-5', calls: 25, errors: 2, fallback: 0, input_tokens: 120000, output_tokens: 30000, cost_usd: 0.9 }, { model: 'anthropic:claude-haiku-5-5', calls: 15, errors: 1, fallback: 2, input_tokens: 40000, output_tokens: 9000, cost_usd: 0.3345 }],
      top_users: [{ user_id: A, full_name: 'Ayşe Yılmaz', email: 'ayse@ornek.com', calls: 22, charged: 15, cost_usd: 0.7 }] }),
    admin_set_ai_setting: a => {
      const m = st.fr.models.find(x => x.key === a.p_value);
      if (['report_model', 'report_model_complex', 'rewrite_model', 'free_report_model'].includes(a.p_key) && a.p_value && !m?.supports_vision) bad('model');
      if (a.p_key === 'report_style' && !['sade', 'dengeli', 'ayrintili'].includes(a.p_value)) bad('value');
      st.fr.settings[a.p_key] = a.p_value; return { key: a.p_key, value: a.p_value };
    },
    admin_upsert_ai_model: a => {
      const m = st.fr.models.find(x => x.key === a.p_key);
      if (!m) { if (!/^(anthropic|openai):[A-Za-z0-9._-]{1,50}$/.test(a.p_key)) bad('key'); const [provider, model] = a.p_key.split(':'); const n = { key: a.p_key, provider, model, enabled: true, sort: 50, ...a.p_patch }; st.fr.models.push(n); return n; }
      if (a.p_patch.enabled === false && frUsed().includes(m.key)) throw { code: '23503', message: 'KISG_MODEL_IN_USE: önce model seçiminde başka model seçin' };
      Object.assign(m, a.p_patch); return m;
    },
    admin_set_ai_prompt: a => {
      const i = st.fr.prompts.findIndex(x => x.target === a.p_target && x.purpose === a.p_purpose);
      if (!a.p_prompt) { if (a.p_target === 'default') bad('default'); if (i >= 0) st.fr.prompts.splice(i, 1); return { target: a.p_target, purpose: a.p_purpose, prompt: null }; }
      if (i >= 0) Object.assign(st.fr.prompts[i], { prompt: a.p_prompt, updated_at: iso(0) }); else st.fr.prompts.push({ target: a.p_target, purpose: a.p_purpose, prompt: a.p_prompt, updated_at: iso(0) });
      return { target: a.p_target, purpose: a.p_purpose, prompt: a.p_prompt };
    },
    admin_set_report_limit: a => { if (a.p_key === 'report_max_photos' && (a.p_value < 1 || a.p_value > 20)) bad('limit'); st.fr.limits[a.p_key] = String(a.p_value); return { key: a.p_key, value: a.p_value }; },
    admin_upsert_checklist_item: a => {
      if (a.p_patch.default_priority && !['acil', 'onemli'].includes(a.p_patch.default_priority)) bad('patch');
      if (!a.p_id) { const n = { id: 'a3a3a3a3-0000-4000-8000-000000000003', question: a.p_patch.deficiency_title, is_active: true, order_index: st.fr.checklist.length + 1, ...a.p_patch }; st.fr.checklist.push(n); return n; }
      const c = st.fr.checklist.find(x => x.id === a.p_id); if (!c) throw { code: 'P0002', message: 'KISG_ADMIN_NOT_FOUND' }; Object.assign(c, a.p_patch); return c;
    },
    admin_reorder_checklist: a => { if (a.p_ids.length !== st.fr.checklist.length) bad('ids'); st.fr.checklist = a.p_ids.map((id, i) => ({ ...st.fr.checklist.find(x => x.id === id), order_index: i + 1 })); return null; },
    admin_moderate_content: a => { if (a.p_id === 'fail') throw 0; const p = posts.find(x => x.id === a.p_id); if (a.p_action === 'hide') p.status = 'hidden'; if (a.p_action === 'restore') p.status = 'active'; if (a.p_action === 'delete') p.status = 'deleted'; return { status: p.status }; },
    admin_sanction_user: () => 'ffffffff-0000-4000-8000-000000000001',
    admin_revoke_sanction: () => ({ revoked_at: iso(0) }),
    admin_resolve_report: a => { const r = reports.find(x => x.id === a.p_report_id); r.status = a.p_status; return { status: a.p_status, action_taken: 'none', reports_closed: 1 }; }
  };
  st.ready = Promise.all([
    ctx.route('https://isgcalisanplatformu.com/**', r => r.fulfill({ contentType: 'text/html', body: hostPage(new URL(r.request().url()).pathname) })),
    ctx.route('https://cdn.jsdelivr.net/**', r => { const f = libs[r.request().url()]; return f ? r.fulfill({ headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) }) : r.fulfill({ status: 404 }); }),
    ctx.route('https://twaptpofhbnnfciowoig.supabase.co/storage/**', r => {
      const req = r.request(), p = new URL(req.url()).pathname, J = b => r.fulfill({ headers: H, contentType: 'application/json', body: JSON.stringify(b) });
      if (req.method() === 'OPTIONS') return r.fulfill({ status: 200, headers: H });
      const sign = /\/object\/sign\/kisg-verifications\/(.+)$/.exec(p);
      if (sign && req.method() === 'POST') return J({ signedURL: `/object/sign/kisg-verifications/${sign[1]}?token=t` });
      if (sign && req.method() === 'GET') return r.fulfill({ headers: H, contentType: 'image/png', body: IMG });
      if (/\/object\/kisg-verifications$/.test(p) && req.method() === 'DELETE') { const b = JSON.parse(req.postData() || '{}'); if (st.failRemove) return r.fulfill({ status: 400, headers: H, contentType: 'application/json', body: '{"message":"x"}' }); st.removed.push(...(b.prefixes || [])); return J((b.prefixes || []).map(name => ({ name }))); }
      return r.fulfill({ status: 404, headers: H, body: '' });
    }),
    ctx.route('https://twaptpofhbnnfciowoig.supabase.co/auth/v1/**', r => {
      const req = r.request(), p = new URL(req.url()).pathname;
      if (req.method() === 'OPTIONS') return r.fulfill({ status: 200, headers: H });
      if (p.endsWith('/token')) {
        const body = JSON.parse(req.postData() || '{}');
        const uid = body.email === 'admin@ornek.com' && body.password === 'dogru' ? X : body.email === 'ayse@ornek.com' && body.password === 'dogru' ? A : null;
        if (!uid) return r.fulfill({ status: 400, headers: H, contentType: 'application/json', body: JSON.stringify({ code: 'invalid_credentials', message: 'Invalid login credentials' }) });
        return r.fulfill({ headers: H, contentType: 'application/json', body: JSON.stringify({ access_token: tokenFor(uid), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r', user: { id: uid, aud: 'authenticated', email: body.email } }) });
      }
      if (p.endsWith('/logout')) return r.fulfill({ status: 204, headers: H, body: '' });
      const uid = uidOf((req.headers().authorization || '').replace(/^Bearer /i, ''));
      return r.fulfill({ headers: H, contentType: 'application/json', body: JSON.stringify({ id: uid, aud: 'authenticated', email: uid === X ? 'admin@ornek.com' : 'ayse@ornek.com' }) });
    }),
    ctx.route('https://twaptpofhbnnfciowoig.supabase.co/rest/v1/**', r => {
      const req = r.request(), u = new URL(req.url());
      if (req.method() === 'OPTIONS') return r.fulfill({ status: 200, headers: H });
      const m = /\/rest\/v1\/rpc\/([a-z_]+)$/.exec(u.pathname);
      if (!m) {
        st.table.push({ method: req.method(), path: u.pathname, q: u.search, body: req.postData() || null });
        // v1.2.0 Destek: support_requests doğrudan tablo (RLS: yalnız admin okur/günceller) + isimler için profiles
        const tbl = u.pathname.split('/').pop(), who = uidOf((req.headers().authorization || '').replace(/^Bearer /i, ''));
        const eq = k => (u.searchParams.get(k) || '').replace(/^eq\./, '');
        const J = (b, status = 200, extra = {}) => r.fulfill({ status, headers: { ...H, ...extra }, contentType: 'application/json', body: JSON.stringify(b) });
        if (tbl === 'support_requests' && req.method() === 'GET') {
          const rows = who === X ? st.support.filter(x => (!u.searchParams.get('status') || x.status === eq('status')) && (!u.searchParams.get('category') || x.category === eq('category'))) : [];
          return J(rows, 200, { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` });
        }
        if (tbl === 'support_requests' && req.method() === 'PATCH') {
          const row = who === X ? st.support.find(x => x.id === eq('id')) : null;
          if (row) Object.assign(row, JSON.parse(req.postData() || '{}'));
          return row ? J({ id: row.id, status: row.status }) : J({ code: 'PGRST116', message: 'no rows' }, 406);
        }
        if (tbl === 'profiles' && req.method() === 'GET') return J(users.map(x => ({ id: x.id, full_name: x.full_name })));
        return r.fulfill({ status: 404, headers: H, body: '[]' });
      }
      const name = m[1], args = JSON.parse(req.postData() || '{}'), uid = uidOf((req.headers().authorization || '').replace(/^Bearer /i, ''));
      st.rpc.push({ name, args, uid, method: req.method() });
      const J = (b, status = 200) => r.fulfill({ status, headers: H, contentType: 'application/json', body: JSON.stringify(b) });
      if (name === 'kisg_is_admin') return J(uid === X);
      if (!ADMIN_RPC[name]) return J({ code: 'PGRST202', message: `Could not find the function public.${name}` }, 404);
      if (uid !== X) return J({ code: '42501', message: 'KISG_ADMIN_ONLY', details: null, hint: null }, 403);
      if (st.fail[name]) return J(st.fail[name], 400);
      try { return J(ADMIN_RPC[name](args)); } catch (e) { if (e?.code) return J(e, 400); return J({ code: '22023', message: 'KISG_ADMIN_STATE: yalniz aktif icerik gizlenir' }, 400); }
    })
  ]);
  return st;
}
const session = uid => ([key, value]) => localStorage.setItem(key, value);
async function open(browser, { uid = null, width = 1280, height = 900, qs = '' } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const st = server(ctx); await st.ready;
  if (uid) await ctx.addInitScript(session(uid), ['sb-twaptpofhbnnfciowoig-auth-token', JSON.stringify({ access_token: tokenFor(uid), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r', user: { id: uid, aud: 'authenticated', email: uid === X ? 'admin@ornek.com' : 'ayse@ornek.com' } })]);
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.goto('https://isgcalisanplatformu.com/pro-admin' + qs);
  const f = page.frames().find(x => x !== page.mainFrame()) || (await page.waitForEvent('frameattached'));
  await f.waitForSelector('#kisgAdmin[data-ready]');
  return { ctx, page, f, st, errs };
}
const until = async (fn, ms = 5000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await new Promise(r => setTimeout(r, 50)); } return false; };
const visible = (f, sel) => f.locator(sel).first().isVisible().catch(() => false);
const lastRpc = (st, name) => [...st.rpc].reverse().find(x => x.name === name);
const ALLOWED = new Set(['kisg_is_admin', 'admin_set_report_steps', 'admin_set_report_assist', 'admin_overview', 'admin_list_users', 'admin_get_user', 'admin_list_content', 'admin_list_reports', 'admin_list_audit_log', 'admin_update_profile', 'admin_moderate_content', 'admin_sanction_user', 'admin_revoke_sanction', 'admin_resolve_report', 'admin_list_tags', 'admin_update_tag', 'admin_merge_tags', 'admin_list_service_categories', 'admin_create_service_category', 'admin_update_service_category', 'admin_reorder_service_categories', 'admin_delete_service_category', 'admin_service_category_icons', 'admin_list_verifications', 'admin_decide_verification', 'admin_revoke_verification',
  'admin_report_config', 'admin_report_usage', 'admin_report_unit_stats', 'admin_set_ai_setting', 'admin_upsert_ai_model', 'admin_set_ai_prompt', 'admin_set_report_limit', 'admin_upsert_checklist_item', 'admin_reorder_checklist', 'admin_blocked_words', 'admin_set_blocked_word', 'admin_job_phrases', 'admin_set_job_phrase', 'admin_set_report_text']);

// ---------------- statik ----------------
check(!/service_role|service-role|serviceRole/i.test(ADMIN_HTML.replace(/service_role YOKTUR|service_role YOK/g, '')), 'admin HTML\'de service role anahtarı/kullanımı yok');
check(/sb_publishable_/.test(ADMIN_HTML) && !/eyJhbGciOi/.test(ADMIN_HTML), 'yalnız publishable anahtar var (JWT biçimli gizli anahtar yok)');
{ const t = [...ADMIN_HTML.matchAll(/\.from\(\s*['"]([a-z_]+)/g)].map(x => x[1]);
  check(t.length && t.every(n => n === 'support_requests' || n === 'profiles'), `doğrudan tablo erişimi yalnız Destek sekmesinde (support_requests + isim için profiles): ${t.join(', ')}`); }
check(!/<a[^>]+data-view-link|kisgApp/.test(ADMIN_HTML), 'Professional App Shell\'e bağlı değil (ayrı ve bağımsız sayfa)');

const browser = await chromium.launch(LAUNCH);
try {
  // ---------------- 1) oturum yok → giriş ----------------
  {
    const { ctx, f, st, errs } = await open(browser);
    check(await until(() => visible(f, '[data-gate-pane="login"]')), 'oturum yoksa giriş formu açılır');
    check(!st.rpc.length, 'giriş öncesi hiçbir RPC çağrılmaz');
    await f.fill('input[name="email"]', 'admin@ornek.com'); await f.fill('input[name="password"]', 'yanlis');
    await f.click('[data-gate-pane="login"] button[type="submit"]');
    check(await until(async () => (await f.textContent('[data-login-error]')).includes('hatalı')), 'hatalı şifre: "E-posta veya şifre hatalı."');
    await f.fill('input[name="password"]', 'dogru');
    await f.click('[data-gate-pane="login"] button[type="submit"]');
    check(await until(() => visible(f, '.pa-stats')), 'admin girişi sonrası Genel Bakış açılır');
    check(errs.length === 0, `sayfa hatası yok ${errs.join(' ')}`);
    await ctx.close();
  }
  // ---------------- 2) admin olmayan kullanıcı ----------------
  {
    const { ctx, f, st } = await open(browser, { uid: A });
    check(await until(() => visible(f, '[data-gate-pane="denied"]')), 'admin olmayan kullanıcı "Yetkiniz yok" görür');
    check(st.rpc.length === 1 && st.rpc[0].name === 'kisg_is_admin', 'admin olmayan kullanıcı için yalnız kisg_is_admin çağrıldı (veri istenmedi)');
    check(!(await visible(f, '.pa-shell')), 'yönetim menüsü gösterilmez');
    await ctx.close();
  }
  // ---------------- 3) admin, masaüstü ----------------
  {
    const { ctx, page, f, st, errs } = await open(browser, { uid: X });
    check(await until(() => visible(f, '.pa-stats')), 'admin oturumu: Genel Bakış');
    const stats = await f.locator('.pa-stat').allTextContents();
    check(stats.some(t => t.includes('Bekleyen şikâyet') && t.includes('2')) && stats.some(t => t.includes('1.296')), `özet kutuları admin_overview verisini gösteriyor (${stats.length} kutu)`);
    check((await f.textContent('[data-pending]')).trim() === '2', 'menüde bekleyen şikâyet sayısı');
    check((await f.locator('.pa-table tbody tr').count()) === 1 && (await f.textContent('.pa-table')).includes('Post gizlendi'), 'son yönetici işlemleri listesi');
    await page.screenshot({ path: path.join(OUT, 'pro-admin-overview-desktop.png'), fullPage: true });

    // Kullanıcılar
    await f.click('.pa-nav [data-sec="users"]');
    check(await until(() => f.locator('[data-user]').count().then(n => n === 2)), 'Kullanıcılar listesi');
    check(new URL(page.url()).searchParams.get('b') === 'users', 'bölüm üst sayfa adresinde (?b=users)');
    await f.fill('.pa-search', 'mehmet');
    check(await until(() => lastRpc(st, 'admin_list_users')?.args.p_q === 'mehmet'), 'arama admin_list_users(p_q) ile yapılır');
    check(await until(() => f.locator('[data-user]').count().then(n => n === 1)), 'arama sonucu 1 kullanıcı');
    await f.click(`[data-user="${M}"]`);
    check(await until(async () => (await f.textContent('.pa-drawer')).includes('mehmet@ornek.com')), 'kullanıcı paneli: e-posta ve ayrıntılar (admin_get_user)');
    // Profil düzenle: gerekçesiz → hata, çağrı yok
    await f.click('.pa-drawer button:has-text("Profili düzenle")');
    // Admin V1.1: Şehir (81 il) ve Mesleki Belge / Statü dropdown'ları, mevcut değer seçili
    const sel = await f.evaluate(() => { const c = document.querySelector('.pa-dialog select[name="city"]'), k = document.querySelector('.pa-dialog select[name="certificate_class"]');
      return { cityTag: c?.tagName, cityN: c?.options.length, cityV: c?.value, cityFirst: c?.options[1]?.value, cityLast: c?.options[c.options.length - 1]?.value,
        certV: k?.value, certOpts: k ? [...k.options].map(o => o.value + '=' + o.textContent) : [] }; });
    check(sel.cityTag === 'SELECT' && sel.cityN === 82 && sel.cityV === 'Kocaeli' && sel.cityFirst === 'Adana' && sel.cityLast === 'Zonguldak', `Şehir: 81 il dropdown, mevcut değer seçili ${JSON.stringify(sel).slice(0, 120)}`);
    check(JSON.stringify(sel.certOpts) === JSON.stringify(['=—', 'Uzman Hekim=(mevcut) Uzman Hekim', 'A=A Sınıfı', 'B=B Sınıfı', 'C=C Sınıfı', 'İşyeri Hekimi=İşyeri Hekimi', 'DSP=DSP']) && sel.certV === 'Uzman Hekim',
      `Mesleki Belge / Statü: 5 seçenek; listede olmayan mevcut değer kaybolmadan seçili ${JSON.stringify(sel.certOpts)}`);
    await f.selectOption('.pa-dialog select[name="city"]', 'Ankara');
    await f.selectOption('.pa-dialog select[name="certificate_class"]', 'B');
    const before = st.rpc.filter(x => x.name === 'admin_update_profile').length;
    await f.click('.pa-dialog button[type="submit"]');
    check(await until(async () => (await f.textContent('.pa-dialog .pa-error')).includes('Gerekçe')) && st.rpc.filter(x => x.name === 'admin_update_profile').length === before, 'gerekçe boşsa kaydetmez (istek gönderilmez)');
    await f.fill('.pa-dialog textarea[name="reason"]', 'şehir düzeltmesi');
    await f.click('.pa-dialog button[type="submit"]');
    check(await until(() => lastRpc(st, 'admin_update_profile')), 'admin_update_profile çağrıldı');
    const up = lastRpc(st, 'admin_update_profile').args;
    check(JSON.stringify(up.p_patch) === '{"certificate_class":"B","city":"Ankara"}' && up.p_reason === 'şehir düzeltmesi' && up.p_user_id === M, `yalnız değişen alan gönderildi ${JSON.stringify(up)}`);
    check(await until(async () => (await f.textContent('[data-toast]')).includes('Profil güncellendi')), 'başarı bildirimi');
    // Yaptırım
    await until(() => visible(f, '.pa-drawer button:has-text("Yaptırım uygula")'));
    await f.click('.pa-drawer button:has-text("Yaptırım uygula")');
    await f.check('.pa-dialog input[name="type"][value="suspension"]');
    await f.selectOption('.pa-dialog select[name="duration"]', '3');
    await f.check('.pa-dialog input[name="hide"]');
    await f.fill('.pa-dialog textarea[name="reason"]', 'tekrarlayan spam');
    await f.click('.pa-dialog button[type="submit"]');
    check(await until(() => lastRpc(st, 'admin_sanction_user')), 'admin_sanction_user çağrıldı');
    const sa = lastRpc(st, 'admin_sanction_user').args, days = (Date.parse(sa.p_ends_at) - Date.now()) / 86400000;
    check(sa.p_type === 'suspension' && sa.p_hide_content === true && sa.p_reason === 'tekrarlayan spam' && days > 2.9 && days < 3.1, `askı: tür, 3 gün, içerik gizleme, gerekçe ${JSON.stringify(sa)}`);
    await f.click('.pa-drawer button:has-text("Kapat")').catch(() => {});
    // Yazımı farklı mevcut değerler (istanbul, "A Sınıfı") seçenekle eşleşir; dokunulmazsa kayda girmez
    await f.fill('.pa-search', '');
    await until(() => f.locator('[data-user]').count().then(n => n === 2));
    await f.click(`[data-user="${A}"]`);
    await until(async () => (await f.textContent('.pa-drawer')).includes('ayse@ornek.com'));
    await f.click('.pa-drawer button:has-text("Profili düzenle")');
    const selA = await f.evaluate(() => ({ city: document.querySelector('.pa-dialog select[name="city"]').value, cert: document.querySelector('.pa-dialog select[name="certificate_class"]').value, n: document.querySelector('.pa-dialog select[name="certificate_class"]').options.length }));
    check(selA.city === 'İstanbul' && selA.cert === 'A' && selA.n === 6, `küçük harf "istanbul" → İstanbul, "A Sınıfı" → A seçili ${JSON.stringify(selA)}`);
    await f.fill('.pa-dialog textarea[name="about"]', 'Yeni hakkında');
    await f.fill('.pa-dialog textarea[name="reason"]', 'metin düzeltmesi');
    const nUp = st.rpc.filter(x => x.name === 'admin_update_profile').length;
    await f.click('.pa-dialog button[type="submit"]');
    check(await until(() => st.rpc.filter(x => x.name === 'admin_update_profile').length === nUp + 1), 'ikinci profil kaydı gönderildi');
    check(JSON.stringify(lastRpc(st, 'admin_update_profile').args.p_patch) === '{"about":"Yeni hakkında"}', `dokunulmayan şehir/statü kayda girmedi ${JSON.stringify(lastRpc(st, 'admin_update_profile').args.p_patch)}`);
    await f.click('.pa-drawer button:has-text("Kapat")').catch(() => {});

    // Postlar
    await f.click('.pa-nav [data-sec="posts"]');
    check(await until(() => f.locator('[data-row]').count().then(n => n === 1)), 'Postlar: aktif filtre varsayılan');
    check(lastRpc(st, 'admin_list_content').args.p_kind === 'post' && lastRpc(st, 'admin_list_content').args.p_status === 'active', 'admin_list_content(post, active)');
    await f.click('[data-row] button:has-text("Gizle")');
    await f.fill('.pa-dialog textarea[name="reason"]', 'spam');
    await f.click('.pa-dialog button[type="submit"]');
    check(await until(() => lastRpc(st, 'admin_moderate_content')), 'admin_moderate_content çağrıldı');
    const mo = lastRpc(st, 'admin_moderate_content').args;
    check(mo.p_kind === 'post' && mo.p_action === 'hide' && mo.p_reason === 'spam', `gizleme argümanları ${JSON.stringify(mo)}`);
    check(await until(() => f.locator('[data-row]').count().then(n => n === 0)), 'liste yenilendi (gizlenen post aktif listeden çıktı)');
    await f.click('.pa-chip:has-text("Gizli")');
    check(await until(() => f.locator('[data-row]').count().then(n => n === 2)), 'Gizli filtresi');
    // Sunucu hatası dialogda Türkçe gösterilir
    st.fail.admin_moderate_content = { code: '22023', message: 'KISG_ADMIN_STATE: yalniz gizlenmis icerik geri acilir' };
    await f.click('[data-row] >> nth=0 >> button:has-text("Geri aç")');
    await f.click('.pa-dialog button[type="submit"]');
    check(await until(async () => (await f.textContent('.pa-dialog .pa-error').catch(() => '')).includes('İşlem yapılamadı')), 'sunucu hatası dialogda gösterilir, dialog açık kalır');
    delete st.fail.admin_moderate_content;
    await f.click('.pa-dialog button:has-text("Vazgeç")');

    // Yorumlar / Hizmetler
    await f.click('.pa-nav [data-sec="comments"]');
    check(await until(() => lastRpc(st, 'admin_list_content')?.args.p_kind === 'comment') && await until(async () => (await f.textContent('[data-main]')).includes('Kayıt yok')), 'Yorumlar bölümü (admin_list_content comment)');
    await f.click('.pa-nav [data-sec="services"]');
    check(await until(() => lastRpc(st, 'admin_list_content')?.args.p_kind === 'service'), 'Hizmetler bölümü (admin_list_content service)');

    // Şikâyetler
    await f.click('.pa-nav [data-sec="reports"]');
    check(await until(() => f.locator('[data-report]').count().then(n => n === 2)), 'Şikâyetler: bekleyenler');
    check((await f.textContent('[data-report] >> nth=0')).includes('2 bekleyen şikâyet'), 'aynı hedefteki bekleyen şikâyet sayısı gösteriliyor');
    await f.click('[data-report] >> nth=0 >> button:has-text("Sonuçlandır")');
    const outcomes = await f.locator('.pa-dialog input[name="outcome"]').evaluateAll(els => els.map(e => e.value));
    check(outcomes.includes('resolved|hide') && outcomes.includes('resolved|delete') && outcomes.includes('dismissed|none'), `post şikâyeti seçenekleri ${outcomes.join(',')}`);
    await f.check('.pa-dialog input[value="resolved|hide"]');
    await f.fill('.pa-dialog textarea[name="reason"]', 'reklam doğrulandı');
    await f.click('.pa-dialog button[type="submit"]');
    check(await until(() => lastRpc(st, 'admin_resolve_report')), 'admin_resolve_report çağrıldı');
    const rr = lastRpc(st, 'admin_resolve_report').args;
    check(rr.p_status === 'resolved' && rr.p_content_action === 'hide' && rr.p_note === 'reklam doğrulandı', `sonuçlandırma argümanları ${JSON.stringify(rr)}`);
    check(await until(() => f.locator('[data-report]').count().then(n => n === 1)), 'sonuçlanan şikâyet bekleyenlerden çıktı');
    await f.click('[data-report] >> nth=0 >> button:has-text("Sonuçlandır")');
    const pOut = await f.locator('.pa-dialog input[name="outcome"]').evaluateAll(els => els.map(e => e.value));
    check(!pOut.some(v => v.endsWith('|hide') || v.endsWith('|delete')), 'profil şikâyetinde içerik gizle/sil seçeneği yok');
    await f.click('.pa-dialog button:has-text("Vazgeç")');
    await page.screenshot({ path: path.join(OUT, 'pro-admin-reports-desktop.png'), fullPage: true });

    check(st.table.length === 0, `hiçbir doğrudan tablo isteği yok (yalnız /rpc) ${JSON.stringify(st.table)}`);
    const used = [...new Set(st.rpc.map(x => x.name))];
    check(used.every(n => ALLOWED.has(n)), `yalnız Migration B RPC'leri kullanıldı: ${used.join(', ')}`);
    check(st.rpc.every(x => x.method === 'POST' && x.uid === X), 'tüm RPC\'ler yöneticinin kendi JWT\'siyle gitti');
    check(errs.length === 0, `sayfa hatası yok ${errs.join(' ')}`);
    await ctx.close();
  }
  // ---------------- 4) doğrudan bölüm adresi + oturum kaybı ----------------
  {
    const { ctx, page, f, st } = await open(browser, { uid: X, qs: '?b=reports' });
    check(await until(() => f.locator('[data-report]').count().then(n => n === 2)), '?b=reports doğrudan Şikâyetler\'i açar');
    const frameH = () => page.evaluate(() => document.querySelector('iframe').getBoundingClientRect().height);
    await f.click('.pa-nav [data-sec="overview"]'); await until(() => visible(f, '.pa-stats'));
    await f.evaluate(() => { const m = document.querySelector('[data-main]'); m.append(Object.assign(document.createElement('div'), { style: 'height:2500px', id: 'tall' })); });
    await until(async () => (await frameH()) > 2500);
    const tallH = await frameH();
    await f.evaluate(() => document.getElementById('tall').remove());
    check(await until(async () => (await frameH()) < tallH - 2000), `içerik kısalınca iframe de küçülür (${Math.round(tallH)} → ${Math.round(await frameH())}px)`);
    const rect = await f.evaluate(() => { const n = document.querySelector('.pa-nav').getBoundingClientRect(), m = document.querySelector('[data-main]').getBoundingClientRect(); return { navTop: n.top, mainTop: m.top }; });
    check(Math.abs(rect.navTop - rect.mainTop) < 4, 'masaüstü: menü ve içerik aynı hizada başlıyor');
    await f.click('.pa-nav [data-sec="reports"]'); await until(() => f.locator('[data-report]').count().then(n => n === 2));
    check((await f.getAttribute('.pa-nav [data-sec="reports"]', 'aria-current')) === 'page', 'menüde aktif bölüm işaretli');
    st.fail.admin_list_users = { code: '42501', message: 'KISG_ADMIN_ONLY' };
    await f.click('.pa-nav [data-sec="users"]');
    check(await until(() => visible(f, '[data-gate-pane="denied"]')), 'sunucu yetkiyi reddederse arayüz "Yetkiniz yok" ekranına döner');
    await ctx.close();
  }
  // ---------------- 4b) Destek sekmesi (v1.2.0) ----------------
  for (const vp of [{ n: 'masaüstü', width: 1280, height: 900 }, { n: 'mobil', width: 390, height: 844 }]) {
    const { ctx, page, f, st, errs } = await open(browser, { uid: X, width: vp.width, height: vp.height });
    await until(() => visible(f, '.pa-stats'));
    check(await visible(f, '.pa-nav [data-sec="support"]'), `${vp.n}: menüde "Destek" sekmesi`);
    await f.click('.pa-nav [data-sec="support"]');
    check(await until(() => f.locator('[data-support]').count().then(n => n === 1)), `${vp.n}: varsayılan filtre Açık → 1 talep`);
    const card = await f.textContent('[data-support]');
    check(card.includes('Teknik sorun') && card.includes('Açık') && card.includes('Ayşe Yılmaz') && card.includes('Fotoğraf yüklenmiyor.') && /\d{4}/.test(card), `${vp.n}: kullanıcı, kategori, mesaj, tarih ve durum görünüyor`);
    check(await f.evaluate(() => getComputedStyle(document.querySelector('[data-support] .pa-body')).whiteSpace) === 'pre-wrap', `${vp.n}: mesaj satır sonları korunuyor`);
    await f.click('.pa-chip:text-is("Tümü")');
    check(await until(() => f.locator('[data-support]').count().then(n => n === 2)), `${vp.n}: Tümü → 2 talep`);
    await f.click('[data-support="cccccccc-0000-4000-8000-000000000001"] button:text-is("Çözüldü yap")');
    check(await until(() => st.support[0].status === 'resolved') && await until(async () => (await f.textContent('[data-support="cccccccc-0000-4000-8000-000000000001"]')).includes('Çözüldü')), `${vp.n}: open → resolved`);
    const patch = st.table.filter(x => x.method === 'PATCH');
    check(patch.length === 1 && patch[0].body === '{"status":"resolved"}' && patch[0].q.includes('id=eq.cccccccc-0000-4000-8000-000000000001'), `${vp.n}: yalnız status alanı, yalnız bu talep güncellendi ${JSON.stringify(patch)}`);
    await f.click('[data-support="cccccccc-0000-4000-8000-000000000001"] button:text-is("Yeniden aç")');
    check(await until(() => st.support[0].status === 'open'), `${vp.n}: resolved → open`);
    check(st.table.every(x => /\/(support_requests|profiles)$/.test(x.path)) && st.table.every(x => x.method !== 'POST' && x.method !== 'DELETE'), `${vp.n}: tablo isteği yalnız support_requests/profiles, ekleme/silme yok`);
    const ov = await f.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(ov <= 1 && !errs.length, `${vp.n}: yatay taşma ve sayfa hatası yok ${errs.join(' ')}`);
    await page.screenshot({ path: path.join(OUT, `pro-admin-support-${vp.width}.png`), fullPage: true });
    await ctx.close();
  }
  // ---------------- 4c) Etiketler (v1.3.0) ----------------
  for (const vp of [{ n: 'masaüstü', width: 1280, height: 900 }, { n: 'mobil', width: 390, height: 844 }]) {
    const { ctx, page, f, st, errs } = await open(browser, { uid: X, width: vp.width, height: vp.height });
    const { T1, T2, T3 } = st.T;
    await until(() => visible(f, '.pa-stats'));
    await f.click('.pa-nav [data-sec="tags"]');
    check(await until(() => f.locator('[data-tag]').count().then(n => n === 3)), `${vp.n}: Alanlar listesi`);
    check((await f.textContent('.pa-nav [data-sec="tags"]')).trim() === 'Alanlar' && (await f.textContent('main h1, .pa-main h1').catch(() => '')).includes('Alanlar'), `${vp.n}: menü ve başlık "Alanlar" (v1.6.0; sitedeki dille aynı)`);
    const l0 = lastRpc(st, 'admin_list_tags').args;
    check(l0.p_sort === 'posts' && l0.p_filter === null && l0.p_offset === 0, `${vp.n}: varsayılan sıralama en çok post ${JSON.stringify(l0)}`);
    const row1 = await f.textContent(`[data-tag="${T1}"]`), row3 = await f.textContent(`[data-tag="${T3}"]`);
    check(row1.includes('Yüksekte Çalışma') && !row1.includes('#') && row1.includes('12') && /\d{4}/.test(row1) && row3.includes('Sabit'), `${vp.n}: ad (# yok), post sayısı, tarih, Sabit rozeti`);
    await f.click('.pa-chip:text-is("A–Z")');
    check(await until(() => lastRpc(st, 'admin_list_tags').args.p_sort === 'az') && await until(async () => (await f.locator('[data-tag]').first().getAttribute('data-tag')) === T3), `${vp.n}: alfabetik sıralama`);
    await f.click('.pa-chip:text-is("En yeni")');
    check(await until(() => lastRpc(st, 'admin_list_tags').args.p_sort === 'new'), `${vp.n}: en yeni sıralama`);
    await f.fill('.pa-search', 'yuk');
    check(await until(() => lastRpc(st, 'admin_list_tags').args.p_q === 'yuk'), `${vp.n}: arama admin_list_tags(p_q)`);
    await f.fill('.pa-search', '');
    await until(() => f.locator('[data-tag]').count().then(n => n === 3));
    // yeniden adlandır: çakışma → birleştir önerisi
    await f.click(`[data-tag="${T2}"] button:text-is("Yeniden adlandır")`);
    await f.fill('.pa-dialog input[name="name"]', 'Yüksekte Çalışma');
    await f.click('.pa-dialog button[type="submit"]');
    check(await until(async () => (await f.textContent('.pa-dialog .pa-error').catch(() => '')).includes('Birleştir')), `${vp.n}: aynı ad varsa birleştirme önerilir`);
    await f.fill('.pa-dialog input[name="name"]', 'Çatı İşleri');
    await f.click('.pa-dialog button[type="submit"]');
    check(await until(() => lastRpc(st, 'admin_update_tag')?.args.p_patch.name === 'Çatı İşleri') && await until(async () => (await f.textContent(`[data-tag="${T2}"]`)).includes('Çatı İşleri')), `${vp.n}: yeniden adlandırıldı (gerekçe isteğe bağlı)`);
    // sabitle (açıklama boş → note gönderilmez)
    check((await f.textContent(`[data-tag="${T3}"]`)).includes('Mevzuat sorunlarını paylaş.'), `${vp.n}: sabit konunun açıklaması listede`);
    check(await f.locator(`[data-tag="${T2}"] button:text-is("Açıklama")`).count() === 1, `${vp.n}: sabit olmayan alanda da "Açıklama" (v1.7.0)`);
    await f.click(`[data-tag="${T1}"] button:text-is("Sabitle")`);
    await f.click('.pa-dialog button[type="submit"]');
    check(await until(() => JSON.stringify(lastRpc(st, 'admin_update_tag')?.args.p_patch) === '{"pinned":true}') && await until(async () => (await f.textContent(`[data-tag="${T1}"]`)).includes('Sabit')), `${vp.n}: sabitlendi`);
    // açıklama
    await f.click(`[data-tag="${T1}"] button:text-is("Açıklama")`);
    await f.fill('.pa-dialog textarea[name="note"]', 'Yüksekte çalışma deneyimlerini paylaş.');
    await f.click('.pa-dialog button[type="submit"]');
    check(await until(() => lastRpc(st, 'admin_update_tag')?.args.p_patch.note === 'Yüksekte çalışma deneyimlerini paylaş.') && await until(async () => (await f.textContent(`[data-tag="${T1}"]`)).includes('Yüksekte çalışma deneyimlerini paylaş.')), `${vp.n}: açıklama kaydedildi ve listede`);
    await f.click(`[data-tag="${T1}"] button:text-is("Açıklama")`);
    await f.fill('.pa-dialog textarea[name="note"]', '');
    await f.click('.pa-dialog button[type="submit"]');
    check(await until(() => { const p = lastRpc(st, 'admin_update_tag')?.args.p_patch; return p && 'note' in p && p.note === null; }), `${vp.n}: boş açıklama → null (sitede görünmez)`);
    // engelle: gerekçe zorunlu
    await f.click(`[data-tag="${T1}"] button:text-is("Engelle")`);
    check((await f.textContent('.pa-dialog')).includes('mevcut postlar görünmeye devam eder'), `${vp.n}: engelleme açıklaması`);
    const nUp = st.rpc.filter(x => x.name === 'admin_update_tag').length;
    await f.click('.pa-dialog button[type="submit"]');
    check(await until(async () => (await f.textContent('.pa-dialog .pa-error')).includes('Gerekçe')) && st.rpc.filter(x => x.name === 'admin_update_tag').length === nUp, `${vp.n}: gerekçesiz engellenmez`);
    await f.fill('.pa-dialog textarea[name="reason"]', 'spam');
    await f.click('.pa-dialog button[type="submit"]');
    check(await until(async () => (await f.textContent(`[data-tag="${T1}"]`)).includes('Engelli')) && lastRpc(st, 'admin_update_tag').args.p_reason === 'spam', `${vp.n}: engellendi`);
    // birleştir
    await f.click(`[data-tag="${T2}"] button:text-is("Birleştir")`);
    check(await until(() => f.locator('.pa-dialog select[name="target"] option').count().then(n => n === 2)), `${vp.n}: hedef listesinde kaynak etiket yok`);
    await f.selectOption('.pa-dialog select[name="target"]', T1);
    await f.fill('.pa-dialog textarea[name="reason"]', 'yinelenen');
    await f.click('.pa-dialog button[type="submit"]');
    check(await until(() => lastRpc(st, 'admin_merge_tags')), `${vp.n}: admin_merge_tags çağrıldı`);
    const mg = lastRpc(st, 'admin_merge_tags').args;
    check(mg.p_source === T2 && mg.p_target === T1 && mg.p_reason === 'yinelenen', `${vp.n}: birleştirme argümanları ${JSON.stringify(mg)}`);
    check(await until(async () => (await f.textContent('[data-toast]')).includes('2 post taşındı')) && await until(() => f.locator('[data-tag]').count().then(n => n === 2)), `${vp.n}: birleştirme sonucu ve liste yenilendi`);
    const ov = await f.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(ov <= 1 && !errs.length && !st.table.length, `${vp.n}: yatay taşma, sayfa hatası ve tablo isteği yok ${errs.join(' ')}`);
    await page.screenshot({ path: path.join(OUT, `pro-admin-tags-${vp.width}.png`), fullPage: true });
    await ctx.close();
  }
  // ---------------- 4d) Hizmet Kategorileri (v1.5.0) ----------------
  for (const vp of [{ n: 'masaüstü', width: 1280, height: 900 }, { n: 'mobil', width: 390, height: 844 }]) {
    const { ctx, page, f, st, errs } = await open(browser, { uid: X, width: vp.width, height: vp.height });
    const { C1, C2, C3 } = st.C;
    const order = () => f.$$eval('[data-category]', r => r.map(x => x.dataset.category));
    await until(() => visible(f, '.pa-stats'));
    await f.click('.pa-nav [data-sec="categories"]');
    check(await until(() => f.locator('[data-category]').count().then(n => n === 3)), `${vp.n}: Hizmet Kategorileri listesi (sıraya göre)`);
    const r1 = await f.textContent(`[data-category="${C1}"]`), r3 = await f.textContent(`[data-category="${C3}"]`);
    check(r1.includes('İş Güvenliği Uzmanlığı') && r1.includes('4') && r1.includes('Görünür') && r3.includes('Gizli'), `${vp.n}: ad, aktif hizmet sayısı, durum`);
    check(await f.locator(`[data-category="${C1}"] button:text-is("Sil")`).count() === 0 && await f.locator(`[data-category="${C3}"] button:text-is("Sil")`).count() === 1, `${vp.n}: yalnız hizmeti hiç olmayan kategori silinebilir`);
    check(await f.locator(`[data-category="${C1}"] [aria-label$="yukarı"]`).isDisabled() && await f.locator(`[data-category="${C3}"] [aria-label$="aşağı"]`).isDisabled(), `${vp.n}: ilk satırda ↑, son satırda ↓ pasif`);
    // sırala
    await f.click(`[data-category="${C2}"] [aria-label$="yukarı"]`);
    check(await until(() => JSON.stringify(lastRpc(st, 'admin_reorder_service_categories')?.args.p_ids) === JSON.stringify([C2, C1, C3])) && await until(async () => JSON.stringify(await order()) === JSON.stringify([C2, C1, C3])), `${vp.n}: ↑ ile sıra kaydedildi (tam liste) ve liste yenilendi`);
    // ekle (aynı ad → anlaşılır hata)
    await f.click('button:text-is("+ Yeni kategori")'); await f.waitForSelector('.pa-dialog input[name="name"]');
    await f.fill('.pa-dialog input[name="name"]', 'Diğer'); await f.click('.pa-dialog button[type="submit"]');
    check(await until(async () => (await f.textContent('.pa-dialog .pa-error').catch(() => '')).includes('zaten var')), `${vp.n}: aynı adlı kategori: anlaşılır hata`);
    await f.fill('.pa-dialog input[name="name"]', 'Yangın Güvenliği'); await f.click('.pa-dialog button[type="submit"]');
    check(await until(() => lastRpc(st, 'admin_create_service_category')?.args.p_name === 'Yangın Güvenliği') && await until(() => f.locator('[data-category]').count().then(n => n === 4)), `${vp.n}: yeni kategori eklendi (gerekçe isteğe bağlı)`);
    // düzenle: yeniden adlandır + simge seç (v1.10.0)
    await f.click(`[data-category="${C2}"] button:text-is("Düzenle")`); await f.waitForSelector('.pa-dialog input[name="name"]');
    check(await f.inputValue('.pa-dialog input[name="name"]') === 'Risk Değerlendirmesi', `${vp.n}: düzenleme mevcut adla açılır`);
    check(await f.locator('.pa-dialog .pa-icon-opt').count() === 23 && await f.isChecked('.pa-dialog input[name="icon"][value=""]'), `${vp.n}: 22 simge + "Otomatik"; simgesiz kategoride Otomatik seçili`);
    await f.fill('.pa-dialog input[name="name"]', 'Risk Analizi');
    await f.click('.pa-dialog .pa-icon-opt[title="Uyarı / risk"]');
    check((await f.textContent('.pa-dialog')).includes('Seçili: Uyarı / risk'), `${vp.n}: seçilen simgenin adı yazılır`);
    await f.click('.pa-dialog button[type="submit"]');
    check(await until(() => { const p = lastRpc(st, 'admin_update_service_category')?.args.p_patch; return p?.name === 'Risk Analizi' && p?.icon === 'alert'; }) && await until(async () => (await f.textContent(`[data-category="${C2}"]`)).includes('Risk Analizi')), `${vp.n}: yeniden adlandırıldı ve simge kaydedildi`);
    check(await until(async () => !(await f.textContent(`[data-category="${C2}"]`)).includes('otomatik') && (await f.textContent(`[data-category="${C1}"]`)).includes('otomatik')), `${vp.n}: listede seçili simge, seçilmeyende "otomatik"`);
    // gizle / göster
    await f.click(`[data-category="${C1}"] button:text-is("Gizle")`); await f.waitForSelector('.pa-dialog');
    check((await f.textContent('.pa-dialog')).includes('4 aktif hizmet silinmez'), `${vp.n}: gizleme uyarısı hizmetlerin silinmediğini söyler`);
    await f.click('.pa-dialog button[type="submit"]');
    check(await until(() => JSON.stringify(lastRpc(st, 'admin_update_service_category')?.args.p_patch) === '{"is_active":false}') && await until(async () => (await f.textContent(`[data-category="${C1}"]`)).includes('Gizli')), `${vp.n}: gizlendi`);
    // sil
    await f.click(`[data-category="${C3}"] button:text-is("Sil")`); await f.waitForSelector('.pa-dialog'); await f.click('.pa-dialog button[type="submit"]');
    check(await until(() => lastRpc(st, 'admin_delete_service_category')?.args.p_id === C3) && await until(() => f.locator(`[data-category="${C3}"]`).count().then(n => n === 0)), `${vp.n}: hizmetsiz kategori silindi`);
    const ov = await f.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(ov <= 1 && !errs.length && !st.table.length, `${vp.n}: yatay taşma, sayfa hatası ve tablo isteği yok ${errs.join(' ')}`);
    await page.screenshot({ path: path.join(OUT, `pro-admin-categories-${vp.width}.png`), fullPage: true });
    await ctx.close();
  }
  // ---------------- 4e) Onaylar (v1.8.0) ----------------
  for (const vp of [{ n: 'masaüstü', width: 1280, height: 900 }, { n: 'mobil', width: 390, height: 844 }]) {
    const { ctx, page, f, st, errs } = await open(browser, { uid: X, width: vp.width, height: vp.height });
    await until(() => visible(f, '.pa-stats'));
    check(await until(async () => (await f.textContent('[data-verify-count]')).trim() === '2'), `${vp.n}: menüde bekleyen onay sayısı`);
    await f.click('.pa-nav [data-sec="verify"]');
    check(await until(() => f.locator('[data-verify]').count().then(n => n === 2)), `${vp.n}: Onaylar: 2 bekleyen başvuru`);
    const A1 = `[data-verify="${A}"]`, M1 = `[data-verify="${M}"]`;
    const row = await f.evaluate(s => { const r = document.querySelector(s), img = r.querySelector('.pa-vdoc img'); return { src: img?.src || '', ok: img?.complete && img.naturalWidth > 0, txt: r.textContent }; }, A1);
    check(row.src.includes('/object/sign/kisg-verifications/') && row.src.includes('token=') && /Profildeki ad: Ayşe Yılmaz/.test(row.txt) && /Pro: aktif/.test(row.txt), `${vp.n}: belge imzalı bağlantıyla görünür, profildeki ad ve Pro durumu ${row.src.slice(-60)}`);
    check(await until(() => f.evaluate(s => { const i = document.querySelector(s + ' .pa-vdoc img'); return i?.complete && i.naturalWidth > 0; }, A1)), `${vp.n}: belge görseli yüklendi`);
    check(await f.isDisabled(`${M1} button:text-is("Onayla")`) && /Pro: aktif değil/.test(await f.textContent(M1)), `${vp.n}: Pro olmayan başvuru onaylanamaz`);
    // onayla → belge silinir
    await f.click(`${A1} button:text-is("Onayla")`); await f.waitForSelector('.pa-dialog'); await f.click('.pa-dialog button[type="submit"]');
    check(await until(() => st.removed.includes(`${A}/1.jpg`)) && lastRpc(st, 'admin_decide_verification')?.args.p_user === A && lastRpc(st, 'admin_decide_verification').args.p_approve === true, `${vp.n}: onaylandı, belge depodan silindi`);
    check(await until(() => f.locator('[data-verify]').count().then(n => n === 1)) && await until(async () => (await f.textContent('[data-verify-count]')).trim() === '1'), `${vp.n}: liste ve sayı güncellendi`);
    // reddet: sebep seçimi + not
    await f.click(`${M1} button:text-is("Reddet")`); await f.waitForSelector('.pa-dialog select[name="why"]');
    await f.selectOption('.pa-dialog select[name="why"]', 'Pro üyelik aktif değil'); await f.fill('.pa-dialog textarea[name="reason"]', 'Uygulamadan yenileyin');
    await f.click('.pa-dialog button[type="submit"]');
    check(await until(() => lastRpc(st, 'admin_decide_verification')?.args.p_reason === 'Pro üyelik aktif değil — Uygulamadan yenileyin' && st.removed.includes(`${M}/2.png`)), `${vp.n}: reddedildi (sebep + not), belge silindi`);
    check(await until(async () => /Bekleyen başvuru yok/.test(await f.textContent('[data-main]'))), `${vp.n}: kuyruk boş`);
    // onaylı → geri al (gerekçe zorunlu)
    await f.click('.pa-chips button:text-is("Onaylı")');
    await until(() => f.locator('[data-verify]').count().then(n => n === 2));
    check(!await f.locator('[data-verify] .pa-vdoc').count(), `${vp.n}: karar verilmiş kayıtlarda belge yok`);
    await f.click(`[data-verify="33333333-3333-4333-8333-333333333333"] button:text-is("Onayı geri al")`); await f.waitForSelector('.pa-dialog');
    await f.click('.pa-dialog button[type="submit"]');
    check(await f.isVisible('.pa-dialog .pa-error') && !lastRpc(st, 'admin_revoke_verification'), `${vp.n}: geri almada gerekçe zorunlu`);
    await f.fill('.pa-dialog textarea[name="reason"]', 'Şikâyet'); await f.click('.pa-dialog button[type="submit"]');
    check(await until(() => lastRpc(st, 'admin_revoke_verification')?.args.p_reason === 'Şikâyet'), `${vp.n}: onay geri alındı`);
    // belge silinemezse uyarı
    st.verif.push({ user_id: 'dddddddd-0000-4000-8000-000000000001', full_name: 'Deniz Ak', status: 'pending', doc_path: 'dddddddd-0000-4000-8000-000000000001/x.jpg', submitted_at: iso(1), is_pro: true });
    st.failRemove = true;
    await f.click('.pa-chips button:text-is("Bekleyen")'); await f.waitForSelector('[data-verify] button:text-is("Onayla")');
    await f.click('[data-verify] button:text-is("Onayla")'); await f.waitForSelector('.pa-dialog'); await f.click('.pa-dialog button[type="submit"]');
    check(await until(async () => /belge silinemedi/.test(await f.textContent('[data-toast]'))), `${vp.n}: belge silinemezse yöneticiye uyarı`);
    const ov = await f.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(ov <= 1 && !errs.length && !st.table.length && st.rpc.every(x => ALLOWED.has(x.name)), `${vp.n}: taşma, hata, tablo isteği yok; yalnız izinli RPC ${errs.join(' ')}`);
    await page.screenshot({ path: path.join(OUT, `pro-admin-verify-${vp.width}.png`), fullPage: true });
    await ctx.close();
  }
  // ---------------- 4f) Saha Raporu (v1.9.0) ----------------
  for (const vp of [{ n: 'masaüstü', width: 1280, height: 900 }, { n: 'mobil', width: 390, height: 844 }]) {
    const { ctx, page, f, st, errs } = await open(browser, { uid: X, width: vp.width, height: vp.height, qs: '?b=fieldreports' });
    const dialog = async () => f.waitForSelector('.pa-dialog');
    // Uzun pencere mobilde iframe görünür alanının altına taşabilir (kullanıcı sayfayı kaydırır); form doğrudan gönderilir.
    const submit = async () => f.evaluate(() => document.querySelector('.pa-dialog').requestSubmit(document.querySelector('.pa-dialog button[type="submit"]')));
    const tab = async name => { await f.click(`.pa-tools .pa-chips button:text-is("${name}")`); };
    // Model seçimi
    check(await until(() => visible(f, 'select[name="report_model_text"]')), `${vp.n}: Saha Raporu açıldı (?b=fieldreports), Model seçimi`);
    await page.screenshot({ path: path.join(OUT, `pro-admin-fieldreports-routing-${vp.width}.png`), fullPage: true });
    const visionOnly = await f.evaluate(() => [...document.querySelectorAll('select[name="report_model"] option')].map(o => o.value));
    check(visionOnly.includes('openai:gpt-4o') && !visionOnly.includes('openai:gpt-6-luna'), `${vp.n}: fotoğraflı modelde yalnız fotoğraf okuyan modeller (${visionOnly.join(', ')})`);
    const textAll = await f.evaluate(() => [...document.querySelectorAll('select[name="report_model_text"] option')].map(o => o.value));
    check(textAll.includes('openai:gpt-6-luna'), `${vp.n}: yazı modelinde fotoğraf okumayan model de seçilebilir`);
    await f.selectOption('select[name="report_model"]', 'openai:gpt-4o');
    await f.fill('input[name="report_complex_photos"]', '6');
    await f.check('input[name="report_style"][value="sade"]');
    await f.click('button:text-is("Değişiklikleri kaydet")'); await dialog();
    const list = await f.textContent('.pa-dialog');
    check(/Fotoğraflı/.test(list) && /Claude Sonnet 5\.5 → ChatGPT · GPT-4o/.test(list) && /4 fotoğraf → 6 fotoğraf/.test(list) && /Dengeli → Sade/.test(list), `${vp.n}: onayda yalnız değişen 3 alan, eski → yeni`);
    await submit();
    check(await until(() => st.rpc.filter(x => x.name === 'admin_set_ai_setting').length === 3) && st.fr.settings.report_model === 'openai:gpt-4o' && st.fr.settings.report_complex_photos === '6' && st.fr.settings.report_style === 'sade', `${vp.n}: 3 ayar ayrı RPC ile kaydedildi`);
    await f.click('button:text-is("Değişiklikleri kaydet")');
    check(await until(async () => /Değişiklik yok/.test(await f.textContent('[data-toast]'))), `${vp.n}: değişiklik yoksa RPC yok`);
    // v1.14.0: ücretsiz plana isteğe bağlı ayrı model (yalnız fotoğraf okuyan modeller; boş = ücretli planlarla aynı)
    const freeOpts = await f.evaluate(() => [...document.querySelectorAll('select[name="free_report_model"] option')].map(o => o.value));
    check(freeOpts[0] === '' && freeOpts.includes('anthropic:claude-haiku-5-5') && !freeOpts.includes('openai:gpt-6-luna') && await f.inputValue('select[name="free_report_model"]') === '', `${vp.n}: ücretsiz plan modeli seçimi (varsayılan: ücretli planlarla aynı)`);
    await f.selectOption('select[name="free_report_model"]', 'anthropic:claude-haiku-5-5');
    await f.click('button:text-is("Değişiklikleri kaydet")'); await dialog();
    check(/Ücretsiz plan modeli/.test(await f.textContent('.pa-dialog')) && /ücretli planlarla aynı → Claude Haiku/.test(await f.textContent('.pa-dialog')), `${vp.n}: onayda ücretsiz plan modeli değişimi`);
    await submit();
    check(await until(() => st.fr.settings.free_report_model === 'anthropic:claude-haiku-5-5') && lastRpc(st, 'admin_set_ai_setting').args.p_key === 'free_report_model', `${vp.n}: ücretsiz plan modeli kaydedildi`);
    await f.fill('input[name="report_complex_photos"]', '25'); await f.click('button:text-is("Değişiklikleri kaydet")');
    check(await until(async () => /Eşik 0 ile 20/.test(await f.textContent('[data-toast]'))) && !await f.locator('.pa-dialog').count(), `${vp.n}: geçersiz eşik engellenir`);
    // Modeller
    await tab('Modeller');
    check(await until(() => f.locator('[data-model]').count().then(n => n === 4)), `${vp.n}: Modeller: 4 model`);
    check(/Seçili/.test(await f.textContent('[data-model="openai:gpt-4o"]')) && /Okumaz/.test(await f.textContent('[data-model="openai:gpt-6-luna"]')), `${vp.n}: seçili ve fotoğraf okumayan model işaretli`);
    await f.click('[data-model="openai:gpt-4o"] button:text-is("Kapat")');
    check(await until(async () => /Model seçiminde kullanılıyor/.test(await f.textContent('[data-toast]'))) && !await f.locator('.pa-dialog').count(), `${vp.n}: seçili model kapatılamaz (sunucuya gitmeden)`);
    await f.click('[data-model="openai:gpt-6-luna"] button:text-is("Kapat")'); await dialog(); await submit();
    check(await until(() => st.fr.models.find(x => x.key === 'openai:gpt-6-luna').enabled === false), `${vp.n}: model kapatıldı`);
    await until(() => f.locator('[data-model="openai:gpt-6-luna"] button:text-is("Aç")').count().then(n => n === 1));
    await f.click('button:text-is("+ Yeni model")'); await dialog();
    await f.selectOption('.pa-dialog select[name="provider"]', 'openai');
    await f.fill('.pa-dialog input[name="model"]', 'gpt 5 kötü'); await f.fill('.pa-dialog input[name="label"]', 'Test'); await f.fill('.pa-dialog input[name="input"]', '1'); await f.fill('.pa-dialog input[name="output"]', '2');
    await submit();
    check(await until(async () => /yalnız harf, rakam/.test(await f.textContent('.pa-dialog .pa-error'))), `${vp.n}: geçersiz model adı formda yakalanır`);
    await f.fill('.pa-dialog input[name="model"]', 'gpt-6.2-nova'); await submit();
    check(await until(() => st.fr.models.some(x => x.key === 'openai:gpt-6.2-nova' && x.input_usd_per_mtok === 1 && x.output_usd_per_mtok === 2 && x.supports_vision === true && x.label === 'Test')), `${vp.n}: yeni model eklendi (anahtar, fiyat, görsel)`);
    await until(() => f.locator('[data-model]').count().then(n => n === 5));
    await f.click('[data-model="anthropic:claude-haiku-5-5"] button:text-is("Düzenle")'); await dialog();
    await f.fill('.pa-dialog input[name="output"]', '0.6'); await submit();
    check(await until(() => st.fr.models.find(x => x.key === 'anthropic:claude-haiku-5-5').output_usd_per_mtok === 0.6), `${vp.n}: model fiyatı düzenlendi`);
    // Prompt'lar
    await tab('Prompt’lar');
    check(await until(() => f.locator('[data-prompt]').count().then(n => n === 2)), `${vp.n}: Analiz: varsayılan + ChatGPT özel prompt`);
    check(!await f.locator('[data-prompt="default/report_analyze"] button:text-is("Kaldır")').count(), `${vp.n}: varsayılan prompt kaldırılamaz`);
    await f.click('[data-prompt="default/report_analyze"] button:text-is("Düzenle")'); await dialog();
    check(await f.evaluate(() => document.querySelector('.pa-dialog').classList.contains('is-wide')), `${vp.n}: prompt geniş pencerede`);
    await f.fill('.pa-dialog textarea[name="prompt"]', 'kısa'); await submit();
    check(await until(async () => /çok kısa/.test(await f.textContent('.pa-dialog .pa-error'))), `${vp.n}: çok kısa prompt engellenir`);
    await f.fill('.pa-dialog textarea[name="prompt"]', 'Yeni varsayılan analiz talimatı: tespit nesnel, öneri ...sağlanmalıdır.'); await submit();
    check(await until(() => /^Yeni varsayılan/.test(st.fr.prompts.find(x => x.target === 'default' && x.purpose === 'report_analyze').prompt)), `${vp.n}: varsayılan prompt kaydedildi`);
    await until(() => f.locator('[data-prompt]').count().then(n => n === 2));
    await f.click('button:text-is("+ Modele özel prompt")'); await dialog();
    const targets = await f.evaluate(() => [...document.querySelectorAll('.pa-dialog select[name="target"] option')].map(o => o.value));
    const prefill = await f.inputValue('.pa-dialog textarea[name="prompt"]');
    check(!targets.includes('openai') && targets.includes('anthropic') && targets.includes('openai:gpt-4o') && /^Yeni varsayılan/.test(prefill), `${vp.n}: yeni özel prompt: dolu hedefler listede yok, metin varsayılandan`);
    await f.selectOption('.pa-dialog select[name="target"]', 'openai:gpt-4o'); await submit();
    check(await until(() => st.fr.prompts.some(x => x.target === 'openai:gpt-4o' && x.purpose === 'report_analyze')), `${vp.n}: modele özel prompt eklendi`);
    await until(() => f.locator('[data-prompt]').count().then(n => n === 3));
    await f.click('[data-prompt="openai/report_analyze"] button:text-is("Kaldır")'); await dialog(); await submit();
    check(await until(() => !st.fr.prompts.some(x => x.target === 'openai' && x.purpose === 'report_analyze')) && lastRpc(st, 'admin_set_ai_prompt').args.p_prompt === '', `${vp.n}: özel prompt kaldırıldı (boş metin)`);
    await f.click('.pa-tools .pa-chips button:text-is("Yeniden yazma")');
    check(await until(() => f.locator('[data-prompt]').count().then(n => n === 1)), `${vp.n}: Yeniden yazma prompt'ları ayrı`);
    // Limitler
    await tab('Limitler');
    check(await until(() => visible(f, 'input[name="ai_budget_pro_month_microusd"]')) && await f.inputValue('input[name="ai_budget_pro_month_microusd"]') === '10' && await f.inputValue('input[name="ai_budget_free_month_microusd"]') === '0.25', `${vp.n}: Limitler: bütçeler dolar olarak`);
    check(/≈ 400 tipik rapor/.test(await f.textContent('[data-main]')) && /≈ 10 tipik rapor/.test(await f.textContent('[data-main]')), `${vp.n}: bütçenin yanında ölçülen tipik rapor sayısı`);
    await f.fill('input[name="report_max_photos"]', '30'); await f.click('button:text-is("Değişiklikleri kaydet")');
    check(await until(async () => /en çok fotoğraf: 1 ile 20/.test(await f.textContent('[data-toast]'))), `${vp.n}: aralık dışı limit engellenir`);
    await f.fill('input[name="report_max_photos"]', '10'); await f.fill('input[name="ai_budget_pro_month_microusd"]', '12.5');
    check(await until(async () => /≈ 500 tipik rapor/.test(await f.textContent('[data-main]'))), `${vp.n}: yazarken tipik rapor sayısı güncellenir`);
    await f.click('button:text-is("Değişiklikleri kaydet")'); await dialog(); await submit();
    check(await until(() => st.fr.limits.report_max_photos === '10' && st.fr.limits.ai_budget_pro_month_microusd === '12500000') && st.rpc.some(x => x.name === 'admin_set_report_limit' && x.args.p_key === 'ai_budget_pro_month_microusd' && x.args.p_value === 12500000), `${vp.n}: bütçe mikro dolar (tam sayı) olarak kaydedildi`);
    // Spam koruması (v1.11.0): ayrı kart, kendi kaydet düğmesi
    check(await f.inputValue('input[name="spam_comments_per_minute"]') === '5' && await f.inputValue('input[name="new_posts_per_day"]') === '3', `${vp.n}: spam ve yeni hesap sınırları mevcut değerlerle`);
    await f.fill('input[name="spam_comments_per_minute"]', '3');
    await f.locator('button:text-is("Değişiklikleri kaydet")').nth(1).click(); await dialog(); await submit();
    check(await until(() => st.fr.limits.spam_comments_per_minute === '3') && st.rpc.some(x => x.name === 'admin_set_report_limit' && x.args.p_key === 'spam_comments_per_minute' && x.args.p_value === 3), `${vp.n}: spam sınırı kaydedildi`);
    // QR sayfası adımları (v1.18.0): mevcut adımlar, boş adım reddi, ekle, kaydet; kaşe notu yok
    check(!/kaşe/i.test(await f.textContent('[data-main]')), `${vp.n}: Saha Raporu'nda kaşe kalmadı`);
    check(await f.inputValue('input[name="step_title"] >> nth=0') === 'Önce acil maddeler' && await f.locator('[data-step]').count() === 2, `${vp.n}: adımlar mevcut metinle`);
    await f.click('button:text-is("Adım ekle")');
    await f.click('button:text-is("Adımları kaydet")');
    check(await until(async () => /başlığı ve metni dolu/.test(await f.textContent('[data-toast]'))), `${vp.n}: boş adım reddedilir`);
    await f.fill('input[name="step_title"] >> nth=2', 'Raporu saklayın');
    await f.fill('textarea[name="step_body"] >> nth=2', 'PDF\'i değiştirmeden\nsaklayın.');
    await f.click('button:text-is("Adımları kaydet")'); await dialog(); await submit();
    check(await until(() => JSON.parse(st.fr.texts.report_receiver_steps).length === 3) && JSON.parse(st.fr.texts.report_receiver_steps)[2].body === 'PDF\'i değiştirmeden saklayın.' && lastRpc(st, 'admin_set_report_steps'), `${vp.n}: adımlar kaydedildi (satır sonu boşluk olur)`);
    // Yasaklı kelimeler (v1.15.0): liste, ekle (önek), geçersiz giriş, çıkar
    check(await until(async () => /orospu/.test(await f.textContent('[data-main]')) && /Önek/.test(await f.textContent('[data-main]'))), `${vp.n}: yasaklı kelimeler listesi görünür`);
    await f.fill('input[name="word"]', 'a1'); await f.click('[data-add="word"]');
    check(await until(async () => /2–40 harf/.test(await f.textContent('[data-toast]'))), `${vp.n}: geçersiz kelime reddedilir`);
    await f.fill('input[name="word"]', 'kerhane'); await f.check('input[name="prefix"]'); await f.click('[data-add="word"]');
    check(await until(() => st.words.some(w => w.norm === 'kerhane' && w.prefix)) && lastRpc(st, 'admin_set_blocked_word')?.args.p_on === true && await until(async () => /kerhane/.test(await f.textContent('[data-main]'))), `${vp.n}: kelime önek olarak eklendi ve listede`);
    await f.click('button[aria-label="orospu çıkar"]');
    check(await until(() => !st.words.some(w => w.norm === 'orospu')) && lastRpc(st, 'admin_set_blocked_word')?.args.p_on === false, `${vp.n}: kelime çıkarıldı`);
    st.words.push({ word: 'orospu', norm: 'orospu', prefix: true, created_at: iso(0) });
    // İş ilanı ifadeleri (v1.16.0): güçlü varsayılan; orta eklenebilir; çıkar
    check(await until(async () => /eleman aranıyor/.test(await f.textContent('[data-main]'))) && await f.isChecked('input[name="strong"]'), `${vp.n}: iş ilanı ifadeleri listesi; yeni ifade varsayılan güçlü`);
    await f.fill('input[name="phrase"]', 'tam zamanlı'); await f.uncheck('input[name="strong"]'); await f.click('[data-add="phrase"]');
    check(await until(() => st.phrases.some(w => w.phrase === 'tam zamanlı' && !w.strong)) && await until(async () => /Orta \(en az iki\)/.test(await f.textContent('[data-main]'))), `${vp.n}: orta ifade eklendi`);
    await f.click('button[aria-label="eleman aranıyor çıkar"]');
    check(await until(() => !st.phrases.some(w => w.phrase === 'eleman aranıyor')) && lastRpc(st, 'admin_set_job_phrase')?.args.p_on === false, `${vp.n}: ifade çıkarıldı`);
    st.phrases.push({ phrase: 'eleman aranıyor', norm: 'eleman araniyor', strong: true, created_at: iso(0) });
    // Defter ve bildirim (v1.19.0): şablonlar, sebep ekle, boş alan reddi, kılavuzlar; kaşe ve yasak kelimeler yok
    await tab('Defter ve bildirim');
    check(await until(() => visible(f, '[data-assist="report_ledger_template"]')) && await f.inputValue('input[name="ledger_urgent"]') === 'ACİL', `${vp.n}: Defter ve bildirim: defter şablonu mevcut metinle`);
    check(!/kaşe|resmî|e-imza|mühür|onaylı belge/i.test(await f.textContent('[data-main]')), `${vp.n}: Defter ve bildirim'de kaçınılan kelimeler yok`);
    await f.fill('textarea[name="ledger_footer"]', 'Ayrıntılar {rapor_tarihi} tarihli {rapor_no} Rev.{rev} no\'lu saha raporundadır.');
    await f.click('[data-assist="report_ledger_template"] button:text-is("Kaydet")'); await dialog(); await submit();
    check(await until(() => /rapor_tarihi/.test(JSON.parse(st.fr.texts.report_ledger_template).footer)) && lastRpc(st, 'admin_set_report_assist')?.args.p_key === 'report_ledger_template', `${vp.n}: defter şablonu kaydedildi`);
    check(/rica olunur/.test(JSON.parse(st.fr.texts.report_ledger_template).request ?? ''), `${vp.n}: defter şablonunda rica satırı da kaydedilir`);
    await f.fill('input[name="notice_title"]', '');
    await f.click('[data-assist="report_notice_template"] button:text-is("Kaydet")');
    check(await until(async () => /Boş alan bırakma/.test(await f.textContent('[data-toast]'))), `${vp.n}: boş alan reddedilir`);
    await f.fill('input[name="notice_title"]', 'TASLAK');
    await f.click('[data-list="Bildirim sebepleri"] + button:text-is("+ Satır ekle")');
    await f.fill('[data-list="Bildirim sebepleri"] [data-row] >> nth=1 >> input[name="key"]', 'hayati');
    await f.fill('[data-list="Bildirim sebepleri"] [data-row] >> nth=1 >> input[name="label"]', 'Hayati tehlike');
    // Yarım satır uyarısız atılmaz; aynı anahtar iki kez olmaz (v1.19.2).
    await f.click('[data-assist="report_notice_template"] button:text-is("Kaydet")');
    check(await until(async () => /satırdaki tüm alanları doldur/.test(await f.textContent('[data-toast]'))), `${vp.n}: yarım sebep satırı uyarı verir`);
    await f.fill('[data-list="Bildirim sebepleri"] [data-row] >> nth=1 >> input[name="key"]', 'durdurma');
    await f.fill('[data-list="Bildirim sebepleri"] [data-row] >> nth=1 >> textarea[name="text"]', 'x');
    await f.click('[data-assist="report_notice_template"] button:text-is("Kaydet")');
    check(await until(async () => /aynı anahtar iki kez/.test(await f.textContent('[data-toast]'))), `${vp.n}: aynı anahtar reddedilir`);
    await f.fill('[data-list="Bildirim sebepleri"] [data-row] >> nth=1 >> input[name="key"]', 'hayati');
    await f.fill('[data-list="Bildirim sebepleri"] [data-row] >> nth=1 >> textarea[name="text"]', 'hayati tehlike arz eden bir durum');
    await f.click('[data-assist="report_notice_template"] button:text-is("Kaydet")'); await dialog(); await submit();
    check(await until(() => JSON.parse(st.fr.texts.report_notice_template).reasons.length === 2) && JSON.parse(st.fr.texts.report_notice_template).attachments.length === 2, `${vp.n}: sebep eklendi (kod gerekmez), ekler korunur`);
    await f.fill('textarea[name="guide_notice_final"]', 'Dilekçenin ve gönderim belgesinin bir kopyasını sakla.');
    await f.click('[data-assist="report_guides"] button:text-is("Kaydet")'); await dialog(); await submit();
    check(await until(() => JSON.parse(st.fr.texts.report_guides).notice.final === 'Dilekçenin ve gönderim belgesinin bir kopyasını sakla.'), `${vp.n}: kılavuz metni kaydedildi`);
    // Checklist
    await tab('Hazır şablonlar');
    check(await until(() => f.locator('[data-item]').count().then(n => n === 2)), `${vp.n}: Hazır şablonlar: 2 şablon`);
    check(/İşaretsiz \(eski\)/.test(await f.textContent(`[data-item="${st.Q.Q2}"]`)), `${vp.n}: eski "iyileştirme" önceliği işaretsiz görünür`);
    await f.click(`[data-item="${st.Q.Q2}"] button:text-is("Düzenle")`); await dialog();
    check(/Eski uygulamadaki soru metni değişmez/.test(await f.textContent('.pa-dialog')), `${vp.n}: eski soru metni bilgisi`);
    await f.check('.pa-dialog input[name="priority"][value="acil"]'); await f.fill('.pa-dialog textarea[name="rec"]', 'Dolum yaptırılmalıdır.'); await submit();
    check(await until(() => { const c = st.fr.checklist.find(x => x.id === st.Q.Q2); return c.default_priority === 'acil' && c.recommendation_text === 'Dolum yaptırılmalıdır.'; }), `${vp.n}: madde düzenlendi (acil, öneri)`);
    await until(() => f.locator(`[data-item="${st.Q.Q2}"] button:text-is("↑")`).isEnabled());
    await f.click(`[data-item="${st.Q.Q2}"] button:text-is("↑")`);
    check(await until(() => st.fr.checklist[0].id === st.Q.Q2) && lastRpc(st, 'admin_reorder_checklist').args.p_ids.length === 2, `${vp.n}: sıra değişti`);
    await until(() => f.locator(`[data-item="${st.Q.Q1}"] button:text-is("Gizle")`).count().then(n => n === 1));
    await f.click(`[data-item="${st.Q.Q1}"] button:text-is("Gizle")`); await dialog(); await submit();
    check(await until(() => st.fr.checklist.find(x => x.id === st.Q.Q1).is_active === false), `${vp.n}: madde gizlendi`);
    await until(() => f.locator('button:text-is("+ Yeni şablon")').count().then(n => n === 1));
    await f.click('button:text-is("+ Yeni şablon")'); await dialog();
    await f.fill('.pa-dialog input[name="title"]', 'Acil çıkış yolu kapalı'); await submit();
    check(await until(() => st.fr.checklist.some(x => x.deficiency_title === 'Acil çıkış yolu kapalı' && x.default_priority === 'onemli')), `${vp.n}: yeni madde eklendi (varsayılan Önemli)`);
    // Kullanım
    await tab('Kullanım ve maliyet');
    check(await until(() => visible(f, '.pa-stats')), `${vp.n}: Kullanım açıldı`);
    const ustat = await f.textContent('[data-main]');
    check(/\$1\.2345/.test(ustat) && /%7,5/.test(ustat) && /Ayşe Yılmaz/.test(ustat) && /claude-sonnet-5-5/.test(ustat) && lastRpc(st, 'admin_report_usage').args.p_days === 30, `${vp.n}: maliyet, hata oranı, model ve uzman tablosu`);
    check(/Tipik rapor/.test(ustat) && /\$0\.025/.test(ustat) && /Bütçesi dolan/.test(ustat) && !/Hak düşen/.test(ustat), `${vp.n}: rapor başına maliyet ve plan tablosu; "hak" yok`);
    await f.click('.pa-tools .pa-chips button:text-is("Son 7 gün")');
    check(await until(() => lastRpc(st, 'admin_report_usage').args.p_days === 7), `${vp.n}: dönem değişir (7 gün)`);
    const ov = await f.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(ov <= 1 && !errs.length && !st.table.length && st.rpc.every(x => ALLOWED.has(x.name)), `${vp.n}: taşma, hata, tablo isteği yok; yalnız izinli RPC ${errs.join(' ')}`);
    await page.screenshot({ path: path.join(OUT, `pro-admin-fieldreports-${vp.width}.png`), fullPage: true });
    await ctx.close();
  }
  // Veritabanı güncellemesi yoksa (canlıda migration öncesi): bölüm bunu söyler, panel bozulmaz
  {
    const { ctx, f, st, errs } = await open(browser, { uid: X, qs: '?b=fieldreports' });
    st.fail.admin_report_config = { code: 'PGRST202', message: 'Could not find the function public.admin_report_config' };
    await f.click('.pa-nav [data-sec="fieldreports"]');
    check(await until(async () => /veritabanı güncellemesi henüz uygulanmamış/.test(await f.textContent('[data-main]'))), 'Saha Raporu: veritabanı yoksa açıklama');
    await f.click('.pa-nav [data-sec="categories"]');
    check(await until(() => f.locator('[data-category]').count().then(n => n === 3)) && !errs.length, 'Saha Raporu: diğer bölümler etkilenmez');
    await ctx.close();
  }
  // ---------------- 5) mobil ----------------
  {
    const { ctx, page, f } = await open(browser, { uid: X, width: 390, height: 844 });
    check(await until(() => visible(f, '.pa-stats')), 'mobil: Genel Bakış');
    const ov = await f.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, dir: getComputedStyle(document.querySelector('.pa-nav')).flexDirection }));
    check(ov.sw <= ov.cw + 1 && ov.dir === 'row', `mobil: yatay taşma yok, menü yatay sekme (${ov.sw}/${ov.cw}, ${ov.dir})`);
    await f.click('.pa-nav [data-sec="users"]');
    await until(() => f.locator('[data-user]').count().then(n => n === 2));
    const gap = await f.evaluate(() => document.querySelector('[data-main]').getBoundingClientRect().top - document.querySelector('.pa-nav').getBoundingClientRect().bottom);
    check(gap < 24, `mobil: menü ile içerik arasında boşluk yok (${Math.round(gap)}px)`);
    const card = await f.evaluate(() => getComputedStyle(document.querySelector('.pa-table tr')).display);
    check(card === 'block', 'mobil: tablo satırları karta dönüşür');
    const fh = await page.evaluate(() => document.querySelector('iframe').getBoundingClientRect().height);
    check(fh > 400, `iframe yüksekliği içeriğe göre ayarlanıyor (${Math.round(fh)}px)`);
    await page.screenshot({ path: path.join(OUT, 'pro-admin-users-mobile.png'), fullPage: true });
    await ctx.close();
  }
} finally {
  await browser.close();
}
