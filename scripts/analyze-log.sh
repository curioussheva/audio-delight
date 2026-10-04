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
#   - logcat -G 16M gagal, buffer tetap 256 KiB (~17 detik di device ini)
#
# Jadi `logcat` dari Termux TIDAK BISA menangkap log PristineAudio.
# Yang bisa: expor dari aplikasi Logcat Reader (com.dp.logcatapp) ke
# /sdcard/Download, lalu analisis filenya di sini. Termux bisa membaca dan
# menulis /sdcard/Download (terverifikasi). /sdcard/Android/data terkunci.
#
# FORMAT FILE - PENTING
# ---------------------
# Ekspor Logcat Reader BERBEDA dari logcat standar. Header dan isi pesan
# ada di BARIS TERPISAH, dan UID ada di header (bukan hanya PID):
#
#   [2026-10-04 11:40:15.293 Uid(value=10506):31696:8981 D/AudioTrackImpl]
#   [audioTrackData][zero] 34s(...) : pid 31696 uid 10506 sessionId 19521
#
# Parser di sini menangani kedua format: header+body terpisah (reader) dan
# satu baris per entri (logcat standar). UID aplikasi dideteksi otomatis
# dengan mencari nama paket di isi pesan.
#
# PEMAKAIAN
# ---------
#   ./scripts/analyze-log.sh                       # expor terbaru di Download
#   ./scripts/analyze-log.sh <file>                 # ringkasan + error
#   ./scripts/analyze-log.sh <file> app             # ringkasan + error aplikasi
#   ./scripts/analyze-log.sh <file> boot            # urutan boot
#   ./scripts/analyze-log.sh <file> playback        # jalur audio/playback
#   ./scripts/analyze-log.sh <file> audio           # timeline AudioTrack
#   ./scripts/analyze-log.sh <file> errors          # ERROR/WARN dari app
#   ./scripts/analyze-log.sh <file> crashes         # crash + konteksnya
#   ./scripts/analyze-log.sh <file> tags            # frekuensi tag per UID
#   ./scripts/analyze-log.sh <file> uids            # UID mana milik aplikasi apa
#   ./scripts/analyze-log.sh <file> gaps            # tag diharapkan vs hilang
#   ./scripts/analyze-log.sh <file> all             # semua entri app
#   ./scripts/analyze-log.sh <file> grep POLA       # cari pola kustom
#
# `gaps` membandingkan tag yang SEHARUSNYA muncul dengan yang benar-benar ada.
# Tag yang hilang = kandidat silent wiring gap (docs/TROUBLESHOOTING.md pola
# #9), TAPI bisa juga wajar kalau fiturnya tidak dipakai di sesi itu.

set -uo pipefail

DL="/sdcard/Download"
APP_PKG="${APP_PKG:-com.pristineaudio.app}"

c_head() { printf '\n\033[1m=== %s ===\033[0m\n' "$*"; }
c_ok()   { printf '\033[32m%s\033[0m\n' "$*"; }
c_warn() { printf '\033[33m%s\033[0m\n' "$*"; }
c_err()  { printf '\033[31m%s\033[0m\n' "$*"; }
c_dim()  { printf '\033[2m%s\033[0m\n' "$*"; }

newest_export() {
  find "$DL" -maxdepth 1 -type f \
    \( -iname "*logcat*" -o -iname "*log*.txt" -o -iname "*.log" \) 2>/dev/null \
    | while read -r f; do printf '%s\t%s\n' "$(stat -c %Y "$f" 2>/dev/null)" "$f"; done \
    | sort -rn | head -1 | cut -f2-
}

