/**
 * Tinggi tab bar — sumber kebenaran tunggal, tanpa useBottomTabBarHeight().
 *
 * useBottomTabBarHeight() membaca BottomTabBarHeightContext, yang hanya
 * di-provider DI DALAM screen navigator (BottomTabView.tsx). Komponen yang
 * me-render <Tabs> itu sendiri (tabs/_layout.tsx) ada DI LUAR provider itu,
 * jadi context-nya undefined dan hook-nya THROW:
 *
 *   Error: Couldn't find the bottom tab bar height. Are you inside a screen
 *   in Bottom Tab Navigator?
 *
 * Tinggi yang sama dipakai react-navigation sendiri (BottomTabBar.tsx):
 *   TABBAR_HEIGHT_UIKIT (49) + insets.bottom        — portrait, label atas
 *   TABBAR_HEIGHT_UIKIT_COMPACT (32) + insets.bottom — landscape/label samping
 * expo-router memakai variant default (uikit). Kami pakai 49 + insets.
 */
export const TAB_BAR_CONTENT_HEIGHT = 49;

/** Tinggi tab bar total (termasuk safe-area inset bawah). */
export const tabBarHeight = (bottomInset: number): number =>
  TAB_BAR_CONTENT_HEIGHT + bottomInset;
