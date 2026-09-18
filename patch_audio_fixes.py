#!/usr/bin/env python3
"""
patch_audio_fixes.py — PristineAudio chipmunk/distortion fix applier
======================================================================

Menerapkan patch untuk 2 root cause utama (+ 1 safety net + 1 fix opsional
JS) yang ditemukan dari investigasi debugging audio PristineAudio:

  Prioritas 1  FFmpegDecoder.cpp   - fix domain-mismatch loop counting
                                      (penyebab pulsing/chipmunk, parah di 96kHz)
  Prioritas 2  PlaybackController.cpp - fix SPSC violation di seek()
                                      (penyebab NaN/index desync di PCMQueue)
  Prioritas 3  DecoderWorker.cpp   - mutex protection di workerLoop()
                                      (safety net, race condition FFmpeg context)
  Opsional     library.tsx         - queue=[item] bukan seluruh library
                                      (fix "library tidak keluar suara")

Cara pakai
----------
    # Dry-run dulu (tidak mengubah file apa pun, cuma tampilkan yang AKAN diubah)
    python3 patch_audio_fixes.py --repo ~/pristine --dry-run

    # Terapkan semua fix (C++ saja, default)
    python3 patch_audio_fixes.py --repo ~/pristine

    # Terapkan termasuk fix JS library.tsx
    python3 patch_audio_fixes.py --repo ~/pristine --include-js

    # Terapkan cuma satu fix tertentu
    python3 patch_audio_fixes.py --repo ~/pristine --only ffmpeg_decoder

Setiap file yang diubah otomatis di-backup ke <file>.bak_<timestamp>
sebelum ditulis. Kalau anchor (teks yang dicari) tidak ketemu persis di
file kalian (misal karena sudah diedit manual sejak kode yang dianalisis),
script akan SKIP patch itu dan kasih tahu — tidak akan menebak/memaksa.

Setelah dijalankan, review hasilnya dengan `git diff` sebelum commit &
build CI.
"""

import argparse
import datetime
import pathlib
import sys

# ----------------------------------------------------------------------
# Util
# ----------------------------------------------------------------------

class PatchResult:
    def __init__(self, name, file_path):
        self.name = name
        self.file_path = file_path
        self.applied = False
        self.reason = ""


def backup_file(path: pathlib.Path) -> pathlib.Path:
    ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = path.with_name(f"{path.name}.bak_{ts}")
    backup_path.write_bytes(path.read_bytes())
    return backup_path


def apply_str_replace(path: pathlib.Path, old: str, new: str,
                       dry_run: bool, result: PatchResult) -> str:
    """Baca file, ganti SATU kemunculan `old` -> `new`. Return isi baru."""
    if not path.exists():
        result.reason = f"File tidak ditemukan: {path}"
        return None

    content = path.read_text(encoding="utf-8")
    count = content.count(old)

    if count == 0:
        result.reason = (
            "Anchor tidak ditemukan — kemungkinan file sudah berbeda dari "
            "versi yang dianalisis. Patch di-skip, tidak ada perubahan."
        )
        return None
    if count > 1:
        result.reason = (
            f"Anchor ditemukan {count}x (ambigu) — patch di-skip demi "
            "keamanan. Perlu review manual."
        )
        return None

    new_content = content.replace(old, new, 1)

    if dry_run:
        result.reason = "DRY-RUN — belum ditulis ke disk"
        result.applied = True
        return new_content

    backup_path = backup_file(path)
    path.write_text(new_content, encoding="utf-8")
    result.reason = f"Diterapkan. Backup: {backup_path.name}"
    result.applied = True
    return new_content


# ----------------------------------------------------------------------
# PRIORITAS 1 — FFmpegDecoder.cpp: fix domain-mismatch loop counting
# ----------------------------------------------------------------------

