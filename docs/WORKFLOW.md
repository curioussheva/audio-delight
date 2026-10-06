# Alur Kerja Aplikasi — Target vs Kondisi Sekarang

> Status per 2026-10-06. Fokus: **mode bit-perfect**.
> App berjalan di 3 mode (`BitPerfect` / `DSP` / `Immersive`), tapi hanya 2 yang
> punya jalur nyata, dan hanya 1 yang benar-benar bersih.

---

## 1. Alur target (yang seharusnya terjadi)

```
┌─────────────────────────────────────────────────────────────────────┐
│ JS / React                                                          │
│                                                                     │
│  library.tsx ──tap lagu──▶ playerStore.playSong()                   │
│    │                                    │                           │
│    │   1. Reorder queue (lagu tap = index 0)                        │
│    │   2. Filter URI valid                                          │
│    │   3. NativePlaybackService.setQueue(uris)  ──┐                 │
│    │   4. NativePlaybackService.play()           │                 │
│    │   5. set({ isPlaying: true, ... })          │                 │
│    │                                             ▼                 │
└────┼─────────────────────────────────────────────────────────────┐  │
     │  Kotlin                                                       │  │
     │                                                               │  │
     │  NativePlaybackService.setQueue()                             │  │
     │    │ resolve content:// → /data/.../cache/audio_<hash>.ext     │  │
     │    │   (max 5 file pertama, timeout 3s, sisanya deferred)      │  │
     │    │    │                                                      │  │
     │    │    ▼                                                      │  │
     │  PlaybackNativeBridge.setQueue(paths)                         │  │
     │    │    │                                                      │  │
     │    │    ▼                                                      │  │
└─────┼──────┼───────────────────────────────────────────────────────┼──┘
      │      ▼  JNI                                                    │
      │  NativePlaybackModule.cpp                                     │
      │    nativeSetQueue → controller->queue()->setTracks(tracks)    │
      │    nativePlay     → controller->play()                        │
      │                     │                                          │
      │                     ▼                                          │
      │  PlaybackController.cpp                                        │
      │    play() → loadTrack(queue->current())                       │
      │      │                                                          │
      │      ├─ stopDecoder()                                          │
      │      ├─ pcmQueue_->clear()                                     │
      │      ├─ clock_->reset()                                        │
      │      └─ startDecoder(track)                                    │
      │           │                                                     │
      │           ├─ DecodeConfig.targetSampleRate = streamRate ←──┐   │
      │           │   (dari AudioEngine, bukan default 48000)      │   │
      │           ├─ DecodeConfig.chunkFrames = 16384              │   │
      │           └─ DecoderWorker(FFmpegDecoder(cfg))              │   │
      │                │                                           │   │
      └────────────────┼───────────────────────────────────────────┼───┘
                       ▼                                            │
      ┌──────────────────────────────────────────────────────┐     │
      │  Thread decoder (prioritas AUDIO)                    │     │
      │                                                      │     │
      │  while (!stopRequested):                             │     │
      │    if paused: wait(pauseCv_)                         │     │
      │    result = decoder->decode(chunkSize_)              │     │
      │      FFmpegDecoder:                                  │     │
      │        avcodec_send_packet / receive_frame           │     │
      │        swr_convert (HANYA kalau inRate ≠ outRate) ────┼─────┘
      │        guard magnitudo |v| > 2.0 → 0                 │
      │    decodeCallback_(result)                           │
      │      pcmQueue_->write(samples)                       │
      │    on EOF: eofCallback_ → scheduleAdvance()          │
      │             (anti-flood: max 3 EOF cepat → stop)     │
      └──────────────────────────────────────────────────────┘
                                │
                                ▼
      ┌──────────────────────────────────────────────────────┐
      │  Thread realtime Oboe (AudioCallback)                │
      │                                                      │
      │  onAudioReady(stream, audioData, numFrames)          │
      │    if (mPlaybackController):                         │
      │      render(output, numFrames, 2, mSampleRate)  ◀── jalur AKTIF
      │        pcmQueue_->read(output, frames*2)             │
      │        guard NaN/Inf + magnitudo                     │
      │        clock_->advanceFrames(frames)                 │
      │      return  ◀── KELUAR DI SINI, pipeline tidak dipanggil
      │    else:                                             │
      │      bufferController.popStereo()                    │
      │      if isDSPEnabled: mPipeline.process(...)   ◀── jalur DSP
      │      softClip + zapDenormal                          │
      └──────────────────────────────────────────────────────┘
                                │
                                ▼
                        Oboe stream → DAC
```

