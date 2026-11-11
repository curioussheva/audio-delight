import {
  GO_BACK_DEBOUNCE_MS,
  LIBRARY_FALLBACK,
  resetSafeGoBackDebounce,
  safeGoBack,
  type BackCapableRouter,
} from "@/shared/utils/navigation";

function makeRouter(canGoBack: boolean): BackCapableRouter & {
  backCalls: number;
  replacedWith: string | null;
} {
  const router = {
    backCalls: 0,
    replacedWith: null as string | null,
    canGoBack: () => canGoBack,
    back: () => {
      router.backCalls += 1;
    },
    replace: (href: string) => {
      router.replacedWith = href;
    },
  };
  return router;
}

describe("safeGoBack", () => {
  let now = 1_000_000;
  let nowSpy: jest.SpyInstance<number, []>;

  beforeEach(() => {
    resetSafeGoBackDebounce();
    now = 1_000_000;
    nowSpy = jest.spyOn(Date, "now").mockImplementation(() => now);
  });

  afterEach(() => {
    nowSpy.mockRestore();
  });

  it("memanggil back() kalau ada history", () => {
    const router = makeRouter(true);
    expect(safeGoBack(router)).toBe(true);
    expect(router.backCalls).toBe(1);
    expect(router.replacedWith).toBeNull();
  });

  it("fallback ke Library kalau tidak ada history", () => {
    const router = makeRouter(false);
    expect(safeGoBack(router)).toBe(true);
    expect(router.backCalls).toBe(0);
    expect(router.replacedWith).toBe(LIBRARY_FALLBACK);
  });

  it("memakai fallback kustom kalau diberikan", () => {
    const router = makeRouter(false);
    safeGoBack(router, "/(drawer)/settings");
    expect(router.replacedWith).toBe("/(drawer)/settings");
  });

  it("mengabaikan panggilan kedua dalam jendela debounce", () => {
    const router = makeRouter(true);
    expect(safeGoBack(router)).toBe(true);
    expect(safeGoBack(router)).toBe(false);
    expect(router.backCalls).toBe(1);
  });

  it("menerima panggilan lagi setelah jendela debounce lewat", () => {
    const router = makeRouter(true);
    expect(safeGoBack(router)).toBe(true);
    now += GO_BACK_DEBOUNCE_MS;
    expect(safeGoBack(router)).toBe(true);
    expect(router.backCalls).toBe(2);
  });

  it("debounce dibagi semua pemanggil (modul-level)", () => {
    const first = makeRouter(true);
    const second = makeRouter(false);
    expect(safeGoBack(first)).toBe(true);
    // Router berbeda, jendela sama: panggilan kedua tetap diabaikan.
    expect(safeGoBack(second)).toBe(false);
    expect(second.replacedWith).toBeNull();
  });
});
