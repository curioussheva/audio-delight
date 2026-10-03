## graphify - This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships. Built 2026-10-03: **11620 nodes, 22031 edges, 532 communities** (AST extraction, includes `android/app/src/main/cpp/**`).

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## Notes for this repo:
- The graph is above the 5000-node threshold, so `graph.html` is an *aggregated* community view (532 nodes), and query results are truncated at a token budget. Narrow the query or raise `--budget` when the answer is not in the first ~59 nodes.
- ~110 files are partially extracted (syntax errors the extractor can't parse - `build.gradle`, some `.h` globals). Absence from a query result is not proof of absence in the code.
- `android/app/src/main/cpp/oboe/**` is a vendored dependency and is excluded from `scripts/check.sh`; it does contribute nodes to the graph.

## Pitfalls (learned the hard way):
- **`scripts/patch_*.py` — DIBERSIHKAN 2026-10-03.** Dulu ada 59 patch script
  hasil iterasi debugging audio. Hampir semua fixnya sudah terapply ke source,
  tapi banyak yang **tidak idempotent** — kalau dijalankan lagi, double-apply /
  revert fix yang lebih baru (ini benar terjadi: `PlaybackController.cpp`
  buffer `1<<21`→`1<<19` saat mass-run). Yang tersisa **7 file**, semua masih
  dipakai CI/clangd. Kalau butuh patch native baru, ikuti pola
  `patch_audio_fixes.py` (anchor-count validation + `--dry-run` + skip-amankan)
  — jangan tulis script str-replace tanpa guard.
- **A patch script can break silently.** `patch-foojay.py` is invoked by the
  CI workflow but its regex did not match the actual plugin format in
  `node_modules/@react-native/gradle-plugin/settings.gradle.kts` → CI fails.
  When adding a regex pattern to a CI script, **test it against the real
  node_modules file first** (see `~/wiki/log.md` postmortem).
- **`ccache` is broken** on Termux (missing libc++ symbols). Also unavailable:
  bun, kotlinc, gradle, watchman, scrcpy, valgrind, heaptrack, frida,
  react-devtools (needs Electron/X11). Debug C++ with **AddressSanitizer**
  (`-fsanitize=address`).
