import {
  isDSDCapable,
  getMaxDSDRate,
  isHiResCapable,
  canDoBitPerfect,
  recommendDSDMode,
  type DACInfo,
  type DSDRate,
} from "../../../shared/types/dac";

/** Bangun DACInfo minimal untuk pengujian. */
const makeDAC = (over: {
  dsd?: Partial<DACInfo["capabilities"]["dsd"]>;
  pcm?: Partial<DACInfo["capabilities"]["pcm"]>;
}): DACInfo =>
  ({
    hardware: {
      id: "1",
      productId: "0000",
      vendorId: "0000",
      productName: "Test DAC",
      manufacturer: "Test",
      connectionType: "usb",
      isExternal: true,
      audioDeviceType: 0,
    },
    capabilities: {
      pcm: {
        maxSampleRate: 192000,
        maxBitDepth: 24,
        supportedRates: [44100, 48000, 96000, 192000],
        supportedBitDepths: [16, 24, 32],
        ...over.pcm,
      },
      dsd: { dop: false, native: false, supportedRates: [], ...over.dsd },
      mqa: {
        supported: false,
        renderer: false,
        decoder: false,
        fullDecoder: false,
      },
      channelCount: 2,
    },
    isConnected: true,
  }) as DACInfo;

describe("isDSDCapable", () => {
  it("true kalau native DSD", () => {
    expect(isDSDCapable(makeDAC({ dsd: { native: true } }))).toBe(true);
  });

  it("true kalau hanya DoP", () => {
    expect(isDSDCapable(makeDAC({ dsd: { dop: true } }))).toBe(true);
  });

  it("false kalau keduanya tidak", () => {
    expect(isDSDCapable(makeDAC({}))).toBe(false);
  });
});

describe("getMaxDSDRate", () => {
  it("ambil rate tertinggi", () => {
    expect(
      getMaxDSDRate(makeDAC({ dsd: { supportedRates: [64, 128, 256] } })),
    ).toBe(256);
  });

  it("null kalau tidak ada rate didukung", () => {
    expect(getMaxDSDRate(makeDAC({}))).toBeNull();
  });

  it("rate tidak berurutan tetap diambil maksimumnya", () => {
    expect(
      getMaxDSDRate(makeDAC({ dsd: { supportedRates: [512, 64, 256] } })),
    ).toBe(512);
  });
});

describe("isHiResCapable", () => {
  it("true kalau sample rate > 48 kHz", () => {
    expect(isHiResCapable(makeDAC({ pcm: { maxSampleRate: 96000 } }))).toBe(
      true,
    );
  });

  it("true kalau bit depth > 16", () => {
    expect(isHiResCapable(makeDAC({ pcm: { maxBitDepth: 24 } }))).toBe(true);
  });

  it("false untuk DAC CD-quality murni (48k/16)", () => {
    expect(
      isHiResCapable(makeDAC({ pcm: { maxSampleRate: 48000, maxBitDepth: 16 } })),
    ).toBe(false);
  });

  it("48k dengan 24-bit tetap hi-res", () => {
    expect(
      isHiResCapable(makeDAC({ pcm: { maxSampleRate: 48000, maxBitDepth: 24 } })),
    ).toBe(true);
  });
});

describe("canDoBitPerfect", () => {
  it("true kalau rate dan depth sama-sama didukung", () => {
    expect(canDoBitPerfect(makeDAC({}), 96000, 24)).toBe(true);
  });

  it("false kalau rate didukung tapi depth tidak", () => {
    const dac = makeDAC({ pcm: { supportedBitDepths: [16] } });
    expect(canDoBitPerfect(dac, 96000, 24)).toBe(false);
  });

  it("false kalau depth didukung tapi rate tidak", () => {
    const dac = makeDAC({ pcm: { supportedRates: [44100, 48000] } });
    expect(canDoBitPerfect(dac, 192000, 24)).toBe(false);
  });

  // PENTING: 44.1k keluarga sering hilang dari supportedRates pada DAC murah.
  // Bit-perfect untuk file CD harus terdeteksi dengan benar.
  it("44.1k/16 CD harus bit-perfect pada DAC yang mendukungnya", () => {
    expect(canDoBitPerfect(makeDAC({}), 44100, 16)).toBe(true);
  });

  // REGRESI: DAC yang tidak mendukung 44.1k tidak boleh dianggap bit-perfect,
  // walau resampling ke 48k akan "berhasil" secara teknis.
  it("REGRESI: DAC tanpa 44.1k menolak file 44.1k", () => {
    const dac = makeDAC({ pcm: { supportedRates: [48000, 96000] } });
    expect(canDoBitPerfect(dac, 44100, 16)).toBe(false);
  });
});

describe("recommendDSDMode", () => {
  it("native kalau native didukung untuk rate itu", () => {
    const dac = makeDAC({ dsd: { native: true, supportedRates: [64, 128] } });
    expect(recommendDSDMode(dac, 128 as DSDRate)).toBe("native");
  });

  it("dop kalau native tidak mendukung rate itu tapi DoP ada", () => {
    const dac = makeDAC({ dsd: { native: true, dop: true, supportedRates: [64] } });
    expect(recommendDSDMode(dac, 256 as DSDRate)).toBe("dop");
  });

  it("off kalau tidak ada dukungan DSD", () => {
    expect(recommendDSDMode(makeDAC({}), 64 as DSDRate)).toBe("off");
  });

  // REGRESI: DAC tanpa DoP dan native tidak mendukung rate -> harus off,
  // bukan dop yang akan gagal di lapisan native.
  it("REGRESI: dop tanpa DoP nyata tidak dipilih", () => {
    const dac = makeDAC({ dsd: { native: false, dop: false, supportedRates: [] } });
    expect(recommendDSDMode(dac, 64 as DSDRate)).toBe("off");
  });

  it("native menang atas dop saat keduanya tersedia", () => {
    const dac = makeDAC({ dsd: { native: true, dop: true, supportedRates: [64] } });
    expect(recommendDSDMode(dac, 64 as DSDRate)).toBe("native");
  });
});
