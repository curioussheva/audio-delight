// src/features/equalizer/store/equalizerStore.ts

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
const Platform = require("react-native").Platform;
import { EqualizerStore, Preset } from "@/features/equalizer/types";
import { ALL_PRESETS, makeBands } from "../constants/presets";
import { NativeDSPModule } from "@/features/equalizer/api/nativeInterface";
import { useHrtfStore } from "@/features/hrtf/store/hrtfStore";
import {
  useConvolverStore,
  resetConvolverIrLoaded,
} from "@/features/convolver/store/convolverStore";
import { useCrossfadeStore } from "@/features/crossfade/store/crossfadeStore";
import { useGaplessStore } from "@/features/gapless/store/gaplessStore";
import { useHeadphoneStore } from "@/features/headphone/store/headphoneStore";
import { getEffectiveMasterGain, useReplayGainStore } from "@/features/replaygain/store/replayGainStore";
// [BRIDGE-PROBE] diagnostik sementara (logcat #8) — lihat bridgeProbe.ts.
import { noteBridgeProbeApply } from "@/features/player/api/bridgeProbe";
// [DRAG-DIAG] diagnostik sementara (logcat #8) — lihat dragDiag.ts.
import {
  noteThrottleTick,
  noteSetterStart,
  noteSetterEnd,
} from "@/features/equalizer/api/dragDiag";
// (logcat #9) throttle + fire-and-forget untuk tiga setter drag —
// lihat effectPusher.ts.
import { createEffectPusher } from "@/features/equalizer/api/effectPusher";
import { setDspSessionId } from "@/features/equalizer/api/dspSession";
// Opsi 3 (log #15): gate in-flight master gain + band apply selama drag.
import { isDragActive } from "@/features/equalizer/api/dragState";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

// (B14-M-H2, 2026-11-14): rentang gain band UI adalah ±10 dB sejak
// d413d438. Preset bawaan aman (maks ±6), tapi custom preset yang
// disimpan sebelumnya bisa membawa ±12 — dan native mengizinkan sampai
// ±24. Clamp di semua titik baca (applyPreset, rehydrate, pengiriman ke
// native) supaya preset lama tidak berbunyi ±12 sementara fader berskala
// ±10 (thumb bisa render di luar trek).
const BAND_GAIN_MIN = -10;
const BAND_GAIN_MAX = 10;
const clampBandGain = (g: number): number =>
  Math.min(
    BAND_GAIN_MAX,
    Math.max(BAND_GAIN_MIN, Number.isFinite(g) ? g : 0),
  );
const clampPresetBands = (bands: any[]): any[] =>
  bands.map((b) => ({ ...b, gain: clampBandGain(b?.gain ?? 0) }));

// Master gain sebagai preamp skala dB (2026-11-19): slider −12..+12 dB
// simetris (0 dB = netral, tengah slider), konvensi preamp umum
// (Poweramp ±12 dB). Prinsip csheva: "ear as judge, setelan flexible
// buat pro" — +12 dB di lagu keras akan memaksa limiter (ambang 0,98)
// kerja terus-menerus; itu diterima (telinga yang menilai). Lantai
// −12 dB = 0,25×, BUKAN senyap — slider kehilangan fungsi mute
// (mute lewat volume).
// Kontrak ke native TIDAK berubah: store + native tetap LINEAR —
// konversi dB↔linear hanya di batas UI (equalizer.tsx). Nilai linear
// dikirim ke native, dicatat di log [DSP] Applied (gain=), dan
// dipersist persis seperti sebelumnya. Dipilih DI DALAM clamp native
// AudioState (0..4, fallback 1.0). BUKAN bagian profil preset: preset
// menyimpan kurva + bass/widener/reverb (D1), tapi gain adalah level
// output global — preset tidak boleh menarik volume.
export const MASTER_GAIN_DB_MIN = -12;
export const MASTER_GAIN_DB_MAX = 12;
export const MASTER_GAIN_DB_DEFAULT = 0;
// Offset domain slider 0..24 -> dB −12..+12 (VerticalSlider hanya
// mendukung min 0; lihat equalizer.tsx).
export const MASTER_GAIN_DB_OFFSET = 12;
export const MASTER_GAIN_DB_RANGE = 24;

/** dB -> pengali linear (10^(dB/20)). */
export const dbToGain = (db: number): number => Math.pow(10, db / 20);

/** Pengali linear -> dB (20*log10(gain)). gain <= 0 -> -Infinity. */
export const gainToDb = (gain: number): number =>
  gain > 0 ? 20 * Math.log10(gain) : -Infinity;

/** Clamp dB ke rentang preamp; non-finite -> default 0 dB. */
export const clampMasterGainDb = (db: number): number =>
  Math.min(
    MASTER_GAIN_DB_MAX,
    Math.max(
      MASTER_GAIN_DB_MIN,
      Number.isFinite(db) ? db : MASTER_GAIN_DB_DEFAULT,
    ),
  );

/** Format dB buat slider: "0 dB", "+3.5 dB", "−12 dB" (satu desimal,
 *  tanpa desimal bila bulat; non-finite di-clamp ke rentang). */
export const formatMasterGainDb = (db: number): string => {
  const clamped = clampMasterGainDb(db);
  const rounded = Math.round(clamped * 10) / 10;
  if (rounded === 0) return "0 dB";
  const sign = rounded > 0 ? "+" : "−";
  const abs = Math.abs(rounded);
  const num = Number.isInteger(abs) ? String(abs) : abs.toFixed(1);
  return `${sign}${num} dB`;
};

const MASTER_GAIN_MIN = dbToGain(MASTER_GAIN_DB_MIN);
const MASTER_GAIN_MAX = dbToGain(MASTER_GAIN_DB_MAX);
const MASTER_GAIN_DEFAULT = 1.0;
const clampMasterGain = (g: number): number =>
  Math.min(
    MASTER_GAIN_MAX,
    Math.max(MASTER_GAIN_MIN, Number.isFinite(g) ? g : MASTER_GAIN_DEFAULT),
  );

const getCurrentSessionId = async (): Promise<number> => {
  try {
    if (!NativeDSPModule?.createAudioSession) {
      console.warn("[EQ Store] createAudioSession not available");
      return -1;
    }
    const result = await NativeDSPModule.createAudioSession();
    const sessionId = result?.sessionId ?? -1;
    if (sessionId > 0) {
      console.log(`[EQ Store] Got Session ID from native: ${sessionId}`);
      return sessionId;
    }
    return -1;
  } catch (error) {
    console.warn("[EQ Store] getCurrentSessionId failed:", error);
    return -1;
  }
};

