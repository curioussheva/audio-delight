#!/usr/bin/env python3
"""
Fix root cause: default DSP ON. Ubah ke BitPerfect + DSP disabled.
"""

from pathlib import Path
from datetime import datetime
import shutil

# Fix 1: AudioTypes.h — default processingMode
F1 = Path('android/app/src/main/cpp/core/AudioTypes.h')
ts = datetime.now().strftime("%Y%m%d_%H%M%S")
shutil.copy2(F1, f"{F1}.bak_{ts}")
c = F1.read_text()

old1 = '''    ProcessingMode processingMode =
        ProcessingMode::DSP;'''
new1 = '''    ProcessingMode processingMode =
        ProcessingMode::BitPerfect;  // 🔥 FIX: default bypass DSP'''

if old1 in c:
    c = c.replace(old1, new1, 1)
    F1.write_text(c)
    print("✅ Fix 1: processingMode default = BitPerfect")
else:
    print("⚠️  Fix 1 pattern tidak ketemu")

# Fix 2: AudioState.h — default mDSPEnabled
F2 = Path('android/app/src/main/cpp/core/AudioState.h')
shutil.copy2(F2, f"{F2}.bak_{ts}")
c = F2.read_text()

old2 = '''    std::atomic<bool>
        mDSPEnabled{true};'''
new2 = '''    std::atomic<bool>
        mDSPEnabled{false};  // 🔥 FIX: default DSP disabled'''

if old2 in c:
    c = c.replace(old2, new2, 1)
    F2.write_text(c)
    print("✅ Fix 2: mDSPEnabled default = false")
else:
    print("⚠️  Fix 2 pattern tidak ketemu")

print("🎉 Selesai!")
