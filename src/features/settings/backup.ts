// src/features/settings/backup.ts
//
// Format file cadangan pengaturan + file preset EQ PristineAudio.
//
// Logika MURNI (tanpa React Native / expo / AsyncStorage / zustand) —
// mengikuti pola crossfade.ts / outputProfile.ts supaya bisa diuji Jest
// node tanpa mock modul native. Lapisan IO (baca store, tulis file,
// share sheet, picker, terapkan ke store) tinggal di backupIO.ts.
//
// DUA JENIS FILE (dibedakan `kind`):
// - "pristine-audio-backup": SEMUA pengaturan + preset EQ + profil
//   headphone dalam satu file JSON. Dibuat dari Settings → Ekspor.
// - "pristine-audio-preset": SATU preset EQ. Dibuat dari layar EQ →
//   Bagikan (preset yang sedang aktif, sesuai bunyinya saat itu —
//   kurva + bass/widener/reverb yang sedang berlaku, bukan salinan
//   preset tersimpan yang mungkin sudah diedit).
//
// ATURAN IMPOR (merge, bukan wipe — diputuskan 2026-11-20):
// - Seksi yang TIDAK ADA di file dibiarkan apa adanya (tidak di-reset).
// - Seksi / field yang TIDAK DIKENAL diabaikan (file dari versi aplikasi
//   lebih baru tidak menghapus data lokal yang tidak dipahaminya).
// - File yang strukturnya rusak di level atas (bukan JSON, kind salah,
//   formatVersion tidak didukung, `settings` hilang) DITOLAK utuh dengan
//   pesan yang jelas — tidak ada yang diterapkan.
// - Seksi yang isinya rusak DIBUANG sendiri-sendiri (dengan peringatan),
//   seksi lain yang sah tetap diterapkan.
// - Preset EQ custom + profil headphone digabung BERDASARKAN ID: id yang
//   sama ditimpa, id baru ditambahkan, yang tidak disebut di file
//   dipertahankan. Impor tidak pernah menghapus preset/profil lokal.
// - Versi format yang LEBIH BARU dari yang dikenal ditolak (bukan
//   ditebak-tebak): user diminta memperbarui aplikasi dulu.
//
// YANG TIDAK MASUK CADANGAN (bukan pengaturan):
// - Isi library (lagu, playlist, favorit) — itu DATA, bukan setelan;
//   backup DB sudah ada terpisah (DevDBManager).
// - Sesi pemutaran (lagu terakhir, antrean, posisi) — state sesi.
// - Antrean scan internal, status onboarding.
// - File audio IR convolver (.wav) — hanya METADATA-nya (nama/path)
//   yang ikut; file-nya tidak disalin ke dalam JSON. Saat impor, IR
//   hanya dipulihkan bila file-nya masih ada di perangkat ini (impor
//   ulang di perangkat yang sama); di perangkat lain convolver
//   dimatikan dengan peringatan dan IR lokal dipertahankan.
//
// QR TIDAK ADA di ronde ini: tidak ada pustaka QR di dependensi
// (package.json), dan menambah dependensi berat hanya untuk QR
// ditunda — file JSON dulu; QR bisa mengikuti bila sudah ada
// pustaka QR di proyek.

import type { EqualizerBand, Preset } from "@/features/equalizer/types";
import {
  DEFAULT_Q,
  EQ_BAND_TYPES,
  EQ_FREQUENCIES,
} from "@/features/equalizer/constants/presets";
import { clampSolfeggioFreq } from "@/features/equalizer/api/solfeggioTemplates";
import { clampBrainwaveFreq } from "@/features/equalizer/api/brainwaveBands";
import {
  DEFAULT_VISIBLE_SECTIONS,
  type VisibleSections,
} from "@/features/equalizer/utils/visibleSections";
import type { HeadphoneProfile } from "@/features/headphone/types";
import type { ConvolverIrMeta } from "@/features/convolver/api/irFile";
import type { ReplayGainMode } from "@/features/replaygain/replaygain";
import type { AudioMode } from "@/features/player/store/playerStore";
import {
  TUNING_MAX_CENTS,
  TUNING_MIN_CENTS,
  clampTuningCents,
} from "@/features/player/utils/tuning";
import {
  CONFIGURABLE_OUTPUT_CATEGORIES,
  type OutputProfileMap,
} from "@/features/outputprofile/outputProfile";
import {
  CROSSFADE_MAX_SECONDS,
  CROSSFADE_MIN_SECONDS,
} from "@/features/crossfade/crossfade";

