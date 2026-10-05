#pragma once

// =====================================================
// ANOTASI EKSPOR SIMBOL
// =====================================================
//
// Header ini adalah SATU-SATUNYA tempat PRISTINE_EXPORT didefinisikan.
//
// KENAPA PERLU
// ------------
// Library `pristine-audio` dibangun dengan `-fvisibility=hidden`, sehingga
// tidak ada simbol yang terekspos ke luar library secara default. Itu bagus
// untuk ukuran binary, tapi membuat simbol yang HARUS dipanggil dari library
// lain tidak terlihat.
//
// Target `appmodules` (berisi jni/OnLoad.cpp) adalah library terpisah yang
// memanggil beberapa fungsi dari `pristine-audio`. Fungsi-fungsi itu wajib
// dianotasi, kalau tidak link gagal:
//
//   ld.lld: error: undefined symbol: pristine::audio::setDeviceRateDetectorVm(_JavaVM*)
//   ld.lld: error: undefined symbol: pristine::setAudioDeviceManagerVm(_JavaVM*)
//
// Gejalanya adalah kegagalan LINK, bukan kompilasi - jadi mudah tertukar
// dengan "file belum ditambahkan ke CMake". Padahal definisinya ADA, hanya
// disembunyikan visibilitas.
//
// KENAPA DIPUSATKAN DI SINI
// -------------------------
// Sebelumnya makro ini disalin di tiga header berbeda. Salinan ganda berarti
// satu tempat bisa diubah sementara yang lain tidak, dan yang paling
// berbahaya: orang berikutnya mendefinisikan ulang di tempat ke-4 dan lupa
// memakainya di tempat ke-5. Satu definisi, di-`include` dari mana pun.
//
// PAKAI DI MANA
// -------------
// Setiap fungsi yang dipanggil lintas-library: dari `pristine-audio` ke
// `appmodules` (OnLoad.cpp) atau sebaliknya. Kalau ragu, lihat apakah
// pemanggilnya ada di jni/OnLoad.cpp - kalau ya, wajib.
//
// Satu fungsi baru yang lupa dianotasi akan memunculkan lagi error linker
// yang sama di CI, 25 menit kemudian. Jadi: setiap kali menambah fungsi
// publik yang dipanggil dari library lain, anotasi di sini.
#if defined(__GNUC__) || defined(__clang__)
  #define PRISTINE_EXPORT __attribute__((visibility("default")))
#else
  #define PRISTINE_EXPORT
#endif
