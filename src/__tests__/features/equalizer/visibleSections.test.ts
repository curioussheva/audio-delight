import {
  DEFAULT_VISIBLE_SECTIONS,
  parseVisibleSections,
} from "@/features/equalizer/utils/visibleSections";

describe("parseVisibleSections", () => {
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
    });
    expect(
      parseVisibleSections(
        '{"graph":false,"effects":false,"mixer":false}',
      ),
    ).toEqual({ graph: false, effects: false, mixer: false });
  });

  it("hanya boolean false yang mematikan seksi", () => {
    expect(parseVisibleSections('{"graph":0}')).toEqual({
      graph: true,
      effects: true,
      mixer: true,
    });
  });
});
