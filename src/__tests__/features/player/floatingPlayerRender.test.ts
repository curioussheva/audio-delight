// FloatingPlayer — render React tidak lagi tiap tick posisi
// (audit Library 2026-11-22, P1).
//
// Jest di repo ini hanya untuk logika murni (tanpa React Native,
// tanpa @testing-library/react-native, testMatch hanya `*.test.ts`),
// jadi render-count TIDAK bisa diuji di sini. Yang diuji adalah
// properti sumber yang membuat penyempitan itu bekerja:
//  (1) tidak ada lagi langganan selector `position`/`duration` —
//      keduanya hanya dipakai untuk menggerakkan shared value
//      progres, bukan di JSX;
//  (2) progres di-sync dari store DI LUAR render React
//      (`subscribe` + `getState()`), jadi tick posisi ~2/dtk hanya
//      menggerakkan Reanimated shared value;
//  (3) komponen di-memo supaya render ulang TabsLayout (tick scan)
//      tidak ikut membangunkan pill;
//  (4) perilaku dipertahankan: bar progres (withTiming +
//      progressPercent), info lagu, kontrol play/shuffle/repeat.

import * as fs from "fs";
import * as path from "path";

function readSource(rel: string): string {
  const raw = fs.readFileSync(path.resolve(__dirname, rel), "utf8");
  // Hapus komentar sebelum diperiksa — komentar penjelas memang
  // menyebut nama field lama; yang diuji adalah kodenya.
  return raw.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

const floating = readSource(
  "../../../features/player/components/FloatingPlayer.tsx",
);

describe("FloatingPlayer — tidak langganan position/duration di render", () => {
  it("tidak ada selector position / duration (dulu: render tiap tick ~2/dtk)", () => {
    expect(floating).not.toContain("(s) => s.position");
    expect(floating).not.toContain("(s) => s.duration");
  });

  it("progres di-sync lewat subscribe + getState, bukan useEffect atas selector", () => {
    expect(floating).toContain("usePlayerStore.subscribe(");
    expect(floating).toContain("usePlayerStore.getState()");
    expect(floating).not.toContain("[position, duration, progress]");
  });

  it("listener hanya bereaksi bila position/duration berubah", () => {
    expect(floating).toContain("state.position !== prevState.position");
    expect(floating).toContain("state.duration !== prevState.duration");
  });

  it("bar progres tetap bergerak mulus (shared value + withTiming + progressPercent)", () => {
    expect(floating).toContain("useSharedValue(0)");
    expect(floating).toContain("withTiming(");
    expect(floating).toContain("progressPercent(state.position");
    expect(floating).toContain("animatedProgress");
  });

  it("info lagu + kontrol tetap dilanggan (currentSong/isPlaying/shuffle/repeat)", () => {
    expect(floating).toContain("(s) => s.currentSong");
    expect(floating).toContain("(s) => s.isPlaying");
    expect(floating).toContain("(s) => s.shuffle");
    expect(floating).toContain("(s) => s.repeat");
    expect(floating).toContain("{currentSong.title}");
    expect(floating).toContain("togglePlay");
  });
});

describe("FloatingPlayer — memo supaya tick scan induk tidak membangunkan pill", () => {
  it("komponen dibungkus memo() dan di-export sebagai memo", () => {
    expect(floating).toContain("function FloatingPlayer()");
    expect(floating).toContain("export default memo(FloatingPlayer)");
  });
});
