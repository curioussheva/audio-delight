#!/data/data/com.termux/files/usr/bin/bash
# ============================================================================
# metro.sh - kelola sesi Metro dev server PristineAudio dari Termux
# ============================================================================
#
# Kenapa script, bukan langsung `pnpm start`:
#   - Termux tidak punya watchman (lihat metro.config.cjs), jadi Metro harus
#     jalan mode polling. Config sudah menanganinya.
#   - Sesi harus persisten: `pnpm start` di foreground mati begitu terminal
#     ditutup. Script ini memakai tmux supaya sesi bertahan.
#   - Perlu tahu IP LAN yang benar supaya HP bisa menyambung. IP Termux
#     berubah kalau pindah WiFi, jadi dihitung ulang setiap start.
#
# Pemakaian:
#   ./scripts/metro.sh start     # jalankan server di sesi tmux
#   ./scripts/metro.sh status    # cek hidup/tidak + URL
#   ./scripts/metro.sh logs      # ikuti output server
#   ./scripts/metro.sh url       # cetak URL saja
#   ./scripts/metro.sh stop      # hentikan
#   ./scripts/metro.sh restart   # stop + start + clear cache
#   ./scripts/metro.sh doctor    # periksa prasyarat
#
# ============================================================================

set -uo pipefail

SESSION="metro"
PORT="${METRO_PORT:-8081}"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_FILE="$PROJECT_DIR/.metro.log"

# --- utils ------------------------------------------------------------------

c_ok()   { printf '\033[32m%s\033[0m\n' "$*"; }
c_err()  { printf '\033[31m%s\033[0m\n' "$*" >&2; }
c_warn() { printf '\033[33m%s\033[0m\n' "$*"; }
c_dim()  { printf '\033[2m%s\033[0m\n' "$*"; }

have_tmux() { command -v tmux >/dev/null 2>&1; }

get_ip() {
  # Ambil IP LAN (bukan loopback). Urutan: ip route, lalu ifconfig.
  local ip
  ip="$(ip route get 1 2>/dev/null | grep -oE 'src [0-9.]+' | awk '{print $2}' | head -1)"
  if [ -z "$ip" ]; then
    ip="$(ifconfig 2>/dev/null | grep -oE 'inet (192|10|172)\.[0-9.]+' | awk '{print $2}' | grep -v 127.0.0.1 | head -1)"
  fi
  printf '%s' "${ip:-127.0.0.1}"
}

port_busy() {
  (command -v ss >/dev/null 2>&1 && ss -ltn 2>/dev/null | grep -q ":$PORT ") ||
  (command -v netstat >/dev/null 2>&1 && netstat -ltn 2>/dev/null | grep -q ":$PORT ") ||
  (command -v lsof >/dev/null 2>&1 && lsof -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1)
}

server_up() {
  # Server Expo menjawab di /status. Ini bukti hidup yang sebenarnya,
  # bukan sekadar "port terbuka".
  curl -s -m 3 "http://127.0.0.1:$PORT/status" >/dev/null 2>&1
}

print_urls() {
  local ip; ip="$(get_ip)"
  echo
  c_ok "Metro siap dipakai"
  echo "  Lokal    : http://127.0.0.1:$PORT"
  echo "  LAN      : http://$ip:$PORT"
  echo "  Dev menu : exp://$ip:$PORT"
  echo
  c_dim "Isi URL ini di dev-client Expo pada HP (harus satu WiFi dengan $ip)."
  c_dim "Kalau tidak tersambung: buka dev menu > Enter URL manually."
  echo
}

# --- perintah ---------------------------------------------------------------

cmd_doctor() {
  echo "=== Pemeriksaan prasyarat Metro ==="
  local ok=0

  if [ -d "$PROJECT_DIR/node_modules" ]; then
    c_ok "node_modules ada"
  else
    c_err "node_modules TIDAK ada - jalankan: pnpm install"; ok=1
  fi

  if [ -f "$PROJECT_DIR/metro.config.cjs" ]; then
    c_ok "metro.config.cjs ada"
  else
    c_warn "metro.config.cjs tidak ada - pakai default Expo"
  fi

  if command -v node >/dev/null 2>&1; then
    c_ok "node $(node --version)"
  else
    c_err "node tidak ada"; ok=1
  fi

  if have_tmux; then
    c_ok "tmux $(tmux -V 2>/dev/null | awk '{print $2}')"
  else
    c_warn "tmux tidak ada - sesi tidak akan persisten (server mati saat terminal tutup)"
  fi

  if command -v watchman >/dev/null 2>&1; then
    c_warn "watchman terpasang tapi metro.config menonaktifkannya (baik untuk Termux)"
  else
    c_ok "watchman tidak ada - sesuai ekspektasi Termux, Metro pakai polling"
  fi

  local ip; ip="$(get_ip)"
  if [ "$ip" = "127.0.0.1" ]; then
    c_err "Tidak ada IP LAN terdeteksi - HP tidak akan bisa menyambung"; ok=1
  else
    c_ok "IP LAN: $ip"
  fi

  if port_busy; then
    c_warn "Port $PORT sedang dipakai"
    if server_up; then c_ok "  dan server Metro menjawab dengan benar"; fi
  else
    c_ok "Port $PORT bebas"
  fi

  echo
  [ "$ok" = "0" ] && c_ok "Semua prasyarat utama siap" || c_err "Ada prasyarat yang gagal"
  return "$ok"
}

