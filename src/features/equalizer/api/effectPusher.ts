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
// OPSI 3 (logcat #15, 2026-11-22): throttle di atas ternyata BUKAN
// titik tumpuknya — tick drag datang lambat (~1,8/dtk, runOnJS ikut
// antre di thread JS yang kelaparan), jadi tiap tick lolos jendela
// 100 ms dan langsung leading-fire. Yang menumpuk adalah JANJI native
// in-flight: tiap fire memulai satu `await NativeDSPModule.*` yang
// resolve-nya menunggu giliran thread JS — 203 janji menggantung
// sekaligus (overlap maks 199), native 0 ms di semuanya. Karena itu
// `fire()` kini di-gate SELAMA DRAG SAJA (lihat `isDragActive`):
// bila sudah ada panggilan native in-flight untuk pusher ini, nilai
// terbaru DITAHAN (bukan dikirim) dan dikirim begitu yang lama selesai
// — maks 1 in-flight + 1 tertahan per pusher. Di luar drag perilaku
// lama (tanpa gating). Flush saat release tetap mendarat tepat sekali:
// onFinalize memanggil setDragActive(false) SEBELUM onDragEnd, jadi
// flush tidak ter-gate; bila nilai sempat tertahan, ia terkirim saat
// janji in-flight selesai (settle), bukan lewat flush — keduanya tidak
// pernah dobel karena timer trailing sudah habis saat nilai ditahan.
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
import { isDragActive } from "@/features/equalizer/api/dragState";

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
  /**
   * Kirim nilai pending SEKARANG (bukan menunggu timer trailing) —
   * dipakai saat drag dilepas (onFinalize) supaya nilai akhir drag
   * terkirim sekali saat release. Bila ada pending: commit + send
   * seperti fire, lalu timer dibersihkan (tidak ada pengiriman ulang).
   * Bila tidak ada pending: no-op (idempotent, tidak double-fire).
   */
  flush(): void;
}

/** Throttle 100 ms untuk nilai efek drag (lihat header modul). */
export function createEffectPusher(
  options: EffectPusherOptions,
): EffectPusher {
  let lastAt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: PendingPush | null = null;
  // Opsi 3 (log #15): satu panggilan native in-flight per pusher, dan
  // paling satu nilai tertahan (yang terbaru) — hanya selama drag.
  let inFlight = false;
  let held: PendingPush | null = null;

  // Dipanggil saat janji native in-flight selesai (resolve ATAU reject —
  // `send` menelan error di dalam, jadi janji selalu resolve dalam
  // praktik). Kirim nilai tertahan bila ada, tepat sekali.
  const settleFlight = () => {
    inFlight = false;
    const h = held;
    held = null;
    if (h) {
      // fire() menelan error send, tapi commit yang melempar akan lolos —
      // di konteks async ini itu jadi unhandled rejection, jadi telan.
      try {
        fire(h.value, h.sessionId, h.commit);
      } catch {
        // Nilai tertahan sudah dibuang; tidak ada retry.
      }
    }
  };

  // Kembalikan true bila nilai benar-benar dikirim, false bila ditahan
  // (drag aktif + ada in-flight) — pemanggil mencatat "dropped" untuk
  // yang ditahan, supaya hitungan [DRAG-DIAG] jujur.
  const fire = (
    value: number,
    sessionId: number,
    commit?: () => void,
  ): boolean => {
    // Opsi 3: selama drag, JANGAN kirim selagi ada in-flight — tahan
    // nilai terbaru. lastAt TIDAK dimajukan: tick berikut tetap lewat
    // cabang leading dan menimpa `held` dengan nilai yang lebih baru.
    // Di luar drag: tanpa gating (perilaku lama).
    if (isDragActive() && inFlight) {
      held = { value, sessionId, commit };
      timer = null;
      pending = null;
      return false;
    }
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
        typeof (result as { then?: unknown }).then === "function"
      ) {
        // Opsi 3: lacak janji ini sebagai in-flight — settle-nya yang
        // melepas nilai tertahan. Janji yang tidak pernah settle
        // (thread JS kelaparan) menahan `held` sampai drag selesai
        // dan thread bebas — nilai akhir tetap mendarat, sekali.
        inFlight = true;
        (result as Promise<unknown>).then(settleFlight, settleFlight);
        (result as Promise<unknown>).catch(() => {});
      }
    } catch {
      // send yang melempar sinkron: telan — pusher tidak pernah melempar.
    }
    return true;
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
        // [DRAG-DIAG] tick yang langsung fire (leading) — atau ditahan
        // (opsi 3) bila ada in-flight selama drag.
        noteThrottleTick(
          options.throttleName,
          fire(value, sessionId, commit) ? "fired" : "dropped",
        );
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
      // Opsi 3: nilai tertahan ikut dibuang — aksi wholesale (reset)
      // tidak boleh membiarkan nilai drag basi terkirim sesudahnya.
      held = null;
    },

    flush() {
      // Tanpa timer trailing = tidak ada pending: no-op (nilai terakhir
      // sudah terkirim leading, atau belum ada push sama sekali).
      if (!timer) return;
      clearTimeout(timer);
      timer = null;
      const p = pending;
      pending = null;
      // fire() membersihkan state + memajukan lastAt seperti trailing
      // fire biasa — push berikutnya dalam jendela jadi trailing, dan
      // timer yang sudah dibersihkan tidak mengirim ulang nilai ini.
      // Bila fire menahan nilai (drag aktif + in-flight), nilai itu
      // terkirim saat settle — flush tetap tepat sekali, tidak dobel.
      if (p) fire(p.value, p.sessionId, p.commit);
    },
  };
}
