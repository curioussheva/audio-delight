# Native Modules Consistency Analysis

**Analysis date:** 2026-10-07  
**Scope:** All native modules (cpp → JNI → Kotlin → JS)

---

## Executive Summary

**Total modules analyzed:** 4  
**Clean modules:** 3  
**Modules with bugs:** 1

### Bugs Detected

| Module | Bug | Severity | Impact |
|--------|-----|----------|--------|
| NativeDSPModule | `setProcessingMode` in JNI but not exposed to Kotlin | HIGH | Method unusable from JS/Kotlin |

### Clean Modules

| Module | JNI Methods | Architecture | Status |
|--------|-------------|--------------|--------|
| NativePlaybackModule | 17 | 2-layer (Module → Bridge → Service) | ✅ |
| NativeDeviceModule | 4 | direct | ✅ |
| NativeVisualizerBridge | 1 | direct | ✅ |

---

## Module-by-Module Analysis

### 1. NativePlaybackModule ✅

**Architecture:** 2-layer (complex but consistent)

```
JS: NativePlaybackService.ts (26 methods)
     ↓
Kotlin: NativePlaybackService.kt (@ReactMethod wrapper + Promise)
     ↓
Kotlin: PlaybackNativeBridge.kt (singleton bridge)
     ↓
Kotlin: NativePlaybackModule.kt (xxxFromService methods)
     ↓
JNI: NativePlaybackModule.cpp (17 JNIEXPORT)
     ↓
C++: PlaybackController.cpp
```

**Status:**
- ✅ JNI ↔ Kotlin external: 17/17 matched
- ⚠️ Dead spec: `NativePlaybackModule.ts` (not used by JS code)
- ⚠️ JS spec missing: `addListener`, `removeListeners` (EventEmitter methods)

**Recommendation:**
```bash
# Remove dead spec
rm src/specs/NativePlaybackModule.ts

# Add to NativePlaybackService.ts
addListener(eventName: string): void;
removeListeners(count: number): void;
```

**Details:** See [`PLAYBACK_CONSISTENCY_ANALYSIS.md`](./PLAYBACK_CONSISTENCY_ANALYSIS.md)

---

### 2. NativeDSPModule ⚠️

**Architecture:** direct (JS → Kotlin → JNI → C++)

**Status:**
- ✅ JS spec ↔ Kotlin @ReactMethod: 18/18 matched
- ❌ JNI not exposed: `setProcessingMode`

**Bug Details:**

JNI implementation exists:
```cpp
// NativeDSPModule.cpp:80
JNIEXPORT void JNICALL
Java_com_pristineaudio_dsp_NativeDSPModule_setProcessingMode(
    JNIEnv*, jobject, jint mode
)
```

But NOT declared in Kotlin:
```kotlin
// NativeDSPModule.kt - MISSING
private external fun setProcessingMode(mode: Int)
```

**Impact:**
- Method exists in C++ but unreachable from JS/Kotlin
- Likely dead code (JNI implementation without caller)
- OR incomplete feature (implementation exists but not wired)

**Fix Option 1: Expose to Kotlin (if feature needed)**

```kotlin
// Add to NativeDSPModule.kt
private external fun setProcessingMode(mode: Int)

@ReactMethod
fun setProcessingMode(mode: Int) {
    if (engineAvailable) setProcessingMode(mode)
}
```

```typescript
// Add to NativeDSPModule.ts
setProcessingMode(mode: number): void;
```

**Fix Option 2: Remove dead code (if not needed)**

```cpp
// Remove from NativeDSPModule.cpp
JNIEXPORT void JNICALL
Java_com_pristineaudio_dsp_NativeDSPModule_setProcessingMode(...) { ... }
```

**Recommendation:** Determine if feature is needed. If yes, wire it up. If no, remove JNI implementation.

---

### 3. NativeDeviceModule ✅

**Architecture:** direct

**Status:**
- ✅ JNI ↔ Kotlin external: 4/4 matched
- ⚠️ No JS spec (internal module?)

**Methods:**
```
nativeGetDevices
nativeSetActiveDevice
nativeOnDeviceAdded
nativeOnDeviceRemoved
```

**Note:** No JS TurboModule spec found. Likely internal Kotlin-only module or legacy code.

---

### 4. NativeVisualizerBridge ✅

**Architecture:** direct

**Status:**
- ✅ JNI ↔ Kotlin external: 1/1 matched
- ✅ JS spec exists

**Methods:**
```
getVisualizerData() → FloatArray
```

**Note:** Minimal module, single method, fully consistent.

---

## Cross-Cutting Issues

### Issue 1: Dead JS Spec

**File:** `src/specs/NativePlaybackModule.ts`  
**Status:** NOT USED (all JS imports `NativePlaybackService`)

**Evidence:**
```bash
$ grep -rn "from.*NativePlaybackModule" src/features/player
# (no results)

$ grep -rn "from.*NativePlaybackService" src/features/player
src/features/player/api/engine.ts:9
src/features/player/hooks/useAudioPlayer.ts:5
src/features/player/store/playerStore.ts:9
```

**Action:** DELETE `src/specs/NativePlaybackModule.ts`

---

### Issue 2: Hardcoded 48000 in PlaybackController