def patch_ffmpeg_decoder(repo: pathlib.Path, dry_run: bool) -> PatchResult:
    rel = "android/app/src/main/cpp/decoder/FFmpegDecoder.cpp"
    path = repo / rel
    result = PatchResult("ffmpeg_decoder (Prioritas 1: domain mismatch)", path)

    # --- Patch A: tambah counter output lokal setelah deklarasi result ---
    old_a = (
        "    DecodeResult result;\n"
        "    result.samples.reserve(\n"
        "        maxFrames * 2); // asumsi stereo\n"
        "\n"
        "    while (result.framesDecoded < maxFrames) {\n"
    )
    new_a = (
        "    DecodeResult result;\n"
        "    result.samples.reserve(\n"
        "        maxFrames * 2); // asumsi stereo\n"
        "\n"
        "    // 🩹 FIX: counter output lokal — exit condition loop HARUS\n"
        "    // pakai domain output (targetSampleRate), bukan framesDecoded\n"
        "    // yang ada di domain input. Tanpa ini, file dengan rasio\n"
        "    // downsample besar (mis. 96kHz->48kHz = 2:1) menghasilkan\n"
        "    // output ~50% lebih sedikit dari yang diminta per panggilan,\n"
        "    // menyebabkan pcmQueue_ starved -> pulsing/chipmunk.\n"
        "    uint32_t outputFramesThisCall = 0;\n"
        "\n"
        "    while (outputFramesThisCall < maxFrames) {\n"
    )

    # --- Patch B: tambah counter output (anchor tanpa emoji — lebih robust) ---
    # Catatan: NaN/Inf guard TIDAK perlu ditambahkan lagi di sini — kode
    # kalian sudah punya blok manual "NaN/Inf detection & cleanup" pakai
    # std::isnan/std::isinf sebelum baris ini. Cuma fix counter output saja.
    old_b = (
        "    result.framesDecoded += frame_->nb_samples;\n"
        "    currentFrame_ += converted;\n"
    )
    new_b = (
        "    result.framesDecoded += frame_->nb_samples;\n"
        "    currentFrame_ += converted;\n"
        "    // FIX (Prioritas 1): counter output lokal — INI yang dipakai exit condition\n"
        "    outputFramesThisCall += static_cast<uint32_t>(converted);\n"
    )

    old_c = (
        "            if (result.framesDecoded >= maxFrames)\n"
        "                break;\n"
        "        }\n"
        "\n"
        "        if (result.framesDecoded >= maxFrames)\n"
        "            break;\n"
        "    }\n"
    )
    new_c = (
        "            if (outputFramesThisCall >= maxFrames)\n"
        "                break;\n"
        "        }\n"
        "\n"
        "        if (outputFramesThisCall >= maxFrames)\n"
        "            break;\n"
        "    }\n"
    )

    if not path.exists():
        result.reason = f"File tidak ditemukan: {path}"
        return result

    content = path.read_text(encoding="utf-8")
    sub_results = []
    ok = True
    patches = (
        ("A", old_a, new_a),
        ("B", old_b, new_b),
        ("C", old_c, new_c),
    )
    for label, old, new in patches:
        c = content.count(old)
        if c != 1:
            ok = False
            sub_results.append(f"  [{label}] gagal (ditemukan {c}x, butuh tepat 1)")
        else:
            sub_results.append(f"  [{label}] ok")

    if not ok:
        result.reason = (
            "Satu atau lebih anchor tidak match persis (lihat detail):\n"
            + "\n".join(sub_results)
            + "\n  -> Kemungkinan kode di repo sudah berbeda dari versi yang "
              "dianalisis. Perlu patch manual untuk file ini."
        )
        return result

    new_content = content.replace(old_a, new_a, 1)
    new_content = new_content.replace(old_b, new_b, 1)
    new_content = new_content.replace(old_c, new_c, 1)

    if dry_run:
        result.reason = "DRY-RUN — 3 patch cocok, belum ditulis ke disk"
        result.applied = True
        return result

    backup_path = backup_file(path)
    path.write_text(new_content, encoding="utf-8")
    result.reason = f"Diterapkan (3 patch). Backup: {backup_path.name}"
    result.applied = True
    return result


# ----------------------------------------------------------------------
# PRIORITAS 2 — PlaybackController.cpp: fix SPSC violation di seek()
# ----------------------------------------------------------------------

