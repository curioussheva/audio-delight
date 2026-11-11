import {
  resolveOnboardingBack,
  shouldRedirectFromOnboarding,
} from "@/shared/utils/onboardingGuard";

describe("shouldRedirectFromOnboarding (U-P2-48)", () => {
  it("mengalihkan bila sudah onboarded dan tidak dibuka sengaja", () => {
    expect(shouldRedirectFromOnboarding(true, false)).toBe(true);
  });

  it("tidak mengalihkan bila dibuka sengaja (reopen=true)", () => {
    expect(shouldRedirectFromOnboarding(true, true)).toBe(false);
  });

  it("tidak mengalihkan bila belum onboarded", () => {
    expect(shouldRedirectFromOnboarding(false, false)).toBe(false);
    expect(shouldRedirectFromOnboarding(false, true)).toBe(false);
  });

  it("tidak mengalihkan selama status belum terbaca (null)", () => {
    expect(shouldRedirectFromOnboarding(null, false)).toBe(false);
  });
});

describe("resolveOnboardingBack (U-P2-48)", () => {
  it("menahan back selama submit", () => {
    expect(
      resolveOnboardingBack({ isSubmitting: true, alreadyOnboarded: false }),
    ).toBe("block");
    expect(
      resolveOnboardingBack({ isSubmitting: true, alreadyOnboarded: true }),
    ).toBe("block");
  });

  it("kembali ke Library bila onboarding dibuka lagi secara sengaja", () => {
    expect(
      resolveOnboardingBack({ isSubmitting: false, alreadyOnboarded: true }),
    ).toBe("go-library");
  });

  it("keluar aplikasi bila belum onboarded (tidak ada layar sebelumnya)", () => {
    expect(
      resolveOnboardingBack({ isSubmitting: false, alreadyOnboarded: false }),
    ).toBe("exit-app");
  });
});
