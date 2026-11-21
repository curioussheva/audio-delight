// src/features/visualizer/components/AnalyzerSpectrum.tsx
//
// Spektrum analyzer live ala Neutron untuk tab Analyzer — menggantikan
// SpectrumAnalyzer (bar polos) di tab itu saja. Tab Visualizer sudah
// dihapus (keputusan csheva 2026-11-13); SpectrumAnalyzer di sana ikut
// tidak terpakai.
//
// Beda dengan SpectrumAnalyzer:
// - Sumbu frekuensi berlabel (Hz, skala log 20 Hz–Nyquist stream).
// - Skala dB FULL SCALE (-80..0 dB) + garis grid + garis 0 dB merah.
// - Peak hold per bar (putih; MERAH bila peak >= -1 dB).
// - Warna bar per zona dB: hijau < -12 dB, kuning -12..-3 dB, merah >= -3 dB.
// - Pill CLIP yang LATCH (tetap menyala) saat ada bin >= -1 dB; ketuk
//   untuk clear. Frekuensi dominan (diperbarui ~2 Hz, bukan tiap frame).
// - Scroll horizontal HANYA di atas 20 kHz: sampai 20 kHz grafik muat
//   satu layar (bar menyusut menyesuaikan viewport); di atasnya konten
//   ~2x lebar tampak supaya bar lebih lebar dan detail treble/ultrasonik
//   bisa digeser; label dB tetap diam di luar scroll.
//
// Data: VisualizerService menulis LANGSUNG ke SharedValue freqData
// (subscribeSharedValue) — TIDAK ADA callback JS per frame. Data mentah
// 128 bin 0..1, log-scaled; dB = -80 + v*80 sejak full-scale 2026-11-14;
// DULU -80 + v*70 dengan ceiling -10 sehingga bar terpotong). Matematika
// sumbu ada di @/features/visualizer/api/analyzerSpectrum.
//
// Arsitektur render sama seperti SpectrumAnalyzer/SpectogramView:
// data + peak hidup di SharedValue (UI thread), TIDAK ADA setState di
// jalur panas — frekuensi dominan + latch CLIP dihitung di UI thread
// (useAnimatedReaction) dan hanya memanggil runOnJS bila nilainya
// berubah (~2 Hz, bukan tiap frame). Jalur data penuh (D, 2026-11-17):
// VisualizerService.subscribeSharedValue(freqData) — data FFT tidak
// pernah menyentuh JS thread per frame; callback setDataCallback lama
// (handleData) dihapus.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  Dimensions,
  Text,
  ScrollView,
  TouchableOpacity,
  AppState,
} from "react-native";

import {
  Canvas,
  Path,
  Skia,
  Group,
} from "@shopify/react-native-skia";

import {
  useSharedValue,
  useDerivedValue,
  useAnimatedReaction,
  runOnUI,
  runOnJS,
} from "react-native-reanimated";

import { visualizerService } from "@/features/visualizer/services/VisualizerService";
import { useTheme } from "@/shared/context/ThemeContext";
import {
  FONT_FAMILY,
  BASE_RADIUS,
} from "@/shared/constants/themes/base";
import { pickReadable } from "@/shared/utils/contrast";
import {
  ANALYZER_COLOR_CLIP,
  ANALYZER_COLOR_LOW,
  ANALYZER_COLOR_WARN,
  ANALYZER_DB_GRID,
  ANALYZER_FIT_MAX_HZ,
  ANALYZER_FREQ_MIN,
  CLIP_DB,
  SPECTRUM_CHANGE_EPSILON,
  anyPeakAboveBars,
  arraysCloseEnough,
  binCenterFreq,
  dbToValue,
  dbZone,
  dominantBin,
  formatFreq,
  freqLabelsFor,
  freqToFraction,
  valueToDb,
} from "@/features/visualizer/api/analyzerSpectrum";

export interface AnalyzerSpectrumProps {
  width?: number;
  height?: number;
  barCount?: number;
  color?: string;
  backgroundColor?: string;
  sensitivity?: number;
  /** Bila true: tanpa sensitivity dan tanpa treble tilt — bar mencerminkan
   *  nilai dB apa adanya (untuk analyzer; default false = perilaku lama). */
  flatResponse?: boolean;
  /** Laju stream aktual (Hz) dari useBitPerfectStatus; menentukan Nyquist
   *  sumbu frekuensi. Default 48 kHz. */
  sampleRate?: number;
  /** Batas atas sumbu frekuensi (Hz) — dari slider tab Analyzer (E).
   *  Default Nyquist stream penuh (sampleRate/2, keputusan csheva
   *  2026-11-17); slider bisa menurunkan sampai 20 kHz. Bar, label Hz,
   *  grid, dan frekuensi dominan mengikuti nilai ini. */
  freqMaxHz?: number;
  isPlaying: boolean;
  audioSessionId?: number;
}

