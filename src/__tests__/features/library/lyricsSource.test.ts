/**
 * L1: sumber lirik lokal (.lrc berdampingan).
 *
 * Yang dikunci di sini (murni + I/O ter-mock): penurunan path `.lrc`
 * dari path audio, prioritas synced > polos saat diubah jadi baris,
 * dan lazy-load (DB kosong → baca `.lrc` → cache ke DB). Pembacaan
 * file sungguhan di HP (termasuk apakah scoped storage Android 13+
 * mengizinkan baca `.lrc`) diverifikasi di device, bukan di sini.
 */
jest.mock("expo-file-system/legacy", () => ({
  getInfoAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
}));
jest.mock("expo-media-library", () => ({
  getAssetInfoAsync: jest.fn(),
}));
jest.mock("@/features/library/api/scanner", () => ({
  LibraryScanner: { updateMetadata: jest.fn() },
}));
jest.mock("@/features/library/store/libraryStore", () => ({
  useLibraryStore: { getState: jest.fn() },
}));

import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import {
  sidecarLrcPath,
  songLyricsToLines,
  readSidecarLrc,
  loadLyricsForSong,
  resolveAudioLocalPath,
} from "@/features/library/services/lyricsSource";
import { UNSYNCED_LYRIC_TIME } from "@/shared/utils/LrcParser";
import { LibraryScanner } from "@/features/library/api/scanner";
import { useLibraryStore } from "@/features/library/store/libraryStore";

const getInfoMock = FileSystem.getInfoAsync as jest.Mock;
const readMock = FileSystem.readAsStringAsync as jest.Mock;
const getAssetMock = MediaLibrary.getAssetInfoAsync as jest.Mock;
const updateMetadataMock = LibraryScanner.updateMetadata as jest.Mock;

const AUDIO_URI = "content://media/external/audio/media/123";
const LOCAL_PATH = "file:///storage/emulated/0/Music/song.mp3";
const LRC_TEXT = "[00:01.00]la\n[00:05.00]li";

describe("sidecarLrcPath", () => {
  it("folder sama, basename sama, ekstensi .lrc", () => {
    expect(sidecarLrcPath("/Music/Artist/song.mp3")).toBe(
      "/Music/Artist/song.lrc",
    );
  });

  it("nama multi-dot: hanya ekstensi terakhir diganti", () => {
    expect(sidecarLrcPath("/Music/song.v2.flac")).toBe("/Music/song.v2.lrc");
  });

  it("tanpa ekstensi / path kosong → null", () => {
    expect(sidecarLrcPath("/Music/song")).toBeNull();
    expect(sidecarLrcPath("")).toBeNull();
    expect(sidecarLrcPath(null)).toBeNull();
  });
});

describe("resolveAudioLocalPath", () => {
  beforeEach(() => jest.clearAllMocks());

  it("file:// diteruskan apa adanya (tanpa panggil MediaLibrary)", async () => {
    await expect(resolveAudioLocalPath(LOCAL_PATH)).resolves.toBe(LOCAL_PATH);
    expect(getAssetMock).not.toHaveBeenCalled();
  });

  it("content:// diselesaikan lewat MediaLibrary", async () => {
    getAssetMock.mockResolvedValue({ localUri: LOCAL_PATH, uri: AUDIO_URI });
    await expect(resolveAudioLocalPath(AUDIO_URI)).resolves.toBe(LOCAL_PATH);
    expect(getAssetMock).toHaveBeenCalledWith("123");
  });

  it("MediaLibrary gagal → null (tidak throw)", async () => {
    getAssetMock.mockRejectedValue(new Error("no asset"));
    await expect(resolveAudioLocalPath(AUDIO_URI)).resolves.toBeNull();
  });
});

