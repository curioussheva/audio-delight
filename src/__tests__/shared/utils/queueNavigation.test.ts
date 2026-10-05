import {
  NATIVE_STATUS,
  RESTART_THRESHOLD_SECONDS,
  findSongByUri,
  isPlayingFromStatus,
  progressPercent,
  shouldCorrectDuration,
  shouldRestartInsteadOfPrevious,
  uriMatches,
  validateQueueIndex,
} from "@/shared/utils/queueNavigation";

describe("queueNavigation - status native", () => {
  it("hanya PLAYING yang dianggap playing", () => {
    expect(isPlayingFromStatus(NATIVE_STATUS.PLAYING)).toBe(true);
    expect(isPlayingFromStatus(NATIVE_STATUS.PAUSED)).toBe(false);
    expect(isPlayingFromStatus(NATIVE_STATUS.IDLE)).toBe(false);
    expect(isPlayingFromStatus(NATIVE_STATUS.STOPPED)).toBe(false);
  });

  it("status di luar jangkauan tidak dianggap playing", () => {
    expect(isPlayingFromStatus(-1)).toBe(false);
    expect(isPlayingFromStatus(99)).toBe(false);
  });
});

describe("queueNavigation - previous", () => {
  it("mengulang lagu kalau sudah lewat ambang", () => {
    expect(shouldRestartInsteadOfPrevious(RESTART_THRESHOLD_SECONDS + 0.1)).toBe(true);
    expect(shouldRestartInsteadOfPrevious(60)).toBe(true);
  });

  it("pindah ke lagu sebelumnya kalau masih di awal", () => {
    expect(shouldRestartInsteadOfPrevious(0)).toBe(false);
    expect(shouldRestartInsteadOfPrevious(RESTART_THRESHOLD_SECONDS)).toBe(false);
  });
});

describe("queueNavigation - validasi indeks", () => {
  it("menerima indeks yang sah", () => {
    expect(validateQueueIndex(0, 48)).toBe(0);
    expect(validateQueueIndex(47, 48)).toBe(47);
  });

  it("menolak indeks di luar jangkauan", () => {
    expect(validateQueueIndex(48, 48)).toBeNull();
    expect(validateQueueIndex(-1, 48)).toBeNull();
    expect(validateQueueIndex(100, 48)).toBeNull();
  });

  it("menolak queue kosong", () => {
    expect(validateQueueIndex(0, 0)).toBeNull();
  });

  it("menolak indeks bukan bilangan bulat", () => {
    expect(validateQueueIndex(1.5, 48)).toBeNull();
    expect(validateQueueIndex(NaN, 48)).toBeNull();
  });
});

