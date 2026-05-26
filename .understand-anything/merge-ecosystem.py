#!/usr/bin/env python3
"""
merge-ecosystem.py
Namespaces each sub-repo knowledge graph, merges them into the hub graph,
adds hub→repo route edges (index.html links to each dashboard), and writes
the final ecosystem knowledge-graph.json.

Usage:
  py -3 merge-ecosystem.py
"""

import json, os, subprocess, sys, tempfile, shutil
from pathlib import Path

BASE = Path("C:/Users/avner/onedrive/documentos/github")
HUB  = BASE / "datageoparana.github.io"
UA   = HUB / ".understand-anything"
NS   = UA / "namespace-graph.cjs"

REPOS = [
    "vbp-parana",
    "comexstat-parana",
    "precos-diarios",
    "precos-de-terras",
    "precos-florestais",
    "censo-parana",
    "credito-rural-parana",
    "emprego-agro-parana",
    "saude-parana",
    "seguranca-parana",
]

# Hub HTML pages that link out to each dashboard repo
# Key = hub node ID that references the dashboard
# Value = slug of the target repo
HUB_ROUTES = {
    "file:index.html": [
        "vbp-parana",
        "comexstat-parana",
        "precos-diarios",
        "precos-de-terras",
        "precos-florestais",
        "censo-parana",
        "credito-rural-parana",
        "emprego-agro-parana",
        "saude-parana",
        "seguranca-parana",
    ]
}