---

## 2. Kondisi sekarang — per tahap

### ✅ Berfungsi

| Tahap | Status | Catatan |
|---|---|---|
| Library scan | ✅ | MediaStoreModule + ScanDiffEngine, 1196 lagu di log terakhir |
| Tap lagu → playSong | ✅ | Dedupe in-flight + rapid re-tap (cegah crash) |
| Reorder queue (index 0) | ✅ | Fix: native `setTracks()` selalu reset currentIndex=0 |
| Resolve `content://` → cache | ✅ | Max 5 pre-resolve, timeout 3s, sisanya deferred on-demand |
| setQueue → JNI → TrackQueue | ✅ | |
| play() → loadTrack | ✅ | `needsLoad` cek uri berubah (fix: track baru tidak pernah di-load) |
| startDecoder dengan rate stream | ✅ | `targetSampleRate` dari `streamSampleRate()` (fix 2026-10-06) |
| chunkFrames 16384 | ✅ | Fix underrun 96kHz (4096 → 24.8k fps < 48k) |
| decode → PCMQueue | ✅ | Critical section utuh (decode + callback satu lock) |
| Guard magnitudo ±2.0 | ✅ | Bit pattern malloc (1e18–1e32) adalah float valid, lolos isnan/isinf |
| EOF callback → auto-advance | ✅ | Anti-flood 3 EOF cepat; jadwal di thread terpisah (use-after-free fix) |
| render → PCMQueue.read | ✅ | |
| Guard NaN/Inf di render | ✅ | Safety net race boundary |
| MediaSession + notifikasi | ✅ | Event native→JS (`onPlaybackTrackChanged`, `onPlaybackTrackEnded`) |

### ⚠️ Bagian, ada catatan

| Tahap | Masalah |
|---|---|
| Pemilihan laju stream | `DeviceRateDetector::pickBestRate` pilih laju tertinggi yang didukung. **Device speaker hanya `[44100, 48000]`** — file 96 kHz **pasti** downsample. Tidak ada bug, ini batas hardware. |
| Resampler | `swr_convert` aktif paksa untuk hi-res. Kualitas terbaik dari 5 config yang diuji (76.5 dB SNR, `filter_size=128 cutoff=0.97`) — tapi tetap bukan bit-perfect. |
| `isExclusive()` | Dihitung akurat di `AudioStreamController` tapi **tidak pernah sampai JS**. User tidak tahu kalau exclusive gagal dan fallback ke shared (AudioFlinger nambah resample + gain). |

### ❌ Tidak berfungsi / putus

| Tahap | Masalah | Dampak |
|---|---|---|
| **Exclusive mode ke native** | `toggleExclusiveMode(true)` di `engine.ts` **hanya** `releaseAllFX()` (Android DSP session). Tidak pernah panggil `NativeDSPModule.setExclusiveMode()`. | **Bit-perfect saat ini TIDAK memakai Oboe exclusive.** Stream selalu SharedMode → sampel lewat AudioFlinger mixer → konversi tambahan. Padahal chain C++-nya lengkap: `NativeDSPModule.cpp:166` → `EngineManager::setExclusiveMode()` → stop/start stream. |
| **DSP pipeline di jalur playback** | `AudioCallback::onAudioReady()` `return` segera setelah `render()`. `mPipeline.process()` hanya di jalur fallback (`AudioBufferController`), yang tidak dipakai saat playback. | **Mode DSP tidak ada efek saat memutar lagu.** EQ/bass/visualizer (DSP level Android session) mungkin masih jalan, tapi `DSPChain` C++ tidak pernah disentuh PCM playback. |
| **Mode Immersive** | `AudioMode` di JS hanya `"bit-perfect" \| "dsp"`. Enum C++ `ProcessingMode::Immersive=2` tak tercapai. `AudioPipeline::processImmersive` isinya base DSP + komentar "FUTURE". `modes/ImmersivePipeline` + `dsp/immersive/*` tidak punya pemanggil (0 call edge masuk di graphify). | Fitur belum jadi. |
| **ProcessingMode switch** | `setProcessingMode` chain C++ lengkap (JNI + AudioConfig + AudioEngine), tapi `AudioPipeline::process()` tidak dipanggil di jalur playback (lihat di atas). | Switch mode tidak ada efek ke PCM. |
| **Laju stream per-track** | Stream dibuka **sekali** di `EngineManager::start()` pakai rate tertinggi yang didukung device. Tidak pernah di-restart per trek. | File 44.1 kHz di stream 48 kHz → resample fraksional. File 96 kHz di device 48 kHz → downsample 2:1. |

