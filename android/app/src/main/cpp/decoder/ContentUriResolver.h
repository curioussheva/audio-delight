#pragma once

#include <jni.h>
#include <string>

// PRISTINE_EXPORT: lihat core/Export.h untuk penjelasan lengkap kenapa
// anotasi ini wajib (library ini dibangun dengan -fvisibility=hidden,
// sementara OnLoad.cpp ada di target library lain).
#include "core/Export.h"

namespace pristine::decoder {

// =====================================================
// CONTENT URI RESOLVER
// =====================================================
//
// FFmpeg tidak punya handler untuk skema `content://` Android - itu skema
// ContentProvider, bukan jalur file. Tanpa resolusi, avformat_open_input
// SELALU gagal untuk URI seperti:
//
//   content://media/external/audio/media/1000997269
//
// Terbukti pada logcat 2026-10-04 12:22: play(): FAILED - loadTrack returned
// false tiga kali berturut-turut begitu pemutaran mencapai trek yang URI-nya
// belum di-resolve oleh sisi Kotlin (MAX_PRE_RESOLVE = 5, sisanya deferred).
//
// Sisi Kotlin sudah punya resolveContentUriToPath(), tapi bergantung pada JS
// memanggil resolveUri() untuk trek deferred - dan itu tidak pernah terjadi
// (silent wiring gap). Resolver ini membuat dekoder mandiri: berapa pun trek
// yang belum di-resolve, dekoder menyelesaikannya sendiri.
//
// Implementasi memakai JNI + ContentResolver, sama seperti sisi Kotlin, tapi
// bisa dipanggil dari thread dekoder mana pun.

class PRISTINE_EXPORT ContentUriResolver {
public:
    // Simpan JavaVM dari JNI_OnLoad. Wajib dipanggil sekali sebelum resolve().
    // Dipanggil dari OnLoad.cpp (library `appmodules`), jadi HARUS diekspor.
    static void init(JavaVM* vm);

    // true kalau VM sudah terpasang dan JNI siap dipakai.
    static bool isReady();

    // Kalau uri adalah `content://`, salin isinya ke cache aplikasi dan
    // kembalikan jalur file hasilnya. Kalau bukan content://, kembalikan uri
    // apa adanya. Kalau gagal, kembalikan string kosong - pemanggil harus
    // memperlakukan itu sebagai kegagalan, BUKAN mencoba uri aslinya.
    static std::string resolve(const std::string& uri);

    // B9-fd-AVIO (2026-11-12): buka `content://` sebagai fd mentah, TANPA
    // salin — ContentResolver.openFileDescriptor(uri, "r") +
    // ParcelFileDescriptor.detachFd(). Dipanggil dari thread dekoder mana
    // pun (ScopedEnv + appContext global ref, pola yang sama dengan
    // resolve()).
    //
    // fd dimiliki PEMANGGIL dan HARUS di-close() sendiri. detachFd()
    // melepas fd dari objek Java, jadi GC tidak bisa menutupnya di tengah
    // jalan — inilah yang membedakan jalur ini dari percobaan detachFd()
    // lama sisi Kotlin (NativePlaybackModule.kt:276), yang menyerahkan fd
    // ke FFmpeg lewat objek Java.
    //
    // Gagal -> -1: bukan content://, JavaVM/context belum siap, provider
    // menolak fd (mis. sub-section — openFileDescriptor melempar
    // FileNotFoundException untuk itu), atau fd ternyata bukan file
    // reguler (pipe tidak bisa pread/seek — pemanggil fallback ke
    // resolve()). -1 BUKAN "coba uri asli": content:// mentah tidak
    // bisa dibuka FFmpeg; pemanggil harus fallback ke resolve() atau
    // gagal.
    static int openFd(const std::string& uri);

private:
    ContentUriResolver() = delete;
};

} // namespace pristine::decoder
