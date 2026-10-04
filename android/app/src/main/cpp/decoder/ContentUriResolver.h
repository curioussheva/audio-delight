#pragma once

#include <jni.h>
#include <string>

// =====================================================
// ANOTASI EKSPOR SIMBOL
// =====================================================
//
// Library `pristine-audio` dibangun dengan `-fvisibility=hidden`, sehingga
// secara default tidak ada simbol yang terekspos ke luar library. Itu bagus
// untuk ukuran binary, tapi membuat simbol yang HARUS dipanggil dari library
// lain tidak terlihat.
//
// Gejalanya muncul sebagai kegagalan LINK (bukan kompilasi), jadi mudah
// tertukar dengan "file belum ditambahkan ke CMake":
//
//   ld.lld: error: undefined symbol:
//     pristine::decoder::ContentUriResolver::init(_JavaVM*)
//   >>> referenced by OnLoad.cpp:62
//
// Padahal definisinya ADA di library, hanya disembunyikan visibilitas.
//
// Anotasi di bawah memaksa simbol diekspor. Dipakai pada kelas dan pada
// setiap method yang dipanggil lintas-library - satu method yang lupa
// dianotasi akan menggagalkan link lagi dengan pesan yang sama.
#if defined(__GNUC__) || defined(__clang__)
  #define PRISTINE_EXPORT __attribute__((visibility("default")))
#else
  #define PRISTINE_EXPORT
#endif

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
    PRISTINE_EXPORT static void init(JavaVM* vm);

    // true kalau VM sudah terpasang dan JNI siap dipakai.
    PRISTINE_EXPORT static bool isReady();

    // Kalau uri adalah `content://`, salin isinya ke cache aplikasi dan
    // kembalikan jalur file hasilnya. Kalau bukan content://, kembalikan uri
    // apa adanya. Kalau gagal, kembalikan string kosong - pemanggil harus
    // memperlakukan itu sebagai kegagalan, BUKAN mencoba uri aslinya.
    PRISTINE_EXPORT static std::string resolve(const std::string& uri);

private:
    static JavaVM* vm_;

    ContentUriResolver() = delete;
};

} // namespace pristine::decoder