// ─── Format ───────────────────────────────────────────────────────────────

export const BACKUP_FORMAT_VERSION = 1;
export const BACKUP_KIND = "pristine-audio-backup";
export const PRESET_FILE_KIND = "pristine-audio-preset";

// ─── Batas clamp (satu sumber dengan setter store — lihat komentar) ───────

// Gain band ±10 dB (B14-M-H2, equalizerStore).
export const BAND_GAIN_MIN = -10;
export const BAND_GAIN_MAX = 10;
// Bass/widener 0..1000, reverb 0..6 (clamp di setter equalizerStore).
const EFFECT_MIN = 0;
const EFFECT_MAX = 1000;
const REVERB_MIN = 0;
const REVERB_MAX = 6;
// Master gain linear = preamp −12..+12 dB (equalizerStore: 10^(dB/20)).
const MASTER_GAIN_MIN = Math.pow(10, -12 / 20);
const MASTER_GAIN_MAX = Math.pow(10, 12 / 20);
// Kecepatan putar 0,5..2,0 (clamp di Settings handleSpeedChange).
const PLAYBACK_SPEED_MIN = 0.5;
const PLAYBACK_SPEED_MAX = 2.0;
// Intensitas resonansi 0..1 (clamp di playerStore setResonanceIntensity).
const RESONANCE_MIN = 0;
const RESONANCE_MAX = 1;
const AUDIO_MODES: readonly string[] = ["bit-perfect", "dsp", "immersive"];
const REPLAYGAIN_MODES: readonly string[] = ["track", "album"];
const BAND_TYPES: readonly string[] = ["peaking", "lowshelf", "highshelf"];

// ─── Bentuk payload ───────────────────────────────────────────────────────

export interface EqualizerBackupSection {
  bands?: EqualizerBand[];
  activePresetId?: string;
  customPresets?: Preset[];
  isEQEnabled?: boolean;
  isBassEnabled?: boolean;
  isVirtualizerEnabled?: boolean;
  isReverbEnabled?: boolean;
  bassStrength?: number;
  virtualizerLevel?: number;
  reverbPreset?: number;
  masterGain?: number;
  eqEnabledBeforeBitPerfect?: boolean | null;
}

export interface HeadphoneBackupSection {
  profiles?: HeadphoneProfile[];
  deviceProfiles?: Record<string, string | null>;
  activeProfileId?: string | null;
  enabled?: boolean;
}

export interface PlayerBackupSection {
  playbackSpeed?: number;
  tuningCents?: number;
  resonanceIntensity?: number;
  solfeggioFreq?: number;
  solfeggioTemplateId?: string;
  brainwaveFreq?: number;
  audioMode?: AudioMode;
}

export interface BackupSettings {
  equalizer?: EqualizerBackupSection;
  headphone?: HeadphoneBackupSection;
  hrtf?: { isHrtfEnabled: boolean };
  replayGain?: { isReplayGainEnabled: boolean; replayGainMode: ReplayGainMode };
  crossfade?: { crossfadeSeconds: number };
  convolver?: { isConvolverEnabled?: boolean; ir?: ConvolverIrMeta | null };
  outputProfile?: { enabled?: boolean; mapping?: OutputProfileMap };
  player?: PlayerBackupSection;
  library?: {
    isAutoScanEnabled?: boolean;
    isAutoEnrichingEnabled?: boolean;
  };
  artwork?: { artworkFit: "contain" | "cover" };
  theme?: { themeId: string };
  equalizerSections?: VisibleSections;
}

export interface SettingsBackup {
  kind: typeof BACKUP_KIND;
  formatVersion: 1;
  appVersion: string;
  exportedAt: string;
  settings: BackupSettings;
}

export interface PresetShareFile {
  kind: typeof PRESET_FILE_KIND;
  formatVersion: 1;
  appVersion: string;
  exportedAt: string;
  preset: Preset;
}

