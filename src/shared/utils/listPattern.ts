// src/shared/utils/listPattern.ts
//
// U-P2-53: SATU keputusan tercatat — FlashList vs FlatList.
//
// Dulu tiap screen memilih sendiri tanpa alasan tercatat: Library memakai
// FlashList untuk lagu, sementara Playlist/Search/Equalizer memakai
// FlatList. Aturannya sekarang:
//
// - "flash-list" (default, daftar vertikal yang panjangnya tidak
//   terbatas — lagu, hasil pencarian, isi playlist): cell recycling +
//   windowing FlashList menjaga memori tetap datar untuk ribuan baris.
//   Syaratnya: daftar HARUS memegang scroll-nya sendiri (bukan di dalam
//   ScrollView vertikal — FlashList tidak bisa mengukur di sana).
//   (FlashList v2 yang dipakai repo ini mengukur item otomatis — tidak
//   ada lagi `estimatedItemSize` seperti di v1; jangan mengada-adakannya.)
// - "flat-list" (pengecualian): daftar horizontal, daftar bersarang di
//   dalam ScrollView vertikal, atau daftar kecil yang jumlahnya memang
//   terbatas (mis. ~10 band mixer, daftar playlist pengguna + section
//   header). Di sana recycling FlashList tidak memberi apa-apa, sementara
//   FlatList lebih sederhana dan tidak mengeluh soal nested VirtualizedList.
//
// `ScreenList` memakai fungsi ini — pemanggil cukup mendeklarasikan
// bentuk daftarnya (`horizontal` / `nestedInScrollView` / `boundedSmall`)
// dan komponen memilih implementasinya. Jangan memilih manual di screen.
export type ListKind = "flash-list" | "flat-list";

export interface ListShape {
  /** Daftar horizontal (mis. band mixer). */
  horizontal?: boolean;
  /** Daftar bersarang di dalam ScrollView vertikal. */
  nestedInScrollView?: boolean;
  /** Jumlah item memang kecil/terbatas (bukan ribuan baris). */
  boundedSmall?: boolean;
}

export function chooseListKind(shape: ListShape): ListKind {
  if (shape.horizontal) return "flat-list";
  if (shape.nestedInScrollView) return "flat-list";
  if (shape.boundedSmall) return "flat-list";
  return "flash-list";
}
