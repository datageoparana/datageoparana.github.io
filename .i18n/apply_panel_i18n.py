"""Drop i18n switcher into each panel dashboard.

For each panel repo:
  1. Copy i18n.js + i18n-dict.js + i18n-switcher.css into dashboard/public/i18n/
  2. Inject <link>+<script> refs into dashboard/index.html (before </head>)
  3. Inject fixed-position mount point <div data-i18n-switcher> after <body>
  4. Inline a small CSS rule to position the switcher fixed top-right

Idempotent (sentinel: <!-- ATLAS-I18N-PANEL-V1 -->).
"""
from __future__ import annotations
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
THEME = Path(__file__).resolve().parent

REPOS = [
    "vbp-parana", "precos-diarios", "precos-florestais", "precos-de-terras",
    "comexstat-parana", "emprego-agro-parana", "censo-parana",
    "credito-rural-parana", "saude-parana", "seguranca-parana",
]

SENTINEL = "<!-- ATLAS-I18N-PANEL-V1 -->"

HEAD_INJECT = """
    <!-- ATLAS-I18N-PANEL-V1 -->
    <link rel="stylesheet" href="./i18n/i18n-switcher.css" />
    <script defer src="./i18n/i18n-dict.js"></script>
    <script defer src="./i18n/i18n.js"></script>
    <style>
      .lang-fixed {
        position: fixed;
        top: 14px;
        right: 14px;
        z-index: 9990;
        box-shadow: 0 6px 18px -8px rgba(20, 17, 12, 0.35);
      }
      @media (max-width: 640px) {
        .lang-fixed { top: 8px; right: 8px; }
      }
    </style>
"""

BODY_INJECT = '\n    <div class="lang-fixed" data-i18n-switcher></div>\n'


def patch_panel(repo: str) -> str:
    dash = ROOT / repo / "dashboard"
    if not dash.exists():
        return f"{repo}: MISSING"

    # 1. Copy files into public/i18n
    public_i18n = dash / "public" / "i18n"
    public_i18n.mkdir(parents=True, exist_ok=True)
    for fname in ("i18n.js", "i18n-dict.js", "i18n-switcher.css"):
        shutil.copy2(THEME / fname, public_i18n / fname)

    # 2/3. Patch index.html
    idx = dash / "index.html"
    if not idx.exists():
        return f"{repo}: NO_INDEX"
    src = idx.read_text(encoding="utf-8")
    if SENTINEL in src:
        return f"{repo}: already-patched"

    orig = src
    if "</head>" in src:
        src = src.replace("</head>", HEAD_INJECT + "  </head>", 1)
    if "<body>" in src:
        src = src.replace("<body>", "<body>" + BODY_INJECT, 1)
    elif "<body " in src:
        # Find closing > of <body ... > and inject after
        i = src.find("<body ")
        j = src.find(">", i)
        src = src[: j + 1] + BODY_INJECT + src[j + 1:]

    if src != orig:
        idx.write_text(src, encoding="utf-8")
        return f"{repo}: patched"
    return f"{repo}: no-changes"


if __name__ == "__main__":
    for r in REPOS:
        print(patch_panel(r))
