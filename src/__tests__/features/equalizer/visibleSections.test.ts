import {
  DEFAULT_VISIBLE_SECTIONS,
  parseVisibleSections,
} from "@/features/equalizer/utils/visibleSections";

describe("parseVisibleSections", () => {
  it("default baru (declutter 2026-11-18): headphone + mixer tertutup", () => {
    expect(DEFAULT_VISIBLE_SECTIONS).toEqual({
      graph: true,
      effects: true,
      mixer: false,
      headphone: false,
      preset: true,
    });
  });

  it("mengembalikan default bila tidak ada nilai tersimpan", () => {
    expect(parseVisibleSections(null)).toEqual(DEFAULT_VISIBLE_SECTIONS);
    expect(parseVisibleSections("")).toEqual(DEFAULT_VISIBLE_SECTIONS);
  });

  it("mengembalikan default untuk JSON rusak atau bukan objek", () => {
    expect(parseVisibleSections("{bukan json")).toEqual(
      DEFAULT_VISIBLE_SECTIONS,
    );
    expect(parseVisibleSections('"teks"')).toEqual(DEFAULT_VISIBLE_SECTIONS);
    expect(parseVisibleSections("42")).toEqual(DEFAULT_VISIBLE_SECTIONS);
  });

  it("memakai nilai tersimpan dan melengkapi kunci yang hilang", () => {
    expect(parseVisibleSections('{"graph":false}')).toEqual({
      graph: false,
      effects: true,
      mixer: true,
      headphone: true,
      preset: true,
    });
    expect(
      parseVisibleSections(
        '{"graph":false,"effects":false,"mixer":false,"headphone":false,"preset":false}',
      ),
    ).toEqual({
      graph: false,
      effects: false,
      mixer: false,
      headphone: false,
      preset: false,
    });
  });

  it("kunci baru yang hilang (data lama) dianggap tampil", () => {
    // Nilai tersimpan sebelum headphone/preset ada: keduanya true.
    expect(parseVisibleSections('{"graph":true,"effects":true,"mixer":true}')).toEqual({
      graph: true,
      effects: true,
      mixer: true,
      headphone: true,
      preset: true,
    });
  });

  it("false eksplisit pada kunci baru dihormati", () => {
    expect(parseVisibleSections('{"headphone":false,"preset":false}')).toEqual({
      graph: true,
      effects: true,
      mixer: true,
      headphone: false,
      preset: false,
    });
  });

  it("hanya boolean false yang mematikan seksi", () => {
    expect(parseVisibleSections('{"graph":0}')).toEqual({
      graph: true,
      effects: true,
      mixer: true,
      headphone: true,
      preset: true,
    });
  });
});