**File:** `android/app/src/main/cpp/playback/PlaybackController.cpp:262`  
**Severity:** HIGH (user-visible bug)

```cpp
bool PlaybackController::seekTo(double seconds) {
    // ...
    clock_->seekToSeconds(seconds, 48000);  // ❌ HARDCODED
    // ...
}
```

**Impact:** Seek timing incorrect for non-48kHz files

**Fix:**
```cpp
-   clock_->seekToSeconds(seconds, 48000);
+   clock_->seekToSeconds(seconds, streamSampleRate());
```

**Details:** See [`DECODER_RESAMPLER_ANALYSIS.md`](./DECODER_RESAMPLER_ANALYSIS.md)

---

### Issue 3: StreamResampler Dead Code

**Files:**
- `android/app/src/main/cpp/decoder/StreamResampler.{h,cpp}`
- `android/app/src/main/cpp/resampler/LinearResampler.{h,cpp}`
- `AudioDecoder::applyResampling()`
- `AudioDecoder::needsResampling()`

**Status:** Never executed (needsResampling() always returns false)

**Details:** See [`DECODER_RESAMPLER_ANALYSIS.md`](./DECODER_RESAMPLER_ANALYSIS.md)

---

## Recommendations (Priority Order)

### Priority 1: Fix Hardcoded 48000 ✅ SELESAI (commit `ebaa24b0b`)

> Sudah diperbaiki 2026-10-07: `seekRate = streamSampleRate()` dengan fallback
> 48000 saat stream belum terbuka. Lihat
> [`RATE_CHAIN_AUDIT.md`](./RATE_CHAIN_AUDIT.md) §4.


**Severity:** HIGH (user-visible)  
**Frequency:** Every seek on non-48kHz files  
**Effort:** LOW (1 line)

```cpp
// PlaybackController.cpp:262
-   clock_->seekToSeconds(seconds, 48000);
+   clock_->seekToSeconds(seconds, streamSampleRate());
```

---

### Priority 2: Fix NativeDSPModule.setProcessingMode 🟡 MEDIUM

**Severity:** MEDIUM (dead code or incomplete feature)  
**Effort:** LOW-MEDIUM

Decision needed:
1. If feature is needed → wire to Kotlin + JS spec
2. If not needed → remove JNI implementation

---

### Priority 3: Remove Dead Spec 🟢 LOW

**Severity:** LOW (code clarity)  
**Effort:** LOW

```bash
rm src/specs/NativePlaybackModule.ts
```

Verify no references:
```bash
grep -rn "NativePlaybackModule" src/ --include="*.ts" --include="*.tsx"
```

---

### Priority 4: Remove StreamResampler Dead Code 🟢 LOW

**Severity:** LOW (maintenance burden)  
**Effort:** MEDIUM (multiple files)

See [`DECODER_RESAMPLER_ANALYSIS.md`](./DECODER_RESAMPLER_ANALYSIS.md) for details.

---

## Verification Commands

### JNI Symbol Check
```bash
nm -D android/app/build/intermediates/.../libpristine-audio.so | grep Java_com_pristineaudio
```

### Kotlin Module Registration
```bash
./gradlew :app:dependencies --configuration debugRuntimeClasspath | grep react-native
```

### JS Import Check
```bash
grep -rn "from.*Native.*Module" src/ --include="*.ts" --include="*.tsx"
```

---

## Appendix: Full Module Inventory

### JNI Files (android/app/src/main/cpp/jni/)
```
JSIInstaller.cpp
NativeAudioFeed.cpp
NativeDSPModule.cpp        ← 15 methods
NativeDeviceModule.cpp     ← 4 methods
NativePlaybackModule.cpp   ← 17 methods
NativePristineAudio.cpp
NativeVisualizerModule.cpp ← 1 method
OnLoad.cpp
```

### Kotlin TurboModules (android/app/src/main/java/com/pristineaudio/)
```
audio/NativePlaybackModule.kt     ← 16 @ReactMethod + xxxFromService
audio/NativeDeviceModule.kt       ← 4 @ReactMethod
dsp/NativeDSPModule.kt            ← 18 @ReactMethod
visualizer/NativeVisualizerBridge.kt ← 3 @ReactMethod
playback/NativePlaybackService.kt ← 26 @ReactMethod (wrapper)
playback/PlaybackNativeBridge.kt  ← 22 methods (singleton)
usb/USBDACModule.kt               ← (not analyzed - no JNI file)
media/MediaStoreModule.kt         ← (not analyzed - no JNI file)
```

### JS TurboModule Specs (src/specs/)
```
NativePlaybackModule.ts    ← ❌ DEAD (13 methods)
NativePlaybackService.ts   ← ✅ USED (24 methods + 2 missing)
NativeDSPModule.ts         ← ✅ USED (18 methods)
NativeVisualizerBridge.ts  ← ✅ USED
NativeDeviceModule.ts      ← ❓ NOT FOUND
MediaStoreModule.ts        ← (not analyzed)
USBDACModule.ts            ← (not analyzed)
```

---

**Document status:** ✅ Verified via code analysis 2026-10-07  
**Next review:** After JNI/TurboModule refactor or native module additions
