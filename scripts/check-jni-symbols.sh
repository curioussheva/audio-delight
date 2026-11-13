#!/usr/bin/env bash
#
# check-jni-symbols.sh — cocokkan Kotlin `external fun` dengan simbol JNI
# di libpristine-audio.so hasil build.
#
# KENAPA INI ADA (B12-W10)
# -------------------------
# JNI memakai name-mangling: `external fun foo` di kelas Kotlin
# `com.pristineaudio.dsp.NativeDSPModule` mencari simbol
# `Java_com_pristineaudio_dsp_NativeDSPModule_foo` di .so. Kalau namanya
# beda satu huruf, tidak ada error kompilasi apa pun: Kotlin compile lulus,
# C++ compile lulus, CI build lulus — aplikasi baru crash
# `UnsatisfiedLinkError` saat fungsi itu pertama dipanggil di device.
#
# scripts/check_jni_pairs.py sudah memeriksa pasangan ini di level SOURCE
# (.kt vs .cpp). Skrip ini memeriksa level ARTEFAK: apakah simbol itu
# benar-benar ada di .so yang dikemas ke dalam APK. Itu menangkap kasus
# yang tidak terlihat di source, mis. file .cpp yang hilang dari build
# (contoh yang pernah tertangkap: modul dormant NativePristineAudio, yang
# 7 simbol JNI-nya tidak ada di .so — modul itu sudah dihapus, B12-NPA).
#
# PEMAKAIAN
# ---------
#   bash scripts/check-jni-symbols.sh <libpristine-audio.so> [...]
#   bash scripts/check-jni-symbols.sh --java-dir <dir> <libpristine-audio.so>
#   bash scripts/check-jni-symbols.sh            # default: ekstrak .so dari
#                                                # android/app/build/outputs/apk/debug/app-debug.apk
#                                                # (semua ABI di APK diperiksa)
#
#   LLVM_NM / --nm <path>  : paksa path llvm-nm tertentu (untuk tes lokal).
#
# llvm-nm dicari dengan urutan: $LLVM_NM, $ANDROID_NDK_HOME,
# $ANDROID_NDK_ROOT, $ANDROID_HOME/ndk/*, $ANDROID_SDK_ROOT/ndk/*,
# $ANDROID_SDK_HOME/ndk/*, lalu `llvm-nm` di PATH. Bila tidak ketemu,
# skrip gagal dengan pesan jelas (exit 2) — bukan lulus diam-diam.
#
# KELUAR
# ------
#   0  semua `external fun` punya simbol di setiap .so yang diperiksa
#   1  ada simbol yang hilang (daftar dicetak; build harus digagalkan)
#   2  kesalahan pemakaian / lingkungan (llvm-nm tidak ketemu, .so tidak
#      ada, tidak ada `external fun` yang ditemukan, dsb.)
#
# ATURAN MANGGLING JNI YANG DIPAKAI
# ---------------------------------
#   Java_<paket>_<Kelas>_<method>            (tanpa overload)
#   Java_<paket>_<Kelas>_<method>__<argumen>  (overload; lihat bawah)
# dengan escape:  _ -> _1,  $ -> _00024,  . -> _
# (di dalam argumen:  ; -> _2,  [ -> _3,  / -> _).
#
# Dua hal yang diverifikasi terhadap APK build 43341317484 (bukan asumsi):
#  - `external fun` di dalam `companion object` TANPA @JvmStatic tetap
#    dideklarasikan di kelas LUAR (method_ids classes.dex), jadi simbolnya
#    memakai nama kelas luar — bukan `..._00024Companion_...`.
#  - Simbol `Java_` di .so cocok 1:1 dengan daftar ini. Dulu ada pengecualian
#    7 simbol milik NativePristineAudio yang TIDAK ADA di .so (JNI C++-nya
#    sudah dihapus di ronde 1, J-M4; modulnya dormant) — gate ini sengaja
#    dibuat untuk menangkap tepat kasus seperti itu, bukan untuk diloloskan
#    diam-diam, dan kasus itu ditutup dengan menghapus modulnya (B12-NPA).
#    (check_jni_pairs.py sudah melaporkan hal yang sama di level source.)
#
# OVERLOAD
# --------
# Bila satu kelas punya dua `external fun` dengan nama sama (overload),
# JVM memakai bentuk panjang `__<argumen>`; bentuk pendek saja tidak cukup
# (ambigu). Skrip menghitung bentuk panjang dari tipe parameter Kotlin
# (primitif, String, Array<T>/XArray, dan kelas kustom yang bisa
# diselesaikan lewat import file itu atau paket yang sama). Bila ada tipe
# parameter yang tidak bisa dipetakan, skrip menerima bentuk pendek ATAU
# bentuk panjang apa pun (`Java_..._<method>__*`) dan mencetak peringatan
# — dengan begitu overload yang tidak bisa diverifikasi tidak memblokir
# build karena keterbatasan parser, tapi tetap tercatat.
# Saat ini TIDAK ADA overload di codebase (0 dari 56 external fun), jadi
# jalur ini belum teruji terhadap kode nyata — hanya terhadap fixture
# sintetis (lihat catatan uji di bawah).
#
# BATASAN PARSER (didokumentasikan, bukan disembunyikan)
# ------------------------------------------------------
#  - Parser .kt ini sederhana: string "..." dan komentar // dihapus
#    sebelum menghitung kurung kurawal; string multi-baris """..."""
#    TIDAK didukung.
#  - `external fun` harus satu baris (nama + daftar parameter), dan tidak
#    boleh satu baris dengan kurung buka deklarasi kelas/objeknya.
#  - Tipe parameter kustom yang tidak di-import dan bukan satu paket
#    dengan file-nya tidak bisa dipetakan; function type, generic
#    (selain Array<T>), dan parameter bertipe nested class juga tidak
#    bisa dipetakan (hanya berpengaruh pada perhitungan bentuk panjang
#    overload — skrip lalu memakai aturan prefix, lihat OVERLOAD).
#  - Simbol ekstra di .so (ada di .so tapi tidak ada `external fun`-nya,
#    mis. setNativeDSPEnabled/setNativeImmersiveEnabled yang sudah mati)
#    hanya dilaporkan sebagai INFO — tidak menggagalkan.
#
# UJI LOKAL (VM tanpa NDK — llvm-nm asli tidak ada)
# -------------------------------------------------
#   LLVM_NM=nm bash scripts/check-jni-symbols.sh <file.so>
# (GNU nm -D mencetak format yang sama untuk keperluan skrip ini.)
# Diuji 2026-11-13: .so dummy (gcc) + .so asli dari APK 43341317484 —
# lihat laporan commit B12-W10. Gate penuhnya adalah build GitHub Actions.
#
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname -- "$SCRIPT_DIR")"
JAVA_DIR_DEFAULT="$REPO_ROOT/android/app/src/main/java"
APK_DEFAULT="$REPO_ROOT/android/app/build/outputs/apk/debug/app-debug.apk"

