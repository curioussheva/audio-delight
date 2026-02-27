// Stub - tidak pakai RNTP langsung
// Real implementation aktif saat native build
export const Player = {
  play: () => Promise.resolve(),
  pause: () => Promise.resolve(),
  stop: () => Promise.resolve(),
  reset: () => Promise.resolve(),
  add: (_tracks: any[]) => Promise.resolve(),
  skip: (_i: number) => Promise.resolve(),
  setVolume: (_v: number) => Promise.resolve(),
};
export default Player;
