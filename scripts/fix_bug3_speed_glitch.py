#!/data/data/com.termux/files/usr/bin/python3
"""Fix Bug #3 v2: regex-based — toleran indentasi/whitespace."""
import re
from pathlib import Path

FILE = Path.home() / "pristine/src/features/player/api/diagnostics.ts"
src = FILE.read_text()

# Regex match seluruh blok setInterval
pattern = re.compile(
    r'const timer = setInterval\(async \(\) => \{.*?\n  \}, intervalMs\);',
    re.DOTALL
)

new_block = '''const timer = setInterval(async () => {
    const snap = await getAudioSnapshot();
    if (!snap) return;
    lastSnapshot = snap;

    const now = snap.timestamp;
    const elapsed = (now - lastTime) / 1000;
    const deltaPos = (snap.positionMs - lastPosition) / 1000;

    // 🔥 FIX Bug #3: skip speed calc saat glitch-prone
    const MIN_ELAPSED_S = 0.3;
    const MAX_SPEED = 3.0;
    const MIN_SPEED = -0.5;

    const isStateChange = snap.status !== lastStatus;
    const suspiciousDrop = deltaPos < MIN_SPEED;
    const tooShortWindow = elapsed < MIN_ELAPSED_S;

    if (isStateChange) {
      events.push({
        type: "STATE_CHANGE",
        detail: `${lastStatus} → ${snap.status} (${snap.statusLabel})`,
        timestamp: now,
      });
      lastStatus = snap.status;
    }

    // Track change / seek / window pendek → reset baseline, skip speed
    if (suspiciousDrop || tooShortWindow) {
      lastPosition = snap.positionMs;
      lastTime = now;
      return;
    }

    const speed = elapsed > 0 ? deltaPos / elapsed : 0;
    const speedInRange = speed >= MIN_SPEED && speed <= MAX_SPEED;

    // 🔥 FIX: status 1 = PLAYING (bukan 2)
    if (snap.status === 1 && speedInRange) {
      if (speed < speedLow && speed >= 0) {
        events.push({
          type: "SLOW",
          detail: `${speed.toFixed(2)}x (expected 1.0x)`,
          timestamp: now,
        });
      } else if (speed > speedHigh) {
        events.push({
          type: "FAST",
          detail: `${speed.toFixed(2)}x (expected 1.0x)`,
          timestamp: now,
        });
      }
    }

    const shouldLog =
      verbose &&
      speedInRange &&
      (snap.status === 1 || isStateChange ||
        (speed > 0 && Math.abs(speed - 1.0) > 0.5));

    if (shouldLog) {
      console.log(
        `[DIAG] ${snap.statusLabel} pos=${snap.positionMs}ms speed=${speed.toFixed(2)}x`,
      );
    }

    lastPosition = snap.positionMs;
    lastTime = now;
  }, intervalMs);'''

if "suspiciousDrop" in src:
    print("⏭️  Already applied")
else:
    new_src, n = pattern.subn(new_block, src, count=1)
    if n == 0:
        print("❌ Regex tidak match. Paste 30 baris di sekitar 'const timer = setInterval':")
        idx = src.find("const timer = setInterval")
        if idx >= 0:
            print("─" * 50)
            print(src[idx:idx+800])
            print("─" * 50)
        else:
            print("   ❌ Marker 'const timer = setInterval' tidak ditemukan!")
    else:
        FILE.write_text(new_src)
        print(f"✅ Bug #3 fix applied (regex match)\nFile: {FILE}") 