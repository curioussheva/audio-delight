import { chooseListKind } from "@/shared/utils/listPattern";

describe("chooseListKind (U-P2-53)", () => {
  it("default: daftar vertikal panjang -> flash-list", () => {
    expect(chooseListKind({})).toBe("flash-list");
  });

  it("horizontal -> flat-list (mixer band)", () => {
    expect(chooseListKind({ horizontal: true })).toBe("flat-list");
  });

  it("bersarang di ScrollView vertikal -> flat-list", () => {
    expect(chooseListKind({ nestedInScrollView: true })).toBe("flat-list");
  });

  it("daftar kecil/terbatas -> flat-list", () => {
    expect(chooseListKind({ boundedSmall: true })).toBe("flat-list");
  });

  it("kombinasi pengecualian tetap flat-list", () => {
    expect(
      chooseListKind({ horizontal: true, nestedInScrollView: true }),
    ).toBe("flat-list");
  });
});
