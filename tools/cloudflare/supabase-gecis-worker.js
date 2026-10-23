// Cloudflare Worker: kisg-supabase-gecis — Hostinger sayfalarındaki eski Supabase (Tokyo) adresini ve publishable
// anahtarını, ziyaretçiye giderken Frankfurt production'ınkilerle değiştirir (2026-10-23, ürün sahibi kararı S8).
// Neden: eski web parçaları (genel site kodu, footer, tanıtım bandı, iş ilanları, ilan detayı, doküman arşivi) depoda
// değil, doğrudan Hostinger'da; ~50 sayfaya tek tek yapıştırmak yerine geçiş köprüsü. Kalıcı düzeltme: parçalar
// Hostinger'da güncellenince bu Worker ve rotaları kaldırılır.
// Rotalar: isgcalisanplatformu.com/*  ve  www.isgcalisanplatformu.com/*   (Failure mode: Fail open)
// /r/* (kisg-rapor) ve /.well-known/* (kisg-well-known) kendi daha özel rotalarıyla bu Worker'a hiç gelmez.
// Yalnız metin yanıtları (HTML, JS, JSON, CSS, XML) değişir; görsel ve dosyalar olduğu gibi geçer.
// J0 oturum aktarımındaki 'sb-<eski ref>-auth-token' anahtar adı değişmez (yalnız '<eski ref>.supabase.co' değişir).
// Deneme: Worker'ın kendi workers.dev adresi siteyi isgcalisanplatformu.com'dan çekip değiştirilmiş hâlini gösterir.

const SITE = 'isgcalisanplatformu.com';
const SWAPS = [
  ['twaptpofhbnnfciowoig.supabase.co', 'cglndmbjinzmmbimxqok.supabase.co'],
  ['sb_publishable_PbG6v6BuhMVwVyRdCxHUMw_JscAAhVs', 'sb_publishable_EeIO-kiSHIhdYotKcew3Vg_E9Qhgsl0'],
];
const TEXT = /^(text\/|application\/(json|javascript|xml|ld\+json|manifest\+json)|image\/svg\+xml)/i;

export default {
  async fetch(request) {
    const url = new URL(request.url);
    // workers.dev üzerinden deneme: içerik gerçek siteden alınır.
    if (url.hostname.endsWith('.workers.dev')) url.hostname = SITE;
    const upstream = await fetch(new Request(url, request), { redirect: 'manual' });
    const type = upstream.headers.get('content-type') || '';
    if (!TEXT.test(type) || request.method === 'HEAD') return upstream;
    let body = await upstream.text();
    let changed = false;
    for (const [from, to] of SWAPS) {
      if (body.includes(from)) { body = body.split(from).join(to); changed = true; }
    }
    if (!changed) return new Response(body, upstream);
    const headers = new Headers(upstream.headers);
    headers.delete('content-length');
    headers.delete('etag');
    headers.set('x-kisg-gecis', '1');
    return new Response(body, { status: upstream.status, statusText: upstream.statusText, headers });
  },
};