JAVA_DIR="$JAVA_DIR_DEFAULT"
LLVM_NM_OVERRIDE="${LLVM_NM:-}"
SO_FILES=()

usage() {
    cat <<EOF
Pemakaian: $(basename -- "$0") [--java-dir DIR] [--nm PATH] <libpristine-audio.so> [...]
         $(basename -- "$0") [--java-dir DIR] [--nm PATH]
           (tanpa argumen .so: ekstrak libpristine-audio.so dari $APK_DEFAULT)

  --java-dir DIR  direktori sumber .kt (default: android/app/src/main/java)
  --nm PATH       paksa path llvm-nm (atau set env LLVM_NM)
  -h, --help      tampilkan bantuan ini
EOF
}

die() {
    echo "check-jni-symbols: ERROR: $*" >&2
    exit 2
}

# ---------------------------------------------------------------------------
# Cari llvm-nm dari NDK toolchain.
# ---------------------------------------------------------------------------
find_llvm_nm() {
    local candidate ndk_dir
    if [ -n "$LLVM_NM_OVERRIDE" ]; then
        case "$LLVM_NM_OVERRIDE" in
            */*)
                [ -x "$LLVM_NM_OVERRIDE" ] || die "LLVM_NM/--nm '$LLVM_NM_OVERRIDE' tidak bisa dieksekusi"
                ;;
            *)
                resolved="$(command -v "$LLVM_NM_OVERRIDE" || true)"
                [ -n "$resolved" ] || die "LLVM_NM/--nm '$LLVM_NM_OVERRIDE' tidak ditemukan di PATH"
                LLVM_NM_OVERRIDE="$resolved"
                ;;
        esac
        echo "$LLVM_NM_OVERRIDE"
        return 0
    fi
    # $ANDROID_NDK_HOME / $ANDROID_NDK_ROOT menunjuk root NDK.
    for ndk_dir in "${ANDROID_NDK_HOME:-}" "${ANDROID_NDK_ROOT:-}"; do
        [ -n "$ndk_dir" ] || continue
        for candidate in "$ndk_dir"/toolchains/llvm/prebuilt/*/bin/llvm-nm; do
            [ -x "$candidate" ] && { echo "$candidate"; return 0; }
        done
    done
    # Cari di dalam SDK: $ANDROID_HOME/ndk/<versi>/... (versi terbaru dulu).
    local sdk_dir
    for sdk_dir in "${ANDROID_HOME:-}" "${ANDROID_SDK_ROOT:-}" "${ANDROID_SDK_HOME:-}"; do
        [ -n "$sdk_dir" ] || continue
        [ -d "$sdk_dir/ndk" ] || continue
        while IFS= read -r ndk_dir; do
            for candidate in "$ndk_dir"/toolchains/llvm/prebuilt/*/bin/llvm-nm; do
                [ -x "$candidate" ] && { echo "$candidate"; return 0; }
            done
        done < <(printf '%s\n' "$sdk_dir"/ndk/*/ | sort -Vr)
    done
    if command -v llvm-nm >/dev/null 2>&1; then
        command -v llvm-nm
        return 0
    fi
    cat >&2 <<'EOF'