// Helper untuk apply semua efek ke native dengan individual try-catch
// N4: fungsi ini bernama "AllEffects" tapi dulu HANYA mengirim gain 10
// band — matikan EQ lalu nyalakan lagi (atau ganti session): store masih
// menyimpan bassStrength/virtualizerLevel/reverbPreset > 0 dan UI
// menampilkannya aktif, tapi native tidak pernah menerima ketiganya.
// Sekarang kelima efek dikirim (EQ + bass + virtualizer + reverb + HRTF),
// masing-masing try/catch sendiri supaya satu efek yang gagal tidak
// membatalkan yang lain. Nilai 0 dikirim bila sakelar efeknya OFF.
// HRTF (2026-11-19): di luar preset — flag dibaca dari hrtfStore
// (kunci persist sendiri) supaya pemulihan saat app start / ganti
// session / EQ dinyalakan tidak kehilangan HRTF yang dipersist ON.
// (service.ts lama yang berisi applyAllSettings SUDAH DIHAPUS atas
// putusan csheva — logika restore-nya ditulis ulang di sini, file itu
// tidak dikembalikan. Jeda 300 ms dari applyAllSettings lama TIDAK
// ikut dibawa: jalur live ini tidak pernah memilikinya.)
// `trigger` dicetak di log "[DSP] Applied" supaya tes N4 bisa dibuktikan
// dari logcat (follow-up logcat 06:25/06:52/08:06: "[DSP] Applied" muncul
// 2×/5×/4× tanpa pemicu yang diketahui). Murni log — tanpa trigger pun
// perilakunya sama.
const applyAllEffectsToNative = async (state: any, trigger = "unknown") => {
  const {
    bands,
    isEQEnabled,
    isBassEnabled,
    isVirtualizerEnabled,
    isReverbEnabled,
    bassStrength,
    virtualizerLevel,
    reverbPreset,
    masterGain,
    audioSessionId,
    activePresetId,
  } = state;

  // N24 (skalar, 2026-11-20, bagian 3): baca snapshot PENDING bila ada
  // — drag yang masih dalam jendela throttle store belum flush ke
  // `state`, tapi apply harus mengirim nilai terbaru, bukan nilai store
  // yang basi (pola yang sama dengan _eqStorePendingBands untuk kurva
  // di applyEqThrottled). Tanpa ini, preset yang diketuk <100 ms
  // sesudah tick drag mengirim nilai drag lama ke native, lalu trailing
  // flush hanya memperbaiki store tanpa apply ulang.
  const effBassStrength = _eqScalarPending?.bassStrength ?? bassStrength;
  const effVirtualizerLevel =
    _eqScalarPending?.virtualizerLevel ?? virtualizerLevel;
  const effReverbPreset = _eqScalarPending?.reverbPreset ?? reverbPreset;
  const effMasterGain = _eqScalarPending?.masterGain ?? masterGain;

  if (!NativeDSPModule || !isEQEnabled) return false;

  // Gunakan ID yang sudah ada di state (yang dikirim dari playback.ts)
  // Jangan panggil TrackPlayer.getAudioSessionId() karena tidak tersedia
  let finalSessionId = audioSessionId;

  if (finalSessionId <= 0) {
    // Fallback terakhir: minta ke NativeModule kita untuk cari ID yang aktif.
    // EQ-8 langkah 1: guard sesi di pemanggil sudah dihapus, jadi jalur
    // ini kini bisa ditempuh dari apply fire-and-forget — rejection di
    // sini harus ditangkap di tempat, bukan jadi unhandled rejection.
    try {
      const sessionResult = await NativeDSPModule.createAudioSession();
      finalSessionId = sessionResult?.sessionId ?? 0;
    } catch {
      finalSessionId = 0;
    }
  }

  if (finalSessionId <= 0) return false;

  // Ingat: Di Java, gains ini harus dikali 100
  // (B14-M-H2): clamp di corong ke native — state seharusnya sudah
  // ter-clamp (applyPreset/migrate), ini pertahanan terakhir supaya
  // tidak ada jalur yang mengirim gain di luar ±10.
  const gains = bands.map((b: any) => clampBandGain(b.gain));
  // Clamp efek juga di corong (state lama bisa membawa nilai di luar
  // rentang setter): bass/virtualizer 0..1000, reverb 0..6.
  const bass = isBassEnabled
    ? Math.min(1000, Math.max(0, effBassStrength ?? 0))
    : 0;
  const virtualizer = isVirtualizerEnabled
    ? Math.min(1000, Math.max(0, effVirtualizerLevel ?? 0))
    : 0;
  const reverb = isReverbEnabled
    ? Math.min(6, Math.max(0, effReverbPreset ?? 0))
    : 0;
  // HRTF: flag dari store sendiri (bukan dari state EQ — di luar preset).
  const hrtf = useHrtfStore.getState().isHrtfEnabled;
  // Crossfade (2026-11-20): durasi dari store sendiri (di luar preset,
  // sama seperti HRTF). Hidup di PlaybackController, bukan rantai DSP —
  // tapi dipulihkan di sini juga supaya satu apply menutup semua efek.
  const crossfade = useCrossfadeStore.getState().crossfadeSeconds;
  // Convolver (2026-11-20): IR + toggle dari store sendiri (di luar
  // preset, sama seperti HRTF). Dipulihkan lewat restoreToNative di
  // entri efek di bawah — BUKAN di sini, karena restore harus
  // berurutan (load IR dulu, baru toggle).
  const convolver = useConvolverStore.getState();
  // Master gain: nilai linear 0.251..3.98 (−12..+12 dB, 1.0 netral).
  // TIDAK digate sakelar efek — gain bukan efek yang bisa OFF; lantai
  // −12 dB = 0,25× (bukan senyap). Yang di-gate hanya pengiriman ke
  // native (isEQEnabled di atas): rantai DSP yang membawa GainNode
  // hanya hidup di mode DSP saat EQ menyala.
  // ReplayGain (2026-11-20): yang dikirim adalah gain EFEKTIF
  // (user × faktor RG lagu aktif) — satu-satunya tempat nilai master
  // gain dihitung untuk native, jadi restore / preset / mode switch
  // tidak bisa menimpa RG diam-diam. RG mati / tanpa tag = gain user.
  const gain = getEffectiveMasterGain(
    clampMasterGain(effMasterGain ?? MASTER_GAIN_DEFAULT),
  );

  // Nilai efek yang dicetak di log "[DSP] Applied" (follow-up logcat
  // 14:47, 2026-11-19): nilai TERKIRIM ke native (sudah di-clamp;
  // 0 bila sakelar efeknya OFF) + activePresetId — jadi logcat
  // berikutnya menjawab N4 langsung.
  const valueDetailFor = (conv: {
    isConvolverEnabled: boolean;
    ir?: { name: string } | null;
  }) =>
    `preset=${activePresetId ?? "?"} bass=${bass} widener=${virtualizer} reverb=${reverb} hrtf=${hrtf ? 1 : 0} conv=${conv.isConvolverEnabled ? 1 : 0}(${conv.ir?.name ?? "-"}) xf=${crossfade}s gain=${gain.toFixed(2)} gains=[${gains.join(",")}]`;

  // (2026-11-20, fix logcat #9) — JALUR BATCH: satu panggilan native
  // `applyDspEffects` untuk seluruh apply, pengganti Promise.all 8
  // setter di bawah. Round-trip idle median ~1,2 dtk membuat 8
  // round-trip per apply mahal; satu batch = satu round-trip.
  // Kompatibilitas: APK lama (Dev run 44677261596, HEAD 83d1b488d)
  // TIDAK punya metode ini — `typeof` check di bawah mengarahkan ke
  // jalur legacy, jadi JS ini tetap jalan via Metro reload SEBELUM
  // Dev build apa pun. Bila batch MELEMPAR (mis. metode ternyata
  // tidak ada di proxy), fallback yang sama berjalan — nilai yang sama
  // diterapkan ulang (idempotent), jadi tidak ada efek yang hilang
  // walau batch sempat menerapkan sebagian sebelum melempar. Hanya
  // `false` (engine menolak) yang TIDAK di-fallback — setter individual
  // akan gagal dengan cara yang sama.
  if (typeof NativeDSPModule.applyDspEffects === "function") {
    const batchStartedAt = performance.now();
    try {
      // IR convolver dimuat dulu bila ada (toggle-nya ikut batch) —
      // urutan wajib karena native melupakan IR saat engine mati.
      await useConvolverStore.getState().preloadConvolverIr();
      const conv = useConvolverStore.getState();
      const ok = await NativeDSPModule.applyDspEffects(
        gains,
        bass,
        virtualizer,
        reverb,
        hrtf,
        crossfade,
        conv.isConvolverEnabled,
        gain,
        finalSessionId,
      );
      const batchMs = performance.now() - batchStartedAt;
      const detail = `(trigger: ${trigger}) in ${Math.round(batchMs)}ms (batch:${Math.round(batchMs)}ms) ${valueDetailFor(conv)}`;
      if (ok) {
        console.log(`[DSP] Applied to Session: ${finalSessionId} ${detail}`);
      } else {
        // Jujur: jangan klaim "Applied" kalau native menolak.
        console.log(
          `[DSP] Apply GAGAL SEBAGIAN to Session: ${finalSessionId} ${detail} — gagal: batch`,
        );
      }
      // [BRIDGE-PROBE] (diagnostik SEMENTARA, logcat #8): satu sampel
      // konteks "apply" per apply — durasi batch. Hapus baris ini saat
      // probe dicabut.
      noteBridgeProbeApply(batchMs);
      return ok;
    } catch (e) {
      console.warn(
        "[EQ Store] applyDspEffects gagal, fallback ke setter individual:",
        e,
      );
      // Jatuh ke jalur legacy di bawah.
    }
  }

  const effects: Array<[string, () => Promise<unknown>]> = [
    ["setFullEqualizer", () => NativeDSPModule.setFullEqualizer(gains, finalSessionId)],
    ["setBassBoost", () => NativeDSPModule.setBassBoost(bass, finalSessionId)],
    ["setVirtualizer", () => {
      // DIAGNOSTIK SEMENTARA — bisa dicabut (audit setVirtualizer 2026-11-19, opsi B).
      console.log(`[EQ-DIAG] setVirtualizer via applyAllEffectsToNative strength=${virtualizer}`);
      return NativeDSPModule.setVirtualizer(virtualizer, finalSessionId);
    }],
    // Reverb (2026-11-19): engine beneran ada di C++ (ReverbNode
    // Freeverb) — restore ini benar-benar mengubah suara. Preset 0 =
    // tanpa reverb.
    ["setReverbPreset", () => NativeDSPModule.setReverbPreset(reverb, finalSessionId)],
    // HRTF (2026-11-19): flag dari hrtfStore — di luar preset.
    ["setHrtfEnabled", () => NativeDSPModule.setHrtfEnabled(hrtf, finalSessionId)],
    // Crossfade (2026-11-20): durasi dari crossfadeStore — di luar
    // preset. restoreToNative mendorong nilai tersimpan (0 = mati =
    // perilaku lama). Bukan lewat NativeDSPModule langsung di sini
    // supaya logika push (createAudioSession + clamp) satu tempat.
    ["setCrossfadeSeconds", () => useCrossfadeStore.getState().restoreToNative()],
    // Gapless (2026-11-20): flag dari gaplessStore — di luar preset.
    // restoreToNative mendorong nilai tersimpan (default ON = pre-roll
    // + trim). Bukan lewat NativeDSPModule langsung di sini supaya
    // logika push (createAudioSession) satu tempat.
    ["setGaplessEnabled", () => useGaplessStore.getState().restoreToNative()],
    // Convolver (2026-11-20): IR + toggle dari convolverStore — di
    // luar preset. SATU entri gabungan (bukan dua entri Promise.all):
    // load IR dulu, baru toggle — urutan wajib karena native
    // melupakan IR saat engine mati. restoreToNative resolve
    // undefined = berhasil (wrapper di bawah menilai r !== false).
    // Tanpa IR tersimpan, restore hanya mendorong toggle (mati).
    ["convolver", () => useConvolverStore.getState().restoreToNative()],
    // Master gain: Promise<boolean> sejak P1-9 (2026-11-19) — tanpa
    // sessionId (engine global, F7). Dibungkus supaya masuk Promise.all
    // yang sama + hasil false tercatat sebagai gagal oleh wrapper di
    // bawah. `?.()` supaya JS lama tetap jalan lawan modul native yang
    // belum punya metode ini (mirip guard `?.setFullEqualizer` di
    // applyEqThrottled); tanpa itu TypeError membuat apply gagal total.
    ["setMasterGain", async () => NativeDSPModule?.setMasterGain?.(gain)],
  ];
  // Diagnostik (verifikasi 2nd opinion, 2026-11-19): ukur durasi apply —
  // timing log membuktikan/membantah dugaan "apply DSP lambat/berat" dari
  // logcat berikutnya. Murni log; urutan/perilaku tidak berubah, tanpa
  // debounce (debounce TIDAK diputuskan).
  const applyStartedAt = performance.now();
  const results = await Promise.all(
    effects.map(async ([name, apply]) => {
      const startedAt = performance.now();
      try {
        // Hasil apply ikut dinilai: setter lama mengembalikan void
        // (undefined = berhasil), setter baru mengembalikan boolean —
        // `false` berarti native menolak dan harus tercatat sebagai gagal.
        const r: unknown = await apply();
        return { ok: r !== false, name, ms: performance.now() - startedAt };
      } catch (e) {
        console.error(`[EQ Store] Failed to apply ${name}:`, e);
        return { ok: false, name, ms: performance.now() - startedAt };
      }
    }),
  );
  const totalMs = performance.now() - applyStartedAt;
  const perEffect = results
    .map((r) => `${r.name}:${Math.round(r.ms)}ms`)
    .join(" ");
  const detail = `(trigger: ${trigger}) in ${Math.round(totalMs)}ms (${perEffect}) ${valueDetailFor(convolver)}`;
  if (results.every((r) => r.ok)) {
    console.log(`[DSP] Applied to Session: ${finalSessionId} ${detail}`);
  } else {
    // Jujur: jangan klaim "Applied" kalau sebagian efek gagal — log
    // menyebut yang gagal supaya logcat berikutnya bisa membuktikannya.
    const failed = results
      .filter((r) => !r.ok)
      .map((r) => r.name)
      .join(", ");
    console.log(
      `[DSP] Apply GAGAL SEBAGIAN to Session: ${finalSessionId} ${detail} — gagal: ${failed}`,
    );
  }
  // [BRIDGE-PROBE] (diagnostik SEMENTARA, logcat #8): satu sampel konteks
  // "apply" per apply — setter terlambat yang sudah terukur di atas, TANPA
  // panggilan native tambahan. Hapus baris ini saat probe dicabut.
  noteBridgeProbeApply(
    results.length > 0 ? Math.max(...results.map((r) => r.ms)) : 0,
  );
  return results.every((r) => r.ok);
};

