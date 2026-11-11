import { deriveSpectralVerdict } from "@/features/visualizer/api/spectralVerdict";

describe("deriveSpectralVerdict", () => {
  it("spectral null -> unmeasured", () => {
    const v = deriveSpectralVerdict({
      declaredSampleRate: 96000,
      declaredBitDepth: 24,
      isLosslessContainer: true,
      spectral: null,
    });
    expect(v.kind).toBe("unmeasured");
    expect(v.notes).toEqual([]);
  });

  it("96 kHz mengaku, cutoff 22 kHz -> upsample", () => {
    const v = deriveSpectralVerdict({
      declaredSampleRate: 96000,
      declaredBitDepth: 24,
      isLosslessContainer: true,
      spectral: { measuredCutoffHz: 22043, lsbZeroRatio16: 0.01 },
    });
    expect(v.kind).toBe("upsample");
    expect(v.notes[0]).toMatch(/22\.0 kHz/);
  });

  it("96 kHz mengaku, cutoff 40 kHz -> consistent", () => {
    const v = deriveSpectralVerdict({
      declaredSampleRate: 96000,
      declaredBitDepth: 24,
      isLosslessContainer: true,
      spectral: { measuredCutoffHz: 40000, lsbZeroRatio16: 0.01 },
    });
    expect(v.kind).toBe("consistent");
  });

  it("FLAC 44,1 kHz, cutoff 16 kHz -> lossy-source", () => {
    const v = deriveSpectralVerdict({
      declaredSampleRate: 44100,
      declaredBitDepth: 16,
      isLosslessContainer: true,
      spectral: { measuredCutoffHz: 16000, lsbZeroRatio16: 0.01 },
    });
    expect(v.kind).toBe("lossy-source");
  });

  it("24-bit, LSB-16 rasio 1,0 -> padding", () => {
    const v = deriveSpectralVerdict({
      declaredSampleRate: 96000,
      declaredBitDepth: 24,
      isLosslessContainer: true,
      spectral: { measuredCutoffHz: 40000, lsbZeroRatio16: 1.0 },
    });
    expect(v.kind).toBe("padding");
  });

  it("24-bit asli (rasio 0,01) + cutoff tinggi -> consistent", () => {
    const v = deriveSpectralVerdict({
      declaredSampleRate: 96000,
      declaredBitDepth: 24,
      isLosslessContainer: true,
      spectral: { measuredCutoffHz: 45000, lsbZeroRatio16: 0.01 },
    });
    expect(v.kind).toBe("consistent");
  });

  it("wadah lossy (MP3) tidak kena verdict lossy-source", () => {
    const v = deriveSpectralVerdict({
      declaredSampleRate: 44100,
      declaredBitDepth: 16,
      isLosslessContainer: false,
      spectral: { measuredCutoffHz: 16000, lsbZeroRatio16: 0.01 },
    });
    expect(v.kind).toBe("consistent");
  });

  it("cutoff 0 -> unmeasured", () => {
    const v = deriveSpectralVerdict({
      declaredSampleRate: 96000,
      declaredBitDepth: 24,
      isLosslessContainer: true,
      spectral: { measuredCutoffHz: 0, lsbZeroRatio16: 0 },
    });
    expect(v.kind).toBe("unmeasured");
  });
});
