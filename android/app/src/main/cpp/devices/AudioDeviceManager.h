#pragma once
#include "AudioDeviceDescriptor.h"
#include "DeviceCapabilities.h"
#include <jni.h>
#include <vector>
#include <functional>
#include <mutex>
#include <string>

namespace pristine {

// =====================================================
// AUDIO DEVICE MANAGER
// =====================================================
//
// Membaca perangkat output NYATA dari Android lewat
// AudioManager.getDevices(GET_DEVICES_OUTPUTS), termasuk DAC USB.
//
// Sebelumnya seluruh kelas ini stub: getAvailableDevices() mengembalikan {}
// dan setActiveDevice() mengembalikan true tanpa melakukan apa pun. Itu
// berbahaya karena pemanggil menerima "berhasil" padahal tidak ada yang
// terjadi.
//
// BATAS KEMAMPUAN ANDROID (penting supaya ekspektasi benar):
//
// Android tidak menyediakan API publik untuk "paksa output ke device ini".
// Yang tersedia:
//   - membaca daftar device (dipakai di sini)
//   - AudioTrack.setPreferredDevice() -> PREFERENSI, sistem bisa mengabaikan
//   - Oboe AudioStreamBuilder.setDeviceId() -> paling kuat, diterapkan saat
//     stream dibuka
//
// ⚠️ setDeviceId() BELUM DIPAKAI. AudioStreamController tidak punya field
// device id dan buildStream() tidak memanggil setDeviceId(), sehingga
// activeDeviceIdNumeric() di bawah saat ini TIDAK ADA PEMANGGIL: pilihan
// device tercatat tapi tidak mengubah stream, dan audio tetap keluar di
// perangkat default sistem. Lihat docs/AUDIO_OUTPUT_PATHS.md §3.1.
//
// Karena itu setActiveDevice() di sini hanya mencatat pilihan dan
// memvalidasinya terhadap daftar device; penerapan sebenarnya BELUM terjadi
// saat stream dibuka - itu yang perlu disambungkan.
class AudioDeviceManager {
public:
    static AudioDeviceManager& get();

    // Baca ulang daftar device dari Android. Aman dari thread mana pun.
    // Mengembalikan jumlah device yang terdeteksi (0 = gagal/tidak diketahui).
    int refreshDevices();

    // Salinan daftar device terakhir yang berhasil dibaca.
    std::vector<AudioDeviceDescriptor> getAvailableDevices() const;

    // Pilih perangkat. Mengembalikan FALSE kalau id tidak ada di daftar -
    // bukan true-but-blind seperti sebelumnya.
    bool setActiveDevice(const std::string& deviceId);

    // Perangkat aktif. `id` kosong = tidak ada preferensi (sistem yang pilih).
    AudioDeviceDescriptor getActiveDevice() const;

    DeviceCapabilities getDeviceCapabilities(const std::string& deviceId) const;

    // ID numerik perangkat aktif untuk Oboe setDeviceId().
    // 0 = tidak ada preferensi (biarkan sistem).
    int32_t activeDeviceIdNumeric() const;

    // Callback saat device dicolok/dicabut. Panggilan dari lapisan JNI
    // (AudioDeviceCallback) masuk lewat notifyDeviceAdded/Removed.
    void onDevicePlugged(std::function<void(const AudioDeviceDescriptor&)> callback);
    void onDeviceUnplugged(std::function<void(const std::string&)> callback);

    // Dipakai lapisan JNI saat AudioDeviceCallback melaporkan perubahan.
    // Penting: tanpa ini, DAC yang dicolok saat app berjalan tidak terdeteksi
    // dan laju stream tetap memakai device lama sampai app dibuka ulang.
    void notifyDeviceAdded(const AudioDeviceDescriptor& d);
    void notifyDeviceRemoved(const std::string& deviceId);

private:
    AudioDeviceManager() = default;

    mutable std::mutex mMutex;
    std::vector<AudioDeviceDescriptor> mDevices;
    std::string mActiveId;
    int32_t mActiveNumericId = 0;

    std::function<void(const AudioDeviceDescriptor&)> mOnPlugged;
    std::function<void(const std::string&)> mOnUnplugged;
};

// PRISTINE_EXPORT dari core/Export.h - wajib karena fungsi ini dipanggil
// OnLoad.cpp yang ada di target library lain.
#include "core/Export.h"

// Dipanggil sekali dari JNI_OnLoad. Dipisah dari kelas karena butuh JavaVM.
PRISTINE_EXPORT void setAudioDeviceManagerVm(JavaVM* vm);

} // namespace pristine
