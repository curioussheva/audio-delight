import { Platform } from "react-native";

/**
 * U-P2-09: SATU font monospace untuk durasi di semua baris lagu
 * (SongListItem, AlbumGrid, ArtistList, FolderList, FileTypeList,
 * GenreList). Dulu ada dua ejaan — "Menlo"/"monospace" di lima tempat
 * vs "Courier New" di iOS di GenreList — sehingga durasi tampil
 * berbeda antar tab. Semua pemakai mengimpor konstanta ini, bukan
 * menulis Platform.OS sendiri.
 */
export const DURATION_FONT_FAMILY =
  Platform.OS === "ios" ? "Menlo" : "monospace";