def patch_playback_controller(repo: pathlib.Path, dry_run: bool) -> PatchResult:
    rel = "android/app/src/main/cpp/playback/PlaybackController.cpp"
    path = repo / rel
    result = PatchResult("playback_controller (Prioritas 2: SPSC seek fix)", path)

    old = (
        "bool PlaybackController::seek(double seconds) {\n"
        "    if (!decoderWorker_)\n"
        "        return false;\n"
        "\n"
        "    pcmQueue_->clear();\n"
        "    clock_->seekToSeconds(seconds, 48000);\n"
        "\n"
        "    return decoderWorker_->seek(seconds);\n"
        "}\n"
    )
    new = (
        "bool PlaybackController::seek(double seconds) {\n"
        "    if (!decoderWorker_)\n"
        "        return false;\n"
        "\n"
        "    // 🩹 FIX (Prioritas 2): PCMQueue adalah SPSC lock-free ring buffer\n"
        "    // — HANYA aman diakses oleh 1 producer (decoder thread) + 1\n"
        "    // consumer (audio callback thread). clear() dari thread ketiga\n"
        "    // (JNI/seek caller) bisa menyebabkan writeIndex_/readIndex_ desync\n"
        "    // kalau kebetulan race dengan decoder thread yang masih write().\n"
        "    // Fix: pause producer dulu supaya tidak ada writer aktif saat clear.\n"
        "    decoderWorker_->pause();\n"
        "\n"
        "    pcmQueue_->clear();\n"
        "    clock_->seekToSeconds(seconds, 48000);\n"
        "\n"
        "    bool ok = decoderWorker_->seek(seconds);\n"
        "\n"
        "    decoderWorker_->resume();\n"
        "\n"
        "    return ok;\n"
        "}\n"
    )

    apply_str_replace(path, old, new, dry_run, result)
    return result


# ----------------------------------------------------------------------
# PRIORITAS 3 — DecoderWorker.cpp: mutex protection di workerLoop()
# ----------------------------------------------------------------------

def patch_decoder_worker(repo: pathlib.Path, dry_run: bool) -> PatchResult:
    rel = "android/app/src/main/cpp/decoder/DecoderWorker.cpp"
    path = repo / rel
    result = PatchResult("decoder_worker (Prioritas 3: mutex safety net)", path)

    old = (
        "        if (stopRequested_.load()) break;\n"
        "\n"
        "        // DECODE\n"
        "        auto result = decoder_->decode(chunkSize_);\n"
    )
    new = (
        "        if (stopRequested_.load()) break;\n"
        "\n"
        "        // DECODE\n"
        "        // 🩹 FIX (Prioritas 3): mutex_ sebelumnya cuma melindungi\n"
        "        // seek(), TIDAK melindungi decode() di sini — artinya seek()\n"
        "        // dari thread lain bisa mengubah formatCtx_/codecCtx_/swrCtx_\n"
        "        // FFmpeg di tengah decode() masih jalan. Kunci mutex yang\n"
        "        // sama di sini supaya seek() dan decode() saling eksklusif.\n"
        "        auto result = [&]() {\n"
        "            std::lock_guard<std::mutex> lock(mutex_);\n"
        "            return decoder_->decode(chunkSize_);\n"
        "        }();\n"
    )

    apply_str_replace(path, old, new, dry_run, result)
    return result


# ----------------------------------------------------------------------
# PRIORITAS 4 — DecoderWorker.cpp: perluas lock ke decodeCallback_(),
# dan bikin pause() benar-benar blocking (bukan cuma set flag).
#
# Root cause residual: decodeCallback_() (yang manggil pcmQueue_->write())
# dipanggil DI LUAR lock_guard dari Patch 3. pause() juga cuma set flag
# lalu langsung return tanpa menunggu iterasi decode+callback yang sedang
# berjalan selesai. Akibatnya PlaybackController::seek() bisa lanjut
# pcmQueue_->clear() SEBELUM write() yang sedang berjalan benar-benar
# selesai -> index desync -> NaN/nilai ekstrem di render(), walau tanpa
# seek aktif sekalipun (race decode-vs-render murni).
#
# PRASYARAT: Patch 3 (decoder_worker) harus sudah diterapkan lebih dulu,
# karena anchor di sini menyasar bentuk KODE SETELAH Patch 3.
# ----------------------------------------------------------------------

