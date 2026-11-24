import { configureReanimatedLogger, ReanimatedLogLevel } from "react-native-reanimated";

console.log("[BOOT] 0. _layout module loaded");
// J3-4: pemantau lag event-loop JS — dipanggil sekali di sini (modul scope),
// state timer-nya hidup di `global` supaya Fast Refresh tidak menumpuk
// interval + listener (lihat jsLagMonitor.ts).
startJsLagMonitor();
// JL-1 (Fase 0): sampler lag 100 ms + p50/p95/p99 per skenario — matikan
// flag setelah pengukuran selesai.
const LAG_STATS = true; // matikan setelah pengukuran
if (LAG_STATS) {
  startJsLagStats(() => {
    const p = usePlayerStore.getState();
    const l = useLibraryStore.getState();
    return [
      p.isPlaying ? "play" : "idle",
      isDragActive() ? "drag" : "",
      l.isManualScanning || l.isAutoScanning ? "scan" : "",
      l.enrichmentQueueSize > 0 ? "enrich" : "",
    ]
      .filter(Boolean)
      .join("+");
  });
}
configureReanimatedLogger({ level: ReanimatedLogLevel.warn, strict: false });

import React, { memo, useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";
import * as Linking from "expo-linking";
import { Animated, StyleSheet, View, Text, TouchableOpacity } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { ThemeProvider, useTheme } from "@/shared/context/ThemeContext";
import { accentOn } from "@/shared/utils/contrast";
import { loadAppFonts } from "@/shared/utils/fonts";
import LoadingScreen from "@/shared/components/ui/LoadingScreen";
import SplashImageScreen from "@/shared/components/ui/SplashImageScreen";
import {
  SPLASH_HOLD_MS,
  SPLASH_IMAGE_MS,
  SPLASH_READY_DELAY_MS,
} from "@/shared/utils/splashTiming";
import { AudioPropertyToast } from "@/features/player/components/AudioPropertyToast";
import { GlobalToast } from "@/shared/components/ui/GlobalToast";

import { audioEngine } from "@/features/player/api/engine";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { useLibraryStore } from "@/features/library/store/libraryStore";
import {
  isExternalAudioUrl,
  songFromExternalAudioUrl,
} from "@/features/player/api/externalAudioUrl";
import type { Song } from "@/shared/types/audio";
import { useEqualizerStore } from "@/features/equalizer/store/equalizerStore";
import { useForegroundRefreshCoordinator } from "@/features/library/hooks/useForegroundRefreshCoordinator";
import { useHrtfGate } from "@/features/hrtf/hooks/useHrtfGate";
import { useHeadphoneCorrection } from "@/features/headphone/hooks/useHeadphoneCorrection";
import { useOutputProfiles } from "@/features/outputprofile/hooks/useOutputProfiles";
import { requestAudioPermissions } from "@/shared/utils/permissions";
import { startJsLagMonitor } from "@/shared/utils/jsLagMonitor";
import { startJsLagStats } from "@/shared/utils/jsLagStats";
import { isDragActive } from "@/features/equalizer/api/dragState";

// 🔥 DIAGNOSTICS
import {
  startAudioDiagnostics,
  getAudioSnapshot,
  printDiagnosticReport,
  type AudioDiagnosticsHandle,
} from "@/features/player/api/diagnostics";
import { runAudioTestMatrix } from "@/features/player/api/testMatrix";
// [BRIDGE-PROBE] diagnostik sementara (logcat #8) — lihat bridgeProbe.ts.
import { startBridgeProbe } from "@/features/player/api/bridgeProbe";
// [DIAG-GATE] sakelar diagnostik sementara (logcat #8) — lihat diagGate.ts.
import { setTempDiagEnabled } from "@/shared/utils/diagGate";
import { useCrossfadeStore } from "@/features/crossfade/store/crossfadeStore";
import NativeDSPModule from "@/specs/NativeDSPModule";
 
SplashScreen.preventAutoHideAsync();

type AppInitState =
  | "initializing"
  | "loading"
  | "splash-image"
  | "ready"
  | "error";

const DIAGNOSTIC_INTERVAL_MS = 5000;

// Penjaga init di level modul (bukan ref): ref ikut reset saat RootLayout
// remount (activity dibuat ulang), sehingga performInitialization bisa jalan
// dua kali melawan engine/store yang sudah initialized. Teramati 2026-11-10:
// "[BOOT] 1" muncul 2x di logcat, run kedua macet sebelum
// "Engine & Store initialization success" dan splash tidak pernah hilang.
// Proses baru me-reload modul ini, jadi guard reset tepat saat re-init yang
// sesungguhnya dibutuhkan. Tombol Retry tetap bisa reset guard ini.
let hasInitializedModule = false;

// J3-3: penjaga in-flight performInitialization — tap Retry dua kali cepat
// (atau boot effect + Retry bersamaan) tidak boleh menjalankan dua init.
// Guard modul hasInitializedModule di atas hanya ada di boot effect, bukan
// di dalam performInitialization sendiri.
// J3-2: watchdog boot — nama langkah yang sedang berjalan + timer 20 dtk
// yang HANYA menulis warning ke log (langkah mana yang macet + sudah berapa
// lama). Bukan timer paksa-ready: LoadingScreen tetap menunggu prop
// `finishing` by design (U-P1-23).
let initInFlight = false;
let bootCurrentStep = "belum mulai";
let bootWatchdogTimer: ReturnType<typeof setTimeout> | null = null;

// ── Komponen dalam yang butuh tema ──────────────────────────────────────────
//
// RootLayout sendiri berada DI ATAS ThemeProvider, jadi tidak bisa memanggil
// useTheme(). Error screen + Stack dibungkus komponen dalam yang dirender di
// dalam <ThemeProvider> — warnanya mengikuti tema aktif (saat cold start
// ThemeContext mengembalikan DEFAULT_THEME = pristine-noir secara sinkron
// sampai tema tersimpan selesai dibaca, jadi tidak ada tema lain yang
// di-hardcode di sini).
// Per-node render (2026-11-22): memo — layar error hanya perlu bangun
// bila errorMessage/onRetry berubah, bukan tiap render RootLayout.
const ErrorScreen = memo(function ErrorScreen({
  errorMessage,
  onRetry,
}: {
  errorMessage: string | null;
  onRetry: () => void;
}) {
  const { colors } = useTheme().theme;

  // Aksen tombol Retry: emas tema selama terbaca di atas latar, jatuh ke
  // warna teks bila tidak (pola Equalizer).
  const accent = accentOn(
    [colors.primary[500]],
    colors.background.primary,
    [colors.text.primary, colors.text.secondary],
  );

  return (
    <View
      style={[
        styles.errorContainer,
        { backgroundColor: colors.background.primary },
      ]}
    >
      <Text style={[styles.errorTitle, { color: colors.status.error }]}>
        System Engine Failure
      </Text>
      <Text style={[styles.errorMessage, { color: colors.text.secondary }]}>
        {errorMessage}
      </Text>
      <TouchableOpacity
        style={[styles.retryButton, { borderColor: accent }]}
        onPress={onRetry}
      >
        <Text style={[styles.retryText, { color: accent }]}>
          Retry Initialize
        </Text>
      </TouchableOpacity>
    </View>
  );
});

function ThemedStack({ contentOpacity }: { contentOpacity: Animated.Value }) {
  const { colors } = useTheme().theme;

  // Per-node render (2026-11-22): screenOptions dulu objek literal baru
  // tiap render ThemedStack — Stack menerima identitas baru dan ikut
  // me-render ulang rute. Sekarang useMemo (berubah hanya bila tema
  // berganti); opsi layar player (modal) juga stabil di dalamnya.
  const screenOptions = useMemo(
    () => ({
      headerShown: false,
      contentStyle: { backgroundColor: colors.background.primary },
    }),
    [colors.background.primary],
  );
  const playerScreenOptions = useMemo(
    () => ({
      presentation: "modal" as const,
      animation: "slide_from_bottom" as const,
      gestureEnabled: true,
      gestureDirection: "vertical" as const,
    }),
    [],
  );

  // FASE 4: SATU pemicu refresh foreground (quickDiff + bump refreshKey)
  // — ter-mount sekali di sini, hidup selama app ready. Pengganti dua
  // listener AppState di library.tsx + useScanManager.
  useForegroundRefreshCoordinator();

  // HRTF gate (langkah 6, 2026-11-19): HRTF dimatikan otomatis begitu
  // output bukan headphone. Dipasang di sini — hidup selama app ready —
  // bukan hanya di layar EQ (pelajaran P1-7: auto-off koreksi hanya
  // jalan saat layar EQ terbuka, jadi cabut jack di layar lain tidak
  // mematikan apa pun).
  useHrtfGate();

  // Auto-OFF koreksi headphone (P1-7, 2026-11-19): hook yang sama
  // dipasang di root playback, di samping useHrtfGate — cabut jack/DAC
  // di layar mana pun tetap mematikan koreksi. Mount di layar EQ tetap
  // ada (layar itu butuh return value-nya untuk caption grafik); hook
  // ini idempotent, jadi dua mount tidak saling mengganggu.
  useHeadphoneCorrection();

  // Profil per Output (2026-11-20): preset EQ otomatis saat jalur output
  // berubah — jack/DAC/Bluetooth/speaker — selama fitur diaktifkan user
  // di Settings (default OFF). Berlapis DI ATAS auto-OFF koreksi di
  // atas, bukan menggantinya: cabut jack tetap mematikan koreksi (di
  // sana) dan menerapkan preset speaker (di sini). Hook ini idempotent
  // (hanya bereaksi pada transisi kategori), jadi tidak melawan pilihan
  // EQ manual user.
  useOutputProfiles();

  return (
    <SafeAreaProvider>
      <Animated.View
        style={[
          { flex: 1, backgroundColor: colors.background.primary },
          { opacity: contentOpacity },
        ]}
      >
        <Stack screenOptions={screenOptions}>
          <Stack.Screen name="index" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="(drawer)" />
          <Stack.Screen name="player/index" options={playerScreenOptions} />
        </Stack>
        <AudioPropertyToast />
        <GlobalToast />
      </Animated.View>
    </SafeAreaProvider>
  );
}

export default function RootLayout() {
  const [appState, setAppState] = useState<AppInitState>("initializing");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const diagRef = useRef<AudioDiagnosticsHandle | null>(null);
  // Penahan splash native — dibersihkan saat unmount supaya timer tidak
  // memanggil setAppState setelah RootLayout tidak ada.
  const splashHoldTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (splashHoldTimer.current !== null) {
        clearTimeout(splashHoldTimer.current);
      }
    };
  }, []);

  const initStore = usePlayerStore((s) => s.initStore);
  const setAudioMode = usePlayerStore((s) => s.setAudioMode);

  // U-P1-33: URL file audio eksternal terakhir yang ditangani + waktunya —
  // cold start lewat intent bisa sampai lewat getInitialURL DAN listener
  // 'url', jadi yang sama dalam 2 detik hanya ditangani sekali.
  const lastExternalUrlRef = useRef({ url: "", ts: 0 });

  // U-P1-33: rutekan file audio yang dibuka dari luar (Files / file
  // manager) ke antrean/pemutaran lewat playSong. Bukan audio / tidak
  // bisa di-resolve → abaikan diam-diam (log saja), jangan klaim sukses,
  // jangan crash. Kegagalan native (content:// tak ter-resolve) dilaporkan
  // playSong lewat return false — dicatat di log, UI tidak berbohong.
  const handleExternalAudioUrl = useCallback(
    (rawUrl: string | null | undefined) => {
      if (!isExternalAudioUrl(rawUrl)) return;
      const url = rawUrl as string;
      const now = Date.now();
      const last = lastExternalUrlRef.current;
      if (last.url === url && now - last.ts < 2000) return;
      lastExternalUrlRef.current = { url, ts: now };

      // File yang sudah ada di library diputar sebagai track-nya (metadata
      // lengkap); kalau belum discan, bangun Song minimal dari nama file.
      const existing = useLibraryStore
        .getState()
        .tracks.find((t) => t.uri === url);
      const song: Song = existing ?? songFromExternalAudioUrl(url);
      void usePlayerStore
        .getState()
        .playSong(song, [song])
        .then((ok) => {
          if (ok) {
            console.log(
              `[ExternalAudio] Memutar file dari luar: ${song.title}`,
            );
          } else {
            console.warn(`[ExternalAudio] playSong menolak file: ${url}`);
          }
        })
        .catch((e) => {
          console.warn("[ExternalAudio] playSong gagal:", e);
        });
    },
    [],
  );

  // U-P1-33: handler intent audio — didaftarkan sekali saat app ready
  // (playSong butuh engine/store yang sudah init). getInitialURL menangani
  // cold start lewat intent, listener 'url' menangani intent saat app sudah
  // jalan. Cleanup melepas listener saat unmount.
  useEffect(() => {
    if (appState !== "ready") return;
    void Linking.getInitialURL()
      .then(handleExternalAudioUrl)
      .catch(() => {});
    const sub = Linking.addEventListener("url", (event) => {
      handleExternalAudioUrl(event.url);
    });
    return () => sub.remove();
  }, [appState, handleExternalAudioUrl]);

  // DSP Guard (diperbaiki 2026-11-19, ronde clean-cozy): saat masuk
  // bit-perfect, sakelar master EQ dimatikan — TAPI preferensi dicatat
  // dulu di penanda eqEnabledBeforeBitPerfect (dipersist, tahan
  // restart). Saat kembali ke mode DSP, preferensi dipulihkan: EQ
  // menyala lagi persis seperti sebelum masuk bit-perfect. Perilaku
  // lama mematikan isEQEnabled persisten tanpa jejak, jadi pengguna
  // yang kembali ke DSP mendapati EQ-nya mati tanpa pernah mematikannya.
  useEffect(() => {
    const unsub = usePlayerStore.subscribe((state, prevState) => {
      const eqStore = useEqualizerStore.getState();
      if (state.audioMode === "bit-perfect") {
        if (eqStore.isEQEnabled) {
          eqStore.setEqEnabledBeforeBitPerfect(true);
          console.log("🛡️ [System] Bit-Perfect Mode active, disabling DSP.");
          void eqStore.setEQEnabled(false);
        }
      } else if (
        state.audioMode === "dsp" &&
        prevState.audioMode !== "dsp" &&
        eqStore.eqEnabledBeforeBitPerfect === true
      ) {
        // Kembali ke DSP (dari bit-perfect ATAU dari Solfeggio sesudah
        // bit-perfect): pulihkan preferensi, lalu bersihkan penanda.
        console.log(
          "🛡️ [System] Kembali ke DSP, memulihkan sakelar EQ.",
        );
        eqStore.setEqEnabledBeforeBitPerfect(null);
        if (!eqStore.isEQEnabled) {
          void eqStore.setEQEnabled(true);
        }
      }
    });
    return unsub;
  }, []);

  // Init
