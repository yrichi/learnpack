(function(){
// Cœur pur : projections TRANSVERSES du hub de leçons (agrégations cross-projets + graphe de liens).
// AUCUN import, aucune I/O, aucune horloge : émis en IIFE navigateur par bundle.mjs (cf. staleness.mjs).
// Déterministe (tri lexical sur chaînes ISO / ids). Jamais de throw sur entrée partielle.

// Le status factory-v2 peut porter un commentaire ("code_capitalized  # resolu …") → 1er token.
function statusOf(lesson) {
  const s = lesson && lesson.status;
  if (!s) return '';
  return String(s).trim().split(/\s+/)[0] || '';
}

// Aplati toutes les leçons de tous les projets, chaque leçon étiquetée par son projet.
function allLessons(projects) {
  const out = [];
  for (const p of projects || []) {
    for (const l of p.lessons || []) out.push({ ...l, projectSlug: p.slug, projectTitle: p.title });
  }
  return out;
}

function byDateDescIdAsc(a, b) {
  const da = a.date || '', db = b.date || '';
  if (da !== db) return db < da ? -1 : 1;              // date desc (chaînes ISO)
  const ia = a.id || '', ib = b.id || '';
  return ia < ib ? -1 : ia > ib ? 1 : 0;               // tiebreak id asc
}

// Journal transverse : toutes les leçons triées date desc (id asc), filtrables par status/projet.
function journalTimeline(projects, { status = null, projectSlug = null } = {}) {
  let ls = allLessons(projects);
  if (projectSlug) ls = ls.filter((l) => l.projectSlug === projectSlug);
  if (status) ls = ls.filter((l) => statusOf(l) === status);
  return ls.sort(byDateDescIdAsc);
}

// Groupe des leçons par clé (chaîne). Ignore les clés vides. Tri count desc puis clé asc.
function groupLessons(lessons, keyFn) {
  const map = new Map();
  for (const l of lessons) {
    const k = keyFn(l);
    if (!k) continue;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(l);
  }
  return [...map.entries()]
    .map(([key, ls]) => ({ key, count: ls.length, lessons: ls }))
    .sort((a, b) => b.count - a.count || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

function aggregateByStatus(projects) {
  return groupLessons(allLessons(projects), statusOf);
}

function aggregateByFriction(projects) {
  return groupLessons(allLessons(projects), (l) => (l.friction && l.friction.fixKind) || '');
}

// Mineur : ~4 leçons taggées sur le corpus actuel → dégrade à []. Une leçon compte pour CHACUN de ses concepts.
function aggregateByConcept(projects) {
  const map = new Map();
  for (const l of allLessons(projects)) {
    for (const c of l.concepts || []) {
      if (!c) continue;
      if (!map.has(c)) map.set(c, []);
      map.get(c).push(l);
    }
  }
  return [...map.entries()]
    .map(([key, ls]) => ({ key, count: ls.length, lessons: ls }))
    .sort((a, b) => b.count - a.count || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

// Graphe de liens : nœuds = leçons + learnings ; arêtes = evidence lesson-link + learnings.lessonRefs.
// Arête gardée UNIQUEMENT si from ET to résolvent (jamais de nœud fantôme) ; dédupliquée ; pas d'auto-boucle.
function buildLessonGraph(projects) {
  const nodes = [];
  const idset = new Set();
  const add = (id, title, projectSlug, type) => {
    if (!id || idset.has(id)) return;
    idset.add(id);
    nodes.push({ id, title: title || id, projectSlug, type });
  };
  for (const p of projects || []) {
    for (const l of p.lessons || []) add(l.id, l.title, p.slug, 'lesson');
    for (const a of p.learnings || []) add(a.id, a.title, p.slug, 'learning');
  }
  const edges = [];
  const seen = new Set();
  const pushEdge = (from, to, kind) => {
    if (!from || !to || from === to || !idset.has(from) || !idset.has(to)) return;
    const key = from + '->' + to;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ from, to, kind });
  };
  for (const p of projects || []) {
    for (const l of p.lessons || []) {
      for (const ev of l.evidence || []) if (ev && ev.kind === 'lesson-link') pushEdge(l.id, ev.ref, 'lesson-link');
    }
    for (const a of p.learnings || []) {
      for (const ref of a.lessonRefs || []) pushEdge(a.id, ref, 'learning-ref');
    }
  }
  return { nodes, edges };
}

// Récurrences (règle du 2×) : nœuds référencés par >= minRefs autres (in-degree). Tri in-degree desc, id asc.
function detectHubs(graph, { minRefs = 2 } = {}) {
  const edges = (graph && graph.edges) || [];
  const nodes = (graph && graph.nodes) || [];
  const indeg = new Map();
  for (const e of edges) indeg.set(e.to, (indeg.get(e.to) || 0) + 1);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const hubs = [];
  for (const [id, inDegree] of indeg) {
    if (inDegree < minRefs) continue;
    const n = byId.get(id) || { id, title: id, projectSlug: null };
    hubs.push({ id, title: n.title, projectSlug: n.projectSlug, inDegree });
  }
  return hubs.sort((a, b) => b.inDegree - a.inDegree || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

window.LESSONSAGG={journalTimeline,aggregateByStatus,aggregateByFriction,aggregateByConcept,buildLessonGraph,detectHubs,statusOf,allLessons};
})();
