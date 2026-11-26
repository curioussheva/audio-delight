// Tes properti sumber (bukan hitungan render — repo tanpa testing-library):
// kedua subscreen layar Audio harus memenuhi prinsip render per-node:
// - BitPerfect: tick poll yang diam tidak membangunkan siapa pun; verdict,
//   perangkat, dan laju masing-masing hanya update node-nya; tombol DSP memo
// - Solfeggio: tick slider / ganti template / ganti binaural hanya
//   me-render ulang seksi yang bersangkutan; shell tidak melanggan store
import { readFileSync } from "fs";
import { resolve } from "path";

const read = (rel: string) => readFileSync(resolve(__dirname, rel), "utf8");

describe("bitperfect subscreen node render", () => {
  test("BitPerfectSubscreen memo; leaf memo dengan prop primitif", () => {
    const src = read(
      "../../../features/equalizer/components/BitPerfectSubscreen.tsx",
    );
    expect(src).toContain(
      "export const BitPerfectSubscreen = memo(function BitPerfectSubscreen",
    );
    expect(src).toContain("const VerdictRows = memo(function VerdictRows");
    expect(src).toContain(
      "const OutputDeviceRow = memo(function OutputDeviceRow",
    );
    expect(src).toContain(
      "const StreamRateRows = memo(function StreamRateRows",
    );
    // leaf hanya menerima primitif — bukan objek status/perangkat utuh
    expect(src).toContain("label={verdict.label}");
    expect(src).toContain("note={verdict.note}");
    expect(src).toContain("tone={verdict.tone}");
    expect(src).toContain("deviceName={deviceName}");
    expect(src).toContain("deviceType={deviceType}");
    expect(src).toContain("sampleRate={sampleRate}");
    expect(src).toContain("hardwareRate={hardwareRate}");
    expect(src).not.toContain("status={status}");
    expect(src).not.toContain("currentDevice={currentDevice}");
  });

  test("BitPerfect: shell memiliki kedua hook sekali; tombol DSP bukan di shell", () => {
    const src = read(
      "../../../features/equalizer/components/BitPerfectSubscreen.tsx",
    );
    // satu instance tiap hook — poller native tidak digandakan ke leaf
    expect(src.match(/useBitPerfectStatus\(\)/g)).toHaveLength(1);
    expect(src.match(/useAudioOutput\(\)/g)).toHaveLength(1);
    // setAudioMode dimiliki tombol bersama, bukan shell — cek body shell
    // tanpa komentar (header file menyebut nama itu sebagai penjelasan)
    const shellBody = src
      .slice(
        src.indexOf("export const BitPerfectSubscreen"),
        src.indexOf("interface VerdictRowsProps"),
      )
      .replace(/\/\/.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    expect(shellBody).not.toContain("setAudioMode");
    expect(src).toContain("<SwitchToDspButton />");
  });

  test("SwitchToDspButton memo tanpa prop + handler stabil", () => {
    const src = read(
      "../../../features/equalizer/components/SwitchToDspButton.tsx",
    );
    expect(src).toContain(
      "export const SwitchToDspButton = memo(function SwitchToDspButton",
    );
    expect(src).toContain("usePlayerStore((s) => s.setAudioMode)");
    expect(src).toContain("const handlePress = useCallback");
    expect(src).toContain("onPress={handlePress}");
  });

  test("useAudioOutput: codec Bluetooth hanya setState bila berubah", () => {
    // POLL-1: guard pindah dari hook ke audioOutputStore (satu poller
    // bersama); hook kini selector tipis.
    const src = read("../../../features/hardware/store/audioOutputStore.ts");
    expect(src).toContain("sameBluetoothCodec");
    expect(src).toContain(
      "sameBluetoothCodec(prev.bluetoothCodec, codec) ? prev.bluetoothCodec : codec",
    );
    expect(src).toContain("prev.deviceName === next.deviceName");
    expect(src).toContain("prev.address === next.address");
  });
});

describe("solfeggio subscreen node render", () => {
  test("SolfeggioSubscreen memo; shell tidak melanggan playerStore", () => {
    const src = read(
      "../../../features/equalizer/components/SolfeggioSubscreen.tsx",
    );
    expect(src).toContain(
      "export const SolfeggioSubscreen = memo(function SolfeggioSubscreen",
    );
    // shell = dari export sampai kartu pertama; tanpa komentar
    const shellBody = src
      .slice(
        src.indexOf("export const SolfeggioSubscreen"),
        src.indexOf("const TemplateCard = memo"),
      )
      .replace(/\/\/.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    expect(shellBody).not.toContain("usePlayerStore");
    expect(shellBody).not.toContain("setAudioMode");
    expect(src).toContain("<SwitchToDspButton />");
  });

  test("Solfeggio: tiap seksi memo dan memiliki selector-nya sendiri", () => {
    const src = read(
      "../../../features/equalizer/components/SolfeggioSubscreen.tsx",
    );
    for (const card of [
      "TemplateCard",
      "FrequencyCard",
      "TuningCard",
      "IntensityCard",
      "BrainwaveCard",
      "HeadphoneCard",
    ]) {
      expect(src).toContain(`const ${card} = memo(function ${card}`);
    }
    // TemplateCard: hanya templateId + setter-nya
    const templateBody = src.slice(
      src.indexOf("const TemplateCard = memo"),
      src.indexOf("const FrequencyCard = memo"),
    );
    expect(templateBody).toContain(
      "usePlayerStore((s) => s.solfeggioTemplateId)",
    );
    expect(templateBody).toContain(
      "usePlayerStore((s) => s.setSolfeggioTemplate)",
    );
    expect(templateBody).not.toContain("resonanceIntensity");
    expect(templateBody).not.toContain("brainwaveFreq");
    // FrequencyCard: hanya freq + setter + persist
    const freqBody = src.slice(
      src.indexOf("const FrequencyCard = memo"),
      src.indexOf("const TuningCard = memo"),
    );
    expect(freqBody).toContain("usePlayerStore((s) => s.solfeggioFreq)");
    expect(freqBody).toContain("usePlayerStore((s) => s.setSolfeggioFreq)");
    expect(freqBody).toContain("onSlidingComplete={handleSlidingComplete}");
    expect(freqBody).not.toContain("resonanceIntensity");
    // IntensityCard: hanya intensitas + setter + persist
    const intensityBody = src.slice(
      src.indexOf("const IntensityCard = memo"),
      src.indexOf("const BrainwaveCard = memo"),
    );
    expect(intensityBody).toContain(
      "usePlayerStore((s) => s.resonanceIntensity)",
    );
    expect(intensityBody).toMatch(
      /usePlayerStore\(\s*\(s\) => s\.setResonanceIntensity,?\s*\)/,
    );
    expect(intensityBody).toContain(
      "onSlidingComplete={handleSlidingComplete}",
    );
    expect(intensityBody).not.toContain("solfeggioFreq");
    expect(intensityBody).not.toContain("brainwaveFreq");
  });

  test("BrainwaveCard: peringatan 0% pakai selector boolean, bukan nilai intensitas", () => {
    const src = read(
      "../../../features/equalizer/components/SolfeggioSubscreen.tsx",
    );
    const brainwaveBody = src.slice(
      src.indexOf("const BrainwaveCard = memo"),
      src.indexOf("const HeadphoneCard = memo"),
    );
    expect(brainwaveBody).toContain("usePlayerStore((s) => s.brainwaveFreq)");
    expect(brainwaveBody).toContain(
      "usePlayerStore((s) => s.setBrainwaveFreq)",
    );
    expect(brainwaveBody).toContain(
      "usePlayerStore((s) => s.resonanceIntensity === 0)",
    );
    expect(brainwaveBody).toContain(
      "{intensityIsZero && brainwaveFreq > 0 && (",
    );
    expect(brainwaveBody).not.toContain("resonanceIntensity * 100");
  });

  test("Solfeggio: TuningCard + HeadphoneCard statis (anak memo yang punya langganan sendiri)", () => {
    const src = read(
      "../../../features/equalizer/components/SolfeggioSubscreen.tsx",
    );
    const tuningBody = src.slice(
      src.indexOf("const TuningCard = memo"),
      src.indexOf("const IntensityCard = memo"),
    );
    expect(tuningBody).toContain("<TuningControl />");
    expect(tuningBody).not.toContain("usePlayerStore");
    const headphoneBody = src.slice(src.indexOf("const HeadphoneCard = memo"));
    expect(headphoneBody).toContain("<HeadphoneSection inCard />");
    expect(headphoneBody).not.toContain("usePlayerStore");
  });
});