describe("readSidecarLrc", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getAssetMock.mockResolvedValue({ localUri: LOCAL_PATH, uri: AUDIO_URI });
  });

  it("file .lrc ada → kembalikan teksnya", async () => {
    getInfoMock.mockResolvedValue({ exists: true, isDirectory: false });
    readMock.mockResolvedValue(LRC_TEXT);
    await expect(readSidecarLrc(AUDIO_URI)).resolves.toBe(LRC_TEXT);
    expect(getInfoMock).toHaveBeenCalledWith(
      "file:///storage/emulated/0/Music/song.lrc",
    );
  });

  it("file .lrc tidak ada → null (tanpa baca)", async () => {
    getInfoMock.mockResolvedValue({ exists: false });
    await expect(readSidecarLrc(AUDIO_URI)).resolves.toBeNull();
    expect(readMock).not.toHaveBeenCalled();
  });

  it("baca gagal (mis. scoped storage menolak) → null (tidak throw)", async () => {
    getInfoMock.mockResolvedValue({ exists: true, isDirectory: false });
    readMock.mockRejectedValue(new Error("denied"));
    await expect(readSidecarLrc(AUDIO_URI)).resolves.toBeNull();
  });
});

describe("songLyricsToLines", () => {
  it("synced diutamakan atas polos", () => {
    const lines = songLyricsToLines({
      lyrics: "polos",
      lyricsSynced: "[00:01.00]sync",
    });
    expect(lines).toEqual([{ time: 1000, text: "sync" }]);
  });

  it("synced rusak (tanpa timestamp) → jatuh ke polos", () => {
    const lines = songLyricsToLines({
      lyrics: "polos",
      lyricsSynced: "bukan lrc",
    });
    expect(lines).toEqual([{ time: UNSYNCED_LYRIC_TIME, text: "polos" }]);
  });

  it("hanya polos → baris unsynced", () => {
    expect(songLyricsToLines({ lyrics: "a\nb" })).toEqual([
      { time: UNSYNCED_LYRIC_TIME, text: "a" },
      { time: UNSYNCED_LYRIC_TIME, text: "b" },
    ]);
  });

  it("keduanya kosong → []", () => {
    expect(songLyricsToLines({})).toEqual([]);
    expect(songLyricsToLines({ lyrics: "  ", lyricsSynced: "" })).toEqual([]);
  });
});

describe("loadLyricsForSong", () => {
  const updateTrackMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useLibraryStore.getState as jest.Mock).mockReturnValue({
      updateTrack: updateTrackMock,
    });
    getAssetMock.mockResolvedValue({ localUri: LOCAL_PATH, uri: AUDIO_URI });
  });

  it("DB sudah punya lirik → null (tidak baca file)", async () => {
    const song: any = { id: "1", uri: AUDIO_URI, lyricsSynced: "[00:01.00]x" };
    await expect(loadLyricsForSong(song)).resolves.toBeNull();
    expect(readMock).not.toHaveBeenCalled();
  });

  it(".lrc ketemu → baris + cache ke DB dan store", async () => {
    getInfoMock.mockResolvedValue({ exists: true, isDirectory: false });
    readMock.mockResolvedValue(LRC_TEXT);
    const song: any = { id: "1", uri: AUDIO_URI };

    const loaded = await loadLyricsForSong(song);
    expect(loaded?.lines).toEqual([
      { time: 1000, text: "la" },
      { time: 5000, text: "li" },
    ]);
    expect(updateMetadataMock).toHaveBeenCalledWith("1", {
      lyricsSynced: LRC_TEXT,
    });
    expect(updateTrackMock).toHaveBeenCalledWith("1", {
      lyricsSynced: LRC_TEXT,
    });
  });

  it("tidak ada .lrc → null", async () => {
    getInfoMock.mockResolvedValue({ exists: false });
    const song: any = { id: "1", uri: AUDIO_URI };
    await expect(loadLyricsForSong(song)).resolves.toBeNull();
    expect(updateMetadataMock).not.toHaveBeenCalled();
  });

  it("L2: ditandai manual (editedFields) → null, .lrc tidak dibaca lagi", async () => {
    // File .lrc masih ada di disk — tapi user sudah menghapus / mengganti
    // lirik lewat menu Lirik, jadi lazy-load tidak boleh menghidupkannya.
    getInfoMock.mockResolvedValue({ exists: true, isDirectory: false });
    readMock.mockResolvedValue(LRC_TEXT);
    const song: any = {
      id: "1",
      uri: AUDIO_URI,
      editedFields: ["lyricsSynced"],
    };
    await expect(loadLyricsForSong(song)).resolves.toBeNull();
    expect(readMock).not.toHaveBeenCalled();
    expect(updateMetadataMock).not.toHaveBeenCalled();
  });
});
