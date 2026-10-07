#!/usr/bin/env python3
"""
Audit pasangan Kotlin `external fun` <-> JNI `Java_com_pristineaudio_*`.

KENAPA INI ADA
--------------
JNI memakai name-mangling: `external fun foo` di Kotlin kelas
`com.pristineaudio.dsp.NativeDSPModule` mencari simbol
`Java_com_pristineaudio_dsp_NativeDSPModule_foo`.

Kalau namanya beda SATU HURUF, tidak ada error kompilasi apa pun:
- Kotlin compile: LULUS (fungsi `external` tidak diverifikasi saat compile)
- C++ compile: LULUS (fungsi JNI hanya simbol biasa)
- CI build: LULUS
- Aplikasi: **crash `UnsatisfiedLinkError`** saat fungsi itu pertama dipanggil

Bug jenis ini sudah terjadi dua kali di proyek ini:
- getter status bit-perfect (APK di device lebih lama dari commit native-nya)
- `setNativeProcessingMode` vs `setProcessingMode` (ketemu oleh skrip ini)

Karena kotlinc tidak tersedia di Termux, skrip ini adalah satu-satunya
verifikasi lokal untuk masalah ini. Jalankan sebelum commit perubahan JNI
atau Kotlin.

Pemakaian:
    python3 scripts/check_jni_pairs.py
    python3 scripts/check_jni_pairs.py --quiet   # hanya keluar != 0 kalau ada masalah
"""

import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
JAVA_DIR = REPO / "android/app/src/main/java/com/pristineaudio"
CPP_DIR = REPO / "android/app/src/main/cpp"

# Kelas Kotlin yang punya `external fun` -> file JNI-nya.
# Tambahkan baris di sini saat ada modul native baru.
PAIRS = {
    "dsp/NativeDSPModule.kt": "jni/NativeDSPModule.cpp",
    "audio/NativeDeviceModule.kt": "jni/NativeDeviceModule.cpp",
    "audio/NativePlaybackModule.kt": "jni/NativePlaybackModule.cpp",
    "audio/NativePristineAudio.kt": "jni/NativePristineAudio.cpp",
}


def audit() -> int:
    failures = 0

    for kt_rel, cpp_rel in PAIRS.items():
        kt_path = JAVA_DIR / kt_rel
        cpp_path = CPP_DIR / cpp_rel

        if not kt_path.exists():
            print(f"SKIP  {kt_rel} (tidak ada)")
            continue
        if not cpp_path.exists():
            print(f"GAGAL {kt_rel}: JNI {cpp_rel} tidak ditemukan")
            failures += 1
            continue

        kt_src = kt_path.read_text(errors="ignore")
        cpp_src = cpp_path.read_text(errors="ignore")

        kotlin_fns = re.findall(r"external fun\s+(\w+)", kt_src)
        jni_fns = set(
            re.findall(r"Java_com_pristineaudio_\w+_(\w+)\s*\(", cpp_src)
        )

        # Kotlin memanggil, JNI tidak menyediakan -> UnsatisfiedLinkError
        missing = [f for f in kotlin_fns if f not in jni_fns]

        # JNI menyediakan, Kotlin tidak memanggil -> kode mati / salah nama
        orphan = sorted(jni_fns - set(kotlin_fns))

        status = "OK   "
        if missing or orphan:
            status = "GAGAL"
            failures += 1

        print(f"{status} {kt_rel} ({len(kotlin_fns)} external fun)")
        for f in missing:
            print(f"        Kotlin memanggil '{f}' tapi JNI tidak punya "
                  f"Java_..._{f}  -> UnsatisfiedLinkError saat dipanggil")
        for f in orphan:
            print(f"        JNI punya '{f}' tapi tidak ada external fun "
                  f"yang cocok  -> kemungkinan salah nama")

    return failures


def main() -> int:
    quiet = "--quiet" in sys.argv
    if not quiet:
        print("=" * 52)
        print("  Audit pasangan Kotlin external <-> JNI")
        print("=" * 52)
        print()

    failures = audit()

    if not quiet:
        print()
        if failures == 0:
            print("Semua pasangan cocok.")
        else:
            print(f"{failures} modul bermasalah.")

    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