check-jni-symbols: ERROR: llvm-nm tidak ditemukan.
  Skrip ini butuh llvm-nm dari Android NDK untuk membaca simbol .so.
  Di runner GitHub Actions, NDK diinstal langkah "Install NDK + CMake"
  (build-dev.yml) dan ditemukan lewat $ANDROID_HOME/ndk/*.
  Lokal: set ANDROID_NDK_HOME, atau ANDROID_HOME, atau beri path eksplisit:
    LLVM_NM=/path/ke/llvm-nm bash scripts/check-jni-symbols.sh <file.so>
  (Tes logika parsing tanpa NDK: LLVM_NM=nm ... — lihat header skrip.)
EOF
    exit 2
}

# ---------------------------------------------------------------------------
# Parser .kt (awk POSIX): keluarkan baris
#   IMPORT<TAB><file-rel><TAB><nama-sederhana><TAB><nama-lengkap>
#   FUN<TAB><file-rel><TAB><paket.Kelas$Dalam><TAB><method><TAB><tipe1|tipe2|...>
# ---------------------------------------------------------------------------
KT_PARSER=$(cat <<'AWK'
function strip_code(s,   out, i, c) {
    # Hapus string "..." dan komentar // sebelum hitung kurung kurawal.
    # (Batasan: string multi-baris """...""" tidak didukung.)
    out = ""
    in_str = 0
    for (i = 1; i <= length(s); i++) {
        c = substr(s, i, 1)
        if (in_str) {
            if (c == "\\") { i++; continue }
            if (c == "\"") in_str = 0
            continue
        }
        if (c == "\"") { in_str = 1; continue }
        if (c == "/" && substr(s, i + 1, 1) == "/") break
        out = out c
    }
    return out
}
function trim(s) {
    gsub(/^[ \t]+|[ \t]+$/, "", s)
    return s
}
function param_type(p,   t) {
    p = trim(p)
    sub(/^vararg[ \t]+/, "", p)
    if (p ~ /:/) t = substr(p, index(p, ":") + 1)
    else t = p
    t = trim(t)
    sub(/[ \t]*=.*$/, "", t)
    sub(/\?$/, "", t)
    return trim(t)
}
function split_params(s, arr,   n, cur, i, c, d) {
    # Pisah parameter pada koma di luar <...>.
    n = 0; cur = ""; d = 0
    for (i = 1; i <= length(s); i++) {
        c = substr(s, i, 1)
        if (c == "<") d++
        else if (c == ">") d--
        else if (c == "," && d == 0) { n++; arr[n] = cur; cur = ""; continue }
        cur = cur c
    }
    if (trim(cur) != "" || n > 0) { n++; arr[n] = cur }
    return n
}
function resolve_class(   cls, i) {
    # Tumpukan deklarasi terluar -> terdalam; "companion" dilewati
    # (external fun di companion object dideklarasikan di kelas luar —
    # terverifikasi dari classes.dex APK 43341317484).
    cls = ""
    for (i = sp; i >= 1; i--) {
        if (st_name[i] == "companion") continue
        cls = (cls == "" ? st_name[i] : st_name[i] "$" cls)
    }
    if (cls == "") cls = top_class
    if (pkg != "") return pkg "." cls
    return cls
}
BEGIN { pkg = ""; top_class = ""; sp = 0; pending = ""; depth = 0 }
/^package[ \t]/ { pkg = $2; next }
/^import[ \t]/ {
    line = $0
    sub(/^import[ \t]+/, "", line)
    if (line ~ /[ \t]+as[ \t]+/) {
        n = split(line, parts, /[ \t]+as[ \t]+/)
        print "IMPORT\t" FILENAME_REL "\t" parts[2] "\t" parts[1]
    } else {
        n = split(line, parts, ".")
        print "IMPORT\t" FILENAME_REL "\t" parts[n] "\t" line
    }
    next
}
{
    code = strip_code($0)
    # Deklarasi kelas/objek tertunda (header bisa multi-baris; '{' bisa
    # di baris berikutnya).
    if (match(code, /^[ \t]*([A-Za-z_]+[ \t]+)*(class|object)[ \t]+[A-Za-z_][A-Za-z0-9_]*/)) {
        decl = trim(substr(code, RSTART, RLENGTH))
        nw = split(decl, w, /[ \t]+/)
        pending = w[nw]
        if (depth == 0 && top_class == "") top_class = pending
    } else if (code ~ /^[ \t]*companion[ \t]+object/) {
        pending = "companion"
    }
    # external fun (harus satu baris — lihat batasan di header skrip).
    if (match(code, /external[ \t]+fun[ \t]+[A-Za-z_][A-Za-z0-9_]*/)) {
        decl = substr(code, RSTART, RLENGTH)
        nw = split(decl, w, /[ \t]+/)
        mname = w[nw]
        rest = substr(code, RSTART + RLENGTH)
        params = ""
        p1 = index(rest, "(")
        if (p1 > 0) {
            d = 0
            for (i = p1; i <= length(rest); i++) {
                c = substr(rest, i, 1)
                if (c == "(") d++
                else if (c == ")") {
                    d--
                    if (d == 0) { params = substr(rest, p1 + 1, i - p1 - 1); break }
                }
            }
        }
        np = split_params(params, parr)
        plist = ""
        for (k = 1; k <= np; k++) {
            t = param_type(parr[k])
            plist = (plist == "" ? t : plist "|" t)
        }
        print "FUN\t" FILENAME_REL "\t" resolve_class() "\t" mname "\t" plist
    }
    # Akuntansi kurung kurawal + tumpukan deklarasi.
    c1 = code; n_open = gsub(/\{/, "{", c1)
    c2 = code; n_close = gsub(/\}/, "}", c2)
    if (pending != "" && n_open > 0) {
        sp++
        st_name[sp] = pending
        st_depth[sp] = depth + n_open
        pending = ""
    }
    depth += n_open - n_close
    while (sp > 0 && st_depth[sp] > depth) sp--
}
AWK
)

