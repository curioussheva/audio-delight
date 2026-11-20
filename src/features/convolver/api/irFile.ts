// src/features/convolver/api/irFile.ts
//
// Pilih + simpan file impulse response (.wav) untuk convolver.
//
// Alur: DocumentPicker (pola yang sama dengan import M3U —
// copyToCacheDirectory: true, nama asli dari file.name karena hasil
// copy bernama UUID) -> salin ke direktori PERSISTEN app
// (documentDirectory/convolver/, BUKAN cache — cache bisa dihapus
// sistem dan IR harus selamat dari restart supaya restoreToNative
// bisa memuat ulang dari path yang dipersist) -> path itu yang
// dikirim ke native (loadConvolverIr).
//
// File di luar direktori ini tidak pernah disentuh: picker hanya
// membaca, dan yang dihapus hanya file IR app sendiri (saat ganti /
// hapus IR).

import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { ConvolverIrStatus } from "@/specs/NativeDSPModule";

export interface ConvolverIrMeta {
  /** Nama asli file (dari picker, untuk tampil di UI). */
  name: string;
  /** Path file lokal di documentDirectory/convolver/. */
  path: string;
  /** Laju sampel file IR (Hz, dari native). */
  sampleRateHz: number;
  /** Panjang IR sesudah resample ke laju stream saat ini (tap). */
  taps: number;
  /** Durasi IR pada laju stream saat ini (ms). */
  durationMs: number;
}

/** Subdirektori IR di dalam documentDirectory. */
export const CONVOLVER_DIR_NAME = "convolver";

/** Pesan error Indonesia untuk tiap status load native. */
export function convolverIrErrorMessage(status: number): string {
  switch (status) {
    case ConvolverIrStatus.FileError:
      return "File IR tidak bisa dibaca.";
    case ConvolverIrStatus.FormatError:
      return "Bukan file WAV yang didukung (PCM/float 8/16/24/32-bit, mono/stereo).";
    case ConvolverIrStatus.TooLong:
      return "IR terlalu panjang — maks ~2 detik sesudah resample ke laju stream.";
    case ConvolverIrStatus.Silent:
      return "IR sunyi (semua nol) — tidak ada yang bisa dikonvolusi.";
    case ConvolverIrStatus.RateError:
      return "Laju sampel IR di luar 8–192 kHz.";
    default:
      return "Gagal memuat IR (status tidak dikenal).";
  }
}

export interface PickedIrFile {
  /** URI cache hasil picker (file://). */
  uri: string;
  /** Nama asli file (metadata picker). */
  name: string;
}

/**
 * Buka picker file IR. Return null bila user membatalkan (BUKAN
 * error — pemanggil tidak boleh menampilkan toast gagal).
 */
export async function pickIrFile(): Promise<PickedIrFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ["audio/wav", "audio/x-wav"],
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) {
    return null;
  }

  const file = result.assets[0];
  return {
    uri: file.uri,
    name: file.name || "impulse-response.wav",
  };
}

function sanitizeFileName(name: string): string {
  const clean =
    name.replace(/[^A-Za-z0-9._\- ]/g, "_").trim() || "impulse-response.wav";
  return /\.wav$/i.test(clean) ? clean : `${clean}.wav`;
}

/**
 * Salin file IR hasil picker ke penyimpanan persisten app.
 * Return path tujuan (file://). Menimpa file lama dengan nama yang
 * sama — app hanya memegang satu IR aktif.
 */
export async function saveIrFile(
  cacheUri: string,
  originalName: string,
): Promise<string> {
  const baseDir = FileSystem.documentDirectory;
  if (!baseDir) {
    throw new Error("documentDirectory tidak tersedia");
  }
  const dir = `${baseDir}${CONVOLVER_DIR_NAME}/`;
  const dirInfo = await FileSystem.getInfoAsync(dir);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
  const dest = `${dir}${sanitizeFileName(originalName)}`;
  await FileSystem.copyAsync({ from: cacheUri, to: dest });
  return dest;
}

/** Hapus file IR app sendiri (ganti/hapus IR). Gagal = diam saja. */
export async function deleteIrFile(path: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(path, { idempotent: true });
  } catch (e) {
    console.error("[Convolver] deleteIrFile gagal:", e);
  }
}
