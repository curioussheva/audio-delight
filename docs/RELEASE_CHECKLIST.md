# Daftar Persiapan Rilis — PristineAudio

> Dokumen ini **bertahap**, bukan program yang dieksekusi sekaligus. App masih
> tahap pengembangan ("fitur dulu, kualitas serius nanti", keputusan
> 2026-11-20). Kerjakan gerbang demi gerbang; Fase 3 hanya dimulai saat csheva
> menyatakan app sudah mature — trigger yang sama dengan ide branch production
> (total cleaning + minify R8).
>
> Legenda status: ✅ sudah ada / terverifikasi di repo · ⏳ belum dikerjakan ·
> ❓ belum terverifikasi — jangan dianggap beres.
>
> Angka dan persyaratan Play bisa berubah — cek versi terbaru di Play Console,
> jangan jadikan angka di dokumen ini sebagai fakta.

## Gerbang 0 — Freeze Trace 3 terbukti beres ⏳ (SEDANG DIKERJAKAN)

Ini blocker rilis nomor 1. Rilis dengan freeze JS 15–30 detik = ulasan jelek +
ANR di Android vitals. **Tidak ada item rilis lain yang lebih penting dari ini.**

- [ ] Logcat sesi drag widener ~20 detik tanpa freeze ≥ 10 detik
      (pembanding: log #12 maks 11,2 dtk; log #13 kontrol probe-OFF maks 15,7 dtk).
- [ ] Repro drag di APK Preview release (build `44846976066`, HEAD `530399fe3`)
      — memisahkan penyebab tooling dev (Metro) dari penyebab JS.
- [ ] Bila masih belum tertutup: rekaman DevTools Performance saat drag, atau
      `wchan` saat freeze live.
- [ ] Sesudah terjawab: cabut semua diagnostik sementara sekaligus
      (`grep DIAGNOSTIK SEMENTARA` — probe bridge + 5 titik log).

Status Trace 3 (21 Nov 2026): probe bridge **dibebaskan** — kontrol probe-OFF
(log #13) justru memburuk (round-trip widener 4,7 → 16,6 ms). Satu kandidat
gugur; pemisah berikut repro Preview release, lalu DevTools/wchan.
Laporan: `~/workspace/audit-chain-2026-11-18/logcat-2026-11-21-0621-analysis.md`.

## Fase 1 — Kerjakan dulu (murah + berdampak)

### 1. Pelaporan crash dan ANR + simbol native ⏳

- [ ] Pasang **Firebase Crashlytics** (rekomendasi buat solo dev: gratis,
      mendukung NDK, paling sedikit gesekan). Sentry alternatif yang setara.
- [ ] `debugSymbolLevel SYMBOL_TABLE` ✅ **sudah ada**
      (`android/app/build.gradle:62`).
- [ ] Pastikan simbol native terunggah **per rilis**; simpan `mapping`/symbols
      tiap `versionCode`. Tanpa ini crash C++ muncul sebagai alamat mentah.
- [ ] Pantau Android vitals di Play Console (crash-free, ANR — cek angka
      ambang terbaru di Play Console, jangan pakai angka dari dokumen ini).

### 2. Tombol "Kirim laporan" di app ⏳

- [ ] Tombol di app yang mengekspor ke berkas yang bisa dibagikan:
      ring-buffer log, versi build, status jalur audio (mode, laju, perangkat),
      counter XRun.
- [ ] Alasan: penguji publik tidak akan kirim logcat. Ini menggantikan
      banyak tebakan seperti analisis logcat manual.
- [ ] Counter XRun: `EngineStats` ✅ sudah ada
      (`android/app/src/main/cpp/core/AudioEngine.h`,
      `AudioMetrics.cpp`) — tinggal diekspos ke laporan.

### 3. Penanda build di log startup ⏳

- [ ] Tambah `[BOOT] build=… dev=…` di log startup supaya analisis tidak
      bergantung pada tebakan HEAD/bundle (pelajaran log #11: bundle lama
      tidak terdeteksi sampai dicek markernya).

## Fase 2 — Checklist gangguan manual ⏳

Paling sering lolos dari tes otomatis. Centang satu per satu dengan perangkat
nyata (POCO M6 csheva).

- [ ] Panggilan masuk saat memutar (audio focus direbut lalu kembali).
- [ ] App lain meminta audio focus (mis. video/voice note).
- [ ] Cabut headset saat memutar → audio berhenti/beralih dengan benar.
- [ ] Colok headset / DAC USB saat memutar.
- [ ] Bluetooth putus lalu sambung lagi saat memutar.
- [ ] Geser app dari recents saat memutar (playback service bertahan?).
- [ ] Matikan proses lalu buka lagi (antrean + posisi pulih?).
- [ ] Berkas dihapus atau dipindah saat sedang diputar.
- [ ] Berkas 0 byte, korup, atau laju tidak lazim (8 kHz, 352,8 kHz, 768 kHz).
- [ ] Berkas mono, 5.1, dan tag metadata aneh.
- [ ] Ganti mode (bit-perfect ↔ DSP ↔ Solfeggio) saat memutar.
- [ ] Layar mati 30 menit (Doze) saat memutar.
- [ ] Penyimpanan hampir penuh saat scan / pemutaran.
- [ ] Izin (media audio, notifikasi) dicabut dari Pengaturan lalu app dibuka.

## Fase 3 — NANTI, saat app dinyatakan mature

### Matriks perangkat nyata ⏳

- [ ] Minimal 4 perangkat: POCO M6 csheva, satu Pixel/AOSP, satu Samsung,
      satu Xiaomi/HyperOS. OEM agresif mematikan proses latar = penyebab
      "musik berhenti sendiri" paling umum.
- [ ] DAC USB nyata (CM108 csheva + DAC UAC2 bila sudah dibeli).
- [ ] Bluetooth: SBC / AAC / LDAC.
- [ ] **Android Auto: TIDAK MASUK DAFTAR** — sudah diputuskan SKIP
      (keputusan csheva 2026-11-20, usulan 9 dari 10 deep insight).

### Soak test ⏳

- [ ] Putar playlist campuran 4–8 jam; pantau tiap 30 menit:
      `adb shell dumpsys meminfo com.pristineaudio.app`
      (pertumbuhan memori), jumlah XRun (`EngineStats` / `dumpsys
      media.audio_flinger`), jumlah thread. Kebocoran lambat hanya terlihat
      di sini.

### Baterai dan termal ⏳

- [ ] Putar 1 jam layar mati, lalu `adb shell dumpsys batterystats`
      (wake lock, CPU). Pastikan idle-close dan wake lock berbatas benar-benar
      menurunkan konsumsi.

### Pre-launch report / Firebase Test Lab ⏳

- [ ] Robo test di perangkat nyata: menangkap crash saat startup, izin, dan
      masalah 16 KB tanpa tes manual.

### Rilis bertahap di Play ⏳

- [ ] Internal testing → closed testing → staged rollout
      (1% → 5% → 20% → 100%) dengan gerbang vitals di tiap tahap.
- [ ] Akun pengembang pribadi yang baru biasanya **wajib closed test dengan
      sejumlah penguji selama beberapa hari sebelum produksi** — cek syarat
      terbaru di Play Console sekarang, karena itu menentukan jadwal.
- [ ] Rencana mundur: hentikan rollout, bukan perbaiki cepat tanpa tes.
- [ ] Pantau ulasan 48 jam pertama tiap tahap.

### Tanda tangan dan AAB ⏳

- [ ] Pakai Play App Signing; cadangkan keystore upload di luar repo.
- [ ] Uji unggahan `.aab` sebelum hari rilis (`./gradlew bundleRelease`).
      Jangan baru pertama kali membuat AAB di hari rilis.

### Kepatuhan ⏳

- [ ] Formulir Data safety + kebijakan privasi.
- [ ] Pembersihan izin (sudah — verifikasi ulang sebelum rilis).
- [ ] Lisensi: layar "Lisensi sumber terbuka" di app (Oboe Apache-2,
      pustaka RN — `license-checker` mengotomatiskan sisi JS).
- [ ] FFmpeg (LGPL): harus dibangun **tanpa** flag GPL/nonfree dan ditautkan
      **dinamis**.
      - Linking dinamis ✅ terverifikasi: `android/app/src/main/cpp/CMakeLists.txt`
        mengimpor `libavcodec.so` / `libavformat.so` / `libavutil.so` sebagai
        shared library (baris ~140–146).
      - Flag GPL/nonfree ❓ **belum terverifikasi**: `scripts/build-ffmpeg-android.sh`
        mendelegasikan ke `ffmpeg-android-maker` (di-clone saat build);
        flag configure hidup di repo maker tersebut, bukan di repo ini.
        Verifikasi dari `scripts/ffmpeg/build.sh` hasil clone / hasil build
        sebelum rilis.

### Otomasi rilis ⏳

- [ ] `versionCode` otomatis dari nomor run CI.
- [ ] Tag git per rilis + changelog tersimpan.
- [ ] Penguji audiophile: komunitas kecil dengan DAC beragam; formulir
      pendek (perangkat, jalur USB/BT/jack, mode) + satu klik "Kirim laporan"
      (lihat Fase 1.2).

## Gerbang CI / kualitas (harus hijau sebelum rilis)

Perintah siap pakai (dari root repo):

```sh
npx tsc --noEmit
npx jest
pnpm lint:check
```

- [ ] `tsc` 0 error, `jest` lolos, linter hijau.
      **Linter repo ini adalah oxlint** (`pnpm lint:check`) — BUKAN eslint.
- [ ] Job warning ketat C++ ✅ **sudah ada**: `PRISTINE_STRICT_WARNINGS`
      (input workflow `build-dev.yml:7`, `android/app/build.gradle:67,72`).
      Jalankan build dev dengan `strictWarnings=true` sebelum rilis.
- [ ] `check-jni-symbols` ✅ **sudah ada**: `scripts/check-jni-symbols.sh`
      (dipakai `build-dev.yml`).
- [ ] Harness sanitizer di CI — harness host ✅ **sudah ada**
      (`scripts/test_*.cpp`, pemisahan `PRISTINE_HAVE_LIBLOG` sudah ada di
      `ConvolverNode.cpp:17-20`, `HRTFNode.cpp:18`). Tambah workflow
      (TSan di perangkat Android tidak didukung — ini satu-satunya cara
      memeriksa balapan data di struktur lock-free seperti `PCMQueue` dan
      seqlock EQ/preset):

```yaml
# .github/workflows/native-harness.yml (potongan)
- run: |
    for t in scripts/test_*.cpp; do
      clang++ -std=c++17 -O1 -g -fno-omit-frame-pointer -fsanitize=address,undefined "$t" -o /tmp/t && /tmp/t || exit 1
      clang++ -std=c++17 -O1 -g -fsanitize=thread "$t" -o /tmp/tt && /tmp/tt || exit 1
    done
```

- [ ] Analisis statis: `clang-tidy` (bugprone, concurrency, performance)
      dan `cppcheck` di CI.
- [ ] Tes E2E (Maestro, CLI, di emulator GitHub Actions) untuk alur inti:
      scan → play → pause → next → EQ → ganti mode → background → resume.
      Tidak menguji exclusive/USB, tapi menangkap regresi UI dan crash.
- [ ] HWASan (opsional): build `.so` dengan `-fsanitize=hwaddress` untuk
      satu sesi pengujian di perangkat arm64 Android 14+. Berat, tapi
      menangkap use-after-free di audio thread.
- [ ] Sakelar darurat untuk fitur berisiko: `DSPProcessingGate` ✅ **sudah
      ada** (`src/features/hardware/hooks/useDSPProcessingGate`, dipakai
      `settings.tsx:345-346`). Pertimbangkan pola yang sama untuk exclusive
      dan Immersive agar bisa dimatikan tanpa rilis baru.

## Gerbang kualitas audio

- [ ] Tes bit-perfect otomatis: dekode berkas uji → bandingkan PCM keluaran
      dengan referensi `ffmpeg -f s32le`, lewat hash. Bukti objektif untuk
      klaim "bit-perfect", jauh lebih kuat daripada status UI.
      - Berkas uji chirp 24/96 ❓ **belum terverifikasi — cari nama
        berkasnya**: pencarian `chirp` di `scripts/`, `src/`,
        `android/app/src/main/cpp/`, `.github/` tidak menemukan apa pun;
        tidak ada fixture `.wav`/`.pcm` milik repo (yang ada hanya aset
        contoh Oboe). Yang ada: spektrum sintetis 96 kHz di
        `scripts/test_audio_file_analyzer.cpp:42,56` (fixture matematika
        untuk `findCutoffHz`, bukan berkas audio) dan fixture metadata
        24-bit/96 kHz di `src/__tests__/features/audio/BitDepthVerifier.test.ts:42`.
        Berkas chirp perlu dibuat sebelum tes ini bisa jalan.
- [ ] Ukur THD+N dan respons frekuensi dari rantai DSP (sinus + FFT) untuk
      preset netral; harus identik dengan masukan.

## Gerbang go / no-go per tahap rollout

1. `tsc`, `jest`, `oxlint`, job warning ketat, `check-jni-symbols`, harness
   sanitizer hijau di CI.
2. Tes bit-perfect otomatis lulus.
3. Soak test 4 jam tanpa pertumbuhan memori atau XRun abnormal.
4. Matriks perangkat nyata (minimal 4) + checklist gangguan (Fase 2) lulus.
5. Pre-launch report tanpa crash atau peringatan baru.
6. Crash reporting terhubung dan simbol terunggah.
7. Data safety, kebijakan privasi, lisensi, dan AAB siap.
8. Closed test selesai, lalu staged rollout dengan gerbang vitals.
