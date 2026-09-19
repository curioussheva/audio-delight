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


def backup_file(repo: pathlib.Path, path: pathlib.Path) -> pathlib.Path:
    """Simpan salinan file sebelum diubah ke <repo>/tmp/patch_backups/,
    bukan di sebelah file aslinya — supaya source tree tetap bersih dari
    file .bak_* yang menumpuk."""
    ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_dir = repo / "tmp" / "patch_backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    # nama di-flatten dari path relatif terhadap repo, supaya tidak ada
    # tabrakan nama antar file dengan nama sama di folder berbeda
    try:
        rel = path.relative_to(repo)
    except ValueError:
        rel = pathlib.Path(path.name)
    flat_name = str(rel).replace("/", "__").replace("\\", "__")
    backup_path = backup_dir / f"{flat_name}.bak_{ts}"
    backup_path.write_bytes(path.read_bytes())
    return backup_path


def apply_str_replace(repo: pathlib.Path, path: pathlib.Path, old: str, new: str,
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

    backup_path = backup_file(repo, path)
    path.write_text(new_content, encoding="utf-8")
    result.reason = f"Diterapkan. Backup: tmp/patch_backups/{backup_path.name}"
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

    backup_path = backup_file(repo, path)
    path.write_text(new_content, encoding="utf-8")
    result.reason = f"Diterapkan (3 patch). Backup: tmp/patch_backups/{backup_path.name}"
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

    apply_str_replace(repo, path, old, new, dry_run, result)
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

    apply_str_replace(repo, path, old, new, dry_run, result)
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

    backup_path = backup_file(repo, path)
    path.write_text(new_content, encoding="utf-8")
    result.reason = f"Diterapkan (2 patch). Backup: tmp/patch_backups/{backup_path.name}"
    result.applied = True
    return result


# ----------------------------------------------------------------------
# PRIORITAS 6 — KOREKSI Prioritas 4: root cause SEBENARNYA dari hang.
#
# decodeCallback_ (didefinisikan di PlaybackController::startDecoder())
# punya logic BACKPRESSURE internal yang sudah ada sejak sebelum sesi
# debugging ini: setelah pcmQueue_->write(...), kalau buffer > 70% penuh,
# ia memanggil decoderWorker_->pause() -- DARI DALAM decodeCallback_ ITU
# SENDIRI, yang dieksekusi di thread DECODER WORKER.
#
# Patch 4 memperluas lock (mutex_) untuk mencakup decode() + decodeCallback_()
# sekaligus -- niatnya benar (melindungi write() dari race dengan clear()),
# TAPI ini tanpa sengaja menjebak panggilan decoderWorker_->pause() itu di
# DALAM scope lock yang sama. DecoderWorker::pause() (hasil Patch 4) sendiri
# mencoba lock ulang mutex_ yang SAMA:
#
#     void DecoderWorker::pause() {
#         paused_.store(true);
#         std::lock_guard<std::mutex> lock(mutex_);   // <- mutex SAMA
#     }
#
# std::mutex TIDAK reentrant -- thread yang sama mencoba lock ulang mutex
# yang sedang ia pegang sendiri adalah undefined behavior, dan di
# Android/pthread praktiknya SELALU deadlock permanen. Ini persis
# menjelaskan gejala: audio berhenti total beberapa detik setelah play
# (persis saat buffer pertama kali tembus 70%), tanpa log lanjutan sama
# sekali -- workerLoop() macet total, bukan crash.
#
# FIX: pisahkan proteksi decode()/seek()/pause() ke mutex REKURSIF khusus
# (decodeMutex_), terpisah dari mutex_ yang sudah dipakai untuk pause/resume
# condition variable (supaya logic pauseCv_.wait() yang sudah ada tidak
# perlu disentuh sama sekali -- itu perlu std::mutex biasa, tidak kompatibel
# dengan recursive_mutex). Dengan recursive_mutex: thread lain (mis. JNI
# seek thread) tetap diblokir sebagaimana mestinya menunggu decode selesai,
# TAPI kalau pause() dipanggil dari thread yang SAMA yang sedang memegang
# lock itu (kasus backpressure ini), ia bisa masuk ulang tanpa deadlock --
# karena memang tidak ada yang perlu ditunggu (dia sendiri yang sedang
# jalan).
#
# PRASYARAT: Patch 4 (decoder_worker_pause) harus sudah diterapkan lebih
# dulu -- anchor di sini menyasar bentuk kode SETELAH Patch 4. Patch ini
# MENGGANTIKAN Patch 5 (decoder_worker_narrow_lock) yang sebelumnya
# didasarkan pada hipotesis keliru (eofCallback_/errorCallback_, yang
# ternyata tidak pernah di-set sama sekali di codebase ini).
# ----------------------------------------------------------------------

def patch_decoder_worker_recursive_mutex(repo: pathlib.Path, dry_run: bool) -> PatchResult:
    rel_h = "android/app/src/main/cpp/decoder/DecoderWorker.h"
    rel_cpp = "android/app/src/main/cpp/decoder/DecoderWorker.cpp"
    path_h = repo / rel_h
    path_cpp = repo / rel_cpp
    result = PatchResult(
        "decoder_worker_recursive_mutex (Prioritas 6: recursive mutex — fix self-deadlock backpressure pause)",
        path_cpp,
    )

    if not path_h.exists():
        result.reason = f"File tidak ditemukan: {path_h}"
        return result
    if not path_cpp.exists():
        result.reason = f"File tidak ditemukan: {path_cpp}"
        return result

    # --- Patch H: tambah member decodeMutex_ (recursive) di header ---
    old_h = "    mutable std::mutex mutex_;\n"
    new_h = (
        "    mutable std::mutex mutex_;\n"
        "    // FIX (Prioritas 6): mutex REKURSIF terpisah, khusus melindungi\n"
        "    // decode()/decodeCallback_()/seek(). Direkursif karena\n"
        "    // decodeCallback_ (dipanggil dari DALAM lock ini, di workerLoop)\n"
        "    // bisa memicu decoderWorker_->pause() lewat backpressure internal\n"
        "    // -- dari THREAD YANG SAMA yang sedang memegang lock ini. mutex_\n"
        "    // di atas TETAP dipakai apa adanya untuk pauseCv_ (tidak diubah).\n"
        "    mutable std::recursive_mutex decodeMutex_;\n"
    )

    # --- Patch S: DecoderWorker::seek() pakai decodeMutex_ ---
    old_s = (
        "bool DecoderWorker::seek(double positionSeconds) {\n"
        "    if (!decoder_) return false;\n"
        "\n"
        "    std::lock_guard<std::mutex> lock(mutex_);\n"
        "\n"
        "    bool ok = decoder_->seek(positionSeconds);\n"
    )
    new_s = (
        "bool DecoderWorker::seek(double positionSeconds) {\n"
        "    if (!decoder_) return false;\n"
        "\n"
        "    // FIX (Prioritas 6): decodeMutex_ (rekursif), bukan mutex_ lagi\n"
        "    std::lock_guard<std::recursive_mutex> lock(decodeMutex_);\n"
        "\n"
        "    bool ok = decoder_->seek(positionSeconds);\n"
    )

    # --- Patch W: workerLoop() decode block pakai decodeMutex_ ---
    old_w = (
        "        {\n"
        "            std::lock_guard<std::mutex> lock(mutex_);\n"
        "\n"
        "            auto result = decoder_->decode(chunkSize_);\n"
    )
    new_w = (
        "        {\n"
        "            // FIX (Prioritas 6): decodeMutex_ (rekursif), bukan mutex_ lagi\n"
        "            std::lock_guard<std::recursive_mutex> lock(decodeMutex_);\n"
        "\n"
        "            auto result = decoder_->decode(chunkSize_);\n"
    )

    # --- Patch P: DecoderWorker::pause() pakai decodeMutex_ ---
    old_p = (
        "    // dulu sebelum return ke caller.\n"
        "    std::lock_guard<std::mutex> lock(mutex_);\n"
        "}\n"
    )
    new_p = (
        "    // dulu sebelum return ke caller.\n"
        "    //\n"
        "    // FIX (Prioritas 6): decodeMutex_ REKURSIF, bukan mutex_ lagi --\n"
        "    // kalau pause() ini dipanggil dari THREAD YANG SAMA yang sedang\n"
        "    // memegang decodeMutex_ (kasus backpressure dari decodeCallback_),\n"
        "    // recursive_mutex mengizinkan masuk ulang tanpa deadlock, karena\n"
        "    // memang tidak ada yang perlu ditunggu dari thread itu sendiri.\n"
        "    std::lock_guard<std::recursive_mutex> lock(decodeMutex_);\n"
        "}\n"
    )

    content_h = path_h.read_text(encoding="utf-8")
    content_cpp = path_cpp.read_text(encoding="utf-8")

    sub_results = []
    ok = True
    checks = (
        ("H (header)", content_h, old_h),
        ("S (seek)", content_cpp, old_s),
        ("W (workerLoop)", content_cpp, old_w),
        ("P (pause)", content_cpp, old_p),
    )
    for label, content, old in checks:
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
            + "\n  -> Pastikan Patch 4 (decoder_worker_pause) sudah diterapkan "
              "lebih dulu. Kalau sudah dan masih gagal, kemungkinan file "
              "sudah berbeda -- perlu patch manual."
        )
        return result

    new_content_h = content_h.replace(old_h, new_h, 1)
    new_content_cpp = content_cpp.replace(old_s, new_s, 1)
    new_content_cpp = new_content_cpp.replace(old_w, new_w, 1)
    new_content_cpp = new_content_cpp.replace(old_p, new_p, 1)

    if dry_run:
        result.reason = "DRY-RUN — 4 patch cocok (1 header + 3 cpp), belum ditulis ke disk"
        result.applied = True
        return result

    backup_h = backup_file(repo, path_h)
    backup_cpp = backup_file(repo, path_cpp)
    path_h.write_text(new_content_h, encoding="utf-8")
    path_cpp.write_text(new_content_cpp, encoding="utf-8")
    result.reason = (
        f"Diterapkan (4 patch: 1 header + 3 cpp). "
        f"Backup: tmp/patch_backups/{backup_h.name}, tmp/patch_backups/{backup_cpp.name}"
    )
    result.applied = True
    return result