// ─────────────────────────────────────────────
// Store Implementation
// ─────────────────────────────────────────────

// J1-2 (Batch JS-1): throttle apply EQ ke native (leading + trailing, 100 ms).
// setBandGain dipanggil tiap tick drag — tanpa ini tiap tick = satu panggilan
// native yang mengantre di JS → bridge. State store tetap di-update langsung
// tiap tick (UI/graph responsif); hanya panggilan native yang dibatasi.
// Leading memberi feedback suara langsung di tick pertama; trailing memastikan
// nilai akhir selalu terkirim. Apply membaca bands TERKINI dari store, jadi
// tidak ada band yang hilang walau beberapa band berubah dalam satu jendela.
const EQ_APPLY_THROTTLE_MS = 100;
let _eqApplyLastAt = 0;
let _eqApplyTimer: ReturnType<typeof setTimeout> | null = null;

// Opsi 3 (log #15): gate in-flight untuk setFullEqualizer —
// maks 1 panggilan native in-flight + 1 snapshot tertahan (flag; isi
// snapshot dibaca ulang saat fire, jadi selalu yang terbaru), hanya
// selama drag. Di luar drag: tanpa gating (perilaku lama, void).
let _eqApplyInFlight = false;
let _eqApplyHeld = false;

// (Item 7) Kirim bands TERKINI ke native sekali — dipakai leading /
// trailing timer applyEqThrottled di bawah DAN flush saat drag dilepas.
// Membaca snapshot PENDING store bila ada (N24), bukan hanya get().bands.
const fireEqApply = (
  get: () => {
    bands: { gain: number }[];
    isEQEnabled: boolean;
    audioSessionId: number;
  },
) => {
  // Opsi 3: selama drag, JANGAN kirim selagi ada setFullEqualizer yang
  // belum resolve — cukup tandai tertahan. lastAt TIDAK dimajukan:
  // tick berikut tetap lewat cabang leading applyEqThrottled dan
  // menandai tertahan lagi (snapshot terbaru yang dibaca saat settle).
  if (isDragActive() && _eqApplyInFlight) {
    _eqApplyHeld = true;
    _eqApplyTimer = null;
    return;
  }
  _eqApplyLastAt = Date.now();
  _eqApplyTimer = null;
  // N24: apply membaca snapshot PENDING store bila ada, bukan hanya
  // get().bands. Dua throttle (store + apply, masing-masing ~100 ms)
  // dihitung dari lastAt yang berbeda dan bisa meleset beberapa ms —
  // bila timer apply menang dari timer flush store, get().bands masih
  // berisi bands pra-drag dan tidak ada apply susulan (apply hanya
  // dipicu tick drag). Pending adalah snapshot bands TERBARU dari
  // setBandGain, jadi nilai akhir selalu terkirim walau flush store
  // belum jalan. (Flush store yang datang sesudahnya menulis bands
  // yang sama persis, jadi tidak ada apply yang hilang.)
  const { bands: storedBands, isEQEnabled, audioSessionId } = get();
  const bands = _eqStorePendingBands ?? storedBands;
  // EQ-8 langkah 1: guard sesi dihapus — sessionId DIABAIKAN native
  // (F7: satu stream global; setter Kotlin hanya cek engineAvailable),
  // jadi -1 hanya berarti "belum ada sesi", bukan alasan menahan apply.
  // applyAllEffectsToNative punya fallback createAudioSession sendiri.
  if (!isEQEnabled || !NativeDSPModule?.setFullEqualizer) {
    // [DRAG-DIAG] fire yang tidak mengirim apa-apa (guard di atas).
    noteThrottleTick("bands", "skipped");
    return;
  }
  const gains = bands.map((b) => clampBandGain(b.gain));
  // Opsi 3: lacak janji ini sebagai in-flight — settle-nya yang
  // mengirim snapshot tertahan (bila ada). Dulu `void` tanpa jejak:
  // tiap fire memulai janji yang tak terlacak, dan janji-janji itu
  // yang menumpuk saat thread JS kelaparan (log #15).
  const result: unknown = NativeDSPModule.setFullEqualizer(
    gains,
    audioSessionId,
  );
  if (
    result !== null &&
    typeof result === "object" &&
    typeof (result as { then?: unknown }).then === "function"
  ) {
    _eqApplyInFlight = true;
    const settleEqApply = () => {
      _eqApplyInFlight = false;
      if (_eqApplyHeld) {
        _eqApplyHeld = false;
        // Snapshot bands terbaru dibaca ulang di dalam fireEqApply.
        try {
          fireEqApply(get);
        } catch {
          // fireEqApply tidak melempar dalam praktik; jaring pengaman
          // supaya settle async tidak jadi unhandled rejection.
        }
      }
    };
    (result as Promise<unknown>).then(settleEqApply, settleEqApply);
    (result as Promise<unknown>).catch(() => {});
  }
};