export type ParseImportResult =
  | {
      ok: true;
      kind: "backup";
      backup: SettingsBackup;
      warnings: string[];
    }
  | { ok: true; kind: "preset"; preset: Preset; warnings: string[] }
  // Error membawa `kind: "error"` (bukan hanya `ok: false`): tsconfig
  // repo menonaktifkan strictNullChecks, dan di bawah setting itu
  // diskriminan boolean TIDAK me-narrow — diskriminan string-literal
  // (`kind`) yang dipakai di mana-mana untuk hasil parse/impor.
  | { ok: false; kind: "error"; error: string };

// ─── Builder ──────────────────────────────────────────────────────────────

export function buildBackup(
  settings: BackupSettings,
  appVersion: string,
  exportedAt = new Date(),
): SettingsBackup {
  return {
    kind: BACKUP_KIND,
    formatVersion: BACKUP_FORMAT_VERSION,
    appVersion,
    exportedAt: exportedAt.toISOString(),
    settings,
  };
}

export function buildPresetFile(
  preset: Preset,
  appVersion: string,
  exportedAt = new Date(),
): PresetShareFile {
  return {
    kind: PRESET_FILE_KIND,
    formatVersion: BACKUP_FORMAT_VERSION,
    appVersion,
    exportedAt: exportedAt.toISOString(),
    preset,
  };
}

const pad2 = (n: number): string => String(n).padStart(2, "0");

export function backupFileName(now = new Date()): string {
  return `PristineAudio-Backup-${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}-${pad2(now.getHours())}${pad2(now.getMinutes())}.json`;
}

export function presetFileName(name: string, now = new Date()): string {
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "preset";
  return `PristineAudio-Preset-${slug}-${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}.json`;
}

// ─── Gabung (merge by id — impor tidak pernah menghapus data lokal) ───────

/** Preset custom: id yang sama ditimpa, id baru ditambahkan. */
export function mergePresets(existing: Preset[], incoming: Preset[]): Preset[] {
  const byId = new Map(existing.map((p) => [p.id, p]));
  for (const p of incoming) byId.set(p.id, p);
  return [...byId.values()];
}

/** Profil headphone: id yang sama ditimpa, id baru ditambahkan. */
export function mergeHeadphoneProfiles(
  existing: HeadphoneProfile[],
  incoming: HeadphoneProfile[],
): HeadphoneProfile[] {
  const byId = new Map(existing.map((p) => [p.id, p]));
  for (const p of incoming) byId.set(p.id, p);
  return [...byId.values()];
}

let _importedPresetSeq = 0;

/**
 * Preset dari file yang id-nya bentrok dengan preset yang sudah ada
 * (bawaan atau custom) mendapat id baru — nama dipertahankan. Tanpa ini,
 * impor preset orang lain bisa menimpa preset bawaan "flat" / custom
 * lokal secara diam-diam.
 */
export function resolveImportedPreset(
  existingIds: ReadonlySet<string>,
  preset: Preset,
): { preset: Preset; renamed: boolean } {
  if (!existingIds.has(preset.id)) {
    return { preset: { ...preset, isCustom: true }, renamed: false };
  }
  const id = `imported_${Date.now().toString(36)}_${++_importedPresetSeq}`;
  return { preset: { ...preset, id, isCustom: true }, renamed: true };
}

// ─── Validasi (sanitize) ──────────────────────────────────────────────────

type Warnings = string[];

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const asBool = (v: unknown): boolean | undefined =>
  typeof v === "boolean" ? v : undefined;

const asFinite = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

const asClamped = (
  v: unknown,
  min: number,
  max: number,
): number | undefined => {
  const n = asFinite(v);
  return n === undefined ? undefined : Math.min(max, Math.max(min, n));
};

const asNonEmptyString = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;

/**
 * 10 band, diindeks 0..9. Gain WAJIB angka (bukan angka = preset rusak,
 * ditolak utuh). Frekuensi/Q/tipe yang hilang atau tidak valid jatuh ke
 * default band itu — frekuensi di sini hanya label (native hanya memakai
 * gain per indeks), jadi default aman dan tidak mengubah suara.
 */
