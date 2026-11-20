// src/features/settings/backupIO.ts
//
// Lapisan IO ekspor/impor cadangan + preset (bukan logika murni —
// modul ini mengimpor expo + store, jadi TIDAK diuji Jest node;
// yang diuji adalah backup.ts).
//
// Memakai fasilitas yang SUDAH ADA di aplikasi (jangan tambah dependensi):
// - expo-file-system/legacy: tulis/baca file JSON (pola DevDBManager).
// - expo-sharing: share sheet (pola DevDBManager).
// - expo-document-picker: pilih file cadangan (pola impor M3U di Library).
//
// ATURAN TERAPKAN (lihat backup.ts): merge, bukan wipe. Seksi yang
// tidak ada di file dibiarkan; preset/profil digabung by id; IR
// convolver hanya dipulihkan bila file-nya masih ada di perangkat ini.

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import Constants from "expo-constants";

import { useEqualizerStore } from "@/features/equalizer/store/equalizerStore";
import { ALL_PRESETS } from "@/features/equalizer/constants/presets";
import {
  VISIBLE_SECTIONS_KEY,
  parseVisibleSections,
  serializeVisibleSections,
} from "@/features/equalizer/utils/visibleSections";
import { useHeadphoneStore } from "@/features/headphone/store/headphoneStore";
import { useHrtfStore } from "@/features/hrtf/store/hrtfStore";
import { useReplayGainStore } from "@/features/replaygain/store/replayGainStore";
import { useCrossfadeStore } from "@/features/crossfade/store/crossfadeStore";
import { useConvolverStore } from "@/features/convolver/store/convolverStore";
import { useOutputProfileStore } from "@/features/outputprofile/store/outputProfileStore";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { useLibraryStore } from "@/features/library/store/libraryStore";
import { useArtworkDisplayStore } from "@/features/player/store/artworkDisplayStore";
import { BackgroundScanTask } from "@/features/library/services/BackgroundScanTask";
import type {
  EqualizerBand,
  EqualizerStore,
  Preset,
} from "@/features/equalizer/types";
import {
  BACKUP_FORMAT_VERSION,
  backupFileName,
  buildBackup,
  buildPresetFile,
  mergeHeadphoneProfiles,
  mergePresets,
  parseImportFile,
  presetFileName,
  resolveImportedPreset,
  sanitizePreset,
  type BackupSettings,
  type SettingsBackup,
} from "./backup";

// Versi dibaca dari app.json seperti Settings → Tentang.
const getAppVersion = (): string =>
  Constants.expoConfig?.version ??
  (Constants.manifest as { version?: string } | null)?.version ??
  "-";

const errorMessage = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

// ─── Kumpul snapshot ────────────────────────────────────────────────────────

/**
 * Baca SEMUA pengaturan yang bisa dicadangkan dari store yang sedang
 * berjalan. Tema dilewatkan pemanggil (Settings punya useTheme) supaya
 * modul ini tidak menduplikasi kunci storage ThemeContext.
 *
 * TIDAK ikut: isi library, sesi pemutaran (lagu/antrean/posisi terakhir),
 * antrean scan, status onboarding, file audio IR (hanya metadata-nya).
 */