/**
 * (Item 7) Flush apply band yang masih tertunda SEKARANG — dipakai
 * flushBandDrag saat drag dilepas. Hanya bila timer trailing apply
 * masih hidup: tanpa timer, tick terakhir sudah terkirim leading
 * (fire membaca snapshot pending saat itu), jadi no-op dan tidak ada
 * pengiriman ganda. Timer dibersihkan supaya nilai yang sama tidak
 * terkirim ulang sesudahnya.
 */
const flushPendingEqApply = (
  get: () => {
    bands: { gain: number }[];
    isEQEnabled: boolean;
    audioSessionId: number;
  },
) => {
  if (!_eqApplyTimer) return;
  clearTimeout(_eqApplyTimer);
  _eqApplyTimer = null;
  fireEqApply(get);
};

const applyEqThrottled = (
  get: () => {
    bands: { gain: number }[];
    isEQEnabled: boolean;
    audioSessionId: number;
  },
) => {
  const now = Date.now();
  if (now - _eqApplyLastAt >= EQ_APPLY_THROTTLE_MS) {
    if (_eqApplyTimer) {
      clearTimeout(_eqApplyTimer);
      _eqApplyTimer = null;
    }
    fireEqApply(get);
    // [DRAG-DIAG] tick yang langsung fire (leading).
    noteThrottleTick("bands", "fired");
  } else if (!_eqApplyTimer) {
    // [DRAG-DIAG] tick yang dijadwalkan sebagai trailing fire.
    noteThrottleTick("bands", "trailing");
    _eqApplyTimer = setTimeout(
      () => fireEqApply(get),
      EQ_APPLY_THROTTLE_MS - (now - _eqApplyLastAt),
    );
  } else {
    // [DRAG-DIAG] tick dalam jendela + trailing sudah terjadwal =
    // digabung ke trailing fire (nilai akhir tetap terkirim lewat
    // snapshot pending, tapi tick ini hilang) — hitung supaya logcat
    // bisa membuktikan berapa tick yang hilang saat drag.
    noteThrottleTick("bands", "dropped");
  }
};

// Fix G: throttle update STORE di setBandGain (leading + trailing, 100 ms),
// pola sama seperti J1-2 di atas. Tiap tick drag sebelumnya = satu set() =
// satu re-render semua subscriber store + satu redraw grafik Skia.
// Leading: tick pertama langsung masuk store (UI responsif). Tick dalam
// jendela digabung: hanya snapshot bands TERBARU yang disimpan sebagai
// pending, lalu trailing flush paling lambat 100 ms kemudian. Pending
// dihitung dari snapshot pending (bukan get().bands) supaya perubahan band
// lain dalam jendela yang sama tidak hilang. Throttle ini HANYA menutup
// set() — applyEqThrottled (J1-2) tetap dipanggil tiap tick seperti semula,
// jadi perilaku native apply tidak berubah.
const EQ_STORE_THROTTLE_MS = 100;
let _eqStoreLastAt = 0;
let _eqStoreTimer: ReturnType<typeof setTimeout> | null = null;
let _eqStorePendingBands: any[] | null = null;

// (2026-11-20, fix logcat #9, bagian 3) — throttle set() untuk keempat
// slider drag (bass/widener/reverb/master gain), pola Fix G yang sama
// (leading + trailing, 100 ms). SATU jendela + SATU timer bersama: satu
// set() sudah membawa semua field, jadi drag dua slider dalam satu
// jendela tetap satu flush. Thumb TIDAK bergantung pada store ini
// (Reanimated shared value di UI thread mengikuti jari), jadi yang
// di-throttle hanya re-render layar + teks nilai — keduanya mengejar
// nilai akhir via trailing flush. Yang TIDAK di-throttle: dorongan ke
// native (pusher bagian 1 punya throttle sendiri dan dipanggil tiap tick
// dengan nilai terbaru) — suara tetap mengikuti jari, hanya UI yang
// mengejar ≤100 ms. Kategori [DRAG-DIAG] "store" yang sama dengan Fix G.
type ScalarPatch = Partial<{
  bassStrength: number;
  virtualizerLevel: number;
  reverbPreset: number;
  masterGain: number;
}>;
let _eqScalarLastAt = 0;
let _eqScalarTimer: ReturnType<typeof setTimeout> | null = null;
let _eqScalarPending: ScalarPatch | null = null;

const throttledScalarSet = (
  setFn: (partial: ScalarPatch) => void,
  patch: ScalarPatch,
) => {
  const now = Date.now();
  if (now - _eqScalarLastAt >= EQ_STORE_THROTTLE_MS) {
    if (_eqScalarTimer) {
      clearTimeout(_eqScalarTimer);
      _eqScalarTimer = null;
    }
    _eqScalarPending = null;
    _eqScalarLastAt = now;
    // [DRAG-DIAG] tick store yang langsung masuk (leading).
    noteThrottleTick("store", "fired");
    setFn(patch);
  } else {
    _eqScalarPending = { ..._eqScalarPending, ...patch };
    if (!_eqScalarTimer) {
      // [DRAG-DIAG] tick store yang dijadwalkan sebagai trailing flush.
      noteThrottleTick("store", "trailing");
      _eqScalarTimer = setTimeout(() => {
        _eqScalarLastAt = Date.now();
        _eqScalarTimer = null;
        const pending = _eqScalarPending;
        _eqScalarPending = null;
        if (pending) setFn(pending);
      }, EQ_STORE_THROTTLE_MS - (now - _eqScalarLastAt));
    } else {
      // [DRAG-DIAG] tick store yang digabung ke flush tertunda.
      noteThrottleTick("store", "dropped");
    }
  }
};

/**
 * Terapkan flush skalar yang masih tertunda SEKARANG (bukan menunggu
 * timer) — dipakai aksi diskrit (preset) supaya store langsung
 * menunjukkan nilai aksi itu, bukan nilai drag sebelumnya (paralel
 * dengan applyPreset yang set bands langsung, bukan via setBandGain).
 * Tanpa ini, preset yang diketuk <100 ms sesudah tick drag menampilkan
 * nilai drag lama sampai trailing flush jalan.
 */
const flushPendingScalarSet = (
  setFn: (partial: ScalarPatch) => void,
) => {
  if (_eqScalarTimer) {
    clearTimeout(_eqScalarTimer);
    _eqScalarTimer = null;
  }
  const pending = _eqScalarPending;
  _eqScalarPending = null;
  if (pending) {
    _eqScalarLastAt = Date.now();
    setFn(pending);
  }
};

/**
 * (Item 7) Terapkan flush bands Fix G yang masih tertunda SEKARANG —
 * dipakai flushBandDrag saat drag band/kurva dilepas, supaya store
 * langsung menunjukkan gain akhir (bukan menunggu timer trailing).
 * Tanpa pending: no-op. Timer dibersihkan supaya snapshot yang sama
 * tidak ditulis ulang sesudahnya.
 */
