(function(){
// Cœur pur : PONT fiches — relie les axes des projets (domaines + learnings) aux packs existants,
// et détecte les manques (axes sans pack = candidats fiches). Projection LECTURE SEULE : ne modifie
// ni packs ni projets. AUCUN import, aucune I/O : émis en IIFE navigateur par bundle.mjs (window.PONT).
// Déterministe. Jamais de throw sur entrée partielle. Matching DÉCIDABLE (intersection d'ensembles
// normalisés, aucun juge LLM). Concepts de leçons ignorés (morts : 0/259), stack ignoré (infra).

// Normalise une chaîne en clé de comparaison (accents retirés, minuscule, non-alphanum -> '-').
function normKey(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Ensemble de clés d'un pack : slug + tags + concepts (id/titre). Titre NON tokenisé (évite les mots vides).
function packKeys(pack) {
  const keys = new Set();
  if (pack && pack.slug) keys.add(normKey(pack.slug));
  for (const t of (pack && pack.tags) || []) keys.add(normKey(t));
  for (const c of (pack && pack.concepts) || []) keys.add(normKey((c && (c.id || c.title)) || c));
  keys.delete('');
  return keys;
}

// Axes d'un projet à relier : domaines (source curated/fiche) + learnings (axisId, label lisible = titre).
function axesOf(project) {
  const out = [];
  for (const d of (project && project.domains) || []) out.push({ kind: 'domain', label: String(d), key: normKey(d) });
  for (const l of (project && project.learnings) || []) out.push({ kind: 'axis', label: (l && (l.title || l.axisId)) || '', key: normKey(l && (l.axisId || l.title)) });
  return out;
}

// Sujet lisible pré-rempli depuis un axe : un axe (learning) garde son titre ; un domaine slug est dé-slugifié.
function suggestedSubject(gap) {
  if (gap && gap.kind === 'axis') return gap.label;
  return String((gap && gap.label) || (gap && gap.key) || '').replace(/-/g, ' ');
}

// Liens DÉRIVÉS axe -> pack(s). Un axe matche un pack si sa clé normalisée ∈ packKeys(pack).
// Trié (projectSlug asc, key asc) pour déterminisme. Ne matche jamais sur clé vide.
function matchAxesToPacks(projects, packs) {
  const keyed = (packs || []).map((p) => ({ slug: p.slug, keys: packKeys(p) }));
  const out = [];
  for (const pr of projects || []) {
    for (const ax of axesOf(pr)) {
      if (!ax.key) continue;
      const packSlugs = keyed.filter((k) => k.keys.has(ax.key)).map((k) => k.slug).sort();
      if (packSlugs.length) out.push({ projectSlug: pr.slug, kind: ax.kind, label: ax.label, key: ax.key, packSlugs });
    }
  }
  return out.sort((a, b) => (a.projectSlug < b.projectSlug ? -1 : a.projectSlug > b.projectSlug ? 1 : a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

// Manques : axes SANS aucun pack couvrant, dédupliqués par clé (agrège les projets sources).
// Trié (nb projets desc, clé asc). Chaque manque porte un sujet pré-rempli.
function detectFicheGaps(projects, packs) {
  const keyed = (packs || []).map((p) => packKeys(p));
  const covered = (key) => keyed.some((k) => k.has(key));
  const byKey = new Map();
  for (const pr of projects || []) {
    for (const ax of axesOf(pr)) {
      if (!ax.key || covered(ax.key)) continue;
      if (!byKey.has(ax.key)) byKey.set(ax.key, { key: ax.key, label: ax.label, kind: ax.kind, projectSlugs: [] });
      const g = byKey.get(ax.key);
      if (!g.projectSlugs.includes(pr.slug)) g.projectSlugs.push(pr.slug);
    }
  }
  const gaps = [...byKey.values()].map((g) => ({ ...g, projectSlugs: g.projectSlugs.slice().sort(), suggestedSubject: suggestedSubject(g) }));
  return gaps.sort((a, b) => b.projectSlugs.length - a.projectSlugs.length || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

// Liens MANUELS/autoritaires projet -> pack (champ path[] des projets). Préservés tels quels.
function authoritativeLinks(projects) {
  const out = [];
  for (const pr of projects || []) {
    for (const step of (pr && pr.path) || []) {
      if (step && step.packSlug) out.push({ projectSlug: pr.slug, packSlug: step.packSlug, why: step.why || '' });
    }
  }
  return out;
}

window.PONT={matchAxesToPacks,detectFicheGaps,authoritativeLinks,suggestedSubject,normKey};
})();