function sanitizeBands(
  raw: unknown,
  warnings: Warnings,
  where: string,
): EqualizerBand[] | null {
  if (!Array.isArray(raw) || raw.length !== 10) {
    warnings.push(`${where}: harus punya tepat 10 band — dilewati.`);
    return null;
  }
  const bands: EqualizerBand[] = [];
  for (let i = 0; i < 10; i++) {
    const b = raw[i];
    if (!isRecord(b)) {
      warnings.push(`${where}: band ${i + 1} bukan objek — dilewati.`);
      return null;
    }
    const gain = asFinite(b.gain);
    if (gain === undefined) {
      warnings.push(`${where}: gain band ${i + 1} bukan angka — dilewati.`);
      return null;
    }
    const frequency = asFinite(b.frequency) ?? EQ_FREQUENCIES[i];
    const q = asFinite(b.q);
    // Tangkap ke lokal dulu: typeof di properti Record<string, unknown>
    // tidak me-narrow di tsconfig repo (strictNullChecks mati).
    const bandType: unknown = b.type;
    const type =
      typeof bandType === "string" && BAND_TYPES.includes(bandType)
        ? (bandType as EqualizerBand["type"])
        : EQ_BAND_TYPES[i];
    bands.push({
      id: i,
      frequency,
      gain: Math.min(BAND_GAIN_MAX, Math.max(BAND_GAIN_MIN, gain)),
      q: q !== undefined && q > 0 ? q : DEFAULT_Q,
      type,
    });
  }
  return bands;
}

/** Satu preset EQ (dipakai file preset maupun customPresets di backup). */
export function sanitizePreset(
  raw: unknown,
  warnings: Warnings,
  where = "preset",
): Preset | null {
  if (!isRecord(raw)) {
    warnings.push(`${where}: bukan objek — dilewati.`);
    return null;
  }
  const id = asNonEmptyString(raw.id);
  const name = asNonEmptyString(raw.name);
  if (!id || !name) {
    warnings.push(`${where}: id/nama hilang — dilewati.`);
    return null;
  }
  const bands = sanitizeBands(raw.bands, warnings, `Preset "${name}"`);
  if (!bands) return null;
  const preset: Preset = {
    id,
    name,
    isCustom: typeof raw.isCustom === "boolean" ? raw.isCustom : true,
    bands,
  };
  const description: unknown = raw.description;
  if (typeof description === "string") preset.description = description;
  const isPremium: unknown = raw.isPremium;
  if (typeof isPremium === "boolean") preset.isPremium = isPremium;
  const bass = asClamped(raw.bassBoost, EFFECT_MIN, EFFECT_MAX);
  if (bass !== undefined) preset.bassBoost = bass;
  const virt = asClamped(raw.virtualizer, EFFECT_MIN, EFFECT_MAX);
  if (virt !== undefined) preset.virtualizer = virt;
  const rev = asClamped(raw.reverb, REVERB_MIN, REVERB_MAX);
  if (rev !== undefined) preset.reverb = Math.round(rev);
  return preset;
}

