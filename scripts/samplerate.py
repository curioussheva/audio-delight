from pathlib import Path
from datetime import datetime
import shutil

ts = datetime.now().strftime("%Y%m%d_%H%M%S")

# File 1: AudioConstants.h
f1 = Path('android/app/src/main/cpp/core/AudioConstants.h')
shutil.copy2(f1, f"{f1}.bak_{ts}")
content = f1.read_text()

# Replace kDefaultSampleRate = 48000 → 44100
import re
content = re.sub(
    r'constexpr int32_t kDefaultSampleRate\s*=\s*\n\s*48000',
    'constexpr int32_t kDefaultSampleRate =\n    44100',
    content
)
f1.write_text(content)
print(f"✅ Patched: {f1}")

# File 2: AudioStreamController.cpp
f2 = Path('android/app/src/main/cpp/core/AudioStreamController.cpp')
shutil.copy2(f2, f"{f2}.bak_{ts}")
content = f2.read_text()

# Replace builder.setSampleRate(48000) → 44100
content = content.replace('builder.setSampleRate(48000)', 'builder.setSampleRate(44100)')
f2.write_text(content)
print(f"✅ Patched: {f2}")

print("\n🎉 Sample rate konsisten ke 44100! Rebuild: npx expo run:android --device")
