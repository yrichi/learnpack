(function(){
// Sélecteurs de rendu PURS, partagés entre le rendu .md (project.mjs) et le site (window.PACKVIEW).
// Contrainte ADR 0007 : aucun import (émis en IIFE navigateur par bundle.mjs, qui transforme en IIFE).

function essentiel(pack) {
  const claims = ((pack && pack.claims) || []).filter((c) => c.salience && c.salience > 0);
  return claims.sort((a, b) => (b.salience || 0) - (a.salience || 0)).slice(0, 3);
}

function normalizePitfalls(pack) {
  return ((pack && pack.pitfalls) || []).map((x) => {
    if (x && typeof x === 'object') return { failure: x.failure == null ? '' : x.failure, fix: x.fix == null ? null : x.fix };
    return { failure: String(x), fix: null };
  });
}

const AUTHORITY_MAP = {
  spec: { label: 'spec', tier: 'high' },
  official: { label: 'officiel', tier: 'high' },
  academic: { label: 'académique', tier: 'high' },
  doc: { label: 'doc', tier: 'mid' },
  blog: { label: 'blog', tier: 'low' },
  import: { label: 'importé', tier: 'low' },
};
function authorityBadge(source) {
  const a = source && source.authority;
  if (!a) return null;
  return AUTHORITY_MAP[a] || { label: String(a), tier: 'low' };
}

const RELATION_ORDER = ['prérequis', 'mène vers', 'concept commun', 'sujet lié'];
function relatedGroups(pack) {
  const byRel = new Map();
  for (const r of ((pack && pack.related) || [])) {
    if (!r || !r.slug) continue;
    const rel = r.relation || 'lié';
    if (!byRel.has(rel)) byRel.set(rel, []);
    byRel.get(rel).push({ slug: r.slug });
  }
  const groups = [];
  for (const rel of RELATION_ORDER) if (byRel.has(rel)) groups.push({ relation: rel, items: byRel.get(rel) });
  for (const [rel, items] of byRel) if (!RELATION_ORDER.includes(rel)) groups.push({ relation: rel, items });
  return groups;
}

function freshnessLine(pack) {
  const f = pack && pack.provenance && pack.provenance.freshness;
  if (!f) return null;
  const drift = f.drift || 0, unreachable = f.unreachable || 0;
  const status = unreachable > 0 ? 'unreachable' : drift > 0 ? 'drift' : 'fresh';
  return { checkedAt: f.checkedAt || null, status, drift, unreachable };
}

window.PACKVIEW={essentiel,normalizePitfalls,authorityBadge,relatedGroups,freshnessLine};
})();
