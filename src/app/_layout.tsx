import { configureReanimatedLogger, ReanimatedLogLevel } from "react-native-reanimated";

console.log("[BOOT] 0. _layout module loaded");
const Platform = require("react-native").Platform;
configureReanimatedLogger({ level: ReanimatedLogLevel.warn, strict: false });

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";
import * as Linking from "expo-linking";
import { Animated, StyleSheet, View, Text, TouchableOpacity } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { ThemeProvider, useTheme } from "@/shared/context/ThemeContext";
import { accentOn } from "@/shared/utils/contrast";
import LoadingScreen from "@/shared/components/ui/LoadingScreen";
import { AudioPropertyToast } from "@/features/player/components/AudioPropertyToast";

import { audioEngine } from "@/features/player/api/engine";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { useLibraryStore } from "@/features/library/store/libraryStore";
import {
  isExternalAudioUrl,
  songFromExternalAudioUrl,
} from "@/features/player/api/externalAudioUrl";
import type { Song } from "@/shared/types/audio";
import { useEqualizerStore } from "@/features/equalizer/store/equalizerStore";
import { requestAudioPermissions } from "@/shared/utils/permissions";

// 🔥 DIAGNOSTICS
import {
  startAudioDiagnostics,
  getAudioSnapshot,
  printDiagnosticReport,
  type AudioDiagnosticsHandle,
} from "@/features/player/api/diagnostics";
import { runAudioTestMatrix } from "@/features/player/api/testMatrix";
 
SplashScreen.preventAutoHideAsync();

type AppInitState = "initializing" | "loading" | "ready" | "error";

const DIAGNOSTIC_INTERVAL_MS = 5000;

// Penjaga init di level modul (bukan ref): ref ikut reset saat RootLayout
// remount (activity dibuat ulang), sehingga performInitialization bisa jalan
// dua kali melawan engine/store yang sudah initialized. Teramati 2026-11-10:
// "[BOOT] 1" muncul 2x di logcat, run kedua macet sebelum
// "Engine & Store initialization success" dan splash tidak pernah hilang.
// Proses baru me-reload modul ini, jadi guard reset tepat saat re-init yang
// sesungguhnya dibutuhkan. Tombol Retry tetap bisa reset guard ini.
let hasInitializedModule = false;

// ── Komponen dalam yang butuh tema ──────────────────────────────────────────
//
// RootLayout sendiri berada DI ATAS ThemeProvider, jadi tidak bisa memanggil
// useTheme(). Error screen + Stack dibungkus komponen dalam yang dirender di
// dalam <ThemeProvider> — warnanya mengikuti tema aktif (saat cold start
// ThemeContext mengembalikan DEFAULT_THEME = pristine-noir secara sinkron
// sampai tema tersimpan selesai dibaca, jadi tidak ada tema lain yang
// di-hardcode di sini).
function ErrorScreen({
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
}

function ThemedStack({ contentOpacity }: { contentOpacity: Animated.Value }) {
  const { colors } = useTheme().theme;

  return (
    <SafeAreaProvider>
      <Animated.View
        style={[
          { flex: 1, backgroundColor: colors.background.primary },
          { opacity: contentOpacity },
        ]}
      >
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background.primary },
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="(drawer)" />
          <Stack.Screen
            name="player/index"
            options={{
              presentation: "modal",
              animation: "slide_from_bottom",
              gestureEnabled: true,
              gestureDirection: "vertical",
            }}
          />
        </Stack>
        <AudioPropertyToast />
      </Animated.View>
    </SafeAreaProvider>
  );
}

export default function RootLayout() {
  const [appState, setAppState] = useState<AppInitState>("initializing");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const diagRef = useRef<AudioDiagnosticsHandle | null>(null);

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

  // DSP Guard
  useEffect(() => {
    const unsub = usePlayerStore.subscribe((state) => {
      if (state.audioMode === "bit-perfect") {
        const eqStore = useEqualizerStore.getState();
        if (eqStore.isEQEnabled) {
          console.log("🛡️ [System] Bit-Perfect Mode active, disabling DSP.");
          eqStore.setEQEnabled(false);
        }
      }
    });
    return unsub;
  }, []);

  // Init
const performInitialization = useCallback(async () => {
  try {
    console.log("[BOOT] 1. Initializing Audio Engine & Stores...");

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

    await audioEngine.initialize();
    await initStore();

    // 🔥 FIX: Clear old audio cache (anti penumpukan)
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

    console.log("[BOOT] Engine & Store initialization success.");
    setAppState("loading");
  } catch (error) {
    console.error("[BOOT] Initialization Fatal Error:", error);
    setErrorMessage(error instanceof Error ? error.message : "Engine Failure");
    setAppState("error");
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

    return () => {
      console.log("[DIAG] 🛑 Stopping diagnostics monitor");
      diag.stop();
      diagRef.current = null;
      delete (global as any).__audioDiag;
      delete (global as any).__audioSnapshot;
      delete (global as any).__audioReport;
      delete (global as any).__audioTestMatrix;
    };
  }, [appState]);

  // Handle loading complete
  const handleLoadingComplete = useCallback(() => {
    SplashScreen.hideAsync().catch(() => {});
    setTimeout(() => {
      setAppState("ready");
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }).start();
    }, 200);
  }, [contentOpacity]);

  // ── UI STATE: ERROR ──────────────────────────────
  if (appState === "error") {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ThemeProvider>
          <ErrorScreen
            errorMessage={errorMessage}
            onRetry={() => {
              setAppState("initializing");
              hasInitializedModule = false;
              performInitialization();
            }}
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