usage() {
  cat <<'EOF'
analyze-log.sh - analisis log PristineAudio hasil expor Logcat Reader

  analyze-log.sh [file] [mode]

  file  opsional; default = expor terbaru di /sdcard/Download
  mode  app | boot | playback | audio | errors | crashes | tags | uids
        | gaps | all | grep POLA

Alur: expor log dari Logcat Reader ke Download, lalu jalankan script ini.
EOF
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then usage; exit 0; fi

# Argumen bisa (file, mode, pola) atau (mode, pola) saja.
if [ -n "${1:-}" ] && [ -f "${1:-}" ]; then
  LOG="$1"; MODE="${2:-app}"; ARG="${3:-}"
else
  MODE="${1:-app}"; ARG="${2:-}"
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

# -------------------------------------------------------------------------
# Parsing sekali ke TSV: ts <TAB> uid <TAB> pid <TAB> level <TAB> tag <TAB> pesan
# Mode-mode di bawah lalu memakai awk/grep biasa dengan cepat.
# -------------------------------------------------------------------------
TSV="$(mktemp -t pristine-log-XXXXXX)"
trap 'rm -f "$TSV"' EXIT

python3 - "$LOG" > "$TSV" <<'PYEOF'
import re, sys

path = sys.argv[1]
# Format Logcat Reader: header dan body di baris terpisah
HDR = re.compile(r"^\[(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d+) Uid\(value=(\d+)\):(\d+):(\d+) ([VDIWEFA])/([^\]]+)\]\s*$")
# Format logcat standar: semuanya satu baris
STD = re.compile(r"^(\d\d-\d\d \d\d:\d\d:\d\d\.\d+)\s+(\d+)\s+(\d+)\s+([VDIWEFA])\s+(\S+)\s*:\s*(.*)$")

def clean(s):
    return s.replace("\t", " ").strip()

def emit(ts, uid, pid, lvl, tag, msg):
    print(f"{ts}\t{uid}\t{pid}\t{lvl}\t{clean(tag)}\t{clean(msg)}")

with open(path, encoding="utf-8", errors="replace") as f:
    lines = f.read().split("\n")

i = 0
while i < len(lines):
    ln = lines[i]
    m = HDR.match(ln)
    if m:
        i += 1
        body = lines[i].rstrip() if i < len(lines) else ""
        i += 1
        # gabung baris lanjutan (stack trace, JSON multi-baris) sampai header
        # berikutnya atau baris kosong
        while i < len(lines) and lines[i].strip() and not HDR.match(lines[i]):
            body += " | " + lines[i].strip()
            i += 1
        emit(m.group(1), m.group(2), m.group(3), m.group(5), m.group(6), body)
        continue
    s = STD.match(ln)
    if s:
        emit("20" + s.group(1), "-", s.group(2), s.group(4),
             s.group(5).split(":")[0], s.group(6))
    i += 1
PYEOF

TOTAL="$(wc -l < "$TSV")"
if [ "$TOTAL" -eq 0 ]; then
  c_err "Tidak ada entri yang bisa di-parse. Format file tidak dikenali."
  exit 1
fi

# UID aplikasi. Dua lapis, karena nama paket saja TIDAK cukup:
# log sistem (ActivityManager, uid 1000) juga menyebut nama paket kita dan
# jumlahnya jauh lebih banyak daripada app sendiri. Terbukti 2026-10-04:
#   uid 1000  : 957 sebutan nama paket -> itu sistem, BUKAN app
#   uid 10506 :  90 sebutan nama paket -> ini app yang sebenarnya
#
# Jadi lapis pertama: UID yang memakai tag native khas kita. Tag ini hanya
# bisa datang dari kode aplikasi, jadi tidak mungkin tertukar.
APP_UID="$(
  awk -F'\t' '
    BEGIN { split("PlaybackController NativePlaybackModule PlaybackNativeBridge FFmpegDecoder DecoderWorker AudioCallback AudioSession SincResampler AudioStreamController NativeDSP PristineEngine", a, " "); for (i in a) want[a[i]]=1 }
    want[$5] { c[$2]++ }
    END { for (u in c) print c[u]"\t"u }' "$TSV" | sort -rn | head -1 | cut -f2
)"

# Lapis kedua: kalau tidak ada tag native sama sekali (mis. log hanya JS),
# pakai UID yang pesannya menyebut nama paket, tapi BUKAN uid sistem 1000.
if [ -z "${APP_UID:-}" ]; then
  APP_UID="$(
    awk -F'\t' -v pkg="$APP_PKG" 'index($6, pkg) && $2 != "1000" && $2 != "0" { c[$2]++ } END { for (u in c) print c[u]"\t"u }' "$TSV" \
    | sort -rn | head -1 | cut -f2
  )"
fi

