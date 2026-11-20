// src/__tests__/features/equalizer/graphProps.test.ts
import {
  areFrequencyGraphPropsEqual,
  bandsEqual,
  gainsEqual,
  type FrequencyGraphPropsInput,
} from "@/features/equalizer/api/graphProps";
import type { EqualizerBand } from "@/features/equalizer/types";

const FREQUENCIES = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

const bands = (gains: number[]): EqualizerBand[] =>
  gains.map((gain, i) => ({
    id: i,
    frequency: FREQUENCIES[i] ?? 1000,
    gain,
    q: 1,
    type: i === 0 ? "lowshelf" : i === 9 ? "highshelf" : "peaking",
  }));

const onBandChange = () => {};

function props(
  over: Partial<FrequencyGraphPropsInput> = {},
): FrequencyGraphPropsInput {
  return {
    bands: bands([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    combinedGains: [0, 0, 0],
    width: 340,
    height: 120,
    disabled: false,
    onBandChange,
    bassBoostDb: 0,
    masterGainDb: 0,
    ...over,
  };
}

describe("gainsEqual", () => {
  it("array beda referensi tapi nilai sama → sama", () => {
    expect(gainsEqual([1, 2, 3], [1, 2, 3])).toBe(true);
  });
  it("satu nilai beda → beda", () => {
    expect(gainsEqual([1, 2, 3], [1, 2, 4])).toBe(false);
  });
  it("panjang beda → beda", () => {
    expect(gainsEqual([1, 2], [1, 2, 3])).toBe(false);
  });
  it("null/undefined ditangani", () => {
    expect(gainsEqual(null, null)).toBe(true);
    expect(gainsEqual(undefined, null)).toBe(false);
    expect(gainsEqual([1], null)).toBe(false);
  });
});

describe("bandsEqual", () => {
  it("array BARU tiap set() dengan nilai sama → sama (kasus drag)", () => {
    expect(bandsEqual(bands([0, 1, 2]), bands([0, 1, 2]))).toBe(true);
  });
  it("satu gain berubah → beda", () => {
    expect(bandsEqual(bands([0, 1, 2]), bands([0, 1, 3]))).toBe(false);
  });
  it("frekuensi berubah → beda", () => {
    const a = bands([0, 0, 0]);
    const b = bands([0, 0, 0]);
    b[1] = { ...b[1], frequency: 63 };
    expect(bandsEqual(a, b)).toBe(false);
  });
  it("SharedValue beda objek → beda (konservatif, isi .value tidak dibaca)", () => {
    const a = { value: bands([0, 0]) };
    const b = { value: bands([0, 0]) };
    expect(bandsEqual(a, b)).toBe(false);
    expect(bandsEqual(a, a)).toBe(true);
  });
});

describe("areFrequencyGraphPropsEqual", () => {
  it("props identik nilai (array baru) → sama, grafik tidak re-render", () => {
    expect(areFrequencyGraphPropsEqual(props(), props())).toBe(true);
  });
  it("drag slider efek (bands + combinedGains tidak berubah) → sama", () => {
    // Skenario kunci: store set() saat drag widener/bass membuat array
    // bands baru, tapi nilainya sama — grafik harus diam.
    expect(areFrequencyGraphPropsEqual(props(), props())).toBe(true);
  });
  it("satu gain band berubah → beda", () => {
    const a = props();
    const b = props({ bands: bands([0, 0, 0, 0, 0, 0, 0, 0, 0, 2]) });
    expect(areFrequencyGraphPropsEqual(a, b)).toBe(false);
  });
  it("combinedGains berubah → beda", () => {
    expect(
      areFrequencyGraphPropsEqual(props(), props({ combinedGains: [0, 1, 0] })),
    ).toBe(false);
  });
  it("bassBoostDb / masterGainDb berubah → beda", () => {
    expect(
      areFrequencyGraphPropsEqual(props(), props({ bassBoostDb: 5 })),
    ).toBe(false);
    expect(
      areFrequencyGraphPropsEqual(props(), props({ masterGainDb: 3 })),
    ).toBe(false);
  });
  it("onBandChange beda identitas → beda", () => {
    expect(
      areFrequencyGraphPropsEqual(props(), props({ onBandChange: () => {} })),
    ).toBe(false);
  });
  it("width/height/disabled berubah → beda", () => {
    expect(areFrequencyGraphPropsEqual(props(), props({ width: 300 }))).toBe(
      false,
    );
    expect(areFrequencyGraphPropsEqual(props(), props({ height: 100 }))).toBe(
      false,
    );
    expect(areFrequencyGraphPropsEqual(props(), props({ disabled: true }))).toBe(
      false,
    );
  });
  it("default yang hilang (undefined) disamakan dengan defaultnya", () => {
    const a = props({ width: undefined, bassBoostDb: undefined });
    const b = props({ width: 340, bassBoostDb: 0 });
    expect(areFrequencyGraphPropsEqual(a, b)).toBe(true);
  });
});
