import {
  DEFAULT_VISIBLE_SECTIONS,
  parseVisibleSections,
  serializeVisibleSections,
} from "@/features/equalizer/utils/visibleSections";

describe("parseVisibleSections", () => {
  it("default baru (semua tampil, 2026-11-20): kelima seksi", () => {
    expect(DEFAULT_VISIBLE_SECTIONS).toEqual({
      graph: true,
      effects: true,
      mixer: true,
      headphone: true,
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

  it("format lama (tanpa version) dimigrasi ke default baru", () => {
    // Pengguna lama menyimpan {"graph":false,...} tanpa version — payload
    // lama sengaja tidak dikenali supaya default baru mencapai mereka.
    expect(
      parseVisibleSections(
        '{"graph":false,"effects":false,"mixer":false,"headphone":false,"preset":false}',
      ),
    ).toEqual(DEFAULT_VISIBLE_SECTIONS);
    expect(
      parseVisibleSections('{"graph":true,"effects":true,"mixer":true}'),
    ).toEqual(DEFAULT_VISIBLE_SECTIONS);
  });

  it("version yang tidak dikenali jatuh ke default", () => {
    expect(
      parseVisibleSections(
        '{"version":1,"sections":{"graph":false,"effects":false,"mixer":false,"headphone":false,"preset":false}}',
      ),
    ).toEqual(DEFAULT_VISIBLE_SECTIONS);
    expect(
      parseVisibleSections(
        '{"version":4,"sections":{"graph":false,"effects":false,"mixer":false,"headphone":false,"preset":false}}',
      ),
    ).toEqual(DEFAULT_VISIBLE_SECTIONS);
    expect(parseVisibleSections('{"version":3}')).toEqual(
      DEFAULT_VISIBLE_SECTIONS,
    );
  });

  it("payload v2 dimigrasi ke default baru (semua tampil)", () => {
    // v2 adalah version lama sejak 2026-11-20 — payload-nya tidak lagi
    // dikenali, supaya default semua-tampil mencapai pengguna lama juga.
    expect(
      parseVisibleSections(
        '{"version":2,"sections":{"graph":true,"effects":true,"mixer":false,"headphone":false,"preset":false}}',
      ),
    ).toEqual(DEFAULT_VISIBLE_SECTIONS);
    expect(
      parseVisibleSections(
        '{"version":2,"sections":{"graph":false,"effects":false,"mixer":false,"headphone":false,"preset":false}}',
      ),
    ).toEqual(DEFAULT_VISIBLE_SECTIONS);
  });

  it("v3: memakai nilai tersimpan dan melengkapi kunci yang hilang", () => {
    expect(
      parseVisibleSections(
        '{"version":3,"sections":{"graph":false}}',
      ),
    ).toEqual({
      graph: false,
      effects: true,
      mixer: true,
      headphone: true,
      preset: true,
    });
    expect(
      parseVisibleSections(
        '{"version":3,"sections":{"graph":false,"effects":false,"mixer":false,"headphone":false,"preset":false}}',
      ),
    ).toEqual({
      graph: false,
      effects: false,
      mixer: false,
      headphone: false,
      preset: false,
    });
  });

  it("v3: hanya boolean yang dipakai, sisanya default", () => {
    expect(
      parseVisibleSections(
        '{"version":3,"sections":{"graph":0,"preset":"ya"}}',
      ),
    ).toEqual({
      graph: true,
      effects: true,
      mixer: true,
      headphone: true,
      preset: true,
    });
  });
});

describe("serializeVisibleSections", () => {
  it("round-trip: serialize lalu parse kembali sama", () => {
    const sections = {
      graph: false,
      effects: true,
      mixer: true,
      headphone: true,
      preset: true,
    };
    expect(parseVisibleSections(serializeVisibleSections(sections))).toEqual(
      sections,
    );
  });

  it("menulis format v3", () => {
    expect(
      JSON.parse(serializeVisibleSections(DEFAULT_VISIBLE_SECTIONS)),
    ).toEqual({ version: 3, sections: DEFAULT_VISIBLE_SECTIONS });
  });
});
