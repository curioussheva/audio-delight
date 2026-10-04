/**
 * Geometri FloatingPlayer — satu sumber kebenaran, dipakai bersama oleh
 * tab layout (posisi) dan screen list (padding bawah).
 *
 * Sebelumnya ada 3 nilai acak yang harus selalu sinkron tapi tidak saling
 * tahu: `bottom: 70` di tabs/_layout.tsx, `BOTTOM_COMPENSATION` di library.tsx,
 * dan padding 100/120/150 tersebar di 7 komponen library. FloatingPlayer bisa
 * menutupi tab bar karena `70` hanya tebakan tinggi tab bar.
 *
 * Tinggi tab bar diambil dari useBottomTabBarHeight() react-navigation
 * (sudah memasukkan safe-area inset), bukan angka hardcoded.
 */

/** Tinggi total FloatingPlayer: accent 2.5 + progress 1.5 + content 68 */
export const FLOATING_PLAYER_HEIGHT = 72;

/**
 * Padding bawah yang harus dimiliki content list supaya item terakhir
 * tidak tertutup FloatingPlayer + tab bar.
 */
export const FLOATING_PLAYER_CLEARANCE = FLOATING_PLAYER_HEIGHT + 16;