c_head "File: $LOG"
c_dim "$TOTAL entri ter-parse"
if [ -n "${APP_UID:-}" ]; then
  # Buang spasi/CR yang mungkin ikut dari command substitution.
  APP_UID="$(printf '%s' "$APP_UID" | tr -d '[:space:]')"
  c_dim "UID aplikasi ($APP_PKG): $APP_UID"
else
  c_warn "UID aplikasi tidak terdeteksi - nama paket tidak muncul di log."
  c_dim "Mode akan menampilkan seluruh device, bukan hanya app kita."
fi

# Entri aplikasi (kalau UID diketahui), atau semua kalau tidak.
# WAJIB membaca "$TSV" eksplisit: kalau dibiarkan membaca stdin, maka saat
# dipakai di dalam pipeline (mis. `app_rows | awk ...`) awk akan menerima
# stdin dari pipe, BUKAN dari TSV -> hasilnya nol baris tanpa error.
app_rows() {
  if [ -n "${APP_UID:-}" ]; then
    awk -F'\t' -v u="$APP_UID" '$2==u' "$TSV"
  else
    cat "$TSV"
  fi
}

# Cetak TSV jadi baris terbaca.
row() {
  awk -F'\t' '{ printf "%-12s %-2s %-22s %s\n", substr($1,12,12), $4, substr($5,1,22), substr($6,1,125) }'
}

