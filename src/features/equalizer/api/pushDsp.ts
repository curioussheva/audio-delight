// src/features/equalizer/api/pushDsp.ts
//
// EQ-17: SATU helper dorong-efek untuk semua store DSP kecil
// (HRTF, crossfade, gapless, convolver, headphone) — pengganti 4
// duplikat helper yang masing-masing `await createAudioSession()` +
// setter + guard `sessionId !== -1` + try/catch log sendiri.
//
// Kontrak:
// - `fn` menerima sessionId (token dari dspSession; native
//   mengabaikannya — F7 — tapi signature setter tetap memintanya).
//   Setter tanpa sessionId (headphone) boleh mengabaikan argumennya.
// - Bila engine belum siap, push MENUNGGU token (maks 10 detik,
//   lihat waitForDspSession) — bukan skip, bukan alokasi sesi baru.
//   Timeout / engine tak siap = lewati + warn, jangan pernah melempar.
// - Gagal native = log + `undefined` (pola N23: gagal -> log saja).
//   Pemanggil yang butuh tahu hasil (mis. activateProfile headphone)
//   memeriksa `undefined` sebagai "tidak diterapkan".
// - Mengembalikan hasil `fn` supaya pemanggil bisa membedakan
//   sukses/gagal native.
import { waitForDspSession } from "./dspSession";

export async function pushDsp<T>(
  label: string,
  fn: (sessionId: number) => Promise<T>,
): Promise<T | undefined> {
  try {
    const sessionId = await waitForDspSession();
    if (sessionId === null || sessionId === -1) {
      console.warn(
        `[DSP] ${label}: engine belum siap — dorongan dilewati.`,
      );
      return undefined;
    }
    return await fn(sessionId);
  } catch (e) {
    console.error(`[DSP] ${label} gagal:`, e);
    return undefined;
  }
}
