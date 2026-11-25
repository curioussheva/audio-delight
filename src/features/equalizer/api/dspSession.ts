// src/features/equalizer/api/dspSession.ts
//
// Cache SATU sesi DSP stabil (F7) + penunggu kesiapan engine.
//
// Latar: tiap commit efek kecil (HRTF/crossfade/gapless/convolver)
// dulu memanggil `createAudioSession()` sendiri — 2 janji async per
// perubahan (sesi + setter), padahal native MENGABAIKAN sessionId
// (satu stream global, spec NativeDSPModule.ts F7: ID hanya token
// "native siap"). Cukup satu token yang diterbitkan sekali saat
// engine/session terbentuk, lalu dipakai ulang semua push.
//
// Modul ini SENGAJA tanpa impor apa pun (pola effectPusher): tidak ada
// store, tidak ada spec, tidak ada react-native — jadi bisa diuji jest
// tanpa mock dan tidak bisa menimbulkan circular import dari store
// mana pun yang memakainya.
//
// Penerbit token (satu-satunya tempat yang menulis):
// - `audioEngine.refreshSessionId()` — boot, sesi pertama terbentuk.
// - `equalizerStore.initialize()` — sesi dari getCurrentSessionId.
// - `equalizerStore.setAudioSessionId()` — sesi berganti (retry).
//
// Pembaca: `pushDsp()` (pushDsp.ts) — bila token belum ada, push
// MENUNGGU (bukan skip, bukan alokasi sesi baru): toggle yang ditekan
// sepersekian detik sesudah launch tetap mendarat begitu engine siap.
// Batas tunggu 10 detik supaya janji tidak menggantung selamanya bila
// engine tidak pernah siap (native tidak ada) — push dilewati + log.
let sessionId = -1;

type Waiter = (id: number) => void;
let waiters: Waiter[] = [];

/** Token sesi saat ini; -1 = engine belum siap. */
export function getDspSessionId(): number {
  return sessionId;
}

/**
 * Terbitkan token sesi baru. Membangunkan semua push yang menunggu.
 * id -1 (tidak valid) tidak membangunkan siapa pun dan tidak menimpa
 * token valid yang sudah ada.
 */
export function setDspSessionId(id: number): void {
  if (id === -1) return;
  sessionId = id;
  if (waiters.length === 0) return;
  const pending = waiters;
  waiters = [];
  for (const resolve of pending) resolve(id);
}

/**
 * Tunggu token sesi. Langsung resolve bila sudah ada; bila belum,
 * resolve saat `setDspSessionId` menerbitkan token valid, atau null
 * bila batas tunggu habis.
 */
export function waitForDspSession(timeoutMs = 10_000): Promise<number | null> {
  if (sessionId !== -1) return Promise.resolve(sessionId);
  return new Promise((resolve) => {
    let done: Waiter | null = null;
    const timer = setTimeout(() => {
      if (done) {
        waiters = waiters.filter((fn) => fn !== done);
        done = null;
      }
      resolve(null);
    }, timeoutMs);
    done = (id: number) => {
      clearTimeout(timer);
      done = null;
      resolve(id);
    };
    waiters.push(done);
  });
}