const performInitialization = useCallback(async () => {
  // J3-3: tolak panggilan kedua selama init masih berjalan (tap Retry dua
  // kali cepat, atau boot effect + Retry bersamaan).
  if (initInFlight) {
    console.log("[BOOT] init sudah berjalan, panggilan ganda diabaikan");
    return;
  }
  initInFlight = true;

  // J3-2: watchdog boot — cap timestamp + durasi tiap langkah. bootMark
  // dipanggil di AWAL tiap langkah, jadi log-nya menunjukkan durasi langkah
  // sebelumnya; kalau satu langkah macet, log terakhir menunjukkan langkah
  // mana dan catch di bawah melaporkan sudah berapa lama. Timer 20 dtk
  // hanya menulis warning (bukan memaksa ready).
  const bootT0 = Date.now();
  let bootLastMarkAt = bootT0;
  const bootMark = (step: string) => {
    bootCurrentStep = step;
    const now = Date.now();
    console.log(
      `[BOOT] ⏱ ${step} — +${now - bootLastMarkAt}ms (total ${now - bootT0}ms)`,
    );
    bootLastMarkAt = now;
  };
  if (bootWatchdogTimer) clearTimeout(bootWatchdogTimer);
  bootWatchdogTimer = setTimeout(() => {
    console.warn(
      `[BOOT] ⚠ Boot lambat: masih di langkah "${bootCurrentStep}" setelah ${Date.now() - bootT0}ms`,
    );
  }, 20_000);

  try {
    bootMark("mulai");
    console.log("[BOOT] 1. Initializing Audio Engine & Stores...");

    bootMark("font");

    // Fase 1 redesign: font Playfair Display + Inter dibundel di
    // assets/fonts/. Muat di boot sebelum UI pertama — tapi tidak pernah
    // memblokir boot (loadAppFonts mengembalikan false bila gagal, app
    // lanjut dengan font sistem).
    const fontsOk = await loadAppFonts();
    console.log(
      `[BOOT] Font ${fontsOk ? "dimuat (Playfair Display + Inter)" : "gagal — lanjut font sistem"}`,
    );

    bootMark("izin");

    // ==========================================================
    // URUTAN IZIN - SEBELUM ENGINE
    // ==========================================================
    //
    // Dulu `audioEngine.initialize()` dipanggil PERTAMA, dan di dalamnya ada
    // `NativePlaybackService.startService()` -> `startForeground()`. Di
    // Android 13+ (API 33+) foreground service butuh izin POST_NOTIFICATIONS;
    // kalau belum ada, sistem menampilkan permintaan izin SAAT ITU JUGA -
    // jadi dialog izin muncul sebelum layar onboarding sempat dirender.
    //
    // User melihat dialog izin sistem di atas splash, tanpa konteks. Setelah
    // itu onboarding MEMINTA LAGI (media + notifikasi) di langkah terakhir.
    // Dua permintaan untuk hal yang sama, dan yang pertama tanpa penjelasan.
    //
    // Perbaikan: izin diminta di sini HANYA kalau onboarding sudah selesai.
    // Kalau belum, onboarding yang memintanya - di sana user sudah tahu
    // aplikasi apa ini dan kenapa izinnya dibutuhkan.
    let needsOnboarding = true;

    try {
      needsOnboarding =
        (await AsyncStorage.getItem("has_onboarded")) !== "true";

      if (!needsOnboarding) {
        const { PermissionsAndroid, Platform } = require("react-native");

        if (Platform.OS === "android" && Platform.Version >= 33) {
          const granted = await PermissionsAndroid.check(
            PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
          );

          if (!granted) {
            console.log(
              "[BOOT] Onboarding selesai - meminta POST_NOTIFICATIONS",
            );
            await PermissionsAndroid.request(
              PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
            );
          }
        }

        // Izin baca media: READ_MEDIA_AUDIO di API 33+, READ_EXTERNAL_STORAGE
        // di bawahnya. Diminta di sini supaya layar Library tidak menemukan
        // izin kosong saat pertama kali dibuka.
        await requestAudioPermissions();
      } else {
        console.log(
          "[BOOT] Onboarding belum selesai - izin diminta di layar onboarding",
        );
      }
    } catch (e) {
      // Kegagalan izin tidak fatal: audio tetap bisa diputar untuk berkas yang
      // sudah ada di library. Yang hilang hanya notifikasi/pemindaian baru.
      console.warn("[BOOT] Pemeriksaan izin awal dilewati:", e);
    }

    bootMark("audioEngine.initialize");
    await audioEngine.initialize();
    bootMark("initStore");
    await initStore();

    bootMark("listDevices");

    // F2 (logcat #25, 2026-11-16): cold-start race — NativeDeviceModule
    // adalah TurboModule lazy: initialize() (→ nativeInitAppContext,
    // JniContext) baru jalan saat JS pertama menyentuh modul. Play pertama
    // bisa menang (tap 22:02:17, init baru 22:02:25) → decoder gagal
    // resolve content:// sementara stream jalan senyap 12 dtk. Sentuh
    // modul di BOOT — sebelum UI interaktif — supaya Context sudah siap
    // jauh sebelum tap pertama. listDevices() idempotent dan sudah
    // dipanggil saat pemakaian normal.
    try {
      const { AudioOutputService } = require("@/features/hardware/api/audioOutput");
      const devices = await AudioOutputService.listDevices();
      console.log(`[BOOT] NativeDeviceModule ready (${devices.length} perangkat)`);
    } catch (e) {
      console.warn("[BOOT] NativeDeviceModule warm-up dilewati:", e);
    }

    // 🔥 FIX: Clear old audio cache (anti penumpukan)
    bootMark("clearCache");
    try {
      const { NativeModules } = require("react-native");
      const svc = NativeModules.NativePlaybackService;
      if (svc?.clearCache) {
        const deleted = await svc.clearCache();
        console.log(`[BOOT] 🧹 Cleared ${deleted} cache files`);
      } else {
        console.log("[BOOT] ⚠️ clearCache");
      }
    } catch (e) {
      console.warn("[BOOT] Cache cleanup skipped:", e);
    }

    // 🔥 FIX: Reset stuck scan state (anti macet)
    bootMark("reset scan state");
    try {
      const { UnifiedScanService } = require("@/features/library/services/UnifiedScanService");
      const libraryStore = require("@/features/library/store/libraryStore").useLibraryStore.getState();
      
      let didReset = false;
      
      if (UnifiedScanService?.isRunning) {
        console.warn("[BOOT] 🚨 Reset UnifiedScanService.isRunning");
        UnifiedScanService.isRunning = false;
        UnifiedScanService.currentMode = null;
        UnifiedScanService.abortController = null;
        didReset = true;
      }
      
      if (libraryStore?.isManualScanning || libraryStore?.isAutoScanning) {
        console.warn("[BOOT] 🚨 Reset store scan state");
        libraryStore.finishManualScan?.();
        libraryStore.finishAutoScan?.();
        didReset = true;
      }
      
      if (didReset) {
        console.log("[BOOT] ✅ Stuck scan state reset");
      }
    } catch (e) {
      console.warn("[BOOT] Scan reset skipped:", e);
    }

    bootMark("setAudioMode");
    const savedMode = await AsyncStorage.getItem("audio_mode_preference");
    const eqStore = useEqualizerStore.getState();

    // Tiga mode, sesuai prinsip desain app. `immersive` ikut dibaca supaya
    // pilihan itu tidak hilang saat app dibuka ulang.
    //
    // EQ hanya dimatikan di bit-perfect: di situ DSP memang dilewati, jadi
    // menyalakan EQ akan berbohong (slider bergerak tapi tidak ada efek).
    // Di immersive, EQ justru bagian dari rantainya - mematikannya akan
    // menghapus separuh efek.
    if (savedMode === "immersive") {
      await setAudioMode("immersive");
    } else if (savedMode === "bit-perfect") {
      await setAudioMode("bit-perfect");
      eqStore.setEQEnabled(false);
    } else {
      await setAudioMode("dsp");
    }

    // Izin media + notifikasi sudah ditangani di blok URUTAN IZIN di atas.
    // Blok lama di sini meminta POST_NOTIFICATIONS lagi tanpa syarat, yang
    // berarti user baru akan melihat permintaan yang sama dua kali (sekali
    // tanpa konteks dari sini, sekali dari onboarding).

    bootMark("selesai");
    console.log("[BOOT] Engine & Store initialization success.");
    setAppState("loading");
  } catch (error) {
    console.error(
      `[BOOT] Initialization Fatal Error (langkah "${bootCurrentStep}", ${Date.now() - bootT0}ms):`,
      error,
    );
    setErrorMessage(error instanceof Error ? error.message : "Engine Failure");
    setAppState("error");
  } finally {
    if (bootWatchdogTimer) {
      clearTimeout(bootWatchdogTimer);
      bootWatchdogTimer = null;
    }
    initInFlight = false;
  }
}, [initStore, setAudioMode]);

  // ============================================================
  // BOOT TRIGGER
  // ============================================================
  //
  // performInitialization() sebelumnya HANYA dipanggil dari tombol Retry
  // (appState === "error"). Akibatnya audioEngine.initialize() tidak pernah
  // jalan saat boot, dan karena startService() ada di dalamnya, foreground
  // service + notifikasi player TIDAK PERNAH aktif.
  //
  // Gejala di device: tidak ada notifikasi media, dan proses mudah dimatikan
  // sistem karena tidak ada foreground service yang menahannya.
  // Terbukti pada logcat 2026-10-04 12:18 - tidak ada satu pun baris
  // PlaybackService / startForeground untuk aplikasi ini, sementara
  // "[BOOT] 1. Initializing Audio Engine & Stores..." juga tidak muncul
  // (yang muncul hanya "[BOOT] 1. Index mount started" dari index.tsx).
  //
  // hasInitializedModule (level modul) sekarang benar-benar dipakai sebagai
  // penjaga supaya inisialisasi tidak berjalan dua kali (React StrictMode /
  // remount). Ref gagal di sini: remount me-reset ref, dan pada 2026-11-10
  // init jalan 2x lalu run kedua macet sebelum "Engine & Store
  // initialization success" (splash tidak pernah hilang).
  useEffect(() => {
    if (hasInitializedModule) return;
    hasInitializedModule = true;
    performInitialization();
  }, [performInitialization]);




  // ============================================================
  // 🔥 DIAGNOSTICS MONITOR (dev only)
  // ============================================================
  useEffect(() => {
    if (!__DEV__) return;
    if (appState !== "ready") return;

    console.log("[DIAG] 🔍 Starting audio diagnostics monitor...");
    const diag = startAudioDiagnostics({
      intervalMs: DIAGNOSTIC_INTERVAL_MS,
      verbose: true,
      speedLowThreshold: 0.5,
      speedHighThreshold: 1.5,
    });

    diagRef.current = diag;

    // 🔥 Expose ke global untuk trigger manual dari console
    (global as any).__audioDiag = diag;
    (global as any).__audioSnapshot = getAudioSnapshot;
    (global as any).__audioReport = () => printDiagnosticReport(diag);
    (global as any).__audioTestMatrix = runAudioTestMatrix;

    console.log("[DIAG] ✅ Diagnostics started");
    console.log(
      "[DIAG] Available: __audioSnapshot(), __audioReport(), __audioTestMatrix()",
    );

    // [BRIDGE-PROBE] (diagnostik SEMENTARA, logcat #8): sampler round-trip
    // bridge 1/detik — jalan di efek dev-only yang sama dengan monitor di
    // atas. Cabut start/stop ini + modul bridgeProbe.ts bila sudah terjawab.
    //
    // KONTROL TRACE 3 selesai 21 Nov 2026 (log #13): probe kembali ON.
    const BRIDGE_PROBE_ENABLED = true;

    const probe = BRIDGE_PROBE_ENABLED ? startBridgeProbe({
      getAudioMode: () => usePlayerStore.getState().audioMode,
      getCrossfadeSeconds: () =>
        useCrossfadeStore.getState().crossfadeSeconds,
      // Panggilan native diinjeksikan di sini (composition root) supaya
      // modul probe tetap logika murni tanpa impor spec TurboModule.
      callNative: (seconds, sessionId) =>
        NativeDSPModule.setCrossfadeSeconds(seconds, sessionId),
      createSession: async () => {
        const r = await NativeDSPModule.createAudioSession();
        return r?.sessionId ?? 0;
      },
    })
      : null;

    // [DIAG-GATE] nyalakan semua log diagnostik sementara (event-lag,
    // drag-diag, fling-diag, mode-switch) — jalan di efek dev-only yang
    // sama dengan monitor + probe di atas; mati di cleanup di bawah.
    setTempDiagEnabled(true);

    return () => {
      console.log("[DIAG] 🛑 Stopping diagnostics monitor");
      probe?.stop();
      setTempDiagEnabled(false);
      diag.stop();
      diagRef.current = null;
      delete (global as any).__audioDiag;
      delete (global as any).__audioSnapshot;
      delete (global as any).__audioReport;
      delete (global as any).__audioTestMatrix;
    };
  }, [appState]);

  // Handle loading complete — SEBELUM: splash native langsung hilang di
  // sini (hideAsync segera setelah animasi keluar LoadingScreen selesai),
  // lalu ready 200 ms kemudian. SESUDAH: splash native ditahan
  // SPLASH_HOLD_MS dulu supaya gambarnya sempat terlihat, baru hilang
  // dan masuk fase "splash-image" (splash.png tampil lagi sebagai
  // interstitial in-app sebelum rute tampil).
  // Per-node render (2026-11-22): retry stabil supaya memo ErrorScreen
  // tidak batal oleh onRetry baru tiap render RootLayout.
  const handleRetryInit = useCallback(() => {
    setAppState("initializing");
    hasInitializedModule = false;
    performInitialization();
  }, [performInitialization]);

  const handleLoadingComplete = useCallback(() => {
    splashHoldTimer.current = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {});
      setAppState("splash-image");
    }, SPLASH_HOLD_MS);
  }, []);

  // Fase "splash-image" → ready: interstitial splash.png tampil
  // SPLASH_IMAGE_MS, lalu jeda lama 200 ms dan fade-in konten 500 ms
  // seperti sebelumnya. Rute baru tampil setelah ini (index Redirect →
  // onboarding untuk pengguna baru, Library untuk yang sudah onboarded —
  // guard onboarding tidak disentuh).
  useEffect(() => {
    if (appState !== "splash-image") return;
    const timer = setTimeout(() => {
      setAppState("ready");
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }).start();
    }, SPLASH_IMAGE_MS + SPLASH_READY_DELAY_MS);
    return () => clearTimeout(timer);
  }, [appState, contentOpacity]);

  // ── UI STATE: ERROR ──────────────────────────────
  if (appState === "error") {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ThemeProvider>
          <ErrorScreen
            errorMessage={errorMessage}
            onRetry={handleRetryInit}
          />
        </ThemeProvider>
      </GestureHandlerRootView>
    );
  }

  // ── UI STATE: INITIALIZING / LOADING ─────────────
  // U-P1-23: LoadingScreen TIDAK LAGI memutuskan sendiri kapan selesai.
  // `finishing` baru true saat appState === "loading" — dan state itu
  // hanya di-set performInitialization() SETELAH engine + store selesai
  // init. Selama "initializing" layar menunggu indeterminate (tanpa teks
  // langkah palsu, tanpa memaksa ready). Dulu timer internal LoadingScreen
  // (~4,2 dtk) memanggil handleLoadingComplete lepas dari keadaan engine:
  // init cepat tetap menunggu 4,2 dtk, init lambat dipaksa ready duluan.
  if (appState === "initializing" || appState === "loading") {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ThemeProvider>
          <LoadingScreen
            onLoadingComplete={handleLoadingComplete}
            finishing={appState === "loading"}
          />
        </ThemeProvider>
      </GestureHandlerRootView>
    );
  }

  // ── UI STATE: SPLASH IMAGE ─────────────────────
  // Interstitial splash.png (contain, latar tema) antara splash native
  // dan rute pertama. Tampil untuk pengguna baru maupun lama — rutenya
  // yang berbeda (onboarding vs Library), ditentukan index + guard.
  if (appState === "splash-image") {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ThemeProvider>
          <SplashImageScreen />
        </ThemeProvider>
      </GestureHandlerRootView>
    );
  }

  // ── UI STATE: READY ──────────────────────────────
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <ThemedStack contentOpacity={contentOpacity} />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 10,
    textAlign: "center",
  },
  errorMessage: {
    textAlign: "center",
    marginBottom: 30,
    lineHeight: 20,
  },
  retryButton: {
    paddingVertical: 14,
    paddingHorizontal: 30,
    borderWidth: 1.5,
    borderRadius: 12,
  },
  retryText: { fontWeight: "bold", fontSize: 16 },
}); 