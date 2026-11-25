// src/features/equalizer/api/dragState.ts
//
// Flag drag module-level (tanpa import) — ditulis gesture drag EQ,
// dibaca tick poll VisualizerService.
//
// MASALAH (Trace 3): poll visualizer getFFTData() tiap 50 ms (20/detik)
// memakai bridge yang SAMA dengan setter drag (setVirtualizer /
// setBassBoost / setBandGain, throttle 100 ms via effectPusher). Saat drag
// berjalan, poll berebut jalur bridge dengan setter drag dan round-trip
// membengkak. Solusi (item 2): selama drag aktif, poll dilewati setiap
// tick genap (efektif 100 ms / 10 Hz — spektrum tetap jalan, bukan beku);
// sesudah drag selesai kembali 50 ms penuh.
//
// Modul ini SENGAJA tanpa import (pola effectPusher/dragDiag): bisa diuji
// jest tanpa mock RN dan tidak bisa circular-import — VisualizerService
// mengimpor modul ini, modul ini tidak mengimpor apa pun.

let dragActive = false;
let _dragTimer: ReturnType<typeof setTimeout> | null = null;
// DS-1: jaring pengaman — bila onFinalize tak pernah sampai (gesture
// dibatalkan sistem / crash handler), flag drag tidak boleh menempel
// selamanya (poll visualizer tetap 10 Hz + throttle drag tetap
// menahan nilai). 30 detik jauh di atas drag terlama yang wajar.
const DRAG_MAX_MS = 30_000;

/**
 * Dipanggil dari onBegin/onStart (true) dan onFinalize (false) gesture
 * drag, lewat runOnJS — mengikuti pola onChange yang sudah ada di
 * Band / VerticalSlider / Graph.
 */
export function setDragActive(active: boolean): void {
  dragActive = active;
  if (_dragTimer) {
    clearTimeout(_dragTimer);
    _dragTimer = null;
  }
  if (active) {
    _dragTimer = setTimeout(() => {
      dragActive = false;
      _dragTimer = null;
    }, DRAG_MAX_MS);
  }
}

/** Dibaca tick poll VisualizerService tiap 50 ms. */
export function isDragActive(): boolean {
  return dragActive;
}
