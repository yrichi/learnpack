window.STAGE_VERSIONS={"draft":"draft/7","claims":"claims/4","quiz":"quiz/5","judge":"judge/2"};
(function(){
// Oracle DÉCIDABLE de péremption de GÉNÉRATION (pur). Compare la version des prompts (provenance.promptVersions)
// aux versions courantes injectées + vérifie la présence des blocs fiche v2. Aucun import (émis en IIFE navigateur
// par bundle.mjs). Jamais de throw sur pack/entrée partielle. currentVersions injecté (le cœur ignore STAGE_VERSIONS).

const V2_BLOCKS = [
  { key: 'decision', has: (p) => p.decision != null },
  { key: 'salience', has: (p) => (p.claims || []).some((c) => c && c.salience > 0) },
  { key: 'conceptId', has: (p) => (p.examples || []).some((e) => e && e.conceptId) },
  { key: 'pitfalls-fix', has: (p) => (p.pitfalls || []).some((x) => x && typeof x === 'object' && x.failure) },
  { key: 'related', has: (p) => (p.related || []).length > 0 },
  { key: 'authority', has: (p) => (p.sources || []).some((s) => s && s.authority) },
  { key: 'freshness', has: (p) => !!(p.provenance && p.provenance.freshness) },
];

function packStaleness(pack, currentVersions) {
  const p = pack || {};
  const pv = (p.provenance && p.provenance.promptVersions) || {};
  const versions = currentVersions || {};
  const versionLag = [];
  for (const stage of Object.keys(versions)) {
    const has = pv[stage] != null ? pv[stage] : null;
    if (has !== versions[stage]) versionLag.push({ stage, has, want: versions[stage] });
  }
  const missingBlocks = [], presentBlocks = [];
  for (const b of V2_BLOCKS) (b.has(p) ? presentBlocks : missingBlocks).push(b.key);
  const current = versionLag.length === 0 && missingBlocks.length === 0;
  const priority = missingBlocks.length + versionLag.length;
  return { current, versionLag, missingBlocks, presentBlocks, priority };
}

window.STALENESS={packStaleness};
})();