function sanitizeEqualizerSection(
  raw: unknown,
  warnings: Warnings,
): EqualizerBackupSection | undefined {
  if (!isRecord(raw)) {
    warnings.push("Seksi equalizer bukan objek — dilewati.");
    return undefined;
  }
  const s: EqualizerBackupSection = {};
  if (raw.bands !== undefined) {
    const bands = sanitizeBands(raw.bands, warnings, "Equalizer");
    if (bands) s.bands = bands;
  }
  const activePresetId = asNonEmptyString(raw.activePresetId);
  if (activePresetId !== undefined) s.activePresetId = activePresetId;
  if (Array.isArray(raw.customPresets)) {
    const presets: Preset[] = [];
    raw.customPresets.forEach((p, i) => {
      const clean = sanitizePreset(p, warnings, `Preset custom #${i + 1}`);
      if (clean) presets.push(clean);
    });
    s.customPresets = presets;
  } else if (raw.customPresets !== undefined) {
    warnings.push("Seksi equalizer: customPresets bukan array — dilewati.");
  }
  const isEQEnabled = asBool(raw.isEQEnabled);
  if (isEQEnabled !== undefined) s.isEQEnabled = isEQEnabled;
  const isBassEnabled = asBool(raw.isBassEnabled);
  if (isBassEnabled !== undefined) s.isBassEnabled = isBassEnabled;
  const isVirtualizerEnabled = asBool(raw.isVirtualizerEnabled);
  if (isVirtualizerEnabled !== undefined)
    s.isVirtualizerEnabled = isVirtualizerEnabled;
  const isReverbEnabled = asBool(raw.isReverbEnabled);
  if (isReverbEnabled !== undefined) s.isReverbEnabled = isReverbEnabled;
  const bassStrength = asClamped(raw.bassStrength, EFFECT_MIN, EFFECT_MAX);
  if (bassStrength !== undefined) s.bassStrength = bassStrength;
  const virtualizerLevel = asClamped(
    raw.virtualizerLevel,
    EFFECT_MIN,
    EFFECT_MAX,
  );
  if (virtualizerLevel !== undefined) s.virtualizerLevel = virtualizerLevel;
  const reverbPreset = asClamped(raw.reverbPreset, REVERB_MIN, REVERB_MAX);
  if (reverbPreset !== undefined) s.reverbPreset = Math.round(reverbPreset);
  const masterGain = asClamped(
    raw.masterGain,
    MASTER_GAIN_MIN,
    MASTER_GAIN_MAX,
  );
  if (masterGain !== undefined) s.masterGain = masterGain;
  if (raw.eqEnabledBeforeBitPerfect === null) {
    s.eqEnabledBeforeBitPerfect = null;
  } else {
    const v = asBool(raw.eqEnabledBeforeBitPerfect);
    if (v !== undefined) s.eqEnabledBeforeBitPerfect = v;
  }
  return s;
}

function sanitizeHeadphoneProfile(
  raw: unknown,
  warnings: Warnings,
  where: string,
): HeadphoneProfile | null {
  if (!isRecord(raw)) {
    warnings.push(`${where}: bukan objek — dilewati.`);
    return null;
  }
  const id = asNonEmptyString(raw.id);
  const name = asNonEmptyString(raw.name);
  if (!id || !name) {
    warnings.push(`${where}: id/nama hilang — dilewati.`);
    return null;
  }
  const filters = Array.isArray(raw.filters) ? raw.filters : [];
  const filterCount = asFinite(raw.filterCount);
  const source: unknown = raw.source;
  const presetText: unknown = raw.presetText;
  return {
    id,
    name,
    source:
      typeof source === "string" && source.length > 0
        ? (source as HeadphoneProfile["source"])
        : "parametric",
    preampDb: asFinite(raw.preampDb) ?? 0,
    filterCount:
      filterCount !== undefined && filterCount >= 0
        ? Math.floor(filterCount)
        : filters.length,
    filters: filters as HeadphoneProfile["filters"],
    presetText: typeof presetText === "string" ? presetText : "",
  };
}

function sanitizeHeadphoneSection(
  raw: unknown,
  warnings: Warnings,
): HeadphoneBackupSection | undefined {
  if (!isRecord(raw)) {
    warnings.push("Seksi headphone bukan objek — dilewati.");
    return undefined;
  }
  const s: HeadphoneBackupSection = {};
  if (Array.isArray(raw.profiles)) {
    const profiles: HeadphoneProfile[] = [];
    raw.profiles.forEach((p, i) => {
      const clean = sanitizeHeadphoneProfile(
        p,
        warnings,
        `Profil headphone #${i + 1}`,
      );
      if (clean) profiles.push(clean);
    });
    s.profiles = profiles;
  } else if (raw.profiles !== undefined) {
    warnings.push("Seksi headphone: profiles bukan array — dilewati.");
  }
  if (isRecord(raw.deviceProfiles)) {
    const map: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(raw.deviceProfiles)) {
      // Disjungsi `typeof v === "string" || v === null` tidak me-narrow
      // di tsconfig repo — pisah jadi dua cabang.
      if (typeof v === "string") map[k] = v;
      else if (v === null) map[k] = null;
    }
    s.deviceProfiles = map;
  } else if (raw.deviceProfiles !== undefined) {
    warnings.push("Seksi headphone: deviceProfiles bukan objek — dilewati.");
  }
  const activeProfileId: unknown = raw.activeProfileId;
  if (typeof activeProfileId === "string") {
    s.activeProfileId = activeProfileId;
  } else if (activeProfileId === null) {
    s.activeProfileId = null;
  }
  const enabled = asBool(raw.enabled);
  if (enabled !== undefined) s.enabled = enabled;
  return s;
}

