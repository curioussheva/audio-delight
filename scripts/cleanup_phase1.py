#!/data/data/com.termux/files/usr/bin/python3
"""Cleanup Fase 1: hapus .bak + orphan + dead code C++."""
import subprocess
from pathlib import Path

ROOT = Path.home() / "pristine"
deleted = 0

# ══════════════════════════════════════════════════════
# Fase 1a — Hapus semua .bak / .backup_* / .bak_*
# ══════════════════════════════════════════════════════
patterns = ["*.bak*", "*.backup_*"]
for pat in patterns:
    for f in ROOT.rglob(pat):
        if "node_modules" in str(f):
            continue
        try:
            f.unlink()
            deleted += 1
        except Exception as e:
            print(f"⚠️  skip {f}: {e}")

print(f"✅ [1a] Hapus {deleted} file .bak/.backup")

# ══════════════════════════════════════════════════════
# Fase 1b — Hapus folder archive + tmp patch backups
# ══════════════════════════════════════════════════════
import shutil
for p in [
    ROOT / "scripts/.archive",
    ROOT / "tmp/patch_backups",
]:
    if p.exists():
        shutil.rmtree(p)
        print(f"✅ [1b] Hapus folder {p.relative_to(ROOT)}")

# ══════════════════════════════════════════════════════
# Fase 1c — Hapus useTrackPlayerHandler (orphan)
# ══════════════════════════════════════════════════════
hook = ROOT / "src/features/player/hooks/useTrackPlayerHandler.ts"
if hook.exists():
    hook.unlink()
    print("✅ [1c] Hapus useTrackPlayerHandler.ts")

# Cleanup export di index.ts
idx = ROOT / "src/features/player/index.ts"
if idx.exists():
    src = idx.read_text()
    lines = src.splitlines()
    new_lines = [l for l in lines if "useTrackPlayerHandler" not in l]
    if len(new_lines) != len(lines):
        idx.write_text("\n".join(new_lines) + "\n")
        print("✅ [1c] Export dihapus dari index.ts")

# ══════════════════════════════════════════════════════
# Fase 1d — Hapus dead code C++ PlaybackManager dkk
# ══════════════════════════════════════════════════════
dead = [
    "android/app/src/main/cpp/playback/PlaybackManager.h",
    "android/app/src/main/cpp/playback/PlaybackManager.cpp",
    "android/app/src/main/cpp/playback/PlaybackScheduler.h",
    "android/app/src/main/cpp/playback/PlaybackScheduler.cpp",
    "android/app/src/main/cpp/playback/PlaybackEvents.h",
]
for rel in dead:
    f = ROOT / rel
    if f.exists():
        f.unlink()
        print(f"✅ [1d] Hapus {rel}")

# ══════════════════════════════════════════════════════
# Fase 1e — Update .gitignore
# ══════════════════════════════════════════════════════
gi = ROOT / ".gitignore"
if gi.exists():
    content = gi.read_text()
    block = "\n# Backup files (cegah numpuk lagi)\n*.bak\n*.bak_*\n*.backup_*\n"
    if "*.bak" not in content:
        gi.write_text(content + block)
        print("✅ [1e] .gitignore updated")

print(f"\n{'='*50}\nDone.")