const flushPendingBandStoreSet = (
  setFn: (partial: { bands: any[]; activePresetId: string }) => void,
) => {
  if (_eqStoreTimer) {
    clearTimeout(_eqStoreTimer);
    _eqStoreTimer = null;
  }
  const pending = _eqStorePendingBands;
  _eqStorePendingBands = null;
  if (pending) {
    _eqStoreLastAt = Date.now();
    setFn({ bands: pending, activePresetId: "custom" });
  }
};

// P1-9 (2026-11-19): throttle dorongan setMasterGain ke native (leading +
// trailing, 100 ms — pola applyEqThrottled J1-2). Slider gain dipanggil
// tiap tick drag; tanpa ini tiap tick = satu panggilan bridge. State
// store tetap di-update langsung tiap tick; hanya panggilan native yang
// dibatasi. Nilai terakhir selalu terkirim (trailing).
const MASTER_GAIN_NATIVE_THROTTLE_MS = 100;
let _masterGainLastAt = 0;
let _masterGainTimer: ReturnType<typeof setTimeout> | null = null;
let _masterGainPending: number | null = null;
// Opsi 3 (log #15): satu dorongan master gain in-flight + satu nilai
// tertahan (yang terbaru) — hanya selama drag (lihat fireMasterGain).
let _masterGainInFlight = false;
let _masterGainHeld: number | null = null;

const fireMasterGain = async (gain: number) => {
  // Opsi 3 (log #15): selama drag, maks 1 in-flight. Bila ada dorongan
  // master gain yang belum resolve, tahan nilai terbaru — kirim begitu
  // yang lama selesai. Pending throttle (`_masterGainPending ?? gain`)
  // ikut dikonsumsi ke nilai tertahan supaya yang terbaru yang menang.
  // Di luar drag: tanpa gating (perilaku lama).
  if (isDragActive() && _masterGainInFlight) {
    _masterGainHeld = _masterGainPending ?? gain;
    _masterGainPending = null;
    _masterGainTimer = null;
    return;
  }
  _masterGainInFlight = true;
  try {
    _masterGainLastAt = Date.now();
    _masterGainTimer = null;
    const value = _masterGainPending ?? gain;
    _masterGainPending = null;
    // ReplayGain (2026-11-20): `value` di sini masih gain USER (slider);
    // yang dikirim ke native adalah gain EFEKTIF (user × faktor RG lagu
    // aktif). Konversi di sini (bukan di pemanggil) supaya SEMUA pemanggil
    // — slider, restore, toggle RG — otomatis konsisten, dan nilai
    // terakhir selalu terkirim (trailing) dengan faktor RG terbaru.
    const effective = getEffectiveMasterGain(value);
    // setMasterGain kini Promise<boolean> (P1-9): false = native menolak.
    // fire-and-forget (N23) tapi rejection dicatat — jangan jadi unhandled.
    try {
      const ok = await NativeDSPModule?.setMasterGain?.(effective);
      if (ok === false) {
        console.warn("[EQ Store] setMasterGain ditolak native");
      }
    } catch (e) {
      console.error("[EQ Store] setMasterGain gagal:", e);
    }
  } finally {
    _masterGainInFlight = false;
    const held = _masterGainHeld;
    _masterGainHeld = null;
    if (held !== null) void fireMasterGain(held);
  }
};

/**
 * (Item 7) Kirim pending master gain SEKARANG — dipakai flushMasterGainDrag
 * saat slider gain dilepas. Hanya bila timer trailing masih hidup: tanpa
 * timer, tick terakhir sudah terkirim leading, jadi no-op dan tidak ada
 * pengiriman ganda. Timer dibersihkan supaya nilai yang sama tidak
 * terkirim ulang sesudahnya.
 */
const flushMasterGainPush = () => {
  if (!_masterGainTimer) return;
  clearTimeout(_masterGainTimer);
  _masterGainTimer = null;
  const pending = _masterGainPending;
  _masterGainPending = null;
  if (pending !== null) void fireMasterGain(pending);
};

const pushMasterGainThrottled = (gain: number) => {
  const now = Date.now();
  if (now - _masterGainLastAt >= MASTER_GAIN_NATIVE_THROTTLE_MS) {
    if (_masterGainTimer) {
      clearTimeout(_masterGainTimer);
      _masterGainTimer = null;
    }
    _masterGainPending = null;
    void fireMasterGain(gain);
    // [DRAG-DIAG] tick yang langsung fire (leading).
    noteThrottleTick("gain", "fired");
  } else if (!_masterGainTimer) {
    // [DRAG-DIAG] tick yang dijadwalkan sebagai trailing fire.
    noteThrottleTick("gain", "trailing");
    _masterGainPending = gain;
    _masterGainTimer = setTimeout(
      () => void fireMasterGain(gain),
      MASTER_GAIN_NATIVE_THROTTLE_MS - (now - _masterGainLastAt),
    );
  } else {
    // [DRAG-DIAG] tick dalam jendela + trailing sudah terjadwal =
    // digabung ke trailing fire — lihat applyEqThrottled di atas.
    noteThrottleTick("gain", "dropped");
    _masterGainPending = gain;
  }
};

// (logcat #9) — throttle + fire-and-forget untuk tiga setter drag yang
// dulu TANPA throttle (`setBassBoost` / `setVirtualizer` / `setReverb`:
// tiap tick langsung `await` native → 41 janji tak ter-resolve, overlap
// depth 2 → 41). Pola sama seperti `pushMasterGainThrottled` di atas
// (leading + trailing, 100 ms): nilai terakhir selalu terkirim via
// trailing; panggilan native TIDAK PERNAH di-await — `send` menelan
// rejection di dalam (pola N23), pusher memasang .catch pengaman.
//
// CATATAN gate: aksi di bawah memeriksa `isEQEnabled` / sakelar efek /
// session SEBELUM push. Trailing fire yang jatuh sesudah master
// dimatikan tetap terkirim (satu panggilan sia-sia — engine sudah
// bypass, nilainya tidak terdengar; apply berikutnya mengirim ulang
// semua) — itu diterima supaya pusher tetap logika murni tanpa `get()`.
// Store `set()` TIDAK lagi langsung per tick (bagian 3):
// `throttledScalarSet` di atas men-throttle-nya (leading + trailing,
// 100 ms, pola Fix G) — pusher tetap dipanggil tiap tick dengan nilai
// terbaru, jadi suara mengikuti jari sementara re-render layar mengejar
// ≤100 ms.
const EFFECT_PUSH_THROTTLE_MS = 100;

const pushBassBoostThrottled = createEffectPusher({
  throttleName: "bass",
  throttleMs: EFFECT_PUSH_THROTTLE_MS,
  send: (value, sessionId) => {
    // Opsi 3 (log #15): KEMBALIKAN janji IIFE ini (dulu `void`) supaya
    // pusher bisa melacak in-flight dan menahan nilai tengah selama
    // drag. IIFE menelan error di dalam, jadi janji selalu resolve —
    // pusher tetap fire-and-forget, hanya kini ia tahu kapan satu
    // panggilan selesai.
    return (async () => {
      const h = noteSetterStart("setBassBoost");
      try {
        await NativeDSPModule.setBassBoost(value, sessionId);
      } catch (e) {
        console.error("[EQ Store] setBassBoost gagal:", e);
      } finally {
        noteSetterEnd(h);
      }
    })();
  },
});

const pushVirtualizerThrottled = createEffectPusher({
  throttleName: "widener",
  throttleMs: EFFECT_PUSH_THROTTLE_MS,
  send: (value, sessionId) => {
    // Opsi 3 (log #15): kembalikan janji — lihat pushBassBoostThrottled.
    return (async () => {
      const h = noteSetterStart("setVirtualizer");
      try {
        // DIAGNOSTIK SEMENTARA — bisa dicabut (audit setVirtualizer 2026-11-19, opsi B).
        console.log(`[EQ-DIAG] setVirtualizer via setVirtualizer strength=${value}`);
        await NativeDSPModule.setVirtualizer(value, sessionId);
      } catch (e) {
        console.error("[EQ Store] setVirtualizer gagal:", e);
      } finally {
        noteSetterEnd(h);
      }
    })();
  },
});

