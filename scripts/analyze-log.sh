#!/data/data/com.termux/files/usr/bin/bash
#
# analyze-log.sh - analisis file log hasil expor dari aplikasi logcat reader.
#
# KENAPA BEGINI, BUKAN TANGKAP LANGSUNG
# -------------------------------------
# Termux PUNYA biner `logcat` dan bisa membacanya tanpa root, TAPI Android
# membatasi logcat per-UID: aplikasi tanpa izin READ_LOGS hanya melihat log
# dari UID-nya sendiri. Terverifikasi 2026-10-04 pada POCO / Android 16:
#
#   - 0 baris dari aplikasi pihak ketiga mana pun di buffer
#   - 0 baris ActivityTaskManager, padahal sistem selalu menulis semua
#     peluncuran app ke sana
#   - yang terlihat hanya app=com.termux.styling (UID Termux sendiri)
#
# Jadi `logcat` dari Termux TIDAK BISA menangkap log PristineAudio.
# Yang bisa: expor dari aplikasi Logcat Reader (com.dp.logcatapp) ke
# /sdcard/Download, lalu analisis filenya di sini. Termux bisa membaca dan
# menulis /sdcard/Download (terverifikasi). /sdcard/Android/data terkunci.
#
# PEMAKAIAN
# ---------
#   ./scripts/analyze-log.sh                       # pakai expor terbaru di Download
#   ./scripts/analyze-log.sh <file>                 # analisis file tertentu
#   ./scripts/analyze-log.sh <file> boot            # urutan boot
#   ./scripts/analyze-log.sh <file> playback        # jalur playback
#   ./scripts/analyze-log.sh <file> errors          # ERROR/WARN saja
#   ./scripts/analyze-log.sh <file> crashes         # crash + konteksnya
#   ./scripts/analyze-log.sh <file> dsp             # jalur DSP / bit-perfect
#   ./scripts/analyze-log.sh <file> library         # pemindaian library
#   ./scripts/analyze-log.sh <file> gaps            # tag yang DIHARAPKAN tapi hilang
#   ./scripts/analyze-log.sh <file> tags            # tabel frekuensi tag
#   ./scripts/analyze-log.sh <file> all             # semua baris
#   ./scripts/analyze-log.sh <file> grep POLA       # cari pola kustom
#
# `gaps` adalah mode yang paling berharga: ia membandingkan tag yang
# SEHARUSNYA muncul (dari alur boot/playback) dengan yang benar-benar ada.
# Tag yang hilang menandakan silent wiring gap - kode ada tapi tidak
# terpasang - pola debugging #9 di docs/TROUBLESHOOTING.md.

set -uo pipefail

DL="/sdcard/Download"

c_head() { printf '\n\033[1m=== %s ===\033[0m\n' "$*"; }
c_ok()   { printf '\033[32m%s\033[0m\n' "$*"; }
c_warn() { printf '\033[33m%s\033[0m\n' "$*"; }
c_err()  { printf '\033[31m%s\033[0m\n' "$*"; }
c_dim()  { printf '\033[2m%s\033[0m\n' "$*"; }

# Cari file log terbaru di Download.
newest_export() {
  find "$DL" -maxdepth 1 -type f \
    \( -iname "*logcat*" -o -iname "*log*.txt" -o -iname "*.log" \) 2>/dev/null \
    | while read -r f; do printf '%s\t%s\n' "$(stat -c %Y "$f" 2>/dev/null)" "$f"; done \
    | sort -rn | head -1 | cut -f2-
}

# ---- daftar tag, diverifikasi 2026-10-03 dari sumber ----------------------
# ReactNativeJS = tag untuk SEMUA console.log dari JS; pesan kita berprefix
# `[Tag]`. Tag native dari Logger.h / android.util.Log di C++ dan Kotlin.
RE_JS_TAG='\[(BOOT|DIAG|Player|AudioEngine|PERF|LibraryScanner|UnifiedScan|ScanQueue|ScanDiffEngine|MediaStore|MetadataEnricher|MetadataExtractor|VisualizerService|SpectrumAnalyzer|Settings|SQLite|DSP|DSPModule|VisualizerBridge|OnlineMetadata|BackgroundTask|Onboarding|Analyzer|Preset|M3U)\]'
RE_NATIVE='(PlaybackController|NativePlaybackModule|PlaybackNativeBridge|FFmpegDecoder|DecoderWorker|AudioCallback|AudioStreamController|SincResampler|AudioSession|AudioDeviceManager|AudioRouteManager|USBDeviceManager|USBStreamSession|USBDAC|NoisyReceiver|NativeDSP|FFTPlan|PristineEngine|PristineApp|PristineRenderer)'

APP_RE="ReactNativeJS|$RE_NATIVE"

# ---- tag yang DIHARAPKAN pada alur normal --------------------------------
EXPECT_BOOT='BOOT|AudioEngine|AudioSession|PlaybackController|NativePlaybackModule|ReactNativeJS'
EXPECT_PLAYBACK='PlaybackController|FFmpegDecoder|DecoderWorker|AudioCallback|AudioStreamController|AudioEngine|SincResampler|NativePlaybackModule'
EXPECT_LIBRARY='LibraryScanner|MediaStore|UnifiedScan|ScanQueue|ScanDiffEngine|MetadataEnricher'
EXPECT_DSP='DIAG|NativeDSP|PlaybackController'

show() { sed -n '1,400p'; }

