import {
  formatFrequencyHz,
  frequencyAxisLabels,
} from "@/features/visualizer/api/frequencyAxis";

describe("formatFrequencyHz", () => {
  it("0 dan negatif -> '0'", () => {
    expect(formatFrequencyHz(0)).toBe("0");
    expect(formatFrequencyHz(-5)).toBe("0");
    expect(formatFrequencyHz(NaN)).toBe("0");
  });

  it("di bawah 1 kHz -> Hz bulat", () => {
    expect(formatFrequencyHz(512)).toBe("512 Hz");
  });

  it("kHz bulat tanpa desimal, pecahan satu desimal", () => {
    expect(formatFrequencyHz(6000)).toBe("6 kHz");
    expect(formatFrequencyHz(12000)).toBe("12 kHz");
    expect(formatFrequencyHz(5512.5)).toBe("5.5 kHz");
    expect(formatFrequencyHz(22050)).toBe("22.1 kHz");
  });
});

describe("frequencyAxisLabels", () => {
  it("48 kHz default 5 titik linear 0–24 kHz", () => {
    expect(frequencyAxisLabels(48000)).toEqual([
      "0",
      "6 kHz",
      "12 kHz",
      "18 kHz",
      "24 kHz",
    ]);
  });

  it("44,1 kHz -> Nyquist 22,05 kHz, titik tengah ~11 kHz (bukan 2 kHz)", () => {
    expect(frequencyAxisLabels(44100)).toEqual([
      "0",
      "5.5 kHz",
      "11 kHz",
      "16.5 kHz",
      "22.1 kHz",
    ]);
  });

  it("3 titik -> 0 / tengah / Nyquist", () => {
    expect(frequencyAxisLabels(48000, 3)).toEqual(["0", "12 kHz", "24 kHz"]);
  });

  it("sample rate tak valid -> fallback 48 kHz", () => {
    expect(frequencyAxisLabels(0)).toEqual(frequencyAxisLabels(48000));
    expect(frequencyAxisLabels(NaN)).toEqual(frequencyAxisLabels(48000));
  });
});