def patch_decoder_worker_pause_blocking(repo: pathlib.Path, dry_run: bool) -> PatchResult:
    rel = "android/app/src/main/cpp/decoder/DecoderWorker.cpp"
    path = repo / rel
    result = PatchResult(
        "decoder_worker_pause_blocking (Prioritas 4: full-lock + blocking pause)",
        path,
    )

    # --- Patch A: perluas lock ke decodeCallback_() + jadikan blok tunggal ---
    old_a = (
        "        // DECODE\n"
        "        // 🩹 FIX (Prioritas 3): mutex_ sebelumnya cuma melindungi\n"
        "        // seek(), TIDAK melindungi decode() di sini — artinya seek()\n"
        "        // dari thread lain bisa mengubah formatCtx_/codecCtx_/swrCtx_\n"
        "        // FFmpeg di tengah decode() masih jalan. Kunci mutex yang\n"
        "        // sama di sini supaya seek() dan decode() saling eksklusif.\n"
        "        auto result = [&]() {\n"
        "            std::lock_guard<std::mutex> lock(mutex_);\n"
        "            return decoder_->decode(chunkSize_);\n"
        "        }();\n"
        "\n"
        "        // 🔥 DEBUG: log tiap 100 loop untuk trace\n"
        "        static int loopCount = 0;\n"
        "        loopCount++;\n"
        "        if (loopCount % 100 == 0) {\n"
        "            __android_log_print(ANDROID_LOG_INFO, \"DecoderWorker\",\n"
        "                \"loop #%d: status=%d, frames=%u\",\n"
        "                loopCount, (int)result.status, result.framesDecoded);\n"
        "        }\n"
        "\n"
        "        if (result.status == DecodeStatus::Success) {\n"
        "\n"
        "            if (decodeCallback_) {\n"
        "                decodeCallback_(std::move(result));\n"
        "            }\n"
        "\n"
        "        } else if (result.status == DecodeStatus::EndOfStream) {\n"
        "            __android_log_print(ANDROID_LOG_WARN, \"DecoderWorker\",\n"
        "                \"EOF reached, exiting loop\");\n"
        "            if (eofCallback_) eofCallback_();\n"
        "            break;\n"
        "\n"
        "        } else if (result.status == DecodeStatus::Error ||\n"
        "                   result.status == DecodeStatus::FatalError) {\n"
        "            __android_log_print(ANDROID_LOG_ERROR, \"DecoderWorker\",\n"
        "                \"Error: %s\", result.errorMessage.c_str());\n"
        "            if (errorCallback_) errorCallback_(result.errorMessage);\n"
        "            break;\n"
        "\n"
        "        } else if (result.status == DecodeStatus::NeedMoreData) {\n"
        "            // streaming case → small sleep to avoid busy loop\n"
        "            std::this_thread::sleep_for(milliseconds(2));\n"
        "        }\n"
    )
    new_a = (
        "        // DECODE\n"
        "        // 🩹 FIX (Prioritas 4): lock diperluas mencakup decodeCallback_()\n"
        "        // (yang memanggil pcmQueue_->write()). Sebelumnya callback ini\n"
        "        // dipanggil DI LUAR lock — artinya seek()/pause() bisa lanjut\n"
        "        // pcmQueue_->clear() di tengah write() sedang berjalan, walau\n"
        "        // decode() sendiri sudah selesai & lock sudah dilepas duluan.\n"
        "        // Sekarang decode() + callback jadi SATU critical section utuh.\n"
        "        {\n"
        "            std::lock_guard<std::mutex> lock(mutex_);\n"
        "\n"
        "            auto result = decoder_->decode(chunkSize_);\n"
        "\n"
        "            // 🔥 DEBUG: log tiap 100 loop untuk trace\n"
        "            static int loopCount = 0;\n"
        "            loopCount++;\n"
        "            if (loopCount % 100 == 0) {\n"
        "                __android_log_print(ANDROID_LOG_INFO, \"DecoderWorker\",\n"
        "                    \"loop #%d: status=%d, frames=%u\",\n"
        "                    loopCount, (int)result.status, result.framesDecoded);\n"
        "            }\n"
        "\n"
        "            if (result.status == DecodeStatus::Success) {\n"
        "\n"
        "                if (decodeCallback_) {\n"
        "                    decodeCallback_(std::move(result));\n"
        "                }\n"
        "\n"
        "            } else if (result.status == DecodeStatus::EndOfStream) {\n"
        "                __android_log_print(ANDROID_LOG_WARN, \"DecoderWorker\",\n"
        "                    \"EOF reached, exiting loop\");\n"
        "                if (eofCallback_) eofCallback_();\n"
        "                break;\n"
        "\n"
        "            } else if (result.status == DecodeStatus::Error ||\n"
        "                       result.status == DecodeStatus::FatalError) {\n"
        "                __android_log_print(ANDROID_LOG_ERROR, \"DecoderWorker\",\n"
        "                    \"Error: %s\", result.errorMessage.c_str());\n"
        "                if (errorCallback_) errorCallback_(result.errorMessage);\n"
        "                break;\n"
        "\n"
        "            } else if (result.status == DecodeStatus::NeedMoreData) {\n"
        "                // streaming case → small sleep to avoid busy loop\n"
        "                std::this_thread::sleep_for(milliseconds(2));\n"
        "            }\n"
        "        }\n"
    )

    # --- Patch B: pause() jadi benar-benar blocking ---
    old_b = (
        "void DecoderWorker::pause() {\n"
        "    paused_.store(true);\n"
        "}\n"
    )
    new_b = (
        "void DecoderWorker::pause() {\n"
        "    paused_.store(true);\n"
        "    // 🩹 FIX (Prioritas 4): pause() sebelumnya cuma set flag lalu\n"
        "    // LANGSUNG return — tidak menunggu apa pun. Kalau caller (mis.\n"
        "    // PlaybackController::seek()) lanjut pcmQueue_->clear() sesaat\n"
        "    // setelah ini, decode+callback yang masih di tengah jalan bisa\n"
        "    // tetap write() ke queue yang baru saja di-reset -> desync.\n"
        "    // Ambil mutex_ yang sama dipakai workerLoop() supaya pause()\n"
        "    // benar-benar menunggu iterasi decode+callback aktif selesai\n"
        "    // dulu sebelum return ke caller.\n"
        "    std::lock_guard<std::mutex> lock(mutex_);\n"
        "}\n"
    )

    if not path.exists():
        result.reason = f"File tidak ditemukan: {path}"
        return result

    content = path.read_text(encoding="utf-8")
    sub_results = []
    ok = True
    patches = (("A", old_a, new_a), ("B", old_b, new_b))
    for label, old, new in patches:
        c = content.count(old)
        if c != 1:
            ok = False
            sub_results.append(f"  [{label}] gagal (ditemukan {c}x, butuh tepat 1)")
        else:
            sub_results.append(f"  [{label}] ok")

    if not ok:
        result.reason = (
            "Satu atau lebih anchor tidak match persis (lihat detail):\n"
            + "\n".join(sub_results)
            + "\n  -> Pastikan Patch 3 (decoder_worker) sudah diterapkan lebih "
              "dulu, karena Patch 4 ini menyasar bentuk kode SETELAH Patch 3. "
              "Kalau sudah dan masih gagal, kemungkinan file sudah berbeda — "
              "perlu patch manual."
        )
        return result

    new_content = content.replace(old_a, new_a, 1)
    new_content = new_content.replace(old_b, new_b, 1)

    if dry_run:
        result.reason = "DRY-RUN — 2 patch cocok, belum ditulis ke disk"
        result.applied = True
        return result

    backup_path = backup_file(path)
    path.write_text(new_content, encoding="utf-8")
    result.reason = f"Diterapkan (2 patch). Backup: {backup_path.name}"
    result.applied = True
    return result


