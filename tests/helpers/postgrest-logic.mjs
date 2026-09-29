// PostgREST mantıksal filtre çözücüsü (or / and / eq / ilike / is / lt / gt / cs): mock REST'in yok saydığı
// or=(...) koşullarını gerçek PostgREST gibi değerlendirir. ILIKE: PostgreSQL gibi toLowerCase (Türkçe'ye özel değil).
function splitTop(s) { const out = []; let d = 0, q = false, cur = ''; for (let i = 0; i < s.length; i++) { const c = s[i]; if (c === '"' && s[i - 1] !== '\\') q = !q; if (!q && c === '(') d++; if (!q && c === ')') d--; if (!q && d === 0 && c === ',') { out.push(cur); cur = ''; } else cur += c; } if (cur) out.push(cur); return out; }
const unq = v => (v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1).replace(/\\(.)/g, '$1') : v);
function likeRe(pat) { let r = ''; for (let i = 0; i < pat.length; i++) { const c = pat[i]; if (c === '\\' && i + 1 < pat.length) { r += pat[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); } else if (c === '%' || c === '*') r += '.*'; else if (c === '_') r += '.'; else r += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); } return new RegExp('^' + r + '$', 's'); }
function evalExpr(expr, row) {
  const m = /^(and|or)\((.*)\)$/s.exec(expr);
  if (m) { const parts = splitTop(m[2]); return m[1] === 'and' ? parts.every(p => evalExpr(p, row)) : parts.some(p => evalExpr(p, row)); }
  const f = /^([a-z_]+(?:\.[a-z_]+)?)\.(not\.)?(eq|ilike|is|lt|gt|cs)\.(.*)$/s.exec(expr); if (!f) return true;
  const [, col, not, op, raw] = f; if (col.includes('.')) return true;
  const v = row[col], val = unq(raw); let r = true;
  if (op === 'eq') r = String(v ?? '') === val;
  else if (op === 'is') r = val === 'null' ? v == null : true;
  else if (op === 'ilike') r = v != null && likeRe(val.toLowerCase()).test(String(v).toLowerCase());
  else if (op === 'lt') r = v != null && v < val; else if (op === 'gt') r = v != null && v > val;
  else if (op === 'cs') { const items = val.replace(/^\{|\}$/g, '').split(',').map(unq); r = Array.isArray(v) && items.every(x => v.includes(x)); }
  return not ? !r : r;
}

export { splitTop, unq, likeRe, evalExpr };
