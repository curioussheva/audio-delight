import { Song } from "./audio";

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