const DEFAULT_BAR_COUNT = 48;
const MAX_BAR_COUNT = 128;
const MIN_BAR_COUNT = 16;

// Ruang untuk label sumbu: kiri untuk dB, bawah untuk Hz.
// Gutter 64px supaya label "0 (maks)" / "-80 (senyap)" muat —
// user awam bingung karena di dBFS 0 = paling keras, bukan senyap.
const DB_GUTTER = 64;
const FREQ_STRIP = 18;

// Latar pill gelap (petunjuk scroll, frekuensi dominan, menunggu data):
// 65% hitam — opasitas TERKECIL yang membuat teks putih lolos AA di
// keempat tema (terukur 7,68–20,12); 45% lama hanya 3,82–3,90 di tema
// terang (teks praktis tak terbaca). Pola yang sama dengan pill clip EQ
// (45% → 90%) — di sini 65% sudah cukup dengan margin.
const PILL_BG = "rgba(0,0,0,0.65)";

// Latar pill CLIP: #DC2626, bukan #EF4444 (merah zona). Teks putih di
// atas #EF4444 hanya 3,76:1; di atas #DC2626 4,83:1 (lolos AA). Bar/peak/
// garis clip tetap #EF4444 (ANALYZER_COLOR_CLIP) — pill adalah elemen UI,
// bukan bar.
const CLIP_PILL_BG = "#DC2626";

// Lebar minimum tiap bar (px) — menentukan lebar konten scroll.
const MIN_BAR_WIDTH = 14;

// Peluruhan peak hold per frame (~0.2/detik pada polling 10 Hz).
const PEAK_DECAY = 0.02;

// Bar digambar setinggi maks 85% area (sama seperti SpectrumAnalyzer) —
// jadi puncak 0 dB berada di 15% dari atas, tepat di garis grid 0 dB.
const BAR_HEIGHT_FACTOR = 0.85;

// Glow halo ala ParametricSpectrumView: bar yang sama, 2 px lebih lebar
// (1 px tiap sisi), opacity rendah — halo lembut TANPA BlurMask.
// BlurMask blur=2 di tiga path zona = blur pass per frame untuk 48 bar,
// biaya GPU terbesar di jalur gambar Analyzer; halo duplikat hanya
// tambah 3 fill path murah. Halo memakai warna zonanya sendiri supaya
// tampilan tetap sama.
const HALO_EXTRA_WIDTH = 2;
const HALO_OPACITY = 0.22;
const HALO_OPACITY_WAITING = 0.12;

