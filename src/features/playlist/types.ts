// src/features/playlist/types.ts
import { Song } from "@/shared/types/audio";
import type { SmartPlaylistId } from "@/features/playlist/utils/smartPlaylists";

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  songs: Song[];
  songIds: string[]; // Untuk performa query
  createdAt: number;
  updatedAt: number;
  artwork?: string; // Dari lagu pertama atau custom
  songCount: number;
  duration: number; // Total durasi dalam detik
  // Smart playlist (virtual): true bila playlist ini dihitung live dari
  // library, bukan baris di tabel `playlists` — user tidak bisa
  // tambah/hapus lagu atau menghapus playlistnya.
  isSmart?: boolean;
}

/** Ringkasan satu smart playlist untuk baris daftar (hitung saja,
 *  tanpa memuat lagunya — dipakai PlaylistList). */
export interface SmartPlaylistSummary {
  id: SmartPlaylistId;
  name: string;
  description: string;
  count: number;
}

export interface CreatePlaylistDTO {
  name: string;
  description?: string;
  songIds?: string[];
}

export interface UpdatePlaylistDTO {
  name?: string;
  description?: string;
  songIds?: string[];
}