mode_all()      { cat "$LOG"; }
mode_filtered() {
  grep -aE "$APP_RE" "$LOG" || {
    c_err "Tidak ada baris dengan tag PristineAudio."
    c_dim "Kemungkinan: file bukan dari app kita, atau log diekspor sebelum app jalan."
    c_dim "Cek dulu: ./scripts/analyze-log.sh '$LOG' tags"
    return 1
  }
}
mode_errors()   { grep -aE "^[0-9-]+ [0-9:.]+ +[0-9]+ +[0-9]+ [EW] " "$LOG" | grep -aE "$APP_RE" ; }
mode_crashes() {
  grep -anE "FATAL EXCEPTION|AndroidRuntime|Fatal signal|SIGSEGV|SIGABRT|backtrace:|beginning of crash" "$LOG" \
    | head -40
}
mode_boot()      { grep -aE "ReactNativeJS: *\[(BOOT|DIAG)\]|$RE_NATIVE" "$LOG" | head -60; }
mode_playback()  { grep -aE "$EXPECT_PLAYBACK" "$LOG"; }
mode_library()   { grep -aE "$EXPECT_LIBRARY" "$LOG"; }
mode_dsp()       { grep -aE "$EXPECT_DSP|BitPerfect|bit-perfect|upsample|resample" "$LOG"; }
mode_grep()      { grep -aE "${2:-}" "$LOG"; }

# Tabel frekuensi tag - berguna untuk tahu file ini isinya apa.
mode_tags() {
  awk '
    /^[0-9]{2}-[0-9]{2} [0-9:.]+ +[0-9]+ +[0-9]+ +[VDIWEFA] +/ {
      match($0, /[VDIWEFA] +[^ ]+ *:/); t=substr($0, RSTART, RLENGTH)
      gsub(/[VDIWEFA] +/, "", t); gsub(/ *:$/, "", t); print t
    }' "$LOG" 2>/dev/null | sort | uniq -c | sort -rn | head -40
}

# Deteksi silent wiring gap: bandingkan tag yang diharapkan vs yang ada.
mode_gaps() {
  local expected="$1" label="$2"
  c_head "$label"
  local missing=0
  local tags; tags="$(printf '%s' "$expected" | tr '|' '\n')"
  while IFS= read -r t; do
    [ -n "$t" ] || continue
    if grep -aqE "$t" "$LOG"; then
      printf '  \033[32mADA   \033[0m %s\n' "$t"
    else
      printf '  \033[33mHILANG\033[0m %s\n' "$t"
      missing=$((missing + 1))
    fi
  done <<< "$tags"
  echo
  if [ "$missing" -eq 0 ]; then
    c_ok "Semua tag alur ini muncul."
  else
    c_warn "$missing tag tidak muncul."
    c_dim "Tag yang hilang = kandidat silent wiring gap (docs/TROUBLESHOOTING.md pola #9),"
    c_dim "TAPI bisa juga wajar: fitur itu mungkin tidak dipakai di sesi ini."
    c_dim "Pastikan dulu aksinya memang dilakukan sebelum menyimpulkan ada bug."
  fi
}

usage() {
  cat <<'EOF'
analyze-log.sh - analisis log PristineAudio hasil expor Logcat Reader

  analyze-log.sh [file] [mode]

  file  opsional; default = expor terbaru di /sdcard/Download
  mode  boot | playback | errors | crashes | dsp | library | tags | gaps | all

Alur: expor log dari Logcat Reader ke Download, lalu jalankan script ini.
EOF
}

# ---------------------------------------------------------------- main
if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then usage; exit 0; fi

# Argumen bisa (file, mode, pola) atau (mode, pola) saja.
if [ -n "${1:-}" ] && [ -f "${1:-}" ]; then
  LOG="$1"; MODE="${2:-filtered}"; ARG="${3:-}"
else
  MODE="${1:-filtered}"; ARG="${2:-}"
  LOG="$(newest_export || true)"
fi

if [ -z "${LOG:-}" ] || [ ! -f "$LOG" ]; then
  c_err "Tidak ada file log."
  echo
  c_dim "Ekspor log dari aplikasi Logcat Reader (com.dp.logcatapp) ke:"
  c_dim "  $DL"
  c_dim "Termux bisa membaca folder itu (terverifikasi)."
  echo
  c_dim "Logcat dari Termux sendiri TIDAK bisa menangkap log app ini -"
  c_dim "Android membatasi logcat per-UID tanpa izin READ_LOGS."
  exit 1
fi

c_head "File: $LOG"
c_dim "$(wc -l < "$LOG") baris, $(du -h "$LOG" | cut -f1), diubah $(date -r "$LOG" '+%Y-%m-%d %H:%M' 2>/dev/null)"

case "$MODE" in
  all)      mode_all ;;
  filtered) mode_filtered ;;
  errors)   mode_errors ;;
  crashes)  mode_crashes ;;
  boot)     mode_boot ;;
  playback) mode_playback ;;
  library)  mode_library ;;
  dsp)      mode_dsp ;;
  tags)     mode_tags ;;
  gaps)
    mode_gaps "$EXPECT_BOOT"    "Alur BOOT"
    mode_gaps "$EXPECT_PLAYBACK" "Alur PLAYBACK"
    mode_gaps "$EXPECT_LIBRARY"  "Alur LIBRARY"
    ;;
  grep)     mode_grep "$LOG" "$ARG" ;;
  *)        c_err "Mode tidak dikenal: $MODE"; echo; usage; exit 1 ;;
esac