export async function collectBackupSettings(
  themeId?: string,
): Promise<BackupSettings> {
  const eq = useEqualizerStore.getState();
  const hp = useHeadphoneStore.getState();
  const rg = useReplayGainStore.getState();
  const xf = useCrossfadeStore.getState();
  const conv = useConvolverStore.getState();
  const out = useOutputProfileStore.getState();
  const player = usePlayerStore.getState();
  const lib = useLibraryStore.getState();
  const artwork = useArtworkDisplayStore.getState();

  // Seksi tampil Equalizer: hanya bila user pernah menyimpannya.
  // Kunci tidak ada = belum pernah diubah = jangan tulis default ke
  // dalam file (impor file itu tidak boleh menimpa pilihan orang lain
  // dengan default kita).
  const visibleRaw = await AsyncStorage.getItem(VISIBLE_SECTIONS_KEY).catch(
    () => null,
  );

  const settings: BackupSettings = {
    equalizer: {
      bands: eq.bands,
      activePresetId: eq.activePresetId,
      customPresets: eq.customPresets,
      isEQEnabled: eq.isEQEnabled,
      isBassEnabled: eq.isBassEnabled,
      isVirtualizerEnabled: eq.isVirtualizerEnabled,
      isReverbEnabled: eq.isReverbEnabled,
      bassStrength: eq.bassStrength,
      virtualizerLevel: eq.virtualizerLevel,
      reverbPreset: eq.reverbPreset,
      masterGain: eq.masterGain,
      eqEnabledBeforeBitPerfect: eq.eqEnabledBeforeBitPerfect,
    },
    headphone: {
      profiles: hp.profiles,
      deviceProfiles: hp.deviceProfiles,
      activeProfileId: hp.activeProfileId,
      enabled: hp.enabled,
    },
    hrtf: { isHrtfEnabled: useHrtfStore.getState().isHrtfEnabled },
    replayGain: {
      isReplayGainEnabled: rg.isReplayGainEnabled,
      replayGainMode: rg.replayGainMode,
    },
    crossfade: { crossfadeSeconds: xf.crossfadeSeconds },
    convolver: {
      isConvolverEnabled: conv.isConvolverEnabled,
      ir: conv.ir,
    },
    outputProfile: { enabled: out.enabled, mapping: out.mapping },
    player: {
      playbackSpeed: player.playbackSpeed,
      tuningCents: player.tuningCents,
      resonanceIntensity: player.resonanceIntensity,
      solfeggioFreq: player.solfeggioFreq,
      solfeggioTemplateId: player.solfeggioTemplateId,
      brainwaveFreq: player.brainwaveFreq,
      audioMode: player.audioMode,
    },
    library: {
      isAutoScanEnabled: lib.isAutoScanEnabled,
      isAutoEnrichingEnabled: lib.isAutoEnrichingEnabled,
    },
    artwork: { artworkFit: artwork.artworkFit },
  };
  if (themeId) settings.theme = { themeId };
  if (visibleRaw !== null) {
    settings.equalizerSections = parseVisibleSections(visibleRaw);
  }
  return settings;
}

// ─── Ekspor ───────────────────────────────────────────────────────────────

export type ExportResult =
  | { ok: true; kind: "exported"; fileName: string }
  | { ok: false; kind: "error"; error: string };