def namespace_graph(slug: str) -> dict:
    """Run namespace-graph.cjs on the repo's knowledge-graph.json and return parsed result."""
    src = BASE / slug / ".understand-anything" / "knowledge-graph.json"
    if not src.exists():
        print(f"  SKIP {slug}: no knowledge-graph.json", file=sys.stderr)
        return None
    # Write to a temp file
    tmp = UA / "tmp" / f"{slug}-ns.json"
    tmp.parent.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(
        ["node", str(NS), str(src), str(tmp), slug],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        print(f"  ERROR namespacing {slug}: {result.stderr}", file=sys.stderr)
        return None
    print(f"  {result.stdout.strip()}")
    with open(tmp, "r", encoding="utf-8") as f:
        return json.load(f)


def entry_node_id(graph: dict, slug: str) -> str | None:
    """Return the namespaced ID of the best 'entry point' node in the graph.
    Prefer: file:<slug>/index.html > file:<slug>/dashboard/index.html > file:<slug>/README.md
    Fallback: first file: node.
    """
    nodes = {n["id"]: n for n in graph.get("nodes", [])}
    candidates = [
        f"file:{slug}/index.html",
        f"file:{slug}/dashboard/index.html",
        f"file:{slug}/dashboard/src/main.jsx",
        f"file:{slug}/README.md",
    ]
    for c in candidates:
        if c in nodes:
            return c
    # fallback: first file: node
    for n in graph.get("nodes", []):
        if n["id"].startswith("file:"):
            return n["id"]
    return None


def merge_graphs(hub: dict, sub_graphs: list[dict], slug_map: dict) -> dict:
    """Merge sub-repo graphs into hub graph, adding route edges."""
    # Collect existing node IDs from hub
    hub_node_ids = {n["id"] for n in hub.get("nodes", [])}

    all_nodes = list(hub.get("nodes", []))
    all_edges = list(hub.get("edges", []))
    all_layers = list(hub.get("layers", []))
    tour = list(hub.get("tour", []))

    for slug, sub in zip(slug_map.keys(), sub_graphs):
        if sub is None:
            continue
        # Merge nodes (skip duplicates)
        for n in sub.get("nodes", []):
            if n["id"] not in hub_node_ids:
                all_nodes.append(n)
                hub_node_ids.add(n["id"])

        # Merge edges
        existing_edge_keys = {(e.get("source"), e.get("target"), e.get("type")) for e in all_edges}
        for e in sub.get("edges", []):
            k = (e.get("source"), e.get("target"), e.get("type"))
            if k not in existing_edge_keys:
                all_edges.append(e)
                existing_edge_keys.add(k)

        # Merge layers
        existing_layer_ids = {l["id"] for l in all_layers}
        for layer in sub.get("layers", []):
            if layer["id"] not in existing_layer_ids:
                all_layers.append(layer)
                existing_layer_ids.add(layer["id"])

    # Add hub→repo route edges
    valid_ids = {n["id"] for n in all_nodes}
    for hub_node_id, slugs in HUB_ROUTES.items():
        if hub_node_id not in valid_ids:
            continue
        for slug in slugs:
            # Find namespaced entry node for this repo
            sub = slug_map.get(slug)
            if sub is None:
                continue
            entry = entry_node_id(sub, slug)
            if entry and entry in valid_ids:
                edge_key = (hub_node_id, entry, "route")
                existing = {(e.get("source"), e.get("target"), e.get("type")) for e in all_edges}
                if edge_key not in existing:
                    all_edges.append({
                        "source": hub_node_id,
                        "target": entry,
                        "type": "route",
                        "label": f"links to {slug}"
                    })

    hub_merged = dict(hub)
    hub_merged["nodes"] = all_nodes
    hub_merged["edges"] = all_edges
    hub_merged["layers"] = all_layers
    hub_merged["tour"] = tour
    hub_merged["project"]["description"] = (
        "Ecossistema completo Datageo Paraná: hub central (datageoparana.github.io) + "
        "10 dashboards de dados públicos do Paraná. Inclui pipelines de dados (DATASUS, IBGE, "
        "BCB, CAGED, SESP, SECEX), interfaces React/Vite, sistema i18n PT/EN/ES e autenticação."
    )
    return hub_merged


def validate(g: dict) -> list[str]:
    issues = []
    valid_ids = {n["id"] for n in g.get("nodes", [])}
    for e in g.get("edges", []):
        if e.get("source") not in valid_ids:
            issues.append(f"edge source not found: {e.get('source')}")
        if e.get("target") not in valid_ids:
            issues.append(f"edge target not found: {e.get('target')}")
    for layer in g.get("layers", []):
        for nid in layer.get("nodeIds", []):
            if nid not in valid_ids:
                issues.append(f"layer '{layer['id']}' references unknown node: {nid}")
    for step in g.get("tour", []):
        for nid in step.get("nodeIds", []):
            if nid not in valid_ids:
                issues.append(f"tour step '{step.get('title')}' references unknown node: {nid}")
    return issues


def main():
    print("=== Ecosystem Merge Pipeline ===\n")

    # Load hub graph (use backup/original if it exists to allow re-running)
    backup_path = UA / "knowledge-graph.hub-original.json"
    hub_path = backup_path if backup_path.exists() else UA / "knowledge-graph.json"
    with open(hub_path, "r", encoding="utf-8") as f:
        hub = json.load(f)
    print(f"Hub loaded: {len(hub['nodes'])} nodes, {len(hub['edges'])} edges\n")

    # Namespace all sub-repo graphs
    print("Step 1: Namespacing sub-repo graphs...")
    slug_map = {}
    for slug in REPOS:
        ns = namespace_graph(slug)
        slug_map[slug] = ns

    # Merge
    print("\nStep 2: Merging into hub graph...")
    merged = merge_graphs(hub, list(slug_map.values()), slug_map)

    # Validate
    print("\nStep 3: Validating merged graph...")
    issues = validate(merged)
    if issues:
        print(f"  {len(issues)} issues found:")
        for i in issues[:20]:
            print(f"    - {i}")
        if len(issues) > 20:
            print(f"    ... and {len(issues)-20} more")
    else:
        print("  0 issues — graph is valid")

    # Write output
    out_path = UA / "knowledge-graph.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(merged, f, ensure_ascii=False, indent=2)

    node_count = len(merged["nodes"])
    edge_count = len(merged["edges"])
    layer_count = len(merged["layers"])
    tour_count  = len(merged["tour"])

    print(f"\n=== Done ===")
    print(f"  Output: {out_path}")
    print(f"  Nodes  : {node_count}")
    print(f"  Edges  : {edge_count}")
    print(f"  Layers : {layer_count}")
    print(f"  Tour   : {tour_count} steps")
    print(f"  Issues : {len(issues)}")


if __name__ == "__main__":
    main()
