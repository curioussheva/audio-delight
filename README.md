# 🎧 AudioDelight

Independent EQ + Spatial Audio untuk audiophile. Android-first, React Native + Expo.

## Quick Start

```bash
# 1. Clone / copy project ini ke mesin lokal
cd AudioDelight

# 2. Jalankan setup
chmod +x setup.sh && ./setup.sh

# 3. Connect HP Android (USB debugging ON)

# 4. Run
yarn android
```

## Struktur

```
app/           → Screens (expo-router)
src/audio/     → AudioEngine, EQProcessor, Presets
src/store/     → Zustand stores (EQ, Player, Spatial, App)
src/hooks/     → useVisualizer, useHeadTracking, useLibrary
src/services/  → TrackPlayer, LibraryScanner, PresetStorage
src/components → UI Components (EQBoard, SpectrumBars, dll)
```

## Audio Signal Chain

```
File/SD → AudioContext → 10×BiquadFilter (EQ) → PannerNode (HRTF) → AnalyserNode → Output
                                                                           ↓
                                                                     useVisualizer
                                                                      (Skia 60fps)
```

## Catatan Penting

- **Test di device fisik** — emulator sering broken untuk real-time audio
- `react-native-audio-api` butuh **development build** (bukan Expo Go biasa)
- Spatial/HRTF hasilnya optimal pakai **headphone**, bukan speaker
- Atmos-like effects = simulasi, bukan lisensi resmi Dolby

## Minggu per Minggu

| Minggu | Target |
|--------|--------|
| 1 | Setup + onboarding + basic playback ✅ (file ini) |
| 2 | EQ slider gestures + real-time processing |
| 3 | Skia visualizer polish |
| 4 | Spatial pad + head-tracking gyro |
| 5 | Testing + UI polish |
| 6 | EAS build + Play Store beta |