---

## 3. Rantai bit-perfect — 6 syarat

| # | Syarat | Status | Bukti |
|---|---|---|---|
| 1 | **Exclusive mode aktif** (bypass mixer) | ✅ **FIXED** | `engine.ts` sekarang panggil `NativeDSPModule.setExclusiveMode()` (commit `db8327cd7`). Sebelumnya hanya `releaseAllFX()` — DSP session Android, bukan Oboe stream. |
| 2 | **Bisa diverifikasi** (status aktual, bukan permintaan) | ✅ **SELESAI** | `isExclusive()` + `getActualSampleRate()` ke JS (commit `0a19cbb78`). Log: `Stream: exclusive=YA/TIDAK (fallback shared) rate=48000Hz`. |
| 3 | Laju stream mengikuti DAC/file | ⚠️ Sebagian | `DeviceRateDetector` jalan, tapi hanya ambil rate tertinggi **device**, bukan per-file. Speaker: `[44100,48000]`. |
| 4 | Decoder tidak resample ke laju lain | ⚠️ Sebagian | `targetSampleRate` = rate stream (fix 2026-10-06). Tapi kalau rate file > rate device, downsample paksa. |
| 5 | Tidak ada stage gain tersembunyi | ✅ Fixed | `kGain 0.89f` dihapus 2026-10-06 (sebelumnya -1 dB diam-diam di decoder). |
| 6 | DSP dilewati | ✅ Berlebihan | `render()` tidak panggil pipeline apa pun — tapi ini bukan desain, lihat syarat 1. |

**Kesimpulan:** syarat 1, 2, 5, 6 aman. Syarat 3–4 sebagian — ini **batas hardware**, bukan bug: speaker internal hanya `[44100, 48000]`, jadi file 96 kHz pasti downsample 2:1. Yang bisa dijamin sekarang: PCM utuh sampai DAC untuk file yang rate-nya didukung device.

---

## 4. Yang harus dikerjakan (urutan = dampak)

### 🔴 Prioritas 1 — Nyalakan exclusive mode (1 file JS)

~~Satu-satunya blocker bit-perfect nyata.~~ **FIXED 2026-10-06, commit `db8327cd7`, CI 37479212847 sukses.**

Chain C++ sudah lengkap dan teruji:
`NativeDSPModule.setExclusiveMode(bool)` → JNI → `EngineManager::setExclusiveMode()`
→ stop stream → `AudioEngine::start(exclusive=true)` → AAudio Exclusive.

Yang kurang cuma satu baris di `engine.ts` — `toggleExclusiveMode()` tidak
pernah memanggil `NativeDSPModule.setExclusiveMode()`, hanya `releaseAllFX()`
(DSP session Android, bukan Oboe stream).

**Risiko:** `EngineManager::setExclusiveMode` stop+start stream. Kalau dipanggil
saat playback jalan, ada jeda singkat. AAudio bisa juga menolak exclusive
(device/Android version) → Oboe fallback ke shared secara otomatis — perlu
cek `isExclusive()` setelahnya dan kasih tahu user.

