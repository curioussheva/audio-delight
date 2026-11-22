// Tes properti sumber (bukan hitungan render — repo tanpa testing-library):
// kedua subscreen layar Audio harus memenuhi prinsip render per-node:
// - BitPerfect: tick poll yang diam tidak membangunkan siapa pun; verdict,
//   perangkat, dan laju masing-masing hanya update node-nya; tombol DSP memo
// - Solfeggio: tick slider / ganti template / ganti binaural hanya
//   me-render ulang seksi yang bersangkutan; shell tidak melanggan store
import { readFileSync } from "fs";
import { resolve } from "path";

const read = (rel: string) =>
  readFileSync(resolve(__dirname, rel), "utf8");

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
    const src = read("../../../features/hardware/hooks/useAudioOutput.ts");
    expect(src).toContain("sameBluetoothCodec");
    expect(src).toContain(
      "sameBluetoothCodec(prev, codec) ? prev : codec",
    );
    expect(src).toContain(
      "prev.deviceName === next.deviceName",
    );
    expect(src).toContain("prev.address === next.address");
  });
});