const pushReverbThrottled = createEffectPusher({
  throttleName: "reverb",
  throttleMs: EFFECT_PUSH_THROTTLE_MS,
  send: (value, sessionId) => {
    // Opsi 3 (log #15): kembalikan janji — lihat pushBassBoostThrottled.
    return (async () => {
      const h = noteSetterStart("setReverb");
      try {
        await NativeDSPModule.setReverbPreset(value, sessionId);
      } catch (e) {
        console.error("[EQ Store] setReverbPreset gagal:", e);
      } finally {
        noteSetterEnd(h);
      }
    })();
  },
});

/** Batalkan trailing fire ketiga pusher di atas (lihat resetToDefault). */
const cancelPendingEffectPushes = () => {
  pushBassBoostThrottled.cancelPending();
  pushVirtualizerThrottled.cancelPending();
  pushReverbThrottled.cancelPending();
};

// N29: counter penambah keunikan id preset custom (lihat saveCustomPreset).
let _customPresetSeq = 0;

// Batalkan update store yang masih tertunda (pending trailing flush).
// Dipanggil aksi yang mengganti bands secara wholesale (preset, reset,
// setBandsGain) supaya flush basi tidak menimpa bands baru mereka.
// (2026-11-20, bagian 3): mencakup juga flush skalar tertunda
// (bass/widener/reverb/gain) — alasan yang sama.
const cancelPendingStoreUpdate = () => {
  if (_eqStoreTimer) {
    clearTimeout(_eqStoreTimer);
    _eqStoreTimer = null;
  }
  _eqStorePendingBands = null;
  if (_eqScalarTimer) {
    clearTimeout(_eqScalarTimer);
    _eqScalarTimer = null;
  }
  _eqScalarPending = null;
};

