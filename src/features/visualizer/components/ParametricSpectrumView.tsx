// src/features/visualizer/components/ParametricSpectrumView.tsx
//
// Bar spektrum parametrik untuk MAIN PLAYER — menggantikan SpectogramView
// (waterfall) di sana sejak 2026-11-17. Beda dengan tab Analyzer:
// - Tanpa sumbu/grid/label dB, tanpa pill CLIP, tanpa scroll — tampilan
//   minimal yang muat di ruang 120px main player.
// - Warna bar GRADIENT MULUS ramp hangat mengikuti dB (sejak 2026-11-18
//   sore, pilihan csheva di Fase 3 — menggantikan biru→merah pagi itu;
//   merah di 0 dB dipertahankan):
//   SATU gradient vertikal (cokelat-amber gelap bawah → merah atas)
//   untuk semua bar — ujung atas tiap bar = warna dB-nya karena tinggi
//   bar ∝ dB. Bukan satu warna solid per bar, bukan zona yang patah.
// - PEAK HOLD: topi kecil di puncak terakhir tiap bar, naik instan,
//   turun pelan (~3 detik dari 0 dB ke lantai).
// - GLOW murah: halo (bar yang sama, sedikit lebih lebar, opacity
//   rendah) di belakang bar utama — TANPA BlurMask (mahal untuk 48 bar).
// - SINGLE-CHANNEL (mono): satu array FFT campuran dari
//   VisualizerService.getFFTData(). BUKAN dobel channel L/R —
//   dual-channel butuh FFT native per channel (follow-up, bukan di sini).
//
// Hemat resource (keputusan csheva 2026-11-17 — pertimbangkan pemakaian
// resources dulu):
// - Data + processed + peak hidup di SharedValue (UI thread), TIGA Path
//   saja (halo, bar, topi peak) + SATU shader gradient, TANPA setState
//   per frame, TANPA BlurMask, TANPA ribuan elemen React per frame
//   (kesalahan waterfall lama yang sudah diperbaiki).
// - Bar count 48 (sama seperti Analyzer), bukan 128.

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  Dimensions,
  Text,
  AppState,
} from "react-native";

import { Canvas, Path, Skia, Group, LinearGradient, vec } from "@shopify/react-native-skia";

import {
  useSharedValue,
  useDerivedValue,
  useAnimatedReaction,
  runOnUI,
  runOnJS,
} from "react-native-reanimated";

import { visualizerService } from "@/features/visualizer/services/VisualizerService";
import {
  PARAMETRIC_GRADIENT_STOPS,
  PEAK_HOLD_FLOOR,
  dbToValue,
  nextPeakHold,
} from "@/features/visualizer/api/analyzerSpectrum";

export interface ParametricSpectrumViewProps {
  width?: number;
  height?: number;
  barCount?: number;
  backgroundColor?: string;
  sensitivity?: number;
  isPlaying: boolean;
  audioSessionId?: number;
}

const DEFAULT_BAR_COUNT = 48;
const MAX_BAR_COUNT = 128;
const MIN_BAR_COUNT = 16;

// Bar digambar setinggi maks 85% area (sama seperti AnalyzerSpectrum) —
const BAR_HEIGHT_FACTOR = 0.85;

// Gradient vertikal SATU shader untuk halo + bar + topi peak:
// cokelat-amber gelap di bawah (amp 0 = -80 dB) → merah di atas
// (amp 1 = 0 dB). Posisi jangkar
// = dbToValue(dB) — ujung atas bar setinggi amp tepat menyentuh warna
// dB-nya. Start/end gradient dihitung per render (butuh `height`).
const GRADIENT_COLORS = PARAMETRIC_GRADIENT_STOPS.map((s) => s.color);
const GRADIENT_POSITIONS = PARAMETRIC_GRADIENT_STOPS.map((s) =>
  dbToValue(s.db),
);

// Glow halo: bar yang sama, 2 px lebih lebar (1 px tiap sisi), opacity
// rendah — halo lembut tanpa BlurMask.
const HALO_EXTRA_WIDTH = 2;
const HALO_OPACITY = 0.22;
const HALO_OPACITY_WAITING = 0.12;

// Topi peak hold: garis kecil 3 px di puncak terakhir tiap bar.
const PEAK_CAP_HEIGHT = 3;

export const ParametricSpectrumView: React.FC<
  ParametricSpectrumViewProps
