#!/usr/bin/env node
/**
 * namespace-graph.cjs <input-graph.json> <output-graph.json> <repoSlug>
 *
 * Rewrites a per-repo knowledge graph so its IDs cannot collide with other
 * repos when merged into the hub graph via merge-subdomain-graphs.py.
 *
 * Node IDs `<type>:<rest>` -> `<type>:<slug>/<rest>`.
 * Layer IDs `layer:<x>` -> `layer:<slug>:<x>`, names prefixed with [slug].
 * Edge source/target and layer/tour nodeIds rewritten to match.
 * A `repo:<slug>` tag is added to every node for filtering in the dashboard.
 */
const fs = require('fs');
const [, , inPath, outPath, slug] = process.argv;
if (!inPath || !outPath || !slug) {
  console.error('Usage: node namespace-graph.cjs <in.json> <out.json> <slug>');
  process.exit(1);
}
const g = JSON.parse(fs.readFileSync(inPath, 'utf8'));
const idMap = new Map();

function nsNodeId(id) {
  if (idMap.has(id)) return idMap.get(id);
  const i = id.indexOf(':');
  const out = i === -1 ? `${slug}/${id}` : `${id.slice(0, i)}:${slug}/${id.slice(i + 1)}`;
  idMap.set(id, out);
  return out;
}
const mapRef = (id) => (idMap.has(id) ? idMap.get(id) : nsNodeId(id));

(g.nodes || []).forEach((n) => {
  n.id = nsNodeId(n.id);
  n.tags = Array.isArray(n.tags) ? n.tags : [];
  if (!n.tags.includes(`repo:${slug}`)) n.tags.push(`repo:${slug}`);
});

(g.edges || []).forEach((e) => {
  // Normalize from/to -> source/target
  if (e.from !== undefined && e.source === undefined) { e.source = e.from; delete e.from; }
  if (e.to   !== undefined && e.target === undefined) { e.target = e.to;   delete e.to;   }
  if (e.source) e.source = mapRef(e.source);
  if (e.target) e.target = mapRef(e.target);
});

const validIds = new Set((g.nodes || []).map((n) => n.id));

(g.layers || []).forEach((l) => {
  if (l.id) l.id = l.id.startsWith('layer:') ? `layer:${slug}:${l.id.slice(6)}` : `layer:${slug}:${l.id}`;
  if (l.name) l.name = `[${slug}] ${l.name}`;
  l.nodeIds = (l.nodeIds || []).map(mapRef).filter((id) => validIds.has(id));
});

(g.tour || []).forEach((s) => {
  s.nodeIds = (s.nodeIds || []).map(mapRef).filter((id) => validIds.has(id));
});

fs.writeFileSync(outPath, JSON.stringify(g, null, 2));
console.log(`namespaced ${slug}: ${(g.nodes || []).length} nodes, ${(g.edges || []).length} edges, ${(g.layers || []).length} layers, ${(g.tour || []).length} tour steps`);
