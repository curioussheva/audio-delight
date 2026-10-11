#!/data/data/com.termux/files/usr/bin/bash
# Pemantau build. Ditulis sebagai skrip, bukan one-liner - kutipan bersarang
# di dalam perintah background beberapa kali rusak dan prosesnya mati dengan
# "unexpected EOF while looking for matching".
RUN_ID="${1:?usage: watch_run.sh <run-id>}"

for i in $(seq 1 100); do
  S=$(gh run view "$RUN_ID" --json status,conclusion \
        -q '.status+"|"+(.conclusion // "none")' 2>/dev/null)
  echo "[$i] $S"
  case "$S" in
    completed*) break ;;
  esac
  sleep 45
done

echo "=== FINAL ==="
gh run view "$RUN_ID" --json status,conclusion \
  -q '.status+" | "+.conclusion'
echo "=== artifact ==="
gh api "repos/curioussheva/audio-delight/actions/runs/$RUN_ID/artifacts" \
  -q '.artifacts[] | "\(.id) \(.name) \((.size_in_bytes/1048576)|floor)MB"' 2>/dev/null