# ---------------------------------------------------------------------------
# Argumen.
# ---------------------------------------------------------------------------
while [ $# -gt 0 ]; do
    case "$1" in
        --java-dir) [ $# -ge 2 ] || die "--java-dir butuh argumen"; JAVA_DIR="$2"; shift 2 ;;
        --java-dir=*) JAVA_DIR="${1#--java-dir=}"; shift ;;
        --nm) [ $# -ge 2 ] || die "--nm butuh argumen"; LLVM_NM_OVERRIDE="$2"; shift 2 ;;
        --nm=*) LLVM_NM_OVERRIDE="${1#--nm=}"; shift ;;
        -h|--help) usage; exit 0 ;;
        --) shift; while [ $# -gt 0 ]; do SO_FILES+=("$1"); shift; done; break ;;
        -*) die "opsi tidak dikenal: $1 (lihat --help)" ;;
        *) SO_FILES+=("$1"); shift ;;
    esac
done

[ -d "$JAVA_DIR" ] || die "direktori .kt tidak ditemukan: $JAVA_DIR"
JAVA_DIR="${JAVA_DIR%/}"

TMPDIR_EXTRACT=""
if [ "${#SO_FILES[@]}" -eq 0 ]; then
    # Default: ekstrak .so dari APK debug hasil build.
    [ -f "$APK_DEFAULT" ] || {
        echo "check-jni-symbols: ERROR: tidak ada argumen .so dan APK default tidak ditemukan:" >&2
        echo "  $APK_DEFAULT" >&2
        echo "Beri path .so, atau build dulu (./gradlew assembleDebug)." >&2
        usage >&2
        exit 2
    }
    command -v unzip >/dev/null 2>&1 || die "'unzip' tidak ditemukan (dibutuhkan untuk mengekstrak .so dari APK)"
    TMPDIR_EXTRACT="$(mktemp -d)"
    unzip -o -q "$APK_DEFAULT" "lib/*/libpristine-audio.so" -d "$TMPDIR_EXTRACT" \
        || die "gagal mengekstrak libpristine-audio.so dari $APK_DEFAULT"
    for so in "$TMPDIR_EXTRACT"/lib/*/libpristine-audio.so; do
        [ -e "$so" ] && SO_FILES+=("$so")
    done
    [ "${#SO_FILES[@]}" -gt 0 ] || die "tidak ada libpristine-audio.so di dalam $APK_DEFAULT"
fi

for so in "${SO_FILES[@]}"; do
    [ -f "$so" ] || die "file .so tidak ditemukan: $so"
done

LLVM_NM="$(find_llvm_nm)" || exit 2
NM_TMP="$(mktemp)"
trap 'rm -f "$NM_TMP" "$NM_TMP.err"; [ -n "${TMPDIR_EXTRACT:-}" ] && rm -rf "$TMPDIR_EXTRACT"' EXIT

# ---------------------------------------------------------------------------
# Kumpulkan `external fun` dari semua .kt.
# ---------------------------------------------------------------------------
declare -A IMPORTS=()          # "file|NamaSederhana" -> nama lengkap
declare -A OVERLOAD_COUNT=()   # "Kelas|method" -> jumlah kemunculan
declare -A METHOD_PARAMS=()    # "Kelas|method#i" -> "Tipe1|Tipe2"
declare -A METHOD_FILE=()      # "Kelas|method#i" -> file-rel (resolusi import)
declare -a METHOD_KEYS=()      # kunci unik "Kelas|method" (urutan stabil)
KT_FILES=0
FUN_COUNT=0

while IFS= read -r -d '' kt; do
    KT_FILES=$((KT_FILES + 1))
    rel="${kt#"$JAVA_DIR"/}"
    while IFS=$'\t' read -r tag f1 f2 f3 f4; do
        case "$tag" in
            IMPORT)
                IMPORTS["$f1|$f2"]="$f3"
                ;;
            FUN)
                FUN_COUNT=$((FUN_COUNT + 1))
                key="$f2|$f3"
                if [ -z "${OVERLOAD_COUNT[$key]:-}" ]; then
                    OVERLOAD_COUNT["$key"]=1
                    METHOD_KEYS+=("$key")
                else
                    OVERLOAD_COUNT["$key"]=$((OVERLOAD_COUNT["$key"] + 1))
                fi
                idx="${OVERLOAD_COUNT[$key]}"
                METHOD_PARAMS["$key#$idx"]="$f4"
                METHOD_FILE["$key#$idx"]="$f1"
                ;;
        esac
    done < <(awk -v FILENAME_REL="$rel" "$KT_PARSER" "$kt")
done < <(find "$JAVA_DIR" -name '*.kt' -type f -print0 | sort -z)

[ "$KT_FILES" -gt 0 ] || die "tidak ada file .kt di $JAVA_DIR"
[ "$FUN_COUNT" -gt 0 ] || die "tidak ada 'external fun' yang ditemukan di $JAVA_DIR (cek parser / direktori)"

# ---------------------------------------------------------------------------
# Mangling JNI.
# ---------------------------------------------------------------------------
# Escape untuk nama paket/kelas/method: _ -> _1, $ -> _00024, . -> _
# (urutan penting: '_' dulu supaya '_' dari _00024 tidak ikut di-escape).
jni_escape_name() {
    local s="$1"
    s="${s//_/_1}"
    s="${s//\$/_00024}"
    s="${s//./_}"
    echo "$s"
}

# Escape untuk deskriptor argumen bentuk panjang: ; -> _2, [ -> _3, / -> _
jni_escape_sig() {
    local s="$1"
    s="${s//_/_1}"
    s="${s//;/_2}"
    s="${s//\[/_3}"
    s="${s//\//_}"
    echo "$s"
}

# Selesaikan nama kelas sederhana -> nama lengkap (paket) untuk deskriptor.
# $1 = tipe, $2 = file-rel. Gagal (return 1) bila tidak bisa diselesaikan.
resolve_fqcn() {
    local t="$1" file="$2"
    case "$t" in
        *.*) echo "$t"; return 0 ;;
    esac
    if [ -n "${IMPORTS["$file|$t"]:-}" ]; then
        echo "${IMPORTS["$file|$t"]}"
        return 0
    fi
    # Asumsi: kelas satu paket dengan file-nya.
    local cls="${METHOD_CLASS:-}"
    local pkg="${cls%.*}"
    if [ "$pkg" != "$cls" ]; then
        echo "$pkg.$t"
        return 0
    fi
    return 1
}

# $1 = tipe Kotlin, $2 = file-rel -> deskriptor JNI (atau gagal return 1).
kotlin_type_to_desc() {
    local t="$1" file="$2" inner fq
    t="${t%\?}"
    case "$t" in
        Boolean) echo "Z"; return 0 ;;
        Byte)    echo "B"; return 0 ;;
        Char)    echo "C"; return 0 ;;
        Short)   echo "S"; return 0 ;;
        Int)     echo "I"; return 0 ;;
        Long)    echo "J"; return 0 ;;
        Float)   echo "F"; return 0 ;;
        Double)  echo "D"; return 0 ;;
        Unit)    echo "V"; return 0 ;;
        String)  echo "Ljava/lang/String;"; return 0 ;;
        Any)     echo "Ljava/lang/Object;"; return 0 ;;
        IntArray)     echo "[I"; return 0 ;;
        LongArray)    echo "[J"; return 0 ;;
        FloatArray)   echo "[F"; return 0 ;;
        DoubleArray)  echo "[D"; return 0 ;;
        BooleanArray) echo "[Z"; return 0 ;;
        ByteArray)    echo "[B"; return 0 ;;
        CharArray)    echo "[C"; return 0 ;;
        ShortArray)   echo "[S"; return 0 ;;
        Array\<*\>)
            inner="${t#Array<}"
            inner="${inner%>}"
            case "$inner" in
                String) echo "[Ljava/lang/String;"; return 0 ;;
                Any)    echo "[Ljava/lang/Object;"; return 0 ;;
            esac
            # Hanya nama kelas sederhana / FQCN yang bisa dipetakan;
            # function type, generic lain, dsb. -> tidak bisa dihitung.
            [[ "$inner" =~ ^[A-Za-z_][A-Za-z0-9_.]*$ ]] || return 1
            fq="$(resolve_fqcn "$inner" "$file")" || return 1
            echo "[L${fq//./\/};"
            return 0
            ;;
        *)
            # Hanya nama kelas sederhana / FQCN yang bisa dipetakan.
            [[ "$t" =~ ^[A-Za-z_][A-Za-z0-9_.]*$ ]] || return 1
            fq="$(resolve_fqcn "$t" "$file")" || return 1
            echo "L${fq//./\/};"
            return 0
            ;;
    esac
}

# ---------------------------------------------------------------------------
# Bangun grup simbol yang diharapkan.
# Tiap grup = satu (kelas, method); grup lolos bila SALAH SATU simbol
# yang diterimanya ada di .so. Grup overload tanpa tipe yang bisa
# dipetakan memakai aturan PREFIX (bentuk pendek ATAU bentuk panjang apa pun).
# ---------------------------------------------------------------------------
declare -a GROUP_LABELS=()    # label manusiawi, mis. Kelas.method(Int)
declare -a GROUP_ACCEPT=()    # simbol yang diterima, dipisah spasi
declare -a GROUP_PREFIX=()    # prefix bentuk panjang (atau "" bila tidak ada)
declare -A EXPECTED_ALL=()    # semua simbol bentuk pendek/panjang yg dikenal
WARN_OVERLOAD_UNRESOLVED=0

for key in "${METHOD_KEYS[@]}"; do
    cls="${key%%|*}"
    method="${key#*|}"
    count="${OVERLOAD_COUNT[$key]}"
    base="Java_$(jni_escape_name "$cls")_$(jni_escape_name "$method")"
    METHOD_CLASS="$cls"
    if [ "$count" -eq 1 ]; then
        plist="${METHOD_PARAMS["$key#1"]}"
        label="$cls.$method(${plist//|/, })"
        GROUP_LABELS+=("$label")
        GROUP_ACCEPT+=("$base")
        GROUP_PREFIX+=("")
        EXPECTED_ALL["$base"]=1
    else
        # Overload: hitung bentuk panjang tiap kemunculan.
        accept="$base"   # bentuk pendek tetap diterima (ART mencoba itu dulu)
        prefix="${base}__"
        long_ok=1
        label="$cls.$method (overload x$count):"
        for ((i = 1; i <= count; i++)); do
            plist="${METHOD_PARAMS["$key#$i"]}"
            file="${METHOD_FILE["$key#$i"]}"
            sig=""
            sig_ok=1
            if [ -n "$plist" ]; then
                IFS='|' read -r -a types <<< "$plist"
                for t in "${types[@]}"; do
                    d="$(kotlin_type_to_desc "$t" "$file")" || { sig_ok=0; break; }
                    sig="$sig$d"
                done
            fi
            if [ "$sig_ok" -eq 1 ]; then
                long_symbol="${base}__$(jni_escape_sig "$sig")"
                accept="$accept $long_symbol"
                EXPECTED_ALL["$long_symbol"]=1
            else
                long_ok=0
            fi
        done
        # Label ringkas: satu baris per kemunculan.
        label="$cls.$method (overload x$count):"
        for ((i = 1; i <= count; i++)); do
            plist="${METHOD_PARAMS["$key#$i"]}"
            label="$label $method(${plist//|/, });"
        done
        GROUP_LABELS+=("$label")
        GROUP_ACCEPT+=("$accept")
        EXPECTED_ALL["$base"]=1
        if [ "$long_ok" -eq 1 ]; then
            GROUP_PREFIX+=("")
        else
            GROUP_PREFIX+=("$prefix")
            WARN_OVERLOAD_UNRESOLVED=1
        fi
    fi
done

echo "== Cek simbol JNI =="
echo "Kotlin : $FUN_COUNT external fun dari $KT_FILES file .kt (${#METHOD_KEYS[@]} method unik)"
echo "llvm-nm: $LLVM_NM"
[ "$WARN_OVERLOAD_UNRESOLVED" -eq 1 ] && echo "PERINGATAN: ada overload yang tipe parameternya tidak bisa dipetakan — bentuk panjangnya tidak diverifikasi (hanya bentuk pendek / prefix __*)"
echo

OVERALL_FAIL=0
for so in "${SO_FILES[@]}"; do
    echo "--- $so"
    if ! "$LLVM_NM" -D --defined-only "$so" >"$NM_TMP" 2>"$NM_TMP.err"; then
        echo "check-jni-symbols: ERROR: llvm-nm gagal membaca $so (bukan file .so yang valid?)" >&2
        cat "$NM_TMP.err" >&2
        exit 2
    fi
    mapfile -t SO_SYMBOLS < <(awk '{print $NF}' "$NM_TMP" | grep '^Java_' | sort -u || true)
    declare -A HAVE=()
    for s in "${SO_SYMBOLS[@]}"; do HAVE["$s"]=1; done
    echo "  simbol Java_ di .so: ${#SO_SYMBOLS[@]}"

    missing=()
    for ((g = 0; g < ${#GROUP_LABELS[@]}; g++)); do
        found=0
        for sym in ${GROUP_ACCEPT[$g]}; do
            if [ -n "${HAVE[$sym]:-}" ]; then found=1; break; fi
        done
        if [ "$found" -eq 0 ] && [ -n "${GROUP_PREFIX[$g]}" ]; then
            for s in "${SO_SYMBOLS[@]}"; do
                case "$s" in
                    "${GROUP_PREFIX[$g]}"*) found=1; break ;;
                esac
            done
        fi
        if [ "$found" -eq 0 ]; then
            missing+=("${GROUP_LABELS[$g]}  ->  ${GROUP_ACCEPT[$g]}")
        fi
    done

    if [ "${#missing[@]}" -gt 0 ]; then
        OVERALL_FAIL=1
        echo "  HILANG (${#missing[@]}):"
        for m in "${missing[@]}"; do echo "    - $m"; done
    else
        echo "  OK: semua ${#GROUP_LABELS[@]} simbol ditemukan"
    fi

    # Simbol ekstra: ada di .so, tidak ada external fun-nya (info saja).
    extras=()
    for s in "${SO_SYMBOLS[@]}"; do
        if [ -z "${EXPECTED_ALL[$s]:-}" ]; then
            is_prefix=0
            for ((g = 0; g < ${#GROUP_LABELS[@]}; g++)); do
                if [ -n "${GROUP_PREFIX[$g]}" ]; then
                    case "$s" in
                        "${GROUP_PREFIX[$g]}"*) is_prefix=1; break ;;
                    esac
                fi
            done
            [ "$is_prefix" -eq 0 ] && extras+=("$s")
        fi
    done
    if [ "${#extras[@]}" -gt 0 ]; then
        echo "  INFO: simbol ekstra di .so (tidak ada external fun-nya; tidak digagalkan):"
        for e in "${extras[@]}"; do echo "    - $e"; done
    fi
    unset HAVE
    echo
done

if [ "$OVERALL_FAIL" -ne 0 ]; then
    echo "GAGAL: ada external fun Kotlin tanpa simbol JNI di .so."
    echo "Di runtime ini berarti UnsatisfiedLinkError saat fungsi itu dipanggil."
    echo "Perbaiki nama di Kotlin/C++, atau hapus/implementasikan modul yang"
    echo "bersangkutan — jangan loloskan gate ini dengan allowlist diam-diam."
    exit 1
fi

echo "LOLOS: semua $FUN_COUNT external fun punya simbol JNI di ${#SO_FILES[@]} file .so."
exit 0