export const AnalyzerSpectrum: React.FC<AnalyzerSpectrumProps> = ({
  width = Dimensions.get("window").width - 40,
  height = 250,
  barCount: rawBarCount = DEFAULT_BAR_COUNT,
  color = "#00D4AA",
  backgroundColor = "transparent",
  sensitivity = 2.2,
  flatResponse = false,
  sampleRate = 48000,
  freqMaxHz,
  isPlaying,
  audioSessionId,
}) => {
  // FASE 3 Analyzer: warna teks label dibaca dari tema (bukan hex
  // hardcoded). Komponen ini hanya dirender di dalam kartu Analyzer —
  // latar label = background.secondary.
  const { theme } = useTheme();
  const cardBg = theme.colors.background.secondary;
  // Label "0 (maks)" harus tetap MERAH (menandai garis clip) tapi
  // terbaca di semua tema: status.error dulu, lalu merah zona, lalu
  // merah gelap untuk tema terang. Terukur: 6,39/6,51/5,40/5,55.
  const clipLabelColor = useMemo(
    () =>
      pickReadable(
        [theme.colors.status.error, ANALYZER_COLOR_CLIP, "#B91C1C"],
        cardBg,
      ) ?? theme.colors.status.error,
    [theme],
  );

  const barCount = Math.max(
    MIN_BAR_COUNT,
    Math.min(MAX_BAR_COUNT, rawBarCount),
  );

  const barsWidth = Math.max(1, width - DB_GUTTER);
  const barsHeight = Math.max(1, height - FREQ_STRIP);

  // Nyquist stream aktual — label Hz mengikuti laju (44,1/48/96 kHz).
  const nyquist = (sampleRate > 0 ? sampleRate : 48000) / 2;
  // E: batas atas tampilan grafik — default Nyquist penuh (keputusan
  // csheva), slider di tab bisa menurunkan sampai 20 kHz untuk memeriksa
  // konten ultrasonik. Dijepit ke [20 kHz, Nyquist].
  const freqMax =
    freqMaxHz == null
      ? nyquist
      : Math.min(
          Math.max(freqMaxHz, Math.min(ANALYZER_FREQ_MIN, nyquist)),
          nyquist,
        );
  // Ronde 9: sampai 20 kHz grafik MUAT SATU LAYAR (contentWidth =
  // barsWidth, bar menyusut menyesuaikan viewport, tanpa scroll); di atas
  // 20 kHz konten boleh scroll — menampilkan rentang ultrasonik butuh
  // lebar bar minimum (barCount x MIN_BAR_WIDTH).
  const contentWidth =
    freqMax <= ANALYZER_FIT_MAX_HZ
      ? barsWidth
      : Math.max(barsWidth, barCount * MIN_BAR_WIDTH);
  const freqLabels = useMemo(() => freqLabelsFor(freqMax), [freqMax]);

  const freqData = useSharedValue<number[]>(Array(MAX_BAR_COUNT).fill(0.1));
  const prevData = useSharedValue<number[]>(Array(barCount).fill(0.1));
  const peakData = useSharedValue<number[]>(Array(barCount).fill(0.05));
  // Laju untuk worklet (prop bisa berubah saat reopen ganti laju file).
  const sampleRateSV = useSharedValue(sampleRate);
  // E: batas atas tampilan untuk worklet (slider tab bisa mengubahnya).
  const freqMaxSV = useSharedValue(freqMax);
  // Penghitung frame + cermin worklet untuk readout JS yang di-throttle
  // (frekuensi dominan, latch CLIP) — supaya runOnJS hanya dipanggil
  // bila nilainya berubah, bukan tiap frame.
  const frameCountSV = useSharedValue(0);
  const silentFramesSV = useSharedValue(0);
  const dominantFreqSV = useSharedValue<string | null>(null);
  const clipLatchedSV = useSharedValue(false);

  // FIX: hasRealData dan isPlayingSV sebagai SharedValue agar bisa dibaca worklet
  const hasRealData = useSharedValue(false);
  const isPlayingSV = useSharedValue(isPlaying);

  // ITEM 1 (2026-11-21): suspend loop gambar saat app background/
  // inactive — pola yang sama dengan ParametricSpectrumView.
  // `VisualizerService.pause()` hanya menghentikan polling data;
  // loop umpan-balik (processedData → reaction → prevData/peakData →
  // processedData) tetap jalan karena tiap evaluasi mengembalikan
  // array BARU (referensi baru = perubahan baru bagi Reanimated),
  // sehingga Canvas terus minta redraw ~60 Hz ke surface yang sudah
  // lepas (sumber `updateAndRelease() failed` log #14).
  // `isSuspendedSV` dicerminkan dari AppState; `cachedProcessed`
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

  // Frekuensi dominan — di-throttle (bukan tiap frame) supaya tidak
  // setState 10x/detik; teks kecil ini satu-satunya state JS yang berubah
  // saat audio jalan.
  const [dominantFreq, setDominantFreq] = useState<string | null>(null);

  // CLIP latch: menyala saat ada bin >= -1 dB, tetap menyala sampai
  // diketuk (bukan hilang saat level turun) — supaya user sempat melihat
  // bahwa audionya pernah menyentuh clip.
  const [clipLatched, setClipLatched] = useState(false);

  useEffect(() => {
    return visualizerService.setOnError(() => setFftError(true));
  }, []);

  const unsubscribeRef = useRef<(() => void) | null>(null);
  const isStarted = useRef(false);
  const lastSessionId = useRef<number | null>(null);

  // Sync isPlaying + sampleRate prop → SharedValue
  useEffect(() => {
    isPlayingSV.value = isPlaying;
  }, [isPlaying]);

  // ITEM 1: cerminkan AppState ke UI thread (suspend = apa pun selain
  // "active", termasuk "inactive" sementara). Saat kembali foreground,
  // loop jalan lagi normal dan data segar mengalir dari polling service
  // yang di-resume (tidak ada bar basi yang ditahan — prevData/peakData
  // dibiarkan apa adanya supaya falloff/smoothing normal tetap jalan
  // dari nilai terakhir, sama seperti jeda biasa).
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      isSuspendedSV.value = nextState !== "active";
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    sampleRateSV.value = sampleRate;
  }, [sampleRate]);

  useEffect(() => {
    freqMaxSV.value = freqMax;
  }, [freqMax]);

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

  // Jalur data panas (D, 2026-11-17): tiap kali VisualizerService
  // menulis freqData (SharedValue), reaksi ini jalan DI UI THREAD —
  // tanpa callback JS, tanpa setState per frame. Yang dihitung di sini:
  // hasRealData (bar hidup vs lantai), frekuensi dominan + latch CLIP
  // (paling sering tiap 5 frame ≈ 2 Hz, dan runOnJS hanya bila
  // nilainya berubah). Smoothing + peak hold tetap di tempat lama
  // (smoothing di service, peak di useAnimatedReaction processedData).
  useAnimatedReaction(
    () => freqData.value,
    (data) => {
      // ITEM 1: saat suspend, jangan hitung apa pun — tidak ada data
      // baru yang masuk (polling service pause), dan runOnJS ke state
      // JS (frekuensi dominan, latch CLIP) tidak perlu jalan saat
      // background.
      if (isSuspendedSV.value) {
        return;
      }
      if (!data || data.length === 0) return;

      frameCountSV.value += 1;
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
        // Data sunyi >10 frame berturut-turut = sesi benar-benar
        // tidak mengalirkan FFT (bukan jeda antar-frame).
        silentFramesSV.value += 1;
        if (silentFramesSV.value > 10) hasRealData.value = false;
      }

      // Frekuensi dominan + latch CLIP: hitung di UI thread, paling
      // sering 2 Hz saja (tiap 5 frame pada polling 10 Hz) dan hanya
      // bila berubah — supaya tidak setState tiap frame.
      if (frameCountSV.value % 5 === 0) {
        if (isReal) {
          // E: frekuensi dominan hanya dari bin yang tampil (di bawah
          // batas atas slider); pemetaan bin->Hz tetap pakai Nyquist.
          const nyquist = sampleRateSV.value / 2;
          const binLimit =
            Math.floor(
              freqToFraction(freqMaxSV.value, nyquist) * (data.length - 1),
            ) + 1;
          const bin = dominantBin(data, binLimit);
          if (bin >= 0) {
            const label = formatFreq(
              binCenterFreq(bin, data.length, sampleRateSV.value / 2),
            );
            if (dominantFreqSV.value !== label) {
              dominantFreqSV.value = label;
              runOnJS(setDominantFreq)(label);
            }
          }
          if (valueToDb(maxVal) >= CLIP_DB && !clipLatchedSV.value) {
            clipLatchedSV.value = true;
            runOnJS(setClipLatched)(true);
          }
        } else if (dominantFreqSV.value !== null) {
          dominantFreqSV.value = null;
          runOnJS(setDominantFreq)(null);
        }
      }
    },
  );

  // Start/Stop berdasarkan isPlaying dan audioSessionId.
  //
  // MULTI-SUBSCRIBER (2026-11-10): layar ini subscribe saat butuh data dan
  // unsubscribe saat tidak — JANGAN panggil visualizerService.stop(), itu
  // kill-switch global yang mematikan polling untuk layar lain juga.
  useEffect(() => {
    const shouldStart = isPlaying && audioSessionId && audioSessionId > 0;

    if (shouldStart) {
      if (!isStarted.current || lastSessionId.current !== audioSessionId) {
        console.log(`[AnalyzerSpectrum] Starting session ${audioSessionId}`);
        unsubscribeRef.current?.();
        // D: langganan SharedValue langsung — VisualizerService menulis
        // freqData.value tiap poll; tidak ada callback JS per frame.
        unsubscribeRef.current =
          visualizerService.subscribeSharedValue(freqData);
        visualizerService.start(audioSessionId);
        isStarted.current = true;
        lastSessionId.current = audioSessionId;
        runOnUI(() => {
          "worklet";
          hasRealData.value = false;
          frameCountSV.value = 0;
          silentFramesSV.value = 0;
          dominantFreqSV.value = null;
          clipLatchedSV.value = false;
        })();
        setHasRealDataState(false);
        setDominantFreq(null);
        setClipLatched(false);
        setFftError(false);
      }
    } else {
      if (isStarted.current) {
        console.log("[AnalyzerSpectrum] Stopping");
        unsubscribeRef.current?.();
        unsubscribeRef.current = null;
        isStarted.current = false;
        lastSessionId.current = null;
        runOnUI(() => {
          "worklet";
          freqData.value = Array(MAX_BAR_COUNT).fill(0.1);
          prevData.value = Array(barCount).fill(0.1);
          peakData.value = Array(barCount).fill(0.05);
          hasRealData.value = false;
          frameCountSV.value = 0;
          silentFramesSV.value = 0;
          dominantFreqSV.value = null;
          clipLatchedSV.value = false;
        })();
        setHasRealDataState(false);
        setDominantFreq(null);
        setClipLatched(false);
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
  // (Pemetaan sama seperti SpectrumAnalyzer: resample log dari 128 bin
  // mentah ke barCount, falloff 0.85. flatResponse mematikan sensitivity
  // + treble tilt supaya bar mencerminkan dB apa adanya.)
  const processedData = useDerivedValue(() => {
    // ITEM 1: saat suspend, kembalikan array TERAKHIR yang sama
    // (referensi identik, dari cachedProcessed) — bukan array baru.
    // Reanimated menganggap tidak ada perubahan, jadi reaction
    // umpan-balik tidak jalan dan path-path Skia (yang membaca
    // processedData/peakData) tidak dihitung ulang: Canvas tidak
    // mendapat picture baru dan tidak minta redraw ke surface yang
    // sudah lepas. Perubahan prop/State saat background (mis. laju,
    // freqMax dari pergantian lagu) juga aman: evaluasi ini tetap
    // mengembalikan referensi yang sama.
    if (isSuspendedSV.value) {
      return cachedProcessed.value;
    }

    const raw = freqData.value;
    const useDummy = !hasRealData.value && isPlayingSV.value;

    let result: number[];
    if (useDummy) {
      result = Array(barCount).fill(0.05);
    } else if (!raw || raw.length === 0) {
      result = Array(barCount).fill(0.1);
    } else {
      // E: bar hanya memetakan bin sampai batas atas tampilan — bin di atas
      // freqMax tidak digambar (zoom jujur, bukan sekadar relabel sumbu).
      // freqMax == Nyquist -> maxBin == raw.length - 1 (perilaku lama).
      const nyquist = sampleRateSV.value / 2;
      const maxBin =
        freqToFraction(freqMaxSV.value, nyquist) * (raw.length - 1);

      result = Array.from({ length: barCount }, () => 0);
      const falloff = 0.85;

      for (let i = 0; i < barCount; i++) {
        const t = i / (barCount - 1);
        const logT = Math.pow(t, 1.2);
        const startIdx = Math.floor(logT * maxBin);
        const endIdx = Math.min(Math.floor(maxBin), startIdx + 8);

        let sum = 0,
          count = 0;
        for (let j = startIdx; j <= endIdx && j < raw.length; j++) {
          sum += raw[j] || 0;
          count++;
        }

        let target = count > 0 ? sum / count : 0;
        if (!flatResponse) {
          target *= sensitivity;
          target *= 1 + (i / barCount) * 0.5;
        }
        target = Math.max(0.05, Math.min(1.0, target));

        const prev = prevData.value[i] || 0.05;
        if (target < prev * falloff) target = prev * falloff;

        result[i] = target;
      }
    }

    // ITEM 4 (2026-11-21): sama seperti ParametricSpectrumView —
    // hasil hitung yang sama (dalam epsilon, vs cachedProcessed item
    // 1) mengembalikan referensi yang SAMA supaya derived tidak
    // memicu reaction umpan-balik dan loop settle saat data FFT
    // konstan; kecuali peak hold masih di atas bar (lihat komentar
    // yang sama di Player — topi dibiarkan turun dulu sampai
    // menyentuh bar).
    const cached = cachedProcessed.value;
    if (
      arraysCloseEnough(cached, result, SPECTRUM_CHANGE_EPSILON) &&
      !anyPeakAboveBars(peakData.value, result, SPECTRUM_CHANGE_EPSILON)
    ) {
      return cached;
    }

    return result;
  });

  // Peak hold + prevData: tiap frame, peak = maks(nilai, peak - decay).
  useAnimatedReaction(
    () => processedData.value,
    (current) => {
      // ITEM 1: saat suspend, early-return TANPA menulis apa pun.
      // Menulis prevData/peakData akan memicu processedData menghitung
      // ulang, yang mengembalikan array baru, yang memicu reaction
      // lagi — loop yang tidak pernah settle. Cache diperbarui di sini
      // (bukan di dalam derived) supaya tidak ada derived yang menulis
      // dependensinya sendiri.
      if (isSuspendedSV.value) {
        return;
      }
      cachedProcessed.value = current;
      prevData.value = [...current];
      const next = [...peakData.value];
      for (let i = 0; i < current.length; i++) {
        const cur = current[i] ?? 0.05;
        const prev = next[i] ?? 0.05;
        next[i] = Math.max(cur, prev - PEAK_DECAY);
      }
      peakData.value = next;
    },
  );

  // Bar per zona warna — tiga path solid terpisah supaya tiap zona punya
  // warna sendiri, ditambah tiga path halo (di bawah) dengan warna zona
  // yang sama. Zona dari dB bar itu (valueToDb): hijau < -12, kuning
  // -12..-3, merah >= -3 dB. (Satu useDerivedValue per path: prop `path`
  // Skia menerima SkPath atau SharedValue<SkPath>, bukan objek berisi
  // path.)
  // Geometri bar (dipakai tiga path zona) — worklet karena dipanggil dari
  // useDerivedValue. Tanpa direktif ini, Reanimated throw di runtime
  // (pelajaran ff5f12cd). `extraWidth` untuk halo glow (bar yang sama,
  // sedikit lebih lebar, posisi x digeser setengahnya supaya tetap di
  // tengah) — pola yang sama dengan ParametricSpectrumView.
  const barGeometry = useCallback(
    (data: number[], extraWidth = 0) => {
      "worklet";
      const gap = 3;
      const barWidth = (contentWidth - (barCount - 1) * gap) / barCount;
      return data.map((amp, i) => {
        const barHeight = Math.max(4, amp * barsHeight * BAR_HEIGHT_FACTOR);
        const x = i * (barWidth + gap) - extraWidth / 2;
        const y = barsHeight - barHeight;
        return {
          rect: Skia.XYWHRect(x, y, barWidth + extraWidth, barHeight),
          amp,
        };
      });
    },
    [contentWidth, barCount, barsHeight],
  );

  const barsLowPath = useDerivedValue(() => {
    const path = Skia.Path.Make();
    for (const { rect, amp } of barGeometry(processedData.value)) {
      if (dbZone(valueToDb(amp)) === "low") {
        path.addRRect(Skia.RRectXY(rect, 4, 4));
      }
    }
    return path;
  });

  const barsWarnPath = useDerivedValue(() => {
    const path = Skia.Path.Make();
    for (const { rect, amp } of barGeometry(processedData.value)) {
      if (dbZone(valueToDb(amp)) === "warn") {
        path.addRRect(Skia.RRectXY(rect, 4, 4));
      }
    }
    return path;
  });

  const barsClipPath = useDerivedValue(() => {
    const path = Skia.Path.Make();
    for (const { rect, amp } of barGeometry(processedData.value)) {
      if (dbZone(valueToDb(amp)) === "clip") {
        path.addRRect(Skia.RRectXY(rect, 4, 4));
      }
    }
    return path;
  });

  // Glow murah: bar yang sama, sedikit lebih lebar, opacity rendah, di
  // belakang bar utama — TANPA BlurMask (mahal untuk 48 bar per frame).
  // Satu halo per zona supaya warnanya tetap warna zona itu sendiri.
  const barsLowHaloPath = useDerivedValue(() => {
    const path = Skia.Path.Make();
    for (const { rect, amp } of barGeometry(
      processedData.value,
      HALO_EXTRA_WIDTH,
    )) {
      if (dbZone(valueToDb(amp)) === "low") {
        path.addRRect(Skia.RRectXY(rect, 4, 4));
      }
    }
    return path;
  });

  const barsWarnHaloPath = useDerivedValue(() => {
    const path = Skia.Path.Make();
    for (const { rect, amp } of barGeometry(
      processedData.value,
      HALO_EXTRA_WIDTH,
    )) {
      if (dbZone(valueToDb(amp)) === "warn") {
        path.addRRect(Skia.RRectXY(rect, 4, 4));
      }
    }
    return path;
  });

  const barsClipHaloPath = useDerivedValue(() => {
    const path = Skia.Path.Make();
    for (const { rect, amp } of barGeometry(
      processedData.value,
      HALO_EXTRA_WIDTH,
    )) {
      if (dbZone(valueToDb(amp)) === "clip") {
        path.addRRect(Skia.RRectXY(rect, 4, 4));
      }
    }
    return path;
  });

  // Tanda peak hold: garis pendek di atas tiap bar — putih biasa, MERAH
  // bila peak >= -1 dB (pernah menyentuh clip).
  const peakPath = useDerivedValue(() => {
    const peaks = peakData.value;
    const path = Skia.Path.Make();
    const gap = 3;
    const barWidth = (contentWidth - (barCount - 1) * gap) / barCount;
    const clipThreshold = dbToValue(CLIP_DB);

    peaks.forEach((peak, i) => {
      if (peak >= clipThreshold) return;
      const peakHeight = Math.max(0, peak * barsHeight * BAR_HEIGHT_FACTOR);
      const x = i * (barWidth + gap);
      const y = Math.max(0, barsHeight - peakHeight - 2);
      path.addRect(Skia.XYWHRect(x, y, barWidth, 3));
    });

    return path;
  });

  const peakClipPath = useDerivedValue(() => {
    const peaks = peakData.value;
    const path = Skia.Path.Make();
    const gap = 3;
    const barWidth = (contentWidth - (barCount - 1) * gap) / barCount;
    const clipThreshold = dbToValue(CLIP_DB);

    peaks.forEach((peak, i) => {
      if (peak < clipThreshold) return;
      const peakHeight = Math.max(0, peak * barsHeight * BAR_HEIGHT_FACTOR);
      const x = i * (barWidth + gap);
      const y = Math.max(0, barsHeight - peakHeight - 2);
      path.addRect(Skia.XYWHRect(x, y, barWidth, 3));
    });

    return path;
  });

  // Grid: garis horizontal dB + garis vertikal di frekuensi berlabel.
  // Garis 0 dB dipisah (merah) supaya ambang clip langsung terlihat.
  // Statis (hanya bergantung pada ukuran), tapi dibangun di worklet supaya
  // konsisten dengan path lain.
  const gridPath = useDerivedValue(() => {
    const path = Skia.Path.Make();
    const freqMax = freqMaxSV.value;
    for (const db of ANALYZER_DB_GRID) {
      if (db === 0) continue;
      const v = dbToValue(db);
      const y = barsHeight * (1 - BAR_HEIGHT_FACTOR * v);
      path.moveTo(0, Math.min(barsHeight - 0.5, y));
      path.lineTo(contentWidth, Math.min(barsHeight - 0.5, y));
    }
    for (const freq of freqLabels) {
      const x = freqToFraction(freq, freqMax) * contentWidth;
      path.moveTo(x, 0);
      path.lineTo(x, barsHeight);
    }
    return path;
  });

  const clipLinePath = useDerivedValue(() => {
    const path = Skia.Path.Make();
    const y = barsHeight * (1 - BAR_HEIGHT_FACTOR * dbToValue(0));
    path.moveTo(0, Math.min(barsHeight - 0.5, y));
    path.lineTo(contentWidth, Math.min(barsHeight - 0.5, y));
    return path;
  });

  return (
    <View style={[styles.container, { width, height, backgroundColor }]}>
      {/* Label dBFS (kiri) — statis, React biasa, DIAM di luar ScrollView. */}
      <Text style={[styles.dbCaption, { color }]}>dBFS</Text>
      {ANALYZER_DB_GRID.map((db) => {
        const v = dbToValue(db);
        const y = barsHeight * (1 - BAR_HEIGHT_FACTOR * v);
        // dBFS membingungkan user awam (0 = paling keras, bukan senyap),
        // jadi ujung skala diberi keterangan: 0 (maks), -80 (senyap).
        const label =
          db === 0 ? "0 (maks)" : db === -80 ? "-80 (senyap)" : `${db}`;
        return (
          <Text
            key={`db-${db}`}
            style={[
              styles.dbLabel,
              {
                top: Math.min(barsHeight - 7, Math.max(0, y - 6)),
                color: theme.colors.text.secondary,
              },
              db === 0
                ? [styles.dbLabelClip, { color: clipLabelColor }]
                : undefined,
            ]}
          >
            {label}
          </Text>
        );
      })}

      {/* Area bar + grid — bisa di-scroll horizontal; label Hz ikut scroll. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{
          position: "absolute",
          left: DB_GUTTER,
          top: 0,
          width: barsWidth,
          height,
        }}
      >
        <View style={{ width: contentWidth, height }}>
          <View style={{ width: contentWidth, height: barsHeight }}>
            <Canvas style={{ flex: 1 }}>
              <Group>
                <Path
                  path={gridPath}
                  color="#FFFFFF"
                  style="stroke"
                  strokeWidth={0.5}
                  opacity={0.18}
                />
                <Path
                  path={clipLinePath}
                  color={ANALYZER_COLOR_CLIP}
                  style="stroke"
                  strokeWidth={1}
                  opacity={0.7}
                />
                {/* Glow: halo di belakang bar utama (opacity rendah),
                    tanpa BlurMask. */}
                <Path
                  path={barsLowHaloPath}
                  color={ANALYZER_COLOR_LOW}
                  style="fill"
                  opacity={
                    hasRealDataState ? HALO_OPACITY : HALO_OPACITY_WAITING
                  }
                />
                <Path
                  path={barsWarnHaloPath}
                  color={ANALYZER_COLOR_WARN}
                  style="fill"
                  opacity={
                    hasRealDataState ? HALO_OPACITY : HALO_OPACITY_WAITING
                  }
                />
                <Path
                  path={barsClipHaloPath}
                  color={ANALYZER_COLOR_CLIP}
                  style="fill"
                  opacity={
                    hasRealDataState ? HALO_OPACITY : HALO_OPACITY_WAITING
                  }
                />
                <Path
                  path={barsLowPath}
                  color={ANALYZER_COLOR_LOW}
                  style="fill"
                  opacity={hasRealDataState ? 1 : 0.5}
                />
                <Path
                  path={barsWarnPath}
                  color={ANALYZER_COLOR_WARN}
                  style="fill"
                  opacity={hasRealDataState ? 1 : 0.5}
                />
                <Path
                  path={barsClipPath}
                  color={ANALYZER_COLOR_CLIP}
                  style="fill"
                  opacity={hasRealDataState ? 1 : 0.5}
                />
                <Path
                  path={peakPath}
                  color="#FFFFFF"
                  style="fill"
                  opacity={0.9}
                />
                <Path
                  path={peakClipPath}
                  color={ANALYZER_COLOR_CLIP}
                  style="fill"
                  opacity={0.9}
                />
              </Group>
            </Canvas>
          </View>

          {/* Label Hz (bawah) — ikut scroll bersama bar. */}
          {freqLabels.map((freq) => {
            const x = freqToFraction(freq, freqMax) * contentWidth;
            const left = Math.max(0, Math.min(contentWidth - 36, x - 18));
            return (
              <Text
                key={`hz-${freq}`}
                style={[
                  styles.hzLabel,
                  { left, color: theme.colors.text.secondary },
                ]}
              >
                {formatFreq(freq)}
              </Text>
            );
          })}
        </View>
      </ScrollView>

      {/* Petunjuk scroll — hanya bila konten lebih lebar dari viewport. */}
      {contentWidth > barsWidth && (
        <View style={styles.scrollHint} pointerEvents="none">
          <Text style={styles.scrollHintText}>↔ geser</Text>
        </View>
      )}

      {/* Pill CLIP (latch) — ketuk untuk clear. */}
      {clipLatched && (
        <TouchableOpacity
          style={styles.clipPill}
          onPress={() => setClipLatched(false)}
          accessibilityRole="button"
          accessibilityLabel="Audio pernah clip, ketuk untuk menghapus peringatan"
        >
          <Text style={styles.clipText}>● CLIP</Text>
        </TouchableOpacity>
      )}

      {/* Frekuensi dominan — di-throttle ~2 Hz di handleData. */}
      {hasRealDataState && dominantFreq && (
        <View style={styles.dominantPill} pointerEvents="none">
          <Text style={styles.dominantText}>Dominan {dominantFreq}</Text>
        </View>
      )}

      {/* U-P1-29: lagu diputar tapi FFT belum/tidak mengembalikan data —\n          katakan jujur, jangan animasikan bar palsu. */}
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
    overflow: "hidden",
  },
  // FASE 3 Analyzer: bobot → keluarga font token; warna label sumbu
  // hardcoded (#888888, #EF4444) → token tema (lihat JSX — warna butuh
  // theme, jadi di-inline). Ukuran tidak berubah (gutter 64px diukur
  // untuk label 9px — membesarkan merusak geometri sumbu).
  dbCaption: {
    position: "absolute",
    left: 0,
    top: 0,
    fontSize: 9,
    fontFamily: FONT_FAMILY.semiBold,
  },
  dbLabel: {
    position: "absolute",
    left: 0,
    width: 60,
    textAlign: "right",
    fontSize: 9,
    fontFamily: FONT_FAMILY.regular,
  },
  dbLabelClip: {
    fontFamily: FONT_FAMILY.bold,
  },
  hzLabel: {
    position: "absolute",
    bottom: 0,
    width: 36,
    textAlign: "center",
    fontSize: 9,
    fontFamily: FONT_FAMILY.regular,
  },
  scrollHint: {
    position: "absolute",
    top: 4,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  scrollHintText: {
    fontSize: 9,
    fontFamily: FONT_FAMILY.semiBold,
    color: "#FFFFFF",
    backgroundColor: PILL_BG,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BASE_RADIUS.pill,
    overflow: "hidden",
  },
  clipPill: {
    position: "absolute",
    top: 4,
    left: DB_GUTTER,
    backgroundColor: CLIP_PILL_BG,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BASE_RADIUS.pill,
  },
  clipText: {
    fontSize: 10,
    fontFamily: FONT_FAMILY.bold,
    color: "#FFFFFF",
  },
  dominantPill: {
    position: "absolute",
    top: 4,
    right: 0,
    backgroundColor: PILL_BG,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BASE_RADIUS.pill,
  },
  dominantText: {
    fontSize: 10,
    fontFamily: FONT_FAMILY.semiBold,
    color: "#FFFFFF",
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
    fontFamily: FONT_FAMILY.medium,
    color: "#FFFFFF",
    backgroundColor: PILL_BG,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BASE_RADIUS.pill,
    overflow: "hidden",
  },
});
