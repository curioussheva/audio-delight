// src/features/equalizer/api/effectPusher.ts
//
// Throttle leading + trailing (100 ms) untuk SATU nilai efek drag
// (bass / widener / reverb) + fire-and-forget ke native.
//
// MASALAH (logcat #9, Session 80817): `setBassBoost` / `setVirtualizer` /
// `setReverb` di equalizerStore tiap tick drag langsung `await` native
// tanpa throttle apa pun — 41 panggilan `setVirtualizer` dikeluarkan,
// 41 dieksekusi native (0 ms), 0 resolve; overlap depth naik monoton
// 2 → 41 dan semua timer JS mati. Janji yang tak kunjung resolve itu
// mengantre di belakang backlog tugas JS.
//
// PERBAIKAN: panggilan native TIDAK PERNAH di-await di sini. `push()`
// hanya menjadwalkan; `fire()` mengirim via `send()` yang fire-and-forget
// (pemanggil `send` yang menelan rejection — lihat equalizerStore).
// Nilai TERAKHIR selalu terkirim (trailing), jadi drag cepat tidak
// meninggalkan nilai basi sesudah drag selesai.
//
// POLA: sama seperti `pushMasterGainThrottled` (leading + trailing,
// 100 ms) dan throttle store Fix G di `setBandGain` — bedanya pusher ini
// generik (satu nilai skalar) dan `commit` opsional (bagian 3: store
// `set()` ikut dithrottle lewat `commit`, bukan langsung per tick).
//
// Modul ini SENGAJA tidak mengimpor react-native / spec TurboModule /
// store: logika murni yang bisa diuji jest (aturan jest.config.cjs).
// `send` + `commit` disuntikkan pemakai (equalizerStore) supaya modul
// ini tidak bergantung pada store (circular import).

import {
  noteThrottleTick,
  type ThrottleName,
} from "@/features/equalizer/api/dragDiag";

/** Satu panggilan drag yang tertunda (nilai terbaru yang menang). */
interface PendingPush {
  value: number;
  sessionId: number;
  commit?: () => void;
}

export interface EffectPusherOptions {
  /** Nama throttle untuk [DRAG-DIAG] ("bass" | "widener" | "reverb"). */
  throttleName: ThrottleName;
  /** Jendela throttle (ms) — 100, sama seperti gain + band. */
  throttleMs: number;
  /**
   * Kirim nilai ke native. HARUS fire-and-forget: pusher tidak pernah
   * menunggu hasilnya (void / janji yang tidak di-await). Boleh
   * mengembalikan janji — pusher memasang .catch pengaman supaya
   * rejection tidak jadi unhandled — tapi `send` tetap WAJIB mencatat
   * errornya sendiri bila perlu (lihat equalizerStore).
   */
  send: (value: number, sessionId: number) => unknown;
}

export interface EffectPusher {
  /**
   * Jadwalkan nilai terbaru. Leading (≥ jendela sejak fire terakhir):
   * langsung fire. Dalam jendela: hanya nilai terbaru yang disimpan
   * sebagai pending; trailing fire paling lambat satu jendela kemudian.
   * `commit` (bila ada) dijalankan saat fire — bukan saat push — supaya
   * store `set()` ikut dithrottle (bagian 3).
   */
  push(value: number, sessionId: number, commit?: () => void): void;
  /**
   * Batalkan trailing fire yang masih tertunda (nilai pending dibuang).
   * Dipakai aksi yang mengganti state secara wholesale (reset) supaya
   * nilai drag basi tidak menimpa state baru sesudahnya.
   */
  cancelPending(): void;
}

/** Throttle 100 ms untuk nilai efek drag (lihat header modul). */
export function createEffectPusher(
  options: EffectPusherOptions,
): EffectPusher {
  let lastAt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: PendingPush | null = null;

  const fire = (value: number, sessionId: number, commit?: () => void) => {
    lastAt = Date.now();
    timer = null;
    pending = null;
    // Store dulu, native sesudahnya — nilai yang dilihat UI sama dengan
    // nilai yang dikirim ke native.
    commit?.();
    // Fire-and-forget: pusher TIDAK PERNAH menunggu / melempar.
    // `send` yang mengembalikan janji yang reject tetap aman — .catch
    // di sini hanya jaring pengaman (pemanggil `send` yang mencatat
    // error bila perlu, lihat equalizerStore).
    try {
      const result: unknown = options.send(value, sessionId);
      if (
        result !== null &&
        typeof result === "object" &&
        typeof (result as { catch?: unknown }).catch === "function"
      ) {
        (result as Promise<unknown>).catch(() => {});
      }
    } catch {
      // send yang melempar sinkron: telan — pusher tidak pernah melempar.
    }
  };

  return {
    push(value: number, sessionId: number, commit?: () => void) {
      const now = Date.now();
      if (now - lastAt >= options.throttleMs) {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        pending = null;
        fire(value, sessionId, commit);
        // [DRAG-DIAG] tick yang langsung fire (leading).
        noteThrottleTick(options.throttleName, "fired");
      } else if (!timer) {
        pending = { value, sessionId, commit };
        // [DRAG-DIAG] tick yang dijadwalkan sebagai trailing fire.
        noteThrottleTick(options.throttleName, "trailing");
        timer = setTimeout(
          () => {
            const p = pending;
            pending = null;
            timer = null;
            if (p) fire(p.value, p.sessionId, p.commit);
          },
          options.throttleMs - (now - lastAt),
        );
      } else {
        // Tick dalam jendela + trailing sudah terjadwal = digabung ke
        // trailing fire (nilai akhir tetap terkirim, tick ini hilang).
        pending = { value, sessionId, commit };
        noteThrottleTick(options.throttleName, "dropped");
      }
    },

    cancelPending() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      pending = null;
    },
  };
}