describe("queueNavigation - pencocokan track aktif", () => {
  const queue = [
    { id: "1", uri: "content://media/external/audio/media/1000996840" },
    { id: "2", uri: "content://media/external/audio/media/1000984680" },
    { id: "3", uri: "content://media/external/audio/media/1000996759" },
  ];

  it("menemukan song lewat URI", () => {
    const found = findSongByUri(queue, "content://media/external/audio/media/1000984680");
    expect(found?.id).toBe("2");
  });

  it("mengembalikan null kalau URI tidak ada di queue", () => {
    expect(findSongByUri(queue, "content://media/external/audio/media/999")).toBeNull();
  });

  it("mengembalikan null untuk URI kosong/null", () => {
    expect(findSongByUri(queue, null)).toBeNull();
    expect(findSongByUri(queue, undefined)).toBeNull();
    expect(findSongByUri(queue, "")).toBeNull();
  });

  it("cocok lewat URI, bukan indeks - penting saat shuffle aktif", () => {
    // Saat shuffle menyala, indeks di store tidak sama dengan indeks native.
    // Kalau pencocokan memakai indeks, UI akan menampilkan lagu yang salah.
    const shuffled = [queue[2], queue[0], queue[1]];
    const found = findSongByUri(shuffled, "content://media/external/audio/media/1000996759");
    expect(found?.id).toBe("3");
  });

  // 🔥 REGRESI: auto-advance UI mati karena URI native (path cache) tidak
  // cocok dengan URI JS (content://). Log device 2026-10-05 17:12:
  //   [Player] 🎵 native track-ended event:
  //     /data/user/0/com.pristineaudio.app/cache/audio_725973120.flac
  //   [Player] 🎵 skip: uri event ≠ currentSong.uri
  //     (content://media/external/audio/media/1001007979)
  // ...padahal audio native sudah pindah ke trek berikutnya.
  it("menemukan song meskipun native mengirim path cache, bukan content://", () => {
    // Kotlin me-resolve 5 trek pertama ke path cache sebelum kasih ke native.
    // Nama file: audio_<javaStringHashCode(contentUri)>.<ext>
    const found = findSongByUri(
      queue,
      "/data/user/0/com.pristineaudio.app/cache/audio_104412633.flac",
    );
    expect(found?.id).toBe("1");
  });

  it("uriMatches: content:// JS vs path cache native = true", () => {
    expect(
      uriMatches(
        "content://media/external/audio/media/1000996840",
        "/data/user/0/com.pristineaudio.app/cache/audio_104412633.flac",
      ),
    ).toBe(true);
  });

  it("uriMatches: content:// vs content:// yang sama = true", () => {
    const uri = "content://media/external/audio/media/1000996840";
    expect(uriMatches(uri, uri)).toBe(true);
  });

  it("uriMatches: URI berbeda tidak cocok", () => {
    expect(
      uriMatches(
        "content://media/external/audio/media/1000996840",
        "/data/user/0/com.pristineaudio.app/cache/audio_999999999.flac",
      ),
    ).toBe(false);
  });

  it("uriMatches: null/undefined tidak pernah cocok", () => {
    expect(uriMatches(null, "content://x")).toBe(false);
    expect(uriMatches("content://x", null)).toBe(false);
    expect(uriMatches(null, null)).toBe(false);
    expect(uriMatches(undefined, undefined)).toBe(false);
  });
});

describe("queueNavigation - progress bar", () => {
  it("menghitung persentase normal", () => {
    expect(progressPercent(0, 100)).toBe(0);
    expect(progressPercent(30, 120)).toBeCloseTo(25, 5);
    expect(progressPercent(100, 100)).toBe(100);
  });

  it("menjaga dari duration 0 / tidak terbatas", () => {
    // Dulu ini menghasilkan "NaN%" atau "Infinity%" yang diabaikan RN.
    expect(progressPercent(10, 0)).toBe(0);
    expect(progressPercent(10, NaN)).toBe(0);
    expect(progressPercent(10, Infinity)).toBe(0);
    expect(progressPercent(10, -5)).toBe(0);
  });

  it("menjaga posisi dari nilai tidak masuk akal", () => {
    expect(progressPercent(NaN, 100)).toBe(0);
    expect(progressPercent(-5, 100)).toBe(0);
  });

  it("tidak pernah melewati 100 persen", () => {
    expect(progressPercent(200, 100)).toBe(100);
  });
});

describe("queueNavigation - koreksi duration", () => {
  it("mengoreksi kalau store masih 0", () => {
    expect(shouldCorrectDuration(0, 240)).toBe(true);
  });

  it("mengoreksi kalau selisihnya berarti", () => {
    // Durasi salah dari database dulu bertahan selamanya.
    expect(shouldCorrectDuration(240, 300)).toBe(true);
    expect(shouldCorrectDuration(240, 180)).toBe(true);
  });

  it("tidak mengoreksi kalau selisihnya pembulatan", () => {
    expect(shouldCorrectDuration(240, 240)).toBe(false);
    expect(shouldCorrectDuration(240, 240.5)).toBe(false);
  });

  it("tidak mengoreksi dengan durasi song yang tidak valid", () => {
    expect(shouldCorrectDuration(240, 0)).toBe(false);
    expect(shouldCorrectDuration(240, NaN)).toBe(false);
    expect(shouldCorrectDuration(240, -10)).toBe(false);
  });
});
