#!/usr/bin/env python3
"""
Audit file spec TurboModule terhadap tipe yang TIDAK didukung codegen RN.

KENAPA INI ADA
--------------
Codegen React Native mem-PARSE `src/specs/*.ts` untuk menghasilkan kode
JNI/Kotlin. Parser-nya hanya mendukung sebagian TypeScript. Tipe yang tidak
didukung TIDAK menghasilkan error di `tsc` (lolos sepenuhnya), dan tidak
terdeteksi clangd (itu C++). Yang terjadi: build GAGAL di task
`:app:generateCodegenSchemaFromJavaScript` dengan pesan

    UnsupportedTypeAnnotationParserError: Module X: TypeScript type
    annotation 'TSIndexedAccessType' is unsupported in NativeModule specs.

Ini sudah terjadi DUA KALI di proyek ini, keduanya baru ketahuan dari CI:
  - `ProcessingModeValue` memakai `(typeof X)[keyof typeof X]` di signature

Karena kotlinc/gradle tidak tersedia di Termux, skrip ini satu-satunya cara
menangkapnya SEBELUM push.

Pemakaian:
    python3 scripts/check_codegen_spec.py
    python3 scripts/check_codegen_spec.py --quiet   # hanya keluar != 0 kalau ada masalah
"""

import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SPECS_DIR = REPO / "src/specs"

# Pola yang TIDAK didukung parser codegen, beserta penjelasannya.
# Kunci = regex, nilai = (nama tipe, cara memperbaiki).
UNSUPPORTED = [
    (
        r"\bkeyof\s+typeof\b|\(\s*typeof\s+\w+\s*\)\s*\[",
        "TSIndexedAccessType",
        "ganti jadi `number` (atau tipe primitif) di signature method, "
        "lalu taruh konstanta bertipe terpisah di luar `interface Spec`",
    ),
    (
        r"\bextends\s+\w+\s*\?\s*[^:]+\s*:",
        "TSConditionalType",
        "pecah jadi dua method/tipe konkret",
    ),
    (
        r"\{\s*\[\s*\w+\s+in\s+keyof\b",
        "TSMappedType",
        "tulis field-nya eksplisit",
    ),
    (
        r"`[^`]*\$\{[^}]*\}[^`]*`(?=[^;]*\)\s*:)",
        "TSTemplateLiteralType",
        "pakai `string`",
    ),
    (
        r"\bReadonlyArray\s*<|\breadonly\s+\w+\s*\[\]",
        "TSReadonlyArray",
        "pakai array biasa `T[]`",
    ),
]


def strip_comments(src: str) -> str:
    """Buang komentar supaya contoh di dokumentasi tidak ikut ditandai."""
    src = re.sub(r"/\*.*?\*/", "", src, flags=re.S)
    src = re.sub(r"//[^\n]*", "", src)
    return src


def extract_spec_body(src: str) -> str:
    """
    Ambil HANYA isi `interface Spec { ... }`.

    Ini penting: tipe bermasalah aman dipakai DI LUAR interface Spec (codegen
    hanya mem-parse signature method di dalamnya). Contoh yang sah:
        interface Spec { setProcessingMode(mode: number): void; }
        export type Mode = (typeof M)[keyof typeof M];   // <- aman
    Memeriksa seluruh file akan melaporkan yang kedua sebagai masalah padahal
    bukan.
    """
    m = re.search(r"interface\s+Spec\s+extends\s+\w+\s*\{", src)
    if not m:
        return ""

    start = m.end()
    depth = 1
    i = start
    while i < len(src) and depth > 0:
        if src[i] == "{":
            depth += 1
        elif src[i] == "}":
            depth -= 1
        i += 1

    return src[start : i - 1]


def audit(quiet: bool = False) -> int:
    failures = 0

    if not SPECS_DIR.is_dir():
        print(f"GAGAL: direktori {SPECS_DIR} tidak ada")
        return 1

    for spec in sorted(SPECS_DIR.glob("*.ts")):
        raw = spec.read_text(errors="ignore")

        # Tipe bermasalah hanya relevan kalau dipakai DI DALAM interface Spec.
        body = extract_spec_body(strip_comments(raw))
        if not body:
            continue

        problems = []
        for pattern, type_name, fix in UNSUPPORTED:
            for m in re.finditer(pattern, body):
                line_no = body[: m.start()].count("\n") + 1
                problems.append((type_name, line_no, m.group(0).strip(), fix))

        if problems:
            failures += len(problems)
            print(f"GAGAL {spec.name}")
            for type_name, line_no, snippet, fix in problems:
                print(f"        di dalam interface Spec (~baris {line_no}): {type_name}")
                print(f"        potongan: {snippet[:70]}")
                print(f"        perbaikan: {fix}")
        elif not quiet:
            print(f"OK    {spec.name}")

    return failures


def main() -> int:
    quiet = "--quiet" in sys.argv
    if not quiet:
        print("=" * 56)
        print("  Audit spec TurboModule vs dukungan codegen RN")
        print("=" * 56)
        print()

    failures = audit(quiet)

    if not quiet:
        print()
        if failures == 0:
            print("Semua spec aman untuk codegen.")
        else:
            print(f"{failures} masalah. Build akan gagal di task codegen.")

    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