case "$MODE" in
  all)  app_rows | row ;;

  app)
    c_head "Ringkasan per level"
    app_rows | awk -F'\t' '{c[$4]++} END {for (l in c) printf "  %s: %d\n", l, c[l]}' | sort
    c_head "Tag terbanyak (top 25)"
    app_rows | awk -F'\t' '{c[$5]++} END {for (t in c) printf "%8d  %s\n", c[t], t}' | sort -rn | head -25
    c_head "ERROR + WARNING unik"
    app_rows | awk -F'\t' '$4=="E" || $4=="W" {k=substr($6,1,95); seen[k"|"$5]++} END {for (k in seen) printf "%6d\t%s\n", seen[k], k}' \
      | sort -rn | head -25 | awk -F'\t' '{printf "%6d  %s\n", $1, substr($2,1,110)}'
    ;;

  boot)
    c_head "Urutan boot"
    app_rows | awk -F'\t' '$6 ~ /\[BOOT\]|\[DIAG\]|SQLite|Onboarding|useScanManager|UnifiedScan/' | row
    ;;

  playback)
    c_head "Jalur playback (baris AudioCallback berulang diringkas)"
    app_rows | awk -F'\t' '$5 ~ /PlaybackController|FFmpegDecoder|DecoderWorker|NativePlaybackModule|AudioSession|SincResampler|NativeDSP|PlaybackNativeBridge/' | row
    # AudioCallback muncul ~50x/detik dengan pesan identik; tampilkan hanya
    # jumlah dan contoh pertama supaya jalur lain tidak tenggelam.
    ncb="$(app_rows | awk -F'\t' '$5=="AudioCallback"' | wc -l)"
    if [ "$ncb" -gt 0 ]; then
      c_dim "AudioCallback: $ncb baris dengan pesan identik - contoh pertama:"
      app_rows | awk -F'\t' '$5=="AudioCallback"' | head -1 | row
    fi
    ;;

  audio)
    c_head "Timeline AudioTrack (hanya saat status berubah)"
    app_rows | awk -F'\t' '$5=="AudioTrackImpl"' | awk -F'\t' '
      { if (match($6, /\[[a-z]+\]/)) k = substr($6, RSTART, RLENGTH); else k = "?"
        if (k != prev) { printf "%-12s %s\n", substr($1,12,12), substr($6,1,112); prev = k } }'
    c_head "Event playback penting"
    app_rows | awk -F'\t' '$6 ~ /play\(\)|loadTrack|startDecoder|SAMPLE|FORMAT CHECK|setupResampler|workerLoop|Thread priority/' | row
    ;;

  errors)
    c_head "ERROR dari aplikasi (semua)"
    app_rows | awk -F'\t' '$4=="E"' | row
    c_head "WARNING unik dari aplikasi (diringkas)"
    # Warning vendor yang sangat berisik dan tidak ada hubungannya dengan kode
    # kita dibuang: InsetsSource (ratusan baris identik di device ini) dan
    # ViewManagerPropertyUpdater (bawaan RN untuk properti yang tidak punya
    # setter di New Architecture).
    app_rows | awk -F'\t' '$4=="W"' \
      | awk -F'\t' '$5 !~ /^InsetsSource$|^ViewManagerPropertyUpdater$|^RenderInspector$|^HWUI$/ {k=substr($6,1,95)"|"$5; n[k]++} END {for (k in n) printf "%6d\t%s\n", n[k], k}' \
      | sort -rn | head -25 \
      | awk -F'\t' '{printf "%6d  %s\n", $1, substr($2,1,112)}'
    ;;

  crashes)
    c_head "Penanda crash / native abort"
    # 'libc' TIDAK diikutkan: di device ini libc hanya berisi warning vendor
    # ('Access denied finding property ...') yang tidak ada hubungannya dengan
    # crash, dan jumlahnya ribuan.
    if grep -aqP '\t[EF]\t(AndroidRuntime|DEBUG|DEBUGGER|tombstoned)\t|\tF\t' "$TSV"; then
      grep -aP '\t[EF]\t(AndroidRuntime|DEBUG|DEBUGGER|tombstoned)\t|\tF\t' "$TSV" | row | head -40
    else
      c_ok "Tidak ada FATAL EXCEPTION / native abort di rekaman ini."
    fi
    ;;

  tags)
    c_head "Tag terbanyak per UID"
    awk -F'\t' '{c[$2"|"$5]++} END {for (k in c) printf "%9d\t%s\n", c[k], k}' "$TSV" \
      | sort -rn | head -40 \
      | awk -F'\t' '{split($2,a,"|"); printf "%9d  uid %-7s %s\n", $1, a[1], a[2]}'
    ;;

  uids)
    c_head "UID + perkiraan paketnya"
    awk -F'\t' '{c[$2]++} END {for (u in c) printf "%9d\t%s\n", c[u], u}' "$TSV" | sort -rn | head -15 \
      | while IFS=$'\t' read -r n u; do
          pkg="$(awk -F'\t' -v uu="$u" '$2==uu {print $6}' "$TSV" \
                 | grep -aoE '(com|org|host)\.[a-z0-9_.]+' | sort | uniq -c | sort -rn | head -1 | awk '{print $2}')"
          printf "%9d  uid %-7s %s\n" "$n" "$u" "${pkg:-?}"
        done
    ;;

  gaps)
    check_gaps() {
      local label="$1" tags="$2" miss=0
      c_head "Alur $label"
      for t in $(printf '%s' "$tags" | tr '|' ' '); do
        # JANGAN pakai `... | head -1 | grep -q .` di sini: dengan
        # `set -o pipefail`, `head` menutup pipe lebih awal sehingga awk/awk
        # kena SIGPIPE dan pipeline dianggap gagal walau tag-nya ADA.
        # Terbukti: PlaybackController (25.047 baris) dilaporkan HILANG.
        n="$(app_rows | awk -F'\t' -v t="$t" 'index($5,t) || index($6,t)' | wc -l)"
        if [ "$n" -gt 0 ]; then
          printf '  \033[32mADA   \033[0m %-24s %s baris\n' "$t" "$n"
        else
          printf '  \033[33mHILANG\033[0m %-24s\n' "$t"; miss=$((miss+1))
        fi
      done
      [ "$miss" -gt 0 ] && c_dim "  ($miss tag tidak muncul - bisa wajar kalau fiturnya tidak dipakai)"
      return 0
    }
    check_gaps "BOOT"     'BOOT|AudioEngine|AudioSession|PlaybackController|NativePlaybackModule'
    check_gaps "PLAYBACK" 'PlaybackController|FFmpegDecoder|DecoderWorker|AudioCallback|AudioStreamController|SincResampler'
    check_gaps "LIBRARY"  'LibraryScanner|MediaStore|UnifiedScan|ScanQueue|ScanDiffEngine|MetadataEnricher'
    ;;

  grep)  app_rows | awk -F'\t' -v p="$ARG" '$0 ~ p' | row ;;

  *) c_err "Mode tidak dikenal: $MODE"; echo; usage; exit 1 ;;
esac
