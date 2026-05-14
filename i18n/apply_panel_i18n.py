"""Drop i18n switcher + runtime translator into each panel dashboard.

For each panel repo:
  1. Copy i18n.js + i18n-dict.js + i18n-text-map.js + i18n-runtime.js
     + i18n-switcher.css into dashboard/public/i18n/
  2. Inject <link>+<script> refs into dashboard/index.html (before </head>)
  3. Inject fixed-position mount point <div data-i18n-switcher> after <body>
  4. Inline a small CSS rule to position the switcher fixed top-right

V2 includes the runtime translator (walks DOM whitelist + MutationObserver)
so React-rendered panel chrome gets translated without touching JSX.

Idempotent (sentinel: <!-- ATLAS-I18N-PANEL-V2 -->). Replaces v1 block.
"""
from __future__ import annotations
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
THEME = Path(__file__).resolve().parent

REPOS = [
    "vbp-parana", "precos-diarios", "precos-florestais", "precos-de-terras",
    "comexstat-parana", "emprego-agro-parana", "censo-parana",
    "credito-rural-parana", "saude-parana", "seguranca-parana",
]

SENTINEL = "<!-- ATLAS-I18N-PANEL-V2 -->"
LEGACY_SENTINEL = "<!-- ATLAS-I18N-PANEL-V1 -->"

HEAD_INJECT = """
    <!-- ATLAS-I18N-PANEL-V2 -->
    <link rel="stylesheet" href="./i18n/i18n-switcher.css" />
    <script defer src="./i18n/i18n-dict.js"></script>
    <script defer src="./i18n/i18n-text-map.js"></script>
    <script defer src="./i18n/i18n.js"></script>
    <script defer src="./i18n/i18n-runtime.js"></script>
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

# Strip an existing v1 head block (link/script/style chunk we previously injected).
RX_V1 = re.compile(
    r"\n\s*<!-- ATLAS-I18N-PANEL-V1 -->.*?</style>\n",
    re.DOTALL,
)
# Strip an existing v1 body mount.
RX_V1_BODY = re.compile(r'\n\s*<div class="lang-fixed" data-i18n-switcher></div>\n')


def patch_panel(repo: str) -> str:
    dash = ROOT / repo / "dashboard"
    if not dash.exists():
        return f"{repo}: MISSING"

    public_i18n = dash / "public" / "i18n"
    public_i18n.mkdir(parents=True, exist_ok=True)
    for fname in ("i18n.js", "i18n-dict.js", "i18n-switcher.css",
                  "i18n-text-map.js", "i18n-runtime.js"):
        shutil.copy2(THEME / fname, public_i18n / fname)

    idx = dash / "index.html"
    if not idx.exists():
        return f"{repo}: NO_INDEX"
    src = idx.read_text(encoding="utf-8")
    if SENTINEL in src:
        return f"{repo}: already-v2"

    # Remove v1 block + body mount before re-injecting v2.
    if LEGACY_SENTINEL in src:
        src = RX_V1.sub("\n", src, count=1)
        src = RX_V1_BODY.sub("", src, count=1)

    orig = src
    if "</head>" in src:
        src = src.replace("</head>", HEAD_INJECT + "  </head>", 1)
    if "<body>" in src:
        src = src.replace("<body>", "<body>" + BODY_INJECT, 1)
    elif "<body " in src:
        i = src.find("<body ")
        j = src.find(">", i)
        src = src[: j + 1] + BODY_INJECT + src[j + 1:]

    if src != orig:
        idx.write_text(src, encoding="utf-8")
        return f"{repo}: v2-applied"
    return f"{repo}: no-changes"


if __name__ == "__main__":
    for r in REPOS:
        print(patch_panel(r))