# ----------------------------------------------------------------------
# OPSIONAL — library.tsx: kirim queue=[item], bukan seluruh library
# ----------------------------------------------------------------------

def patch_library_tsx(repo: pathlib.Path, dry_run: bool) -> PatchResult:
    rel = "src/app/(drawer)/(tabs)/library.tsx"
    path = repo / rel
    result = PatchResult("library_tsx (opsional: fix queue 1195 lagu)", path)

    old = (
        "  const handleSongPress = useCallback((track: any, queue: any[]) => {\n"
        "    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);\n"
        "\n"
        "    // Kita lakukan casting ke 'any' lalu ke 'Song' di dalam store\n"
        "    // Ini menyelesaikan error TS2322 pada AlbumGrid, GenreList, dll.\n"
        "    playSong(track, queue);\n"
        "  }, [playSong]);\n"
    )
    new = (
        "  const handleSongPress = useCallback((track: any, queue: any[]) => {\n"
        "    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);\n"
        "\n"
        "    // 🩹 FIX: JANGAN kirim seluruh `queue` (bisa 1000+ lagu) ke native\n"
        "    // setQueue(). Native resolve tiap URI content:// secara sinkron\n"
        "    // (query MediaStore / fallback copy ke cache) SATU PER SATU —\n"
        "    // untuk 1195 lagu ini bisa makan waktu menit sebelum play()\n"
        "    // sempat jalan. Kirim cuma track yang di-tap; kalau next/prev\n"
        "    // butuh full queue, kelola itu terpisah di JS state, bukan\n"
        "    // lewat native setQueue().\n"
        "    playSong(track, [track]);\n"
        "  }, [playSong]);\n"
    )

    apply_str_replace(path, old, new, dry_run, result)
    return result