cmd_start() {
  local clear="${1:-}"

  if port_busy; then
    if server_up; then
      c_warn "Server sudah jalan di port $PORT"
      print_urls
      return 0
    fi
    c_err "Port $PORT terpakai proses lain tapi bukan server Metro."
    c_dim "Cek: ss -ltnp | grep $PORT"
    return 1
  fi

  if ! have_tmux; then
    c_warn "tmux tidak ada; menjalankan di foreground (Ctrl-C untuk berhenti)."
    cd "$PROJECT_DIR" || return 1
    exec npx expo start --port "$PORT" ${clear:+--clear}
  fi

  local start_cmd="npx expo start --port $PORT"
  [ "$clear" = "--clear" ] && start_cmd="$start_cmd --clear"

  # Wake lock: tanpa ini Android mematikan CPU saat layar mati dan Metro
  # ikut mati. `termux-wake-lock` bawaan Termux:API.
  if command -v termux-wake-lock >/dev/null 2>&1; then
    termux-wake-lock 2>/dev/null && c_dim "wake-lock aktif (server bertahan saat layar mati)"
  fi

  # Simpan ke log sekaligus supaya bisa dibaca ulang tanpa attach.
  tmux new-session -d -s "$SESSION" \
    "cd '$PROJECT_DIR' && $start_cmd 2>&1 | tee '$LOG_FILE'; exec bash" 2>/dev/null

  c_dim "Menunggu Metro siap... (di Termux ini bisa 2-3 menit: polling watcher)"
  local i
  # Diukur 2026-10-03: server mulai menjawab /status setelah ~130 detik,
  # dan bundel pertama (2487 modul) lebih lama lagi. Timeout pendek
  # membuat "gagal" padahal cuma lambat.
  for i in $(seq 1 90); do
    if server_up; then
      print_urls
      c_dim "Lihat log: ./scripts/metro.sh logs"
      return 0
    fi
    sleep 2
  done

  c_err "Server tidak menjawab setelah 180 detik. Log terakhir:"
  echo "----------------------------------------"
  tail -30 "$LOG_FILE" 2>/dev/null
  echo "----------------------------------------"
  return 1
}

cmd_status() {
  echo "=== Sesi Metro ==="
  if have_tmux && tmux has-session -t "$SESSION" 2>/dev/null; then
    c_ok "sesi tmux '$SESSION' hidup"
  else
    c_warn "sesi tmux '$SESSION' tidak ada"
  fi

  if port_busy; then
    echo "  port $PORT : terpakai"
  else
    echo "  port $PORT : bebas"
  fi

  if server_up; then
    c_ok "server menjawab di /status"
    print_urls
  else
    c_err "server TIDAK menjawab"
    return 1
  fi
}

cmd_logs() {
  if have_tmux && tmux has-session -t "$SESSION" 2>/dev/null; then
    tmux attach -t "$SESSION"
  elif [ -f "$LOG_FILE" ]; then
    c_dim "(sesi tmux mati - menampilkan log tersimpan, Ctrl-C untuk keluar)"
    tail -f "$LOG_FILE"
  else
    c_err "Tidak ada sesi maupun log."
    return 1
  fi
}

cmd_url() {
  local ip; ip="$(get_ip)"
  if server_up; then
    printf 'http://%s:%s\n' "$ip" "$PORT"
  else
    c_err "Server tidak jalan." >&2
    return 1
  fi
}

cmd_stop() {
  local stopped=0
  if have_tmux && tmux has-session -t "$SESSION" 2>/dev/null; then
    tmux kill-session -t "$SESSION" 2>/dev/null && stopped=1
  fi

  # Sisa proses expo/metro yang tidak terikat sesi.
  if command -v pkill >/dev/null 2>&1; then
    pkill -f "expo start" 2>/dev/null && stopped=1
    pkill -f "expo/AppEntry\|metro.*$PROJECT_DIR" 2>/dev/null && stopped=1
  fi

  # Lepas wake-lock; dibiarkan menyala akan menguras baterai.
  if command -v termux-wake-unlock >/dev/null 2>&1; then
    termux-wake-unlock 2>/dev/null
  fi

  if [ "$stopped" = "1" ]; then
    c_ok "Metro dihentikan"
  else
    c_dim "Tidak ada yang berjalan"
  fi
}

cmd_restart() {
  cmd_stop
  sleep 2
  cmd_start --clear
}

case "${1:-}" in
  start)   cmd_start "${2:-}" ;;
  stop)    cmd_stop ;;
  restart) cmd_restart ;;
  status)  cmd_status ;;
  logs)    cmd_logs ;;
  url)     cmd_url ;;
  doctor)  cmd_doctor ;;
  "")
    echo "Pakai: $0 {start|stop|restart|status|logs|url|doctor}"
    echo
    cmd_status
    ;;
  *)
    c_err "Perintah tidak dikenal: $1"
    echo "Pakai: $0 {start|stop|restart|status|logs|url|doctor}"
    exit 1
    ;;
esac