export const useEqualizerStore = create<EqualizerStore>()(
  persist(
    (set, get) => ({
      // --- Initial State ---
      bands: makeBands([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      activePresetId: "flat",
      isEQEnabled: false,
      isBassEnabled: true,
      isVirtualizerEnabled: true,
      isReverbEnabled: true,
      customPresets: [],
      bassStrength: 0,
      reverbPreset: 0,
      virtualizerLevel: 0,
      masterGain: MASTER_GAIN_DEFAULT,
      audioSessionId: -1,
      isInitialized: false,
      eqEnabledBeforeBitPerfect: null,

      // --- Actions ---

      setEqEnabledBeforeBitPerfect: (value: boolean | null) => {
        set({ eqEnabledBeforeBitPerfect: value });
      },

      initialize: async () => {
        if (get().isInitialized) return;
        console.log("[EQ Store] Initializing...");

        if (Platform.OS !== "android") {
          set({ isInitialized: true });
          return;
        }

        try {
          const sessionId = await getCurrentSessionId();
          set({ audioSessionId: sessionId, isInitialized: true });
          // EQ-17: terbitkan token sesi untuk pushDsp.
          setDspSessionId(sessionId);

          // P0: samakan flag native dengan isEQEnabled yang dipersist —
          // native default eqEnabled=true, jadi boot dengan EQ mati harus
          // mendorong false (kalau tidak, rantai memproses walau UI bilang
          // mati — walau dengan parameter default yang netral).
          try {
            await NativeDSPModule?.setEqEnabled?.(
              get().isEQEnabled,
              sessionId,
            );
          } catch (e) {
            console.error("[EQ Store] setEqEnabled gagal:", e);
          }

          if (get().isEQEnabled) {
            await applyAllEffectsToNative(get(), "initialize");
          }

          // Crossfade (2026-11-20): restore DI LUAR gate EQ — nilai
          // ini hidup di PlaybackController (fade track), bukan di
          // rantai DSP, jadi harus pulih walau EQ master mati (mode
          // DSP dengan EQ mati tetap mem-fade ekor lagu). applyAll
          // di atas juga mendorongnya bila EQ menyala; pemulihan di
          // sini menutup kasus EQ mati.
          try {
            await useCrossfadeStore.getState().restoreToNative();
          } catch (e) {
            console.error("[EQ Store] restore crossfade gagal:", e);
          }

          // Gapless (2026-11-20): restore DI LUAR gate EQ — sama
          // seperti crossfade (hidup di PlaybackController, bukan di
          // rantai DSP). applyAll di atas juga mendorongnya bila EQ
          // menyala; pemulihan di sini menutup kasus EQ mati.
          try {
            await useGaplessStore.getState().restoreToNative();
          } catch (e) {
            console.error("[EQ Store] restore gapless gagal:", e);
          }

          // Koreksi headphone (EQ-21, 2026-11-26): restore DI LUAR
          // gate EQ — koreksi hidup di luar rantai EQ 10-band dan
          // harus pulih walau EQ master mati. Native melupakan preset
          // saat proses mati; tanpa ini UI mengklaim "aktif" tapi
          // tidak ada koreksi sampai user men-tap ulang profilnya.
          try {
            await useHeadphoneStore.getState().restoreToNative();
          } catch (e) {
            console.error("[EQ Store] restore headphone gagal:", e);
          }
        } catch {
          set({ isInitialized: true });
        }
      },

      setAudioSessionId: (id: number) => {
        // EQ-20: sesi baru = engine/session dibuat ulang = native lupa
        // IR-nya. Reset penanda supaya apply berikut memuat ulang IR
        // (bukan skip karena mengira IR lama masih ada).
        if (id !== get().audioSessionId) {
          resetConvolverIrLoaded();
        }
        // EQ-17: terbitkan token sesi untuk pushDsp.
        setDspSessionId(id);
        set({ audioSessionId: id });
        if (get().isEQEnabled) {
          applyAllEffectsToNative(get(), "setAudioSessionId");
        }
      },

      toggleEQ: async () => {
        const newState = !get().isEQEnabled;
        await get().setEQEnabled(newState);
      },

      setEQEnabled: async (enabled: boolean) => {
        set({ isEQEnabled: enabled });
        const sessionId = get().audioSessionId;
        // P0 (2026-11-19): dorong flag eqEnabled ke native — inilah yang
        // benar-benar membypass rantai DSP saat OFF (DSPConfig.enabled).
        // releaseAllFX lama (no-op yang hanya resolve true) tidak lagi
        // dipanggil; flag ini satu-satunya mekanisme bypass. sessionId
        // diterima API tapi diabaikan native (F7: satu stream global).
        try {
          await NativeDSPModule?.setEqEnabled?.(enabled, sessionId);
        } catch (e) {
          console.error("[EQ Store] setEqEnabled gagal:", e);
        }
        if (enabled) {
          await applyAllEffectsToNative(get(), "setEQEnabled");
        }
      },

      // --- Individual Switch Actions ---

      // N23: panggilan native dibungkus try/catch — setter ini dipanggil
      // fire-and-forget dari useEqualizer/slider, jadi rejection bridge
      // (session belum siap, modul belum load) dulu jadi unhandled
      // rejection. State tetap disimpan (niat user); yang gagal hanya
      // dorongan ke native, dicatat di log.
      setBassEnabled: async (enabled: boolean) => {
        set({ isBassEnabled: enabled });
        const { isEQEnabled, audioSessionId, bassStrength } = get();
        if (isEQEnabled) {
          try {
            await NativeDSPModule.setBassBoost(
              enabled ? bassStrength : 0,
              audioSessionId,
            );
          } catch (e) {
            console.error("[EQ Store] setBassBoost gagal:", e);
          }
        }
      },

      setVirtualizerEnabled: async (enabled: boolean) => {
        set({ isVirtualizerEnabled: enabled });
        const { isEQEnabled, audioSessionId, virtualizerLevel } = get();
        if (isEQEnabled) {
          try {
            // DIAGNOSTIK SEMENTARA — bisa dicabut (audit setVirtualizer 2026-11-19, opsi B).
            console.log(`[EQ-DIAG] setVirtualizer via setVirtualizerEnabled strength=${enabled ? virtualizerLevel : 0}`);
            await NativeDSPModule.setVirtualizer(
              enabled ? virtualizerLevel : 0,
              audioSessionId,
            );
          } catch (e) {
            console.error("[EQ Store] setVirtualizer gagal:", e);
          }
        }
      },

      setReverbEnabled: async (enabled: boolean) => {
        set({ isReverbEnabled: enabled });
        const { isEQEnabled, audioSessionId, reverbPreset } = get();
        if (isEQEnabled) {
          try {
            await NativeDSPModule.setReverbPreset(
              enabled ? reverbPreset : 0,
              audioSessionId,
            );
          } catch (e) {
            console.error("[EQ Store] setReverbPreset gagal:", e);
          }
        }
      },

      // --- Value Adjustment Actions ---

      setBassBoost: async (strength: number) => {
        const clamped = Math.min(1000, Math.max(0, strength));
        // (logcat #9, bagian 3) store set() di-throttle (leading +
        // trailing, 100 ms) — layar + teks nilai mengejar ≤100 ms;
        // dorongan native di bawah tetap tiap tick via pusher.
        throttledScalarSet(set, { bassStrength: clamped });
        const { isEQEnabled, isBassEnabled, audioSessionId } = get();
        if (isEQEnabled && isBassEnabled) {
          // (logcat #9) throttle + fire-and-forget — JANGAN await native
          // per tick (dulu: 41 janji tak ter-resolve). Aksi kembali
          // segera; nilai terakhir dijamin trailing (lihat effectPusher).
          pushBassBoostThrottled.push(clamped, audioSessionId);
        }
      },

      setVirtualizer: async (level: number) => {
        const clamped = Math.min(1000, Math.max(0, level));
        // (logcat #9, bagian 3) store set() di-throttle — lihat setBassBoost.
        throttledScalarSet(set, { virtualizerLevel: clamped });
        const { isEQEnabled, isVirtualizerEnabled, audioSessionId } = get();
        if (isEQEnabled && isVirtualizerEnabled) {
          // (logcat #9) throttle + fire-and-forget — lihat setBassBoost.
          pushVirtualizerThrottled.push(clamped, audioSessionId);
        }
      },

      // Master gain (2026-11-19): mesin native-nya SUDAH lengkap sejak
      // lama (spec setMasterGain -> Kotlin -> JNI -> AudioEngine ->
      // AudioState clamp 0..4 -> GainNode di DSPChain), tapi NOL
      // pemanggil di src/ — slider ini yang pertama. Tanpa sessionId:
      // gain itu global engine (F7), bukan per-sesi, jadi yang di-gate
      // hanya isEQEnabled (mirip bass/widener, minus cek session).
      // State selalu disimpan (niat user); dorongan ke native yang gagal
      // hanya dicatat (pola N23). Tidak masuk profil preset (lihat
      // komentar MASTER_GAIN_* di atas).
      setMasterGain: async (gain: number) => {
        const clamped = clampMasterGain(gain);
        // (logcat #9, bagian 3) store set() di-throttle — lihat setBassBoost.
        throttledScalarSet(set, { masterGain: clamped });
        if (get().isEQEnabled) {
          pushMasterGainThrottled(clamped);
        }
      },

      setReverb: async (preset: number) => {
        const clamped = Math.min(6, Math.max(0, preset));
        // (logcat #9, bagian 3) store set() di-throttle — lihat setBassBoost.
        throttledScalarSet(set, { reverbPreset: clamped });
        const { isEQEnabled, isReverbEnabled, audioSessionId } = get();
        if (isEQEnabled && isReverbEnabled) {
          // (logcat #9) throttle + fire-and-forget — lihat setBassBoost.
          pushReverbThrottled.push(clamped, audioSessionId);
        }
      },

      setBandGain: (index: number, gain: number) => {
  const clampedGain = clampBandGain(gain);
  // Fix G: jangan set() tiap tick drag — throttle store (leading +
  // trailing, 100 ms). Snapshot dihitung dari pending bila ada, supaya
  // perubahan band lain dalam jendela yang sama tidak tertimpa.
  const baseBands = _eqStorePendingBands ?? get().bands;
  const newBands = baseBands.map((b, i) =>
    i === index ? { ...b, gain: clampedGain } : b,
  );
  const now = Date.now();
  if (now - _eqStoreLastAt >= EQ_STORE_THROTTLE_MS) {
    if (_eqStoreTimer) {
      clearTimeout(_eqStoreTimer);
      _eqStoreTimer = null;
    }
    _eqStorePendingBands = null;
    _eqStoreLastAt = now;
    // [DRAG-DIAG] tick store yang langsung masuk (leading).
    noteThrottleTick("store", "fired");
    set({ bands: newBands, activePresetId: "custom" });
  } else {
    _eqStorePendingBands = newBands;
    if (!_eqStoreTimer) {
      // [DRAG-DIAG] tick store yang dijadwalkan sebagai trailing flush.
      noteThrottleTick("store", "trailing");
      _eqStoreTimer = setTimeout(() => {
        _eqStoreLastAt = Date.now();
        _eqStoreTimer = null;
        const pending = _eqStorePendingBands;
        _eqStorePendingBands = null;
        if (pending) set({ bands: pending, activePresetId: "custom" });
      }, EQ_STORE_THROTTLE_MS - (now - _eqStoreLastAt));
    } else {
      // [DRAG-DIAG] tick store yang digabung ke flush tertunda.
      noteThrottleTick("store", "dropped");
    }
  }

  // J1-2: jangan kirim tiap tick drag ke native — throttle (leading +
  // trailing) via apply penuh. Dipanggil tiap tick seperti semula; apply
  // membaca snapshot PENDING store bila ada (N24), jadi nilai akhir
  // selalu terkirim walau flush store belum jalan saat timer apply fire.
  applyEqThrottled(get);
},

      // (Item 7) Trailing flush saat drag band / kurva dilepas: tulis
      // snapshot bands pending ke store SEKARANG, lalu kirim ke native
      // SEKARANG (bukan menunggu timer trailing ≤100 ms). Urutan dijaga:
      // store dulu, apply sesudahnya — apply membaca bands store yang
      // sudah final. Tanpa pending, keduanya no-op (tidak ada kiriman
      // ganda; tick terakhir sudah terkirim leading). Idempotent: flush
      // kedua berturut-turut tidak mengirim apa-apa.
      flushBandDrag: () => {
        flushPendingBandStoreSet(set);
        flushPendingEqApply(get);
      },

      // (Item 7) Trailing flush saat slider bass dilepas: pusher bass
      // mengirim nilai pending SEKARANG + store skalar ikut di-flush
      // supaya teks nilai langsung menunjukkan nilai akhir. Tanpa
      // pending, no-op.
      flushBassBoostDrag: () => {
        pushBassBoostThrottled.flush();
        flushPendingScalarSet(set);
      },

      // (Item 7) Sama seperti flushBassBoostDrag, untuk pelebar stereo.
      flushVirtualizerDrag: () => {
        pushVirtualizerThrottled.flush();
        flushPendingScalarSet(set);
      },

      // (Item 7) Sama seperti flushBassBoostDrag, untuk master gain:
      // dorongan native pending dikirim SEKARANG (gain efektif, faktor
      // RG terbaru) + store skalar ikut di-flush.
      flushMasterGainDrag: () => {
        flushMasterGainPush();
        flushPendingScalarSet(set);
      },

      setBandsGain: async (gains: number[]) => {
        // Fix G: batalkan trailing flush setBandGain yang masih tertunda —
        // bands baru dari aksi ini yang berlaku, bukan snapshot drag basi.
        cancelPendingStoreUpdate();
        // Clamp dipakai untuk state DAN yang dikirim ke native (dulu
        // native menerima gains mentah tanpa clamp).
        const clampedGains = gains.map((g) => clampBandGain(g));
        const newBands = get().bands.map((b, i) => ({
          ...b,
          gain: clampedGains[i] ?? b.gain,
        }));
        set({ bands: newBands, activePresetId: "custom" });

        if (get().isEQEnabled && NativeDSPModule?.setFullEqualizer) {
          await NativeDSPModule.setFullEqualizer(clampedGains, get().audioSessionId);
        }
      },

      applyPreset: (presetId: string) => {
        const preset =
          ALL_PRESETS.find((p) => p.id === presetId) ||
          get().customPresets.find((p) => p.id === presetId);
        if (preset) {
          // Fix G: batalkan trailing flush setBandGain yang masih tertunda.
          cancelPendingStoreUpdate();
          // (B14-M-H2): jangan salin verbatim — preset lama (custom,
          // tersimpan sebelum ±10 dB) bisa membawa gain ±12.
          const newBands = clampPresetBands(preset.bands);
          set({ activePresetId: presetId, bands: newBands });
          // D1: preset adalah PROFIL penuh, bukan kurva saja — terapkan
          // efek bila preset mendefinisikannya. undefined = biarkan nilai
          // saat ini (preset bawaan yang EQ-only tidak me-reset efek).
          if (preset.bassBoost !== undefined)
            void get().setBassBoost(preset.bassBoost);
          if (preset.virtualizer !== undefined) {
            // DIAGNOSTIK SEMENTARA — bisa dicabut (audit setVirtualizer 2026-11-19, opsi B).
            console.log(`[EQ-DIAG] setVirtualizer via applyPreset preset=${presetId} virtualizer=${preset.virtualizer}`);
            void get().setVirtualizer(preset.virtualizer);
          }
          if (preset.reverb !== undefined)
            void get().setReverb(preset.reverb);
          // (logcat #9, bagian 3): flush skalar tertunda SEKARANG —
          // preset adalah aksi diskrit, store harus langsung menunjukkan
          // nilai preset (bukan nilai drag sebelumnya sampai trailing
          // flush jalan). Apply di bawah membaca state segar karenanya
          // (jaring pengaman N24 skalar tetap ada untuk jalur lain).
          flushPendingScalarSet(set);
          if (get().isEQEnabled) {
            applyAllEffectsToNative(get(), "applyPreset");
          }
        }
      },

      saveCustomPreset: (name: string) => {
        // N29: id dulu `custom_${Date.now()}` — dua save dalam 1 ms
        // menghasilkan ID identik; deleteCustomPreset (filter by id)
        // menghapus keduanya sekaligus dan applyPreset menemukan yang
        // pertama saja. Tambah counter proses + cek tabrakan dengan id
        // yang sudah ada (pengaman bila jam mundur / id lama tersimpan).
        let id = `custom_${Date.now()}_${++_customPresetSeq}`;
        while (get().customPresets.some((p) => p.id === id)) {
          id = `custom_${Date.now()}_${++_customPresetSeq}`;
        }
        const newPreset: Preset = {
          id,
          name,
          isCustom: true,
          bands: JSON.parse(JSON.stringify(get().bands)),
          // D1: simpan racikan lengkap, bukan kurva saja.
          bassBoost: get().bassStrength,
          virtualizer: get().virtualizerLevel,
          reverb: get().reverbPreset,
        };
        set({
          customPresets: [...get().customPresets, newPreset],
          activePresetId: newPreset.id,
        });
      },

      deleteCustomPreset: (id: string) => {
        const filtered = get().customPresets.filter((p) => p.id !== id);
        set({ customPresets: filtered });
        if (get().activePresetId === id) get().applyPreset("flat");
      },

      resetToDefault: async () => {
        // Fix G: batalkan trailing flush setBandGain yang masih tertunda.
        cancelPendingStoreUpdate();
        // (logcat #9) batalkan juga trailing fire ketiga pusher efek —
        // nilai drag basi tidak boleh menimpa reset sesudahnya.
        cancelPendingEffectPushes();
        // Reset mencakup HRTF + convolver + koreksi headphone
        // (2026-11-19, ronde clean-cozy; convolver 2026-11-20):
        // "netral" berarti semua pemrosesan DSP kembali netral, bukan
        // hanya kurva + efek. HRTF dimatikan dulu supaya
        // applyAllEffectsToNative di bawah mengirim hrtf=0; convolver
        // dimatikan dengan cara yang sama (IR yang dimuat TETAP
        // tersimpan — reset hanya mematikan toggle, file tidak dihapus);
        // koreksi dimatikan lewat deactivate() (native + state
        // headphoneStore).
        void useHrtfStore.getState().setHrtfEnabled(false);
        void useConvolverStore.getState().setConvolverEnabled(false);
        await useHeadphoneStore.getState().deactivate();
        set({
          bands: makeBands([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
          activePresetId: "flat",
          bassStrength: 0,
          virtualizerLevel: 0,
          reverbPreset: 0,
          masterGain: MASTER_GAIN_DEFAULT,
        });
        if (get().isEQEnabled) {
          await applyAllEffectsToNative(get(), "resetToDefault");
        }
      },
    }),
    {
      name: "equalizer-storage",
      storage: createJSONStorage(() => AsyncStorage),
      // (B14-M-H2): version 1 = clamp gain band ke ±10 saat rehydrate.
      // State tersimpan lama (version 0 / tanpa version) bisa membawa
      // bands + customPresets ±12; migrate jalan sekali untuk state itu.
      // Preset bawaan maks ±6 — tidak berubah.
      // version 2 = master gain jadi preamp −12..+12 dB: nilai linear
      // lama di luar [0.251, 3.98] di-clamp saat dibaca (0 lama = mute
      // -> lantai −12 dB; 1.5 lama = +3.52 dB, tetap dalam rentang).
      version: 2,
      migrate: (persistedState: any, _version: number) => {
        if (!persistedState || typeof persistedState !== "object") {
          return persistedState;
        }
        const s = { ...persistedState };
        if (Array.isArray(s.bands)) {
          s.bands = clampPresetBands(s.bands);
        }
        if (Array.isArray(s.customPresets)) {
          s.customPresets = s.customPresets.map((p: any) => ({
            ...p,
            bands: Array.isArray(p?.bands)
              ? clampPresetBands(p.bands)
              : p?.bands,
          }));
        }
        if (s.masterGain !== undefined) {
          s.masterGain = clampMasterGain(s.masterGain);
        }
        return s;
      },
      partialize: (state) => ({
        bands: state.bands,
        activePresetId: state.activePresetId,
        customPresets: state.customPresets,
        bassStrength: state.bassStrength,
        virtualizerLevel: state.virtualizerLevel,
        reverbPreset: state.reverbPreset,
        masterGain: state.masterGain,
        isEQEnabled: state.isEQEnabled,
        isBassEnabled: state.isBassEnabled,
        isVirtualizerEnabled: state.isVirtualizerEnabled,
        isReverbEnabled: state.isReverbEnabled,
        // Penanda DSP Guard ikut dipersist: preferensi "EQ menyala di
        // mode DSP" harus tahan restart — kalau tidak, guard yang
        // mematikan EQ saat masuk bit-perfect tetap menghancurkan
        // preferensi itu setiap kali app di-restart di mode bit-perfect.
        eqEnabledBeforeBitPerfect: state.eqEnabledBeforeBitPerfect,
      }),
    },
  ),
);

if (require("react-native").Platform.OS === "android") {
  setTimeout(() => {
    useEqualizerStore.getState().initialize();
  }, 1000);
}

// ReplayGain (2026-11-20): langganan perubahan state RG — SETIAP
// perubahan (toggle, ganti mode, tag lagu aktif) menghitung ulang gain
// efektif dan mendorongnya ke native bila berubah. Ini yang membuat
// toggle berlaku ke lagu yang sedang diputar tanpa restart, dan yang
// membuat playerStore/Settings tidak perlu mendorong gain sendiri
// (mereka hanya mengubah state RG / memanggil applyReplayGainForSong).
// Di-gate isEQEnabled seperti setMasterGain: di bit-perfect / EQ mati,
// GainNode memang tidak hidup, jadi tidak ada yang didorong. Nilai
// terakhir yang didorong dicatat supaya perubahan state RG yang tidak
// mengubah gain efektif tidak membanjiri bridge.
let _rgLastPushedEffective: number | null = null;
useReplayGainStore.subscribe((state, prev) => {
  // Abaikan perubahan no-op (mis. rehydrate persist yang menulis ulang
  // nilai yang sama persis): tanpanya, rehydrate saat boot ikut memanggil
  // pushMasterGainThrottled dan "memakan" jendela throttle 100 ms —
  // setMasterGain pertama sesudahnya jadi trailing, bukan leading.
  if (
    state.isReplayGainEnabled === prev.isReplayGainEnabled &&
    state.replayGainMode === prev.replayGainMode &&
    state.currentTags === prev.currentTags &&
    state.currentSongId === prev.currentSongId
  ) {
    return;
  }
  const { masterGain, isEQEnabled } = useEqualizerStore.getState();
  if (!isEQEnabled) return;
  const userGain = clampMasterGain(masterGain ?? MASTER_GAIN_DEFAULT);
  const effective = getEffectiveMasterGain(userGain);
  if (
    _rgLastPushedEffective !== null &&
    Math.abs(effective - _rgLastPushedEffective) < 1e-6
  ) {
    return;
  }
  _rgLastPushedEffective = effective;
  pushMasterGainThrottled(userGain);
});
