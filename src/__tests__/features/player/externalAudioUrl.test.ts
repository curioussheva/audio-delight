import {
  isExternalAudioUrl,
  songFromExternalAudioUrl,
} from "@/features/player/api/externalAudioUrl";

describe("isExternalAudioUrl", () => {
  it("file audio berekstensi dikenal -> true", () => {
    expect(
      isExternalAudioUrl("file:///storage/emulated/0/Music/lagu.flac"),
    ).toBe(true);
    expect(isExternalAudioUrl("file:///sdcard/Music/lagu.MP3")).toBe(true);
    expect(isExternalAudioUrl("file:///sdcard/Music/lagu.m4a")).toBe(true);
  });

  it("file tanpa ekstensi audio -> false", () => {
    expect(isExternalAudioUrl("file:///sdcard/Download/catatan.txt")).toBe(
      false,
    );
    expect(isExternalAudioUrl("file:///sdcard/Music/lagu")).toBe(false);
    expect(isExternalAudioUrl("file:///sdcard/Music/foto.jpg")).toBe(false);
  });

  it("content:// diterima (sudah difilter mime audio/* oleh sistem)", () => {
    expect(
      isExternalAudioUrl("content://media/external/audio/media/123"),
    ).toBe(true);
    expect(
      isExternalAudioUrl(
        "content://com.android.externalstorage.documents/document/primary%3AMusic%2Flagu.flac",
      ),
    ).toBe(true);
  });

  it("deep link app + skema lain diabaikan (urusan expo-router)", () => {
    expect(isExternalAudioUrl("pristineaudio://library")).toBe(false);
    expect(isExternalAudioUrl("https://example.com/lagu.mp3")).toBe(false);
    expect(isExternalAudioUrl(null)).toBe(false);
    expect(isExternalAudioUrl(undefined)).toBe(false);
    expect(isExternalAudioUrl("")).toBe(false);
  });
});

describe("songFromExternalAudioUrl", () => {
  it("judul dari nama file, ekstensi dibuang", () => {
    const song = songFromExternalAudioUrl(
      "file:///storage/emulated/0/Music/Lagu%20Bagus.flac",
    );
    expect(song.title).toBe("Lagu Bagus");
    expect(song.uri).toBe("file:///storage/emulated/0/Music/Lagu%20Bagus.flac");
    expect(song.id).toBe(
      "external:file:///storage/emulated/0/Music/Lagu%20Bagus.flac",
    );
    expect(song.duration).toBe(0);
  });

  it("tanpa nama file -> judul placeholder jujur", () => {
    const song = songFromExternalAudioUrl("content://media/external/audio/media/123");
    expect(song.title).toBe("Audio eksternal");
  });
});