function sanitizePlayerSection(
  raw: unknown,
  warnings: Warnings,
): PlayerBackupSection | undefined {
  if (!isRecord(raw)) {
    warnings.push("Seksi pemutar bukan objek — dilewati.");
    return undefined;
  }
  const s: PlayerBackupSection = {};
  const speed = asClamped(
    raw.playbackSpeed,
    PLAYBACK_SPEED_MIN,
    PLAYBACK_SPEED_MAX,
  );
  if (speed !== undefined) s.playbackSpeed = speed;
  const cents = asFinite(raw.tuningCents);
  if (cents !== undefined) s.tuningCents = clampTuningCents(Math.round(cents));
  const resonance = asClamped(
    raw.resonanceIntensity,
    RESONANCE_MIN,
    RESONANCE_MAX,
  );
  if (resonance !== undefined) s.resonanceIntensity = resonance;
  const solfeggio = asFinite(raw.solfeggioFreq);
  if (solfeggio !== undefined) s.solfeggioFreq = clampSolfeggioFreq(solfeggio);
  const templateId = asNonEmptyString(raw.solfeggioTemplateId);
  if (templateId !== undefined) s.solfeggioTemplateId = templateId;
  const brainwave = asFinite(raw.brainwaveFreq);
  if (brainwave !== undefined) s.brainwaveFreq = clampBrainwaveFreq(brainwave);
  const audioMode: unknown = raw.audioMode;
  if (typeof audioMode === "string" && AUDIO_MODES.includes(audioMode)) {
    s.audioMode = audioMode as AudioMode;
  } else if (raw.audioMode !== undefined) {
    warnings.push(
      `Seksi pemutar: mode "${String(raw.audioMode)}" tidak dikenal — dilewati.`,
    );
  }
  return s;
}

function sanitizeConvolverSection(
  raw: unknown,
  warnings: Warnings,
): BackupSettings["convolver"] {
  if (!isRecord(raw)) {
    warnings.push("Seksi convolver bukan objek — dilewati.");
    return undefined;
  }
  const enabled = asBool(raw.isConvolverEnabled);
  // Field yang tidak disebut di file TIDAK di-default-kan ke false di
  // sini — lapisan apply yang memutuskan (absen = biarkan apa adanya).
  const out: NonNullable<BackupSettings["convolver"]> = {};
  if (enabled !== undefined) out.isConvolverEnabled = enabled;
  if (raw.ir !== undefined && raw.ir !== null) {
    if (isRecord(raw.ir)) {
      const name = asNonEmptyString(raw.ir.name);
      const path = asNonEmptyString(raw.ir.path);
      const sampleRateHz = asFinite(raw.ir.sampleRateHz);
      const taps = asFinite(raw.ir.taps);
      const durationMs = asFinite(raw.ir.durationMs);
      if (name && path && sampleRateHz !== undefined) {
        // IR lengkap — satu-satunya bentuk yang bisa dipulihkan
        // (path-nya dicek keberadaannya oleh lapisan apply).
        out.ir = {
          name,
          path,
          sampleRateHz,
          taps: taps ?? 0,
          durationMs: durationMs ?? 0,
        };
      } else {
        warnings.push(
          "Seksi convolver: metadata IR tidak lengkap — IR dilewati.",
        );
      }
    } else {
      warnings.push("Seksi convolver: IR bukan objek — IR dilewati.");
    }
  }
  return out;
}

function sanitizeOutputProfileSection(
  raw: unknown,
  warnings: Warnings,
): BackupSettings["outputProfile"] {
  if (!isRecord(raw)) {
    warnings.push("Seksi profil per output bukan objek — dilewati.");
    return undefined;
  }
  const enabled = asBool(raw.enabled);
  const out: NonNullable<BackupSettings["outputProfile"]> = {};
  if (enabled !== undefined) out.enabled = enabled;
  if (isRecord(raw.mapping)) {
    const mapping: OutputProfileMap = {} as OutputProfileMap;
    for (const cat of CONFIGURABLE_OUTPUT_CATEGORIES) {
      const v: unknown = raw.mapping[cat];
      if (typeof v === "string") mapping[cat] = v;
      else if (v === null) mapping[cat] = null;
    }
    out.mapping = mapping;
  } else if (raw.mapping !== undefined) {
    warnings.push("Seksi profil per output: mapping bukan objek — dilewati.");
  }
  return out;
}

