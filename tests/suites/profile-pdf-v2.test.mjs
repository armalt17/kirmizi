// Profil PDF V2 — hedefli tarayıcı testi: buton yalnız kendi profilinde; PDF profil + hizmetler (tam açıklama) içerir, Post içermez.
import { chromium, fs, OUT, db, check, LAUNCH, setup, frameOf, resetDb, U1, U2 } from '../helpers/harness.mjs';
import zlib from 'node:zlib';
import path from 'node:path';

const SITE = 'https://isgcalisanplatformu.com';
const LONG = 'Uzun aciklama satiri: saha denetimi, risk analizi ve egitim planlamasi birlikte yurutulur. ';

function seed() {
  resetDb();
  const v = db.professional_services.find(x => x.id === 'aaaaaaaa-0000-4000-8000-000000000004');
  v.description = 'BASLANGIC ' + LONG.repeat(60) + ' SONCUMLE';   // tek hizmet birden fazla sayfaya taşar
  db.professional_posts.filter(p => p.user_id === U1).forEach(p => { p.content = 'GIZLIPOST ' + p.content; });
}
// PDF akışlarını açıp düz metni çıkarır (Helvetica/WinAnsi yolu: (metin) Tj).
function pdfText(buf) {
  const s = buf.toString('latin1'); let out = '';
  const re = /stream\r?\n/g; let m;
  while ((m = re.exec(s))) {
    const start = m.index + m[0].length, end = s.indexOf('endstream', start);
    try { out += zlib.inflateSync(Buffer.from(s.slice(start, end), 'latin1')).toString('latin1') + '\n'; } catch {}
  }
  return [...out.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)].map(x => x[1].replace(/\\(.)/g, '$1')).join('\n');
}
const pages = buf => (buf.toString('latin1').match(/\/Type \/Page\b(?!s)/g) || []).length;

const browser = await chromium.launch(LAUNCH);
try {
  for (const vp of [{ name: 'desktop', width: 1366, height: 900 }, { name: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true }]) {
    for (const fonts of [false, true]) {
      seed();
      const N = `${vp.name}${fonts ? ' (Inter)' : ''}`;
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch, acceptDownloads: true });
      await setup(ctx, true);
      // Metin çıkarımı için yazı tipi yüklenmez → PDF Helvetica ile (Latin karşılıklar) üretilir.
      if (!fonts) await ctx.route(/Inter_\d+\w+\.ttf$/, r => r.fulfill({ status: 404, body: '' }));
      const page = await ctx.newPage();
      const errs = []; page.on('pageerror', e => errs.push(String(e)));

      if (!fonts) {
        // Başkasının profili: PDF seçeneği yok
        await page.goto(`${SITE}/profil?id=${U2}`);
        let f = frameOf(page); await f.waitForSelector('#kpName');
        await f.waitForSelector('.kp-card [data-profile-action="share"]');
        check(await f.locator('[data-profile-action="pdf"]').count() === 0, `${N}: başkasının profilinde PDF butonu yok`);
        check(!/PDF/i.test(await f.textContent('.kp-card')), `${N}: başkasının kartında PDF metni yok`);
        await f.click('[data-profile-tab="hizmetler"]'); await f.waitForSelector('[data-view="profile"] .ks-card');
        check(await f.locator('[data-profile-action="pdf"]').count() === 0, `${N}: Hizmetler sekmesinde de PDF yok`);
      }

      // Kendi profili
      await page.goto(`${SITE}/profil?id=${U1}`);
      const f = frameOf(page); await f.waitForSelector('#kpName');
      await f.waitForSelector('.kp-card [data-profile-action="pdf"]');
      const btn = f.locator('.kp-card [data-profile-action="pdf"]');
      check(await btn.count() === 1 && await btn.isVisible() && (await btn.textContent()).includes('PDF Olarak İndir'), `${N}: kendi profilinde "PDF Olarak İndir" görünür`);
      const box = await btn.boundingBox(), vw = vp.width;
      check(box && box.x >= 0 && box.x + box.width <= vw + 1, `${N}: buton ekran içinde (${box && Math.round(box.x)}+${box && Math.round(box.width)} / ${vw})`);
      if (!fonts) await page.screenshot({ path: path.join(OUT, `profile-pdf-v2-${vp.name}.png`) });

      const dl = page.waitForEvent('download', { timeout: 30000 });
      await btn.click();
      const d = await dl; const file = path.join(OUT, `pdf-v2-${vp.name}${fonts ? '-inter' : ''}.pdf`); await d.saveAs(file);
      const buf = fs.readFileSync(file);
      check(buf.slice(0, 4).toString() === '%PDF', `${N}: PDF indirildi ${d.suggestedFilename()} ${buf.length}B`);
      check(pages(buf) >= 2, `${N}: uzun hizmet açıklaması yeni sayfaya aktı (${pages(buf)} sayfa)`);
      if (!fonts) {
        const t = pdfText(buf), flat = t.replace(/\s+/g, ' ');
        check(flat.includes('Ayse Yilmaz') && flat.includes('Istanbul') && flat.includes('Kirmizi Yapi A.S.'), `${N}: profil bilgileri var`);
        check(flat.includes('HAKKINDA') && flat.includes('8 yillik saha deneyimi'), `${N}: Hakkında bölümü var`);
        check(flat.includes('VERDIGI HIZMETLER') && flat.includes('3 hizmet'), `${N}: Verdiği Hizmetler başlığı + sayı`);
        check(['Santiye Risk Degerlendirmesi', 'Uzaktan ISG Danismanligi', 'Yuksekte Calisma Egitimi'].every(x => flat.includes(x)), `${N}: tüm hizmet başlıkları var`);
        check(flat.includes('Yerinde + Uzaktan') && flat.includes('Ankara') && flat.includes('Egitim'), `${N}: hizmet kategori/mod/bölge satırı`);
        check(flat.includes('BASLANGIC') && flat.includes('SONCUMLE') && (flat.match(/Uzun aciklama satiri/g) || []).length >= 55, `${N}: hizmet açıklaması kesilmeden tam`);
        check(flat.includes('uygulamali yuksekte calisma egitimi'.replace(/^u/, 'U')), `${N}: kısa açıklamalar da var`);
        check(!flat.includes('GIZLIPOST') && !/Calisma #\d/.test(flat) && !/POST|PAYLASIM/.test(flat), `${N}: Postlar PDF'te yok`);
        check(!flat.includes('Gurultu ve Toz') && !flat.includes('Isyeri Hekimligi Hizmeti'), `${N}: başka kullanıcının hizmetleri yok`);
        check(flat.includes('Guncel profili goruntule'), `${N}: QR/canlı profil bloğu var`);
      }
      check(errs.length === 0, `${N}: sayfa hatası yok ${errs.join(' ')}`);
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}