async function writeAndShare(
  json: string,
  fileName: string,
  dialogTitle: string,
): Promise<ExportResult> {
  try {
    const uri = `${FileSystem.cacheDirectory}${fileName}`;
    await FileSystem.writeAsStringAsync(uri, json, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    if (!(await Sharing.isAvailableAsync())) {
      return {
        ok: false,
        kind: "error",
        error: "Berbagi file tidak tersedia di perangkat ini.",
      };
    }
    await Sharing.shareAsync(uri, {
      mimeType: "application/json",
      dialogTitle,
      UTI: "public.json",
    });
    return { ok: true, kind: "exported", fileName };
  } catch (e) {
    console.warn("[Backup] tulis/bagi file gagal:", e);
    return {
      ok: false,
      kind: "error",
      error: `Gagal menulis file cadangan: ${errorMessage(e)}`,
    };
  }
}

/** Ekspor semua pengaturan + preset ke satu file JSON, lalu buka share sheet. */
export async function exportSettingsBackup(
  themeId?: string,
): Promise<ExportResult> {
  try {
    const settings = await collectBackupSettings(themeId);
    const backup = buildBackup(settings, getAppVersion());
    return writeAndShare(
      JSON.stringify(backup, null, 2),
      backupFileName(),
      "Bagikan cadangan PristineAudio",
    );
  } catch (e) {
    console.warn("[Backup] ekspor gagal:", e);
    return {
      ok: false,
      kind: "error",
      error: `Gagal membuat cadangan: ${errorMessage(e)}`,
    };
  }
}

/**
 * Bagikan SATU preset EQ sebagai file. Yang dibagikan adalah preset yang
 * sedang AKTIF sesuai bunyinya saat ini (kurva + bass/widener/reverb
 * yang sedang berlaku) — bukan salinan preset tersimpan yang mungkin
 * sudah diedit sesudahnya.
 */
export async function sharePresetFile(input: {
  name: string;
  bands: EqualizerBand[];
  bassBoost?: number;
  virtualizer?: number;
  reverb?: number;
}): Promise<ExportResult> {
  const warnings: string[] = [];
  const preset = sanitizePreset(
    {
      id: `shared-${Date.now().toString(36)}`,
      name: input.name,
      isCustom: true,
      bands: input.bands,
      bassBoost: input.bassBoost,
      virtualizer: input.virtualizer,
      reverb: input.reverb,
    },
    warnings,
    "preset",
  );
  if (!preset) {
    return {
      ok: false,
      kind: "error",
      error: "Preset saat ini tidak valid, tidak bisa dibagikan.",
    };
  }
  const file = buildPresetFile(preset, getAppVersion());
  return writeAndShare(
    JSON.stringify(file, null, 2),
    presetFileName(preset.name),
    `Bagikan preset "${preset.name}"`,
  );
}

// ─── Terapkan cadangan ─────────────────────────────────────────────────────

export interface ApplyReport {
  applied: string[];
  warnings: string[];
}

export interface BackupIOHooks {
  /** Dipanggil bila cadangan membawa themeId (Settings meneruskan setTheme). */
  applyThemeId?: (themeId: string) => Promise<void>;
}

type EqPatch = Partial<
  Pick<
    EqualizerStore,
    | "bands"
    | "activePresetId"
    | "customPresets"
    | "isEQEnabled"
    | "isBassEnabled"
    | "isVirtualizerEnabled"
    | "isReverbEnabled"
    | "bassStrength"
    | "virtualizerLevel"
    | "reverbPreset"
    | "masterGain"
    | "eqEnabledBeforeBitPerfect"
  >
>;

async function applyEqualizer(
  section: NonNullable<BackupSettings["equalizer"]>,
  report: ApplyReport,
): Promise<void> {
  const eq = useEqualizerStore.getState();
  const mergedCustom = mergePresets(
    eq.customPresets,
    section.customPresets ?? [],
  );
  const patch: EqPatch = { customPresets: mergedCustom };
  if (section.bands !== undefined) patch.bands = section.bands;
  if (section.activePresetId !== undefined) {
    const known = new Set([
      ...ALL_PRESETS.map((p) => p.id),
      ...mergedCustom.map((p) => p.id),
    ]);
    // activePresetId yang tidak dikenal (presetnya tidak ada di file)
    // jatuh ke "custom": kurva tetap diterapkan, label tidak berbohong.
    patch.activePresetId = known.has(section.activePresetId)
      ? section.activePresetId
      : "custom";
  }
  if (section.isEQEnabled !== undefined)
    patch.isEQEnabled = section.isEQEnabled;
  if (section.isBassEnabled !== undefined)
    patch.isBassEnabled = section.isBassEnabled;
  if (section.isVirtualizerEnabled !== undefined)
    patch.isVirtualizerEnabled = section.isVirtualizerEnabled;
  if (section.isReverbEnabled !== undefined)
    patch.isReverbEnabled = section.isReverbEnabled;
  if (section.bassStrength !== undefined)
    patch.bassStrength = section.bassStrength;
  if (section.virtualizerLevel !== undefined)
    patch.virtualizerLevel = section.virtualizerLevel;
  if (section.reverbPreset !== undefined)
    patch.reverbPreset = section.reverbPreset;
  if (section.masterGain !== undefined) patch.masterGain = section.masterGain;
  if (section.eqEnabledBeforeBitPerfect !== undefined)
    patch.eqEnabledBeforeBitPerfect = section.eqEnabledBeforeBitPerfect;
  useEqualizerStore.setState(patch);
  // EQ menyala = dorong ke native (setEQEnabled(true) yang sudah
  // idempotent: flag + applyAllEffects). EQ mati = state cukup;
  // dorongan terjadi saat user menyalakannya nanti.
  if (useEqualizerStore.getState().isEQEnabled) {
    try {
      await useEqualizerStore.getState().setEQEnabled(true);
    } catch (e) {
      report.warnings.push(
        `Equalizer dipulihkan tapi gagal didorong ke native: ${errorMessage(e)}`,
      );
    }
  }
  report.applied.push("Equalizer + preset");
}

async function applyHeadphone(
  section: NonNullable<BackupSettings["headphone"]>,
  report: ApplyReport,
): Promise<void> {
  const hp = useHeadphoneStore.getState();
  const mergedProfiles = mergeHeadphoneProfiles(
    hp.profiles,
    section.profiles ?? [],
  );
  useHeadphoneStore.setState({
    profiles: mergedProfiles,
    deviceProfiles: {
      ...hp.deviceProfiles,
      ...section.deviceProfiles,
    },
  });
  if (section.enabled && section.activeProfileId) {
    // activateProfile mem-parse presetText di native dan hanya
    // menandai aktif bila native menerimanya — penolakan tidak
    // boleh mengklaim koreksi menyala.
    const ok = await hp.activateProfile(section.activeProfileId);
    if (!ok) {
      useHeadphoneStore.setState({
        activeProfileId: section.activeProfileId,
        enabled: false,
      });
      report.warnings.push(
        "Profil headphone tersimpan, tapi native menolak presetnya — koreksi dimatikan.",
      );
    }
  } else {
    useHeadphoneStore.setState({
      activeProfileId: section.activeProfileId ?? hp.activeProfileId,
    });
    if (section.enabled === false && hp.enabled) {
      await hp.deactivate();
    } else if (section.enabled && !section.activeProfileId) {
      report.warnings.push(
        "Cadangan menyalakan koreksi headphone tanpa profil aktif — koreksi dimatikan.",
      );
    }
  }
  report.applied.push("Koreksi headphone");
}

async function applyConvolver(
  section: NonNullable<BackupSettings["convolver"]>,
  report: ApplyReport,
): Promise<void> {
  const conv = useConvolverStore.getState();
  if (section.ir) {
    // File IR tidak ikut di dalam JSON — pulihkan hanya bila file-nya
    // masih ada di perangkat ini (impor ulang di perangkat yang sama).
    // Di perangkat lain: IR lokal dipertahankan, convolver dimatikan.
    const info = await FileSystem.getInfoAsync(section.ir.path).catch(
      () => null,
    );
    if (info?.exists) {
      useConvolverStore.setState({
        ir: section.ir,
        isConvolverEnabled: section.isConvolverEnabled ?? false,
      });
      await conv.restoreToNative();
    } else {
      useConvolverStore.setState({ isConvolverEnabled: false });
      report.warnings.push(
        `File IR "${section.ir.name}" tidak ditemukan di perangkat ini — convolver dimatikan, IR lokal dipertahankan.`,
      );
    }
  } else {
    if (section.isConvolverEnabled) {
      report.warnings.push(
        "Cadangan menyalakan convolver tanpa file IR — convolver dimatikan.",
      );
    }
    useConvolverStore.setState({ isConvolverEnabled: false });
  }
  report.applied.push("Convolver");
}

async function applyPlayer(
  section: NonNullable<BackupSettings["player"]>,
  report: ApplyReport,
): Promise<void> {
  const player = usePlayerStore.getState();
  // Template dulu (ia ikut mengatur freq + intensitas), lalu nilai
  // eksplisit bila ada — nilai eksplisit menang atas template.
  const steps: Array<[string, () => Promise<void>]> = [];
  if (section.solfeggioTemplateId !== undefined) {
    steps.push([
      "template Solfeggio",
      () => player.setSolfeggioTemplate(section.solfeggioTemplateId!),
    ]);
  }
  if (section.solfeggioFreq !== undefined) {
    steps.push([
      "frekuensi Solfeggio",
      () => player.setSolfeggioFreq(section.solfeggioFreq!),
    ]);
  }
  if (section.resonanceIntensity !== undefined) {
    steps.push([
      "intensitas resonansi",
      () => player.setResonanceIntensity(section.resonanceIntensity!),
    ]);
  }
  if (section.playbackSpeed !== undefined) {
    steps.push([
      "kecepatan putar",
      () => player.setPlaybackSpeed(section.playbackSpeed!),
    ]);
  }
  if (section.tuningCents !== undefined) {
    steps.push(["tuning", () => player.setTuningCents(section.tuningCents!)]);
  }
  if (section.brainwaveFreq !== undefined) {
    steps.push([
      "frekuensi brainwave",
      () => player.setBrainwaveFreq(section.brainwaveFreq!),
    ]);
  }
  // Mode PALING AKHIR: ganti mode memicu DSP Guard / reset rantai.
  if (section.audioMode !== undefined) {
    steps.push(["mode audio", () => player.setAudioMode(section.audioMode!)]);
  }
  for (const [label, run] of steps) {
    try {
      await run();
    } catch (e) {
      report.warnings.push(
        `Pemutar: ${label} gagal dipulihkan: ${errorMessage(e)}`,
      );
    }
  }
  report.applied.push("Pemutar");
}

/** Terapkan cadangan yang sudah tervalidasi. Seksi yang tidak ada = dibiarkan. */
export async function applyBackup(
  backup: SettingsBackup,
  hooks: BackupIOHooks = {},
): Promise<ApplyReport> {
  const report: ApplyReport = { applied: [], warnings: [] };
  const s = backup.settings;

  if (s.equalizer) await applyEqualizer(s.equalizer, report);
  if (s.headphone) await applyHeadphone(s.headphone, report);
  if (s.hrtf) {
    try {
      await useHrtfStore.getState().setHrtfEnabled(s.hrtf.isHrtfEnabled);
      report.applied.push("HRTF");
    } catch (e) {
      report.warnings.push(`HRTF gagal dipulihkan: ${errorMessage(e)}`);
    }
  }
  if (s.replayGain) {
    const rg = useReplayGainStore.getState();
    rg.setReplayGainEnabled(s.replayGain.isReplayGainEnabled);
    rg.setReplayGainMode(s.replayGain.replayGainMode);
    report.applied.push("ReplayGain");
  }
  if (s.crossfade) {
    try {
      await useCrossfadeStore
        .getState()
        .setCrossfadeSeconds(s.crossfade.crossfadeSeconds);
      report.applied.push("Crossfade");
    } catch (e) {
      report.warnings.push(`Crossfade gagal dipulihkan: ${errorMessage(e)}`);
    }
  }
  if (s.convolver) await applyConvolver(s.convolver, report);
  if (s.outputProfile) {
    const out = useOutputProfileStore.getState();
    if (s.outputProfile.enabled !== undefined) {
      out.setEnabled(s.outputProfile.enabled);
    }
    if (s.outputProfile.mapping) {
      // Gabung per kategori (bukan timpa buta): kategori yang tidak
      // disebut di file mempertahankan pemetaan lokal.
      const next = { ...out.mapping, ...s.outputProfile.mapping };
      useOutputProfileStore.setState({ mapping: next });
    }
    report.applied.push("Profil per output");
  }
  if (s.player) await applyPlayer(s.player, report);
  if (s.library) {
    // Toggle store adalah flip polos (tanpa efek samping — registrasi
    // tugas background diurus Settings, di bawah ini): bandingkan dulu
    // supaya impor menjadi SET, bukan toggle buta.
    const lib = useLibraryStore.getState();
    if (
      s.library.isAutoScanEnabled !== undefined &&
      s.library.isAutoScanEnabled !== lib.isAutoScanEnabled
    ) {
      lib.toggleAutoScanEnabled();
    }
    if (
      s.library.isAutoEnrichingEnabled !== undefined &&
      s.library.isAutoEnrichingEnabled !== lib.isAutoEnrichingEnabled
    ) {
      lib.toggleAutoEnrichingEnabled();
    }
    // Auto Discovery: tugas background mengikuti flag — sama seperti
    // handler toggle di Settings (register 240 menit / unregister).
    // Auto Enriching: worker mengikuti flag saat resume (lihat
    // resumeEnrichment), jadi tidak perlu di-start di sini.
    if (s.library.isAutoScanEnabled === true) {
      await BackgroundScanTask.register(240).catch((e) =>
        report.warnings.push(
          `Auto Discovery diaktifkan, tapi tugas background gagal didaftarkan: ${errorMessage(e)}`,
        ),
      );
    } else if (s.library.isAutoScanEnabled === false) {
      await BackgroundScanTask.unregister().catch((e) =>
        report.warnings.push(
          `Auto Discovery dimatikan, tapi tugas background gagal dibatalkan: ${errorMessage(e)}`,
        ),
      );
    }
    report.applied.push("Library");
  }
  if (s.artwork) {
    useArtworkDisplayStore.getState().setArtworkFit(s.artwork.artworkFit);
    report.applied.push("Tampilan sampul");
  }
  if (s.theme && hooks.applyThemeId) {
    try {
      await hooks.applyThemeId(s.theme.themeId);
      report.applied.push("Tema");
    } catch (e) {
      report.warnings.push(`Tema gagal dipulihkan: ${errorMessage(e)}`);
    }
  }
  if (s.equalizerSections) {
    await AsyncStorage.setItem(
      VISIBLE_SECTIONS_KEY,
      serializeVisibleSections(s.equalizerSections),
    ).catch((e) =>
      report.warnings.push(
        `Tampilan seksi Equalizer gagal dipulihkan: ${errorMessage(e)}`,
      ),
    );
    report.applied.push("Tampilan seksi Equalizer");
  }
  return report;
}

// ─── Impor ────────────────────────────────────────────────────────────────

export type ImportResult =
  | {
      ok: true;
      kind: "backup";
      applied: string[];
      warnings: string[];
    }
  | { ok: true; kind: "preset"; presetName: string; warnings: string[] }
  // Sama seperti ParseImportResult: diskriminan `kind` (string), bukan
  // `ok` (boolean) — lihat komentar di backup.ts.
  | { ok: false; kind: "canceled" }
  | { ok: false; kind: "error"; error: string };

/**
 * Pilih file (.json) → validasi → terapkan. Menerima cadangan lengkap
 * MAUPUN file preset EQ tunggal: file preset menambahkan preset itu ke
 * daftar profil (id bentrok → id baru, nama dipertahankan).
 */
export async function importSettingsFile(
  hooks: BackupIOHooks = {},
): Promise<ImportResult> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      // "*/*": sebagian file manager melaporkan .json sebagai
      // application/octet-stream — filter mime yang ketat akan
      // menyembunyikan file cadangan yang sah. Gerbangnya adalah
      // validasi isi (parseImportFile), bukan filter picker.
      type: "*/*",
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets || result.assets.length === 0) {
      return { ok: false, kind: "canceled" };
    }
    const text = await FileSystem.readAsStringAsync(result.assets[0].uri, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    const parsed = parseImportFile(text);
    if (parsed.kind === "error") {
      return { ok: false, kind: "error", error: parsed.error };
    }
    if (parsed.kind === "preset") {
      const existingIds = new Set([
        ...ALL_PRESETS.map((p) => p.id),
        ...useEqualizerStore.getState().customPresets.map((p) => p.id),
      ]);
      const { preset, renamed } = resolveImportedPreset(
        existingIds,
        parsed.preset,
      );
      useEqualizerStore.setState({
        customPresets: [...useEqualizerStore.getState().customPresets, preset],
      });
      const warnings = [...parsed.warnings];
      if (renamed) {
        warnings.push(
          "ID preset bentrok dengan preset yang sudah ada — disimpan dengan ID baru.",
        );
      }
      return { ok: true, kind: "preset", presetName: preset.name, warnings };
    }
    const report = await applyBackup(parsed.backup, hooks);
    return {
      ok: true,
      kind: "backup",
      applied: report.applied,
      warnings: [...parsed.warnings, ...report.warnings],
    };
  } catch (e) {
    console.warn("[Backup] impor gagal:", e);
    return {
      ok: false,
      kind: "error",
      error: `Gagal membaca file: ${errorMessage(e)}`,
    };
  }
}

// Re-export supaya pemanggil UI tidak perlu mengimpor dua modul.
export { BACKUP_FORMAT_VERSION };
export type { Preset };