function sanitizeVisibleSections(
  raw: unknown,
  warnings: Warnings,
): VisibleSections | undefined {
  if (!isRecord(raw)) {
    warnings.push("Seksi tampilan Equalizer bukan objek — dilewati.");
    return undefined;
  }
  const out: VisibleSections = { ...DEFAULT_VISIBLE_SECTIONS };
  (Object.keys(DEFAULT_VISIBLE_SECTIONS) as (keyof VisibleSections)[]).forEach(
    (k) => {
      const v = asBool(raw[k]);
      if (v !== undefined) out[k] = v;
    },
  );
  return out;
}

function sanitizeBackupSettings(
  raw: Record<string, unknown>,
  warnings: Warnings,
): BackupSettings {
  const s: BackupSettings = {};
  if (raw.equalizer !== undefined) {
    const v = sanitizeEqualizerSection(raw.equalizer, warnings);
    if (v) s.equalizer = v;
  }
  if (raw.headphone !== undefined) {
    const v = sanitizeHeadphoneSection(raw.headphone, warnings);
    if (v) s.headphone = v;
  }
  if (isRecord(raw.hrtf)) {
    const enabled = asBool(raw.hrtf.isHrtfEnabled);
    if (enabled !== undefined) s.hrtf = { isHrtfEnabled: enabled };
    else warnings.push("Seksi HRTF: isHrtfEnabled bukan boolean — dilewati.");
  } else if (raw.hrtf !== undefined) {
    warnings.push("Seksi HRTF bukan objek — dilewati.");
  }
  if (isRecord(raw.replayGain)) {
    const enabled = asBool(raw.replayGain.isReplayGainEnabled);
    const mode: unknown = raw.replayGain.replayGainMode;
    const modeText = typeof mode === "string" ? mode : undefined;
    if (
      enabled !== undefined &&
      modeText !== undefined &&
      REPLAYGAIN_MODES.includes(modeText)
    ) {
      s.replayGain = {
        isReplayGainEnabled: enabled,
        replayGainMode: modeText as ReplayGainMode,
      };
    } else {
      warnings.push("Seksi ReplayGain tidak lengkap — dilewati.");
    }
  } else if (raw.replayGain !== undefined) {
    warnings.push("Seksi ReplayGain bukan objek — dilewati.");
  }
  if (isRecord(raw.crossfade)) {
    const v = asClamped(
      raw.crossfade.crossfadeSeconds,
      CROSSFADE_MIN_SECONDS,
      CROSSFADE_MAX_SECONDS,
    );
    if (v !== undefined) s.crossfade = { crossfadeSeconds: v };
    else
      warnings.push(
        "Seksi crossfade: crossfadeSeconds bukan angka — dilewati.",
      );
  } else if (raw.crossfade !== undefined) {
    warnings.push("Seksi crossfade bukan objek — dilewati.");
  }
  if (raw.convolver !== undefined) {
    const v = sanitizeConvolverSection(raw.convolver, warnings);
    if (v) s.convolver = v;
  }
  if (raw.outputProfile !== undefined) {
    const v = sanitizeOutputProfileSection(raw.outputProfile, warnings);
    if (v) s.outputProfile = v;
  }
  if (raw.player !== undefined) {
    const v = sanitizePlayerSection(raw.player, warnings);
    if (v) s.player = v;
  }
  if (isRecord(raw.library)) {
    const a = asBool(raw.library.isAutoScanEnabled);
    const b = asBool(raw.library.isAutoEnrichingEnabled);
    // Hanya field yang disebut yang masuk — yang absen dibiarkan apa
    // adanya oleh lapisan apply (bukan di-default-kan false).
    if (a !== undefined || b !== undefined) {
      s.library = {};
      if (a !== undefined) s.library.isAutoScanEnabled = a;
      if (b !== undefined) s.library.isAutoEnrichingEnabled = b;
    }
  } else if (raw.library !== undefined) {
    warnings.push("Seksi library bukan objek — dilewati.");
  }
  if (isRecord(raw.artwork)) {
    const fit = raw.artwork.artworkFit;
    if (fit === "contain" || fit === "cover") s.artwork = { artworkFit: fit };
    else warnings.push("Seksi sampul: artworkFit tidak dikenal — dilewati.");
  } else if (raw.artwork !== undefined) {
    warnings.push("Seksi sampul bukan objek — dilewati.");
  }
  if (isRecord(raw.theme)) {
    const id = asNonEmptyString(raw.theme.themeId);
    if (id !== undefined) s.theme = { themeId: id };
    else warnings.push("Seksi tema: themeId hilang — dilewati.");
  } else if (raw.theme !== undefined) {
    warnings.push("Seksi tema bukan objek — dilewati.");
  }
  if (raw.equalizerSections !== undefined) {
    const v = sanitizeVisibleSections(raw.equalizerSections, warnings);
    if (v) s.equalizerSections = v;
  }
  return s;
}

