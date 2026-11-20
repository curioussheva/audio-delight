// src/__tests__/features/settings/backup.test.ts
//
// Ekspor/impor pengaturan + preset EQ (item 8 deep-insight, 2026-11-20).
// Modul yang diuji murni (backup.ts) — tanpa mock React Native / expo.
import {
  BACKUP_KIND,
  PRESET_FILE_KIND,
  backupFileName,
  buildBackup,
  buildPresetFile,
  mergePresets,
  parseImportFile,
  presetFileName,
  resolveImportedPreset,
  sanitizePreset,
  type BackupSettings,
  type PresetShareFile,
} from "@/features/settings/backup";
import { makeBands } from "@/features/equalizer/constants/presets";
import type { Preset } from "@/features/equalizer/types";

const flatPreset = (over: Partial<Preset> = {}): Preset => ({
  id: "flat",
  name: "Flat",
  bands: makeBands([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
  ...over,
});

const fullSettings = (): BackupSettings => ({
  equalizer: {
    bands: makeBands([1, 2, 3, 0, 0, 0, 0, 0, 0, 0]),
    activePresetId: "rock",
    customPresets: [
      flatPreset({ id: "custom_1", name: "Punyaku", isCustom: true }),
    ],
    isEQEnabled: true,
    isBassEnabled: true,
    isVirtualizerEnabled: false,
    isReverbEnabled: true,
    bassStrength: 400,
    virtualizerLevel: 0,
    reverbPreset: 2,
    masterGain: 1.0,
    eqEnabledBeforeBitPerfect: null,
  },
  hrtf: { isHrtfEnabled: true },
  replayGain: { isReplayGainEnabled: true, replayGainMode: "album" },
  crossfade: { crossfadeSeconds: 3 },
  player: {
    playbackSpeed: 1.25,
    tuningCents: -32,
    resonanceIntensity: 0.5,
    solfeggioFreq: 528,
    solfeggioTemplateId: "528",
    brainwaveFreq: 10,
    audioMode: "dsp",
  },
  library: { isAutoScanEnabled: false, isAutoEnrichingEnabled: true },
  artwork: { artworkFit: "cover" },
  theme: { themeId: "pristine-ember" },
});

describe("buildBackup + parseImportFile (round-trip)", () => {
  it("cadangan lengkap kembali utuh sesudah JSON stringify", () => {
    const settings = fullSettings();
    const backup = buildBackup(
      settings,
      "1.0.37",
      new Date("2026-11-20T10:00:00Z"),
    );
    const parsed = parseImportFile(JSON.stringify(backup));
    expect(parsed.ok).toBe(true);
    expect(parsed.kind).toBe("backup");
    if (parsed.kind !== "backup") return;
    expect(parsed.backup.formatVersion).toBe(1);
    expect(parsed.backup.appVersion).toBe("1.0.37");
    expect(parsed.backup.exportedAt).toBe("2026-11-20T10:00:00.000Z");
    expect(parsed.backup.settings).toEqual(settings);
    expect(parsed.warnings).toEqual([]);
  });

  it("file preset tunggal kembali utuh", () => {
    const preset = flatPreset({
      id: "custom_9",
      name: "Vokal Jernih",
      bassBoost: 200,
      virtualizer: 500,
      reverb: 1,
    });
    const file: PresetShareFile = buildPresetFile(preset, "1.0.37");
    expect(file.kind).toBe(PRESET_FILE_KIND);
    const parsed = parseImportFile(JSON.stringify(file));
    expect(parsed.ok).toBe(true);
    expect(parsed.kind).toBe("preset");
    if (parsed.kind !== "preset") return;
    expect(parsed.preset).toEqual({ ...preset, isCustom: true });
  });

  it("seksi yang tidak ada di file tidak muncul di hasil parse (merge, bukan wipe)", () => {
    const backup = buildBackup({ hrtf: { isHrtfEnabled: true } }, "1.0.37");
    const parsed = parseImportFile(JSON.stringify(backup));
    expect(parsed.ok).toBe(true);
    if (parsed.kind !== "backup") return;
    expect(parsed.backup.settings.hrtf).toEqual({ isHrtfEnabled: true });
    expect(parsed.backup.settings.equalizer).toBeUndefined();
    expect(parsed.backup.settings.player).toBeUndefined();
  });
});

describe("parseImportFile menolak file rusak utuh", () => {
  it.each([
    ["bukan JSON", "bukan json sama sekali"],
    ["JSON string", '"hanya string"'],
    ["JSON array", "[1, 2, 3]"],
    ["JSON angka", "42"],
    ["JSON null", "null"],
    ["objek kosong", "{}"],
  ])("%s", (_label, text) => {
    const parsed = parseImportFile(text);
    expect(parsed.ok).toBe(false);
    if (parsed.kind === "error") {
      expect(parsed.error.length).toBeGreaterThan(0);
    }
  });

  it("kind yang tidak dikenal ditolak", () => {
    const parsed = parseImportFile(
      JSON.stringify({ kind: "playlist", formatVersion: 1 }),
    );
    expect(parsed.ok).toBe(false);
    if (parsed.kind === "error")
      expect(parsed.error).toMatch(/bukan cadangan atau preset/);
  });

  it("versi format hilang ditolak", () => {
    const parsed = parseImportFile(
      JSON.stringify({ kind: BACKUP_KIND, settings: {} }),
    );
    expect(parsed.ok).toBe(false);
    if (parsed.kind === "error") expect(parsed.error).toMatch(/versi format/);
  });

  it("versi format lebih baru ditolak (bukan ditebak-tebak)", () => {
    const parsed = parseImportFile(
      JSON.stringify({ kind: BACKUP_KIND, formatVersion: 2, settings: {} }),
    );
    expect(parsed.ok).toBe(false);
    if (parsed.kind === "error") {
      expect(parsed.error).toMatch(/lebih baru/);
      expect(parsed.error).toMatch(/Perbarui aplikasi/);
    }
  });

  it("versi format 0 ditolak", () => {
    const parsed = parseImportFile(
      JSON.stringify({ kind: BACKUP_KIND, formatVersion: 0, settings: {} }),
    );
    expect(parsed.ok).toBe(false);
  });

  it("cadangan tanpa 'settings' ditolak", () => {
    const parsed = parseImportFile(
      JSON.stringify({ kind: BACKUP_KIND, formatVersion: 1 }),
    );
    expect(parsed.ok).toBe(false);
    if (parsed.kind === "error") expect(parsed.error).toMatch(/settings/);
  });

  it("file preset dengan preset rusak ditolak", () => {
    const parsed = parseImportFile(
      JSON.stringify({
        kind: PRESET_FILE_KIND,
        formatVersion: 1,
        preset: { id: "x" },
      }),
    );
    expect(parsed.ok).toBe(false);
    if (parsed.kind === "error")
      expect(parsed.error).toMatch(/Preset di dalam file rusak/);
  });
});

describe("parseImportFile: seksi rusak dibuang sendiri, yang sah tetap jalan", () => {
  it("bands equalizer salah jumlah dibuang, HRTF tetap diterapkan", () => {
    const parsed = parseImportFile(
      JSON.stringify({
        kind: BACKUP_KIND,
        formatVersion: 1,
        settings: {
          // makeBands([0, 0]) TIDAK bisa dipakai di sini: ia selalu
          // menghasilkan 10 band (map atas EQ_FREQUENCIES).
          equalizer: {
            bands: [
              { id: 0, frequency: 31, gain: 0, q: 1.414, type: "lowshelf" },
              { id: 1, frequency: 62, gain: 0, q: 1.414, type: "peaking" },
            ],
            isEQEnabled: true,
          },
          hrtf: { isHrtfEnabled: true },
        },
      }),
    );
    expect(parsed.ok).toBe(true);
    if (parsed.kind !== "backup") return;
    expect(parsed.backup.settings.equalizer?.bands).toBeUndefined();
    expect(parsed.backup.settings.equalizer?.isEQEnabled).toBe(true);
    expect(parsed.backup.settings.hrtf).toEqual({ isHrtfEnabled: true });
    expect(parsed.warnings.length).toBeGreaterThan(0);
  });

  it("seksi dan field yang tidak dikenal diabaikan tanpa gagal", () => {
    const parsed = parseImportFile(
      JSON.stringify({
        kind: BACKUP_KIND,
        formatVersion: 1,
        settings: {
          masaDepan: { fiturBaru: true },
          hrtf: { isHrtfEnabled: false, modeBaru: "x" },
        },
      }),
    );
    expect(parsed.ok).toBe(true);
    if (parsed.kind !== "backup") return;
    expect(parsed.backup.settings.hrtf).toEqual({ isHrtfEnabled: false });
    expect(
      (parsed.backup.settings as Record<string, unknown>).masaDepan,
    ).toBeUndefined();
  });

  it("field pemutar di luar rentang di-clamp, mode tidak dikenal dibuang", () => {
    const parsed = parseImportFile(
      JSON.stringify({
        kind: BACKUP_KIND,
        formatVersion: 1,
        settings: {
          player: {
            playbackSpeed: 5,
            tuningCents: 500,
            resonanceIntensity: -1,
            audioMode: "karaoke",
          },
        },
      }),
    );
    expect(parsed.ok).toBe(true);
    if (parsed.kind !== "backup") return;
    expect(parsed.backup.settings.player).toEqual({
      playbackSpeed: 2,
      tuningCents: 100,
      resonanceIntensity: 0,
    });
    expect(parsed.warnings.length).toBeGreaterThan(0);
  });

  it("library: hanya flag yang disebut yang masuk (yang absen tidak di-default-kan false)", () => {
    const parsed = parseImportFile(
      JSON.stringify({
        kind: BACKUP_KIND,
        formatVersion: 1,
        settings: { library: { isAutoScanEnabled: true } },
      }),
    );
    expect(parsed.ok).toBe(true);
    if (parsed.kind !== "backup") return;
    expect(parsed.backup.settings.library).toEqual({
      isAutoScanEnabled: true,
    });
  });

  it("convolver: IR tanpa path dibuang, toggle tanpa IR tidak di-default-kan", () => {
    const parsed = parseImportFile(
      JSON.stringify({
        kind: BACKUP_KIND,
        formatVersion: 1,
        settings: {
          convolver: { ir: { name: "hall.wav" } },
        },
      }),
    );
    expect(parsed.ok).toBe(true);
    if (parsed.kind !== "backup") return;
    expect(parsed.backup.settings.convolver?.ir).toBeUndefined();
    expect(
      parsed.backup.settings.convolver?.isConvolverEnabled,
    ).toBeUndefined();
    expect(parsed.warnings.length).toBeGreaterThan(0);
  });
});

describe("sanitizePreset", () => {
  it("gain di-clamp ke ±10 dB", () => {
    const warnings: string[] = [];
    const preset = sanitizePreset(
      {
        id: "x",
        name: "Keras",
        bands: makeBands([15, -12, 0, 0, 0, 0, 0, 0, 0, 0]),
      },
      warnings,
    );
    expect(preset?.bands[0].gain).toBe(10);
    expect(preset?.bands[1].gain).toBe(-10);
    expect(warnings).toEqual([]);
  });

  it("gain bukan angka menolak preset utuh", () => {
    const warnings: string[] = [];
    const bands = makeBands([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    (bands[3] as unknown as Record<string, unknown>).gain = "kencang";
    expect(
      sanitizePreset({ id: "x", name: "Rusak", bands }, warnings),
    ).toBeNull();
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("frekuensi/Q/tipe hilang jatuh ke default band itu", () => {
    const warnings: string[] = [];
    const bands = makeBands([1, 0, 0, 0, 0, 0, 0, 0, 0, 0]).map((b) => ({
      gain: b.gain,
    }));
    const preset = sanitizePreset(
      { id: "x", name: "Minimal", bands },
      warnings,
    );
    expect(preset?.bands[0]).toEqual({
      id: 0,
      frequency: 31,
      gain: 1,
      q: 1.414,
      type: "lowshelf",
    });
    expect(preset?.bands[9].type).toBe("highshelf");
  });

  it("jumlah band bukan 10 menolak preset", () => {
    const warnings: string[] = [];
    expect(
      sanitizePreset(
        {
          id: "x",
          name: "Pendek",
          bands: [
            { id: 0, frequency: 31, gain: 0, q: 1.414, type: "lowshelf" },
            { id: 1, frequency: 62, gain: 0, q: 1.414, type: "peaking" },
          ],
        },
        warnings,
      ),
    ).toBeNull();
  });

  it("efek di-clamp (bass/widener 0..1000, reverb 0..6)", () => {
    const warnings: string[] = [];
    const preset = sanitizePreset(
      {
        id: "x",
        name: "Efek",
        bands: makeBands([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
        bassBoost: 5000,
        virtualizer: -5,
        reverb: 99,
      },
      warnings,
    );
    expect(preset?.bassBoost).toBe(1000);
    expect(preset?.virtualizer).toBe(0);
    expect(preset?.reverb).toBe(6);
  });
});

describe("merge + impor preset", () => {
  it("mergePresets: id sama ditimpa, id baru ditambahkan, urutan dipertahankan", () => {
    const a = flatPreset({ id: "a", name: "A lama" });
    const b = flatPreset({ id: "b", name: "B" });
    const aBaru = flatPreset({ id: "a", name: "A baru" });
    const c = flatPreset({ id: "c", name: "C" });
    expect(mergePresets([a, b], [aBaru, c])).toEqual([aBaru, b, c]);
  });

  it("resolveImportedPreset: tanpa bentrok id dipertahankan", () => {
    const preset = flatPreset({ id: "custom_7", name: "Punyaku" });
    const { preset: out, renamed } = resolveImportedPreset(
      new Set(["flat", "rock"]),
      preset,
    );
    expect(renamed).toBe(false);
    expect(out.id).toBe("custom_7");
    expect(out.isCustom).toBe(true);
  });

  it("resolveImportedPreset: id bentrok (bawaan/custom) diganti, nama dipertahankan", () => {
    const preset = flatPreset({ id: "flat", name: "Flat" });
    const { preset: out, renamed } = resolveImportedPreset(
      new Set(["flat", "rock"]),
      preset,
    );
    expect(renamed).toBe(true);
    expect(out.id).toMatch(/^imported_/);
    expect(out.id).not.toBe("flat");
    expect(out.name).toBe("Flat");
  });
});

describe("nama file", () => {
  it("backup: PristineAudio-Backup-YYYY-MM-DD-HHmm.json", () => {
    expect(backupFileName(new Date("2026-11-20T10:05:00"))).toBe(
      "PristineAudio-Backup-2026-11-20-1005.json",
    );
  });

  it("preset: slug nama + tanggal", () => {
    expect(
      presetFileName("Vokal Jernih!", new Date("2026-11-20T10:05:00")),
    ).toBe("PristineAudio-Preset-vokal-jernih-20261120.json");
    expect(presetFileName("!!!", new Date("2026-11-20T10:05:00"))).toBe(
      "PristineAudio-Preset-preset-20261120.json",
    );
  });
});

describe("buildBackup tidak mengubah settings masukan", () => {
  it("objek settings tidak dimutasi", () => {
    const settings = fullSettings();
    const snapshot = JSON.stringify(settings);
    buildBackup(settings, "1.0.37");
    expect(JSON.stringify(settings)).toBe(snapshot);
  });
});