> = ({
  width = Dimensions.get("window").width - 40,
  height = 120,
  barCount: rawBarCount = DEFAULT_BAR_COUNT,
  backgroundColor = "transparent",
  sensitivity = 2.0,
  isPlaying,
  audioSessionId,
}) => {
  const barCount = Math.max(
    MIN_BAR_COUNT,
    Math.min(MAX_BAR_COUNT, rawBarCount),
  );

  const freqData = useSharedValue<number[]>(Array(MAX_BAR_COUNT).fill(0.1));
  const prevData = useSharedValue<number[]>(Array(barCount).fill(0.1));
  // Puncak terakhir tiap bar (peak hold) — naik instan, turun pelan
  // lewat nextPeakHold BERBASIS WAKTU di useAnimatedReaction di bawah.
  const peaks = useSharedValue<number[]>(
    Array(barCount).fill(PEAK_HOLD_FLOOR),
  );
  // Jam terakhir update peak hold (ms, Date.now di worklet) — untuk
  // dtMs decay berbasis waktu. 0 = belum pernah (tick pertama pakai
  // 100 ms nominal). Di-reset saat stop supaya timestamp basi tidak
  // terpakai setelah jeda panjang (dtMs di-clamp 1000 ms juga).
  const lastPeakMs = useSharedValue(0);

  // FIX: hasRealData dan isPlayingSV sebagai SharedValue agar bisa dibaca worklet
  const hasRealData = useSharedValue(false);
  const isPlayingSV = useSharedValue(isPlaying);
  // Penghitung frame sunyi berturut-turut (pola AnalyzerSpectrum) —
  // hasRealData baru false setelah > 10 frame sunyi, bukan pada frame
  // sunyi pertama (bukan jeda antar-frame).
  const silentFramesSV = useSharedValue(0);

  // ITEM 1 (2026-11-21): suspend loop gambar saat app background/
  // inactive. `VisualizerService.pause()` hanya menghentikan polling
  // data — loop umpan-balik di bawah (processedData → reaction →
  // prevData → processedData) tetap jalan karena tiap evaluasi
  // mengembalikan array BARU (referensi baru = perubahan baru bagi
  // Reanimated), sehingga Canvas terus minta redraw ~60 Hz ke surface
  // yang sudah lepas (sumber `updateAndRelease() failed` 1.525× log
  // #14). `isSuspendedSV` dicerminkan dari AppState; `cachedProcessed`
  // menyimpan referensi array processed terakhir supaya cabang suspend
  // di processedData bisa mengembalikan referensi yang SAMA.
  const isSuspendedSV = useSharedValue(AppState.currentState !== "active");
  const cachedProcessed = useSharedValue<number[]>(
    Array(barCount).fill(0.1),
  );

  // Cermin hasRealData di JS thread — dipakai render label "menunggu data"
  // + opacity (baca .value SharedValue langsung di JSX itu basi).
  const [hasRealDataState, setHasRealDataState] = useState(false);

  // U-P2-27: kegagalan polling FFT native (VisualizerService.setOnError)
  const [fftError, setFftError] = useState(false);

  useEffect(() => {
    return visualizerService.setOnError(() => setFftError(true));
  }, []);

  const unsubscribeRef = useRef<(() => void) | null>(null);
  const isStarted = useRef(false);
  const lastSessionId = useRef<number | null>(null);

  // Sync isPlaying prop → SharedValue
  useEffect(() => {
    isPlayingSV.value = isPlaying;
  }, [isPlaying]);

  // ITEM 1: cerminkan AppState ke UI thread (suspend = apa pun selain
  // "active", termasuk "inactive" sementara). Saat kembali foreground,
  // reset jam peak hold supaya timestamp basi selama background tidak
  // dipakai sebagai dtMs decay; data segar mengalir lagi dari polling
  // service yang di-resume (tidak ada bar basi yang ditahan — prevData/
  // peaks dibiarkan apa adanya supaya falloff/smoothing normal tetap
  // jalan dari nilai terakhir, sama seperti jeda biasa).
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const suspended = nextState !== "active";
      isSuspendedSV.value = suspended;
      if (!suspended) {
        lastPeakMs.value = 0;
      }
    });
    return () => subscription.remove();
  }, []);

  // U-P1-29: JANGAN tampilkan animasi sinus palsu seolah spektrum live
  // saat FFT native tidak mengembalikan data. Bar diam di lantai (0.05)
  // + label "Menunggu data audio…" di bawah.
  useAnimatedReaction(
    () => hasRealData.value,
    (real, prevReal) => {
      if (real !== prevReal) {
        runOnJS(setHasRealDataState)(real);
      }
    },
  );

  // Jalur data panas (item 3, 2026-11-21): sama seperti AnalyzerSpectrum —
  // tiap kali VisualizerService menulis freqData (SharedValue), reaksi ini
  // jalan DI UI THREAD — tanpa callback JS per frame, tanpa runOnUI hop.
  // Yang dihitung di sini hanya hasRealData (bar hidup vs lantai):
  // true bila maxVal > 0.01; false bila data sunyi > 10 frame
  // berturut-turut (bukan jeda antar-frame). Cermin ke state JS tetap di
  // useAnimatedReaction hasRealData di atas (runOnJS hanya bila berubah).
  useAnimatedReaction(
    () => freqData.value,
    (data) => {
      // ITEM 1: saat suspend, jangan hitung apa pun — tidak ada data
      // baru yang masuk (polling service pause).
      if (isSuspendedSV.value) {
        return;
      }
      // Beda dari Analyzer: jangan hitung saat tidak playing. Nilai
      // awal/reset freqData adalah fill 0.1 (placeholder, bukan data
      // FFT) — maxVal 0.1 > 0.01 akan terbaca "real" oleh reaksi ini
      // saat mount dan saat stop menulis ulang fill 0.1, sehingga
      // hasRealData jadi true padahal tidak ada audio (bar idle/paused
      // tampil full opacity, bukan redup seperti sekarang). Guard ini
      // menjaga perilaku visual idle/paused tetap sama; saat playing,
      // semantiknya identik dengan Analyzer.
      if (!isPlayingSV.value) {
        return;
      }
      if (!data || data.length === 0) return;

      let maxVal = 0;
      for (let i = 0; i < data.length; i++) {
        const v = data[i] ?? 0;
        if (v > maxVal) maxVal = v;
      }
      const isReal = maxVal > 0.01;
      if (isReal) {
        hasRealData.value = true;
        silentFramesSV.value = 0;
      } else {
        // Data sunyi > 10 frame berturut-turut = sesi benar-benar
        // tidak mengalirkan FFT (bukan jeda antar-frame).
        silentFramesSV.value += 1;
        if (silentFramesSV.value > 10) hasRealData.value = false;
      }
    },
  );

  // Start/Stop berdasarkan isPlaying dan audioSessionId.
  //
  // MULTI-SUBSCRIBER (2026-11-10): layar ini subscribe saat butuh data dan
  // unsubscribe saat tidak — JANGAN panggil visualizerService.stop(), itu
  // kill-switch global yang mematikan polling untuk layar lain juga
  // (tab Analyzer, SpectogramView).
  useEffect(() => {
    const shouldStart = isPlaying && audioSessionId && audioSessionId > 0;

    if (shouldStart) {
      if (!isStarted.current || lastSessionId.current !== audioSessionId) {
        console.log(`[ParametricSpectrumView] Starting session ${audioSessionId}`);
        unsubscribeRef.current?.();
        // Item 3: langganan SharedValue langsung — VisualizerService
        // menulis freqData.value tiap poll; tidak ada callback JS per frame.
        unsubscribeRef.current =
          visualizerService.subscribeSharedValue(freqData);
        visualizerService.start(audioSessionId);
        isStarted.current = true;
        lastSessionId.current = audioSessionId;
        runOnUI(() => {
          "worklet";
          hasRealData.value = false;
          silentFramesSV.value = 0;
        })();
        setHasRealDataState(false);
        setFftError(false);
      }
    } else {
      if (isStarted.current) {
        console.log("[ParametricSpectrumView] Stopping");
        unsubscribeRef.current?.();
        unsubscribeRef.current = null;
        isStarted.current = false;
        lastSessionId.current = null;
        runOnUI(() => {
          "worklet";
          freqData.value = Array(MAX_BAR_COUNT).fill(0.1);
          prevData.value = Array(barCount).fill(0.1);
          peaks.value = Array(barCount).fill(PEAK_HOLD_FLOOR);
          lastPeakMs.value = 0;
          hasRealData.value = false;
          silentFramesSV.value = 0;
        })();
        setHasRealDataState(false);
      }
    }
  }, [isPlaying, audioSessionId, barCount]);

  // Cleanup saat unmount: lepas subscription (bukan stop() global).
  useEffect(() => {
    return () => {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
    };
  }, []);

  // Processed data — semua SharedValue, aman di worklet.
  // (Pemetaan sama seperti AnalyzerSpectrum: resample log dari 128 bin
  // mentah ke barCount, falloff 0.85, sensitivity + treble tilt supaya
  // bar tetap hidup untuk konten tenang.)
  const processedData = useDerivedValue(() => {
    // ITEM 1: saat suspend, kembalikan array TERAKHIR yang sama
    // (referensi identik, dari cachedProcessed) — bukan array baru.
    // Reanimated menganggap tidak ada perubahan, jadi reaction
    // umpan-balik tidak jalan dan path-path Skia (yang membaca
    // processedData/peaks) tidak dihitung ulang: Canvas tidak mendapat
    // picture baru dan tidak minta redraw ke surface yang sudah lepas.
    // Perubahan prop/State saat background (mis. isPlaying, laju) juga
    // aman: evaluasi ini tetap mengembalikan referensi yang sama.
    if (isSuspendedSV.value) {
      return cachedProcessed.value;
    }

    const raw = freqData.value;
    const useDummy = !hasRealData.value && isPlayingSV.value;

    if (useDummy) {
      return Array(barCount).fill(0.05);
    }

    if (!raw || raw.length === 0) return Array(barCount).fill(0.1);

    const result = Array.from({ length: barCount }, () => 0);
    const falloff = 0.85;

    for (let i = 0; i < barCount; i++) {
      const t = i / (barCount - 1);
      const logT = Math.pow(t, 1.2);
      const startIdx = Math.floor(logT * (raw.length - 1));
      const endIdx = Math.min(raw.length - 1, startIdx + 8);

      let sum = 0,
        count = 0;
      for (let j = startIdx; j <= endIdx && j < raw.length; j++) {
        sum += raw[j] || 0;
        count++;
      }

      let target = count > 0 ? (sum / count) * sensitivity : 0;
      target *= 1 + (i / barCount) * 0.5;
      target = Math.max(0.05, Math.min(1.0, target));

      const prev = prevData.value[i] || 0.05;
      if (target < prev * falloff) target = prev * falloff;

      result[i] = target;
    }

    return result;
  });

  useAnimatedReaction(
    () => processedData.value,
    (current) => {
      // ITEM 1: saat suspend, early-return TANPA menulis apa pun.
      // Menulis prevData/peaks akan memicu processedData menghitung
      // ulang, yang mengembalikan array baru, yang memicu reaction
      // lagi — loop yang tidak pernah settle. Cache diperbarui di sini
      // (bukan di dalam derived) supaya tidak ada derived yang menulis
      // dependensinya sendiri.
      if (isSuspendedSV.value) {
        return;
      }
      cachedProcessed.value = current;
      prevData.value = [...current];
      // Peak hold BERBASIS WAKTU: naik instan ke nilai saat ini, turun
      // pelan (PEAK_HOLD_DECAY_RATE_PER_SEC × dtMs) bila nilainya di
      // bawah puncak. dtMs dari Date.now() — reaction jalan di frame
      // rate (~60 Hz, feedback prevData), bukan ~10 Hz seperti asumsi
      // desain awal; decay per-tick dulu membuat cap hilang ~0,5 dtk
      // (ronde 12). Dengan dtMs, laju jatuh tetap ~24 dB/detik pada
      // tick rate berapa pun. Tick pertama pakai 100 ms (nominal poll).
      const now = Date.now();
      const last = lastPeakMs.value;
      const dtMs = last === 0 ? 100 : now - last;
      lastPeakMs.value = now;
      const p = peaks.value;
      const next = Array.from<number>({ length: barCount });
      for (let i = 0; i < barCount; i++) {
        next[i] = nextPeakHold(
          p[i] ?? PEAK_HOLD_FLOOR,
          current[i] ?? PEAK_HOLD_FLOOR,
          dtMs,
        );
      }
      peaks.value = next;
    },
  );

  // Geometri bar — worklet karena dipanggil dari useDerivedValue. Tanpa
  // direktif ini, Reanimated throw di runtime. `extraWidth` untuk halo
  // glow (bar yang sama, sedikit lebih lebar, posisi x digeser setengahnya
  // supaya tetap di tengah).
  const barGeometry = useCallback(
    (data: number[], extraWidth = 0) => {
      "worklet";
      const gap = 3;
      const barWidth = (width - (barCount - 1) * gap) / barCount;
      return data.map((amp, i) => {
        const barHeight = Math.max(4, amp * height * BAR_HEIGHT_FACTOR);
        const x = i * (barWidth + gap) - extraWidth / 2;
        const y = height - barHeight;
        return {
          rect: Skia.XYWHRect(x, y, barWidth + extraWidth, barHeight),
          amp,
        };
      });
    },
    [width, barCount, height],
  );

  // SATU Path untuk semua bar — warna dari SATU gradient vertikal
  // (cokelat-amber gelap bawah → merah atas, jangkar PARAMETRIC_GRADIENT_STOPS):
  // ujung atas bar setinggi amp menyentuh warna dB-nya karena tinggi
  // bar ∝ dB. 1 path + 1 shader, bukan 48 path berwarna sendiri-sendiri.
  const barsPath = useDerivedValue(() => {
    const path = Skia.Path.Make();
    for (const { rect } of barGeometry(processedData.value)) {
      path.addRRect(Skia.RRectXY(rect, 4, 4));
    }
    return path;
  });

  // Glow murah: bar yang sama, sedikit lebih lebar, opacity rendah, di
  // belakang bar utama — TANPA BlurMask (mahal untuk 48 bar per frame).
  // Halo memakai shader gradient yang sama, jadi warnanya ikut dB bar.
  const haloPath = useDerivedValue(() => {
    const path = Skia.Path.Make();
    for (const { rect } of barGeometry(
      processedData.value,
      HALO_EXTRA_WIDTH,
    )) {
      path.addRRect(Skia.RRectXY(rect, 4, 4));
    }
    return path;
  });

  // Topi peak hold: garis kecil di puncak terakhir tiap bar. Puncak
  // dibaca dari SharedValue `peaks` (naik instan, turun pelan) — topi
  // memakai shader gradient yang sama, jadi warnanya = warna dB puncak.
  const peaksPath = useDerivedValue(() => {
    const path = Skia.Path.Make();
    const gap = 3;
    const barWidth = (width - (barCount - 1) * gap) / barCount;
    for (let i = 0; i < barCount; i++) {
      const peak = peaks.value[i] ?? PEAK_HOLD_FLOOR;
      const barHeight = Math.max(4, peak * height * BAR_HEIGHT_FACTOR);
      const x = i * (barWidth + gap);
      const y = height - barHeight;
      path.addRRect(
        Skia.RRectXY(
          Skia.XYWHRect(x, y, barWidth, PEAK_CAP_HEIGHT),
          2,
          2,
        ),
      );
    }
    return path;
  });

  return (
    <View style={[styles.container, { width, height, backgroundColor }]}>
      {/* R10: Canvas Skia tidak punya ukuran intrinsik — `flex: 1` di
          container `alignItems: "center"` memberi tinggi 120px tapi lebar
          0 (sumbu silang ikut alignItems), sehingga tidak menggambar
          apa-apa. Ukuran eksplisit seperti SpectogramView. */}
      <Canvas style={{ width, height }}>
        <Group>
          {/* Glow: halo di belakang bar utama (opacity rendah). */}
          <Path
            path={haloPath}
            style="fill"
            opacity={hasRealDataState ? HALO_OPACITY : HALO_OPACITY_WAITING}
          >
            <LinearGradient
              start={vec(0, height)}
              end={vec(0, height * (1 - BAR_HEIGHT_FACTOR))}
              colors={GRADIENT_COLORS}
              positions={GRADIENT_POSITIONS}
            />
          </Path>
          {/* Bar utama — gradient mulus cokelat-amber gelap (-80 dB) → merah (0 dB). */}
          <Path
            path={barsPath}
            style="fill"
            opacity={hasRealDataState ? 1 : 0.5}
          >
            <LinearGradient
              start={vec(0, height)}
              end={vec(0, height * (1 - BAR_HEIGHT_FACTOR))}
              colors={GRADIENT_COLORS}
              positions={GRADIENT_POSITIONS}
            />
          </Path>
          {/* Topi peak hold di puncak terakhir tiap bar. */}
          <Path
            path={peaksPath}
            style="fill"
            opacity={hasRealDataState ? 0.9 : 0.4}
          >
            <LinearGradient
              start={vec(0, height)}
              end={vec(0, height * (1 - BAR_HEIGHT_FACTOR))}
              colors={GRADIENT_COLORS}
              positions={GRADIENT_POSITIONS}
            />
          </Path>
        </Group>
      </Canvas>

      {/* U-P1-29: lagu diputar tapi FFT belum/tidak mengembalikan data —
          katakan jujur, jangan animasikan bar palsu. */}
      {isPlaying && !hasRealDataState && (
        <View style={styles.waitingOverlay} pointerEvents="none">
          <Text style={styles.waitingText}>
            {fftError
              ? "Gagal membaca data visualizer — coba restart lagu."
              : "Menunggu data audio…"}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  waitingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  waitingText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#94A3B8",
    backgroundColor: "rgba(0,0,0,0.45)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: "hidden",
  },
});