**Verifikasi:** logcat harus muncul `AudioStreamController: exclusive=...` dan
`OboeAudio: sharing mode: Exclusive`. Kalau masih Shared, device menolak.

### 🟡 Prioritas 2 — Ekspos `isExclusive()` ke JS

**SELESAI 2026-10-06, commit `0a19cbb78`.** Rantai lengkap:

```
AudioStreamController::isExclusive()   status Oboe stream NYATA
  ↑ AudioEngine::isExclusive()
    ↑ EngineManager::isExclusive()
      ↑ JNI isExclusiveModeActive() / getActualSampleRate()
        ↑ Kotlin @ReactMethod(isBlockingSynchronousMethod = true)
          ↑ spec TS NativeDSPModule.ts
            ↑ engine.ts: log verifikasi setelah toggle
```

Indikator jujur: kalau exclusive ditolak device, UI sekarang bisa bilang
"fallback ke shared mode, tidak bit-perfect". `engine.ts` sudah log
`Stream: exclusive=YA/TIDAK (fallback shared) rate=48000Hz` setelah toggle.

**Bedanya dengan `AudioState::exclusiveMode()`:** itu mencatat **APA YANG
DIMINTA**. `isExclusive()` membaca **APA YANG DIBUKA OBOE**. Kalau AAudio
menolak, keduanya beda — dan hanya yang kedua yang jujur.

Sinkron (`isBlockingSynchronousMethod`) supaya bacaan tidak dapat data dari
stream lama saat `setExclusiveMode()` sedang stop+start stream.

**Yang belum:** ~~UI belum pakai ini untuk tampilkan indikator ke user — baru
log. Itu pekerjaan UI terpisah.~~ **SELESAI**, commit `dff0363c7`.

Hook `useBitPerfectStatus` membedakan empat keadaan:

| `requested` | `streamExclusive` | Tampilan | Arti |
|---|---|---|---|
| false | — | DSP Mode | Normal |
| true | true | `BIT-PERFECT 48K` (hijau) | Benar-benar bit-perfect |
| true | false | `FALLBACK` (merah) | AAudio tolak, mixer aktif |
| true | — (native belum siap) | `BIT-PERFECT` (hijau) | Engine belum start |

Dua tempat dipasang: badge di `player/index.tsx` dan baris Switch di
`settings.tsx` (label + sublabel + saran "coba colok USB DAC"). Polling 2s
hanya saat `isPlaying` supaya idle tidak membangun native.

### 🟡 Prioritas 3 — Restart stream per-trek (opsional, mahal)

Kalau mau benar-benar tanpa konversi untuk 44.1 kHz: stream harus di-restart
di rate file. Ini `stop()/start()` per trek — jeda audibly, dan DAC USB
biasanya pop. Android `setPreferredDevice` lebih baik untuk kasus ini.

**Hanya masuk akal untuk DAC USB yang mendukung rate file.** Untuk speaker
internal yang cuma `[44100, 48000]`, tidak ada gunanya — 44.1 → 48 tetap
fraksional, dan downsample tetap wajib untuk 96 kHz.

### 🟢 Backlog — Immersive + DSP pipeline

Butuh `mPipeline.process()` dipanggil di `render()` (atau `onAudioReady`
setelah render). Lihat `docs/archive/README.md` bagian B untuk detail cluster
dead code-nya. Bukan prioritas bit-perfect.

---

## 5. Log yang harus muncul kalau bit-perfect benar jalan

```
AudioEngine: start: requested=44100, actual=44100
AudioStreamController: open: sharingMode=Exclusive, actual=44100
NativePlaybackModule: nativeSetQueue() called
PlaybackController: loadTrack(): START uri=...
PlaybackController: startDecoder: targetSampleRate=44100 (stream=44100)
FFmpegDecoder: FORMAT CHECK: input_rate=44100 → output_rate=44100 (resampler OFF)
PlaybackController: render readSamples=1920/1920
```

`input_rate == output_rate` = satu-satunya tanda bit-perfect benar. Kalau
masih `→`, resampler aktif dan PCM tidak utuh.