// ─── Parse file impor ───────────────────────────────────────────────────────

/**
 * Satu pintu masuk untuk SEMUA file impor (.json): cadangan lengkap
 * maupun preset EQ tunggal — dibedakan dari `kind`. Mengembalikan
 * `ok: false` + pesan yang bisa ditampilkan langsung bila file
 * ditolak utuh; seksi yang rusak hanya menghasilkan peringatan.
 */
export function parseImportFile(text: string): ParseImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, kind: "error", error: "File bukan JSON yang valid." };
  }
  if (!isRecord(parsed)) {
    return { ok: false, kind: "error", error: "Isi file bukan objek JSON." };
  }
  if (parsed.kind !== BACKUP_KIND && parsed.kind !== PRESET_FILE_KIND) {
    return {
      ok: false,
      kind: "error",
      error:
        "File ini bukan cadangan atau preset PristineAudio (jenis file tidak dikenal).",
    };
  }
  const version = parsed.formatVersion;
  if (typeof version !== "number" || !Number.isInteger(version)) {
    return {
      ok: false,
      kind: "error",
      error: "File tidak punya nomor versi format yang valid.",
    };
  }
  if (version > BACKUP_FORMAT_VERSION) {
    return {
      ok: false,
      kind: "error",
      error:
        `File dibuat oleh PristineAudio yang lebih baru (format v${version}, ` +
        `aplikasi ini hanya kenal v${BACKUP_FORMAT_VERSION}). Perbarui aplikasi dulu, lalu impor lagi.`,
    };
  }
  if (version < BACKUP_FORMAT_VERSION) {
    return {
      ok: false,
      kind: "error",
      error: `Nomor versi format tidak dikenal (v${version}).`,
    };
  }
  const warnings: string[] = [];
  if (parsed.kind === PRESET_FILE_KIND) {
    const preset = sanitizePreset(parsed.preset, warnings, "preset");
    if (!preset) {
      return {
        ok: false,
        kind: "error",
        error: "Preset di dalam file rusak atau tidak lengkap.",
      };
    }
    return { ok: true, kind: "preset", preset, warnings };
  }
  if (!isRecord(parsed.settings)) {
    return {
      ok: false,
      kind: "error",
      error: "Bagian 'settings' hilang atau bukan objek.",
    };
  }
  const settings = sanitizeBackupSettings(parsed.settings, warnings);
  const appVersion: unknown = parsed.appVersion;
  const exportedAt: unknown = parsed.exportedAt;
  return {
    ok: true,
    kind: "backup",
    backup: {
      kind: BACKUP_KIND,
      formatVersion: BACKUP_FORMAT_VERSION,
      appVersion: typeof appVersion === "string" ? appVersion : "?",
      exportedAt: typeof exportedAt === "string" ? exportedAt : "",
      settings,
    },
    warnings,
  };
}

// Batas tuning dipakai sanitasi seksi pemutar (diekspos supaya tes bisa
// mengunci angkanya terhadap sumber yang sama dengan playerStore).
export { TUNING_MIN_CENTS, TUNING_MAX_CENTS };