# ----------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------

ALL_PATCHES = {
    "ffmpeg_decoder": patch_ffmpeg_decoder,
    "playback_controller": patch_playback_controller,
    "decoder_worker": patch_decoder_worker,
    "decoder_worker_pause": patch_decoder_worker_pause_blocking,  # jalankan SETELAH decoder_worker
    "library_tsx": patch_library_tsx,  # hanya jalan kalau --include-js
}

JS_PATCHES = {"library_tsx"}


def main():
    parser = argparse.ArgumentParser(
        description="Terapkan patch fix audio chipmunk/distorsi PristineAudio"
    )
    parser.add_argument(
        "--repo", required=True,
        help="Path ke root repo (mis. ~/pristine)"
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Tampilkan apa yang AKAN diubah, tanpa menulis ke disk"
    )
    parser.add_argument(
        "--include-js", action="store_true",
        help="Sertakan juga fix library.tsx (opsional, JS side)"
    )
    parser.add_argument(
        "--only", choices=list(ALL_PATCHES.keys()), default=None,
        help="Terapkan cuma satu patch tertentu"
    )
    args = parser.parse_args()

    repo = pathlib.Path(args.repo).expanduser().resolve()
    if not repo.exists():
        print(f"❌ Repo path tidak ditemukan: {repo}")
        sys.exit(1)

    print(f"📂 Repo: {repo}")
    print(f"🔧 Mode: {'DRY-RUN (tidak menulis apa pun)' if args.dry_run else 'APPLY (akan menulis + backup)'}")
    print()

    if args.only:
        targets = {args.only: ALL_PATCHES[args.only]}
    else:
        targets = {
            k: v for k, v in ALL_PATCHES.items()
            if k not in JS_PATCHES or args.include_js
        }

    results = []
    for name, fn in targets.items():
        r = fn(repo, args.dry_run)
        results.append(r)

    print("=" * 70)
    print("RINGKASAN")
    print("=" * 70)
    for r in results:
        status = "✅ OK" if r.applied else "⏭️  SKIP"
        print(f"\n{status}  {r.name}")
        print(f"   File   : {r.file_path}")
        print(f"   Detail : {r.reason}")

    applied_count = sum(1 for r in results if r.applied)
    print()
    print("=" * 70)
    print(f"Total: {applied_count}/{len(results)} patch diterapkan")
    if args.dry_run:
        print("\n⚠️  Ini masih DRY-RUN. Jalankan ulang tanpa --dry-run untuk")
        print("   benar-benar menulis perubahan (otomatis dibackup dulu).")
    else:
        print("\n➡️  Langkah selanjutnya:")
        print("   1. git diff   — review perubahan")
        print("   2. Rebuild via CI (GitHub Actions)")
        print("   3. Test: putar file 96kHz TANPA seek dulu (verifikasi Prioritas 1)")
        print("   4. Test: seek berkali-kali cepat saat playing (verifikasi Prioritas 2)")
    print("=" * 70)


if __name__ == "__main__":
    main()
 