# ----------------------------------------------------------------------
# PRIORITAS 7 — FFmpegDecoder.cpp: filter_size adaptif (64 untuk file
# >48kHz, demi hemat CPU) diduga jadi sumber NaN residual di resampler
# untuk file hi-res (96kHz). Dikonfirmasi lewat A/B test: file 44.1kHz
# (filter_size=128) jauh lebih bersih dari NaN dibanding 96kHz
# (filter_size=64) pada durasi playback yang sama. Total NaN sudah turun
# drastis sejak Patch 1-6 (dari ~1.3 juta ke ~235rb per sesi), tapi sisa
# ini match persis dengan kondisi filter_size=64.
#
# Fix: samakan filter_size=128 untuk semua sample rate, buang logic
# adaptive-nya. Trade-off: CPU sedikit lebih berat untuk file hi-res,
# tapi menghilangkan sumber NaN yang terbukti berkorelasi kuat.
# ----------------------------------------------------------------------

def patch_ffmpeg_decoder_filter_size(repo: pathlib.Path, dry_run: bool) -> PatchResult:
    rel = "android/app/src/main/cpp/decoder/FFmpegDecoder.cpp"
    path = repo / rel
    result = PatchResult(
        "ffmpeg_decoder_filter_size (Prioritas 7: filter_size konstan 128 — fix NaN residual di file >48kHz)",
        path,
    )

    old = (
        "    // 🔥 Adaptive filter: filter lebih kecil untuk file >48k (CPU heavy)\n"
        "    int filterSize = codecCtx_->sample_rate > 48000 ? 64 : 128;\n"
        "    av_opt_set_int(swrCtx_, \"filter_size\", filterSize, 0);\n"
    )
    new = (
        "    // FIX (Prioritas 7): filter_size KONSTAN 128 untuk semua rate.\n"
        "    // Sebelumnya adaptif (64 untuk >48kHz demi hemat CPU), tapi\n"
        "    // dikonfirmasi lewat A/B test filter_size=64 berkorelasi kuat\n"
        "    // dengan NaN residual di resampler untuk file hi-res (96kHz) —\n"
        "    // file 44.1kHz (filter_size=128) jauh lebih bersih pada durasi\n"
        "    // playback yang sama. Trade-off: CPU sedikit lebih berat untuk\n"
        "    // file hi-res, tapi menghilangkan sumber NaN yang terbukti.\n"
        "    int filterSize = 128;\n"
        "    av_opt_set_int(swrCtx_, \"filter_size\", filterSize, 0);\n"
    )

    apply_str_replace(repo, path, old, new, dry_run, result)
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

    apply_str_replace(repo, path, old, new, dry_run, result)
    return result


# ----------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------

ALL_PATCHES = {
    "ffmpeg_decoder": patch_ffmpeg_decoder,
    "playback_controller": patch_playback_controller,
    "decoder_worker": patch_decoder_worker,
    "decoder_worker_pause": patch_decoder_worker_pause_blocking,  # jalankan SETELAH decoder_worker
    "decoder_worker_recursive_mutex": patch_decoder_worker_recursive_mutex,  # jalankan SETELAH decoder_worker_pause — fix self-deadlock backpressure
    "ffmpeg_decoder_filter_size": patch_ffmpeg_decoder_filter_size,  # fix NaN residual di file >48kHz (independen, bisa jalan kapan saja)
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
 