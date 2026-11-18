# Playback Consistency Analysis

**Analysis date:** 2026-10-07  
**Scope:** cpp/playback → JNI → Kotlin → JS layer consistency

---

## Architecture Overview

pristine playback memiliki 2-layer Kotlin architecture:

```
JS Layer:
  ├─ NativePlaybackModule.ts (OUTDATED, 13 methods) ❌
  └─ NativePlaybackService.ts (ACTUAL, 17+ methods) ✅

Kotlin Layer:
  ├─ NativePlaybackModule.kt (direct JNI, 16 @ReactMethod)
  ├─ PlaybackNativeBridge.kt (singleton bridge, 22 methods)
  └─ NativePlaybackService.kt (wrapper + Promise, 26 @ReactMethod) ✅

JNI Layer:
  └─ NativePlaybackModule.cpp (17 JNIEXPORT functions)

C++ Layer:
  └─ PlaybackController.cpp (audio engine)
```

**Design rationale:**
- `NativePlaybackModule` provides direct JNI bindings
- `PlaybackNativeBridge` is singleton for cross-context calls (Android Service → JNI)
- `NativePlaybackService` wraps methods with Promise for JS async/await + error handling

---

## Consistency Check Results

### ✅ C++ → JNI (17/17 matched)

All JNI implementations present:
- `nativePlay`, `nativePause`, `nativeStop`, `nativeSeek`
- `nativeNext`, `nativePrevious`
- `nativeGetPosition`, `nativeGetStatus`
- `nativeGetQueue`, `nativeSetQueue`, `nativeGetCurrentTrack`
- `nativeGetCurrentIndex`, `nativeGetQueueSize`, `nativeJumpTo`
- `nativeSetShuffle`, `nativeSetRepeatMode`
- `nativeInitEventEmitter`

### ✅ JNI → Kotlin external (17/17 matched)

All Kotlin `external fun nativeXxx()` have JNI implementations.

### ✅ Kotlin → PlaybackNativeBridge (functional)

`NativePlaybackModule.kt` provides `xxxFromService()` methods called by `PlaybackNativeBridge`.

**Minor mismatch detected:**
- Bridge has 22 public methods
- Service only calls 20 of them

**Unused bridge methods:**
- `emitTrackChanged`
- `emitTrackEnded`

**Impact:** Low — these are event emitters that may be called from C++ callback thread, not from Service.

### ⚠️ NativePlaybackService.kt → NativePlaybackService.ts

**Kotlin @ReactMethod:** 26  
**JS spec methods:** 24

**Missing in JS spec (implemented but not declared):**
- `addListener`
- `removeListeners`

**Impact:** Medium — EventEmitter methods exist in Kotlin but not typed in spec. JS can call them (TurboModule allows), but TypeScript won't autocomplete/typecheck.

**Fix needed:**
```typescript
// Add to NativePlaybackService.ts
export interface Spec extends TurboModule {
  // ... existing methods ...
  
  // EventEmitter
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}
```

---

## Dead Code

### ❌ `src/specs/NativePlaybackModule.ts` — OUTDATED

**Status:** NOT USED by JS code

**Evidence:**
```bash
$ grep -rn 'from.*NativePlaybackModule' src/features/player
# (no results)

$ grep -rn 'from.*NativePlaybackService' src/features/player
src/features/player/api/engine.ts:9
src/features/player/hooks/useAudioPlayer.ts:5
src/features/player/store/playerStore.ts:9
```

All JS code imports `NativePlaybackService`, NOT `NativePlaybackModule`.

**Action:** DELETE `src/specs/NativePlaybackModule.ts`

**Why it exists:**
Likely legacy from before 2-layer architecture was introduced. Module was refactored into Service wrapper (with Promise + error handling), but old spec wasn't removed.

---

## Related Bug: Hardcoded 48000 in seekTo()

**Location:** `PlaybackController.cpp:262`

```cpp
bool PlaybackController::seekTo(double seconds) {
    // ...
    clock_->seekToSeconds(seconds, 48000);  // ❌ HARDCODED
    // ...
}
```

**Impact:** Seek timing salah untuk file non-48kHz

**Fix:**
```cpp
-   clock_->seekToSeconds(seconds, 48000);
+   clock_->seekToSeconds(seconds, streamSampleRate());
```

**Severity:** HIGH (user-visible, affects all non-48kHz files)

See: [`DECODER_RESAMPLER_ANALYSIS.md`](./DECODER_RESAMPLER_ANALYSIS.md) for full details.

---

## Recommendations

### Priority 1: Fix hardcoded 48000 (HIGH severity) — ✅ SELESAI (commit `ebaa24b0b`)

> Diperbaiki 2026-10-07. Lihat [`RATE_CHAIN_AUDIT.md`](./RATE_CHAIN_AUDIT.md) §4
> untuk patch dan verifikasi test domain.


```cpp
// PlaybackController.cpp:262
-   clock_->seekToSeconds(seconds, 48000);
+   clock_->seekToSeconds(seconds, streamSampleRate());
```

### Priority 2: Delete dead spec (LOW risk)

```bash
rm src/specs/NativePlaybackModule.ts
```

Verify no import references:
```bash
grep -rn "NativePlaybackModule" src/ --include="*.ts" --include="*.tsx"
# Should only show NativePlaybackModule.kt comments, not TS imports
```

### Priority 3: Add missing EventEmitter methods to JS spec (MEDIUM)

```typescript
// src/specs/NativePlaybackService.ts
export interface Spec extends TurboModule {
  // ... existing ...
  
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}
```

---

## Verification Commands

```bash
# Verify JNI symbols exist
nm -D android/app/build/intermediates/.../libpristine-audio.so | grep Java_com_pristineaudio

# Verify Kotlin methods registered
./gradlew :app:dependencies --configuration debugRuntimeClasspath | grep react-native

# Verify JS can resolve module
node -e "console.log(require('./src/specs/NativePlaybackService.ts'))"
```

---

## Appendix: Full Method List

### NativePlaybackService.ts (JS spec)

**Service lifecycle:**
- `startService()`
- `stopService()`

**Transport (Promise):**
- `play()`
- `pause()`
- `stop()`
- `next()`
- `previous()`
- `seek(positionMs)`
- `setShuffle(enabled)`
- `setRepeatMode(mode)`
- `setQueue(uris)`

**Query:**
- `getPosition()` → Promise<number>
- `getStatus()` → Promise<number>
- `getQueue()` → Promise<string[]>
- `getCurrentTrack()` → Promise<string>

**Queue navigation (sync):**
- `getCurrentIndex()` → number
- `getQueueSize()` → number
- `jumpTo(index)` → Promise<void>

**Media session:**
- `updateMetadata(...)`
- `updatePlaybackState(...)`
- `updateShuffleMode(enabled)`
- `updateRepeatMode(mode)`

### NativePlaybackModule.cpp (JNI implementations)

All 17 `JNIEXPORT` functions verified present and callable from Kotlin.

---

**Document status:** ✅ Verified via code analysis 2026-10-07  
**Next review:** After any JNI/TurboModule refactor
