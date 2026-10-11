// =====================================================
// scripts/test_immersive.cpp
// =====================================================
//
// Membuktikan tiga kelas immersive TIDAK LAGI stub.
//
// Yang diuji bukan "apakah ia berjalan", tapi hal-hal yang dulu salah:
//
//   1. BrainwaveGenerator: dulu MENOLKAN buffer (left[i] = 0). Sekarang harus
//      MENAMBAHKAN. Kalau test ini gagal, mengaktifkan immersive dengan
//      brainwaveFreq > 0 akan menghasilkan keheningan total.
//
//   2. HarmonicExciter: dulu hanya gain linear. Sekarang harus menghasilkan
//      harmonisa - dibuktikan dengan mengukur energi pada harmonisa orde dua
//      dan tiga, bukan hanya "output lebih keras".
//
//   3. SpatialFieldProcessor: dulu tidak melakukan apa pun. Sekarang harus
//      mengubah korelasi antar-channel saat width != 1.
//
// Ditambah: drive/width/volume 0 harus benar-benar bypass (bit-exact).

#include "dsp/immersive/BrainwaveGenerator.h"
#include "dsp/immersive/HarmonicExciter.h"
#include "dsp/immersive/SpatialFieldProcessor.h"

#include <cmath>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

using namespace pristine::dsp;

static int gPass = 0;
static int gFail = 0;

static void check(bool ok, const std::string& what) {
    if (ok) {
        ++gPass;
        std::printf("  PASS  %s\n", what.c_str());
    } else {
        ++gFail;
        std::printf("  FAIL  %s\n", what.c_str());
    }
}

// Energi pada frekuensi tertentu, dihitung dengan Goertzel-like correlation.
// Dipakai untuk mengukur harmonisa: kalau exciter benar-benar menghasilkan
// harmonisa, energi di 2f dan 3f akan jauh di atas noise floor.
static double binEnergy(
    const std::vector<float>& x,
    double freq,
    double sampleRate
) {
    const double w = 2.0 * M_PI * freq / sampleRate;

    double re = 0.0;
    double im = 0.0;

    for (size_t i = 0; i < x.size(); ++i) {
        re += x[i] * std::cos(w * static_cast<double>(i));
        im += x[i] * std::sin(w * static_cast<double>(i));
    }

    const double n = static_cast<double>(x.size());

    return (re * re + im * im) / (n * n);
}

static double rms(const std::vector<float>& x) {
    double s = 0.0;
    for (float v : x) s += static_cast<double>(v) * v;
    return std::sqrt(s / static_cast<double>(x.size()));
}

// =====================================================
// 1. BRAINWAVE: MENAMBAHKAN, BUKAN MENOLKAN
// =====================================================

static void testBrainwaveAdds() {

    std::printf("\n1. BrainwaveGenerator menambahkan beat\n");

    const int frames = 48000;
    const float sr = 48000.0f;

    // Sinyal sumber: sinus 1 kHz yang jelas ada isinya.
    std::vector<float> left(frames);
    std::vector<float> right(frames);

    for (int i = 0; i < frames; ++i) {
        left[i] = 0.5f * std::sin(2.0 * M_PI * 1000.0 * i / sr);
        right[i] = left[i];
    }

    const double before = rms(left);

    BrainwaveGenerator bw;
    bw.setType(BrainwaveType::ALPHA);
    bw.setVolume(0.5f);
    bw.generate(left.data(), right.data(), frames, sr);

    const double after = rms(left);

    // Ini inti test-nya: versi lama menghasilkan 0.0 (buffer dinolkan).
    check(after > 0.01, "buffer TIDAK dinolkan (sebelumnya: silence total)");
    check(after > before, "level bertambah (menambahkan, bukan menggantikan)");

    // Beat harus benar-benar ada: energi di sekitar carrier 200 Hz harus
    // jauh di atas bin sekitarnya yang tidak diberi nada.
    const double carrier = binEnergy(left, 200.0, sr);
    const double filler = binEnergy(left, 5000.0, sr);

    check(
        carrier > filler * 10.0,
        "carrier binaural terdengar di 200 Hz"
    );

    // Volume 0 harus bypass sejati.
    std::vector<float> l2(frames), r2(frames);
    for (int i = 0; i < frames; ++i) {
        l2[i] = 0.5f * std::sin(2.0 * M_PI * 1000.0 * i / sr);
        r2[i] = l2[i];
    }
    std::vector<float> l2copy = l2;

    BrainwaveGenerator silent;
    silent.setVolume(0.0f);
    silent.generate(l2.data(), r2.data(), frames, sr);

    check(
        std::memcmp(l2.data(), l2copy.data(), l2.size() * sizeof(float)) == 0,
        "volume 0 = bypass bit-exact"
    );
}

// =====================================================
// 2. HARMONIC EXCITER: MENGHASILKAN HARMONISA
// =====================================================

static void testHarmonicProducesHarmonics() {

    std::printf("\n2. HarmonicExciter menghasilkan harmonisa\n");

    const int frames = 48000;
    const double sr = 48000.0;
    const double f0 = 400.0;

    std::vector<float> left(frames);
    std::vector<float> right(frames);

    for (int i = 0; i < frames; ++i) {
        left[i] = 0.4f * std::sin(2.0 * M_PI * f0 * i / sr);
        right[i] = left[i];
    }

    const double fundamentalBefore = binEnergy(left, f0, sr);

    HarmonicExciter ex;
    ex.setDrive(18.0f);
    ex.process(left.data(), right.data(), frames);

    const double fundamentalAfter = binEnergy(left, f0, sr);
    const double h2 = binEnergy(left, f0 * 2.0, sr);
    const double h3 = binEnergy(left, f0 * 3.0, sr);

    // Versi lama (gain linear) tidak menghasilkan energi apa pun di 2f/3f -
    // hanya fundamental yang naik. Jadi test ini membedakan keduanya.
    check(
        h2 > fundamentalBefore * 1e-4,
        "harmonisa orde 2 muncul (gain linear tidak bisa ini)"
    );
    check(
        h3 > fundamentalBefore * 1e-4,
        "harmonisa orde 3 muncul"
    );

    check(
        fundamentalAfter > 0.0,
        "fundamental tetap ada (bukan menggantikan sinyal)"
    );

    // Drive 0 harus bypass bit-exact.
    std::vector<float> l2(frames);
    for (int i = 0; i < frames; ++i) {
        l2[i] = 0.4f * std::sin(2.0 * M_PI * f0 * i / sr);
    }
    std::vector<float> l2copy = l2;

    HarmonicExciter off;
    off.setDrive(0.0f);
    off.process(l2.data(), l2.data(), frames);

    check(
        std::memcmp(l2.data(), l2copy.data(), l2.size() * sizeof(float)) == 0,
        "drive 0 = bypass bit-exact"
    );

    // Level tidak boleh melonjak liar - dulu +6 dB diam-diam pada default.
    const double rIn = 0.4 / std::sqrt(2.0);
    const double rOut = rms(left);
    const double gainDb = 20.0 * std::log10(rOut / rIn);

    std::printf("        (gain terukur: %+.2f dB)\n", gainDb);

    check(
        std::fabs(gainDb) < 4.0,
        "perubahan level < 4 dB (bukan +6 dB tanpa alasan)"
    );
}

// =====================================================
// 3. SPATIAL: BENAR-BENAR MENGUBAH CITRA
// =====================================================

static void testSpatialWidens() {

    std::printf("\n3. SpatialFieldProcessor melebarkan citra\n");

    const int frames = 48000;

    // Sinyal dengan side content yang jelas: L dan R berbeda.
    auto makeL = [&] {
        std::vector<float> v(frames);
        for (int i = 0; i < frames; ++i) {
            v[i] = 0.4f * std::sin(2.0 * M_PI * 1000.0 * i / 48000.0);
        }
        return v;
    };

    auto makeR = [&] {
        std::vector<float> v(frames);
        for (int i = 0; i < frames; ++i) {
            v[i] = 0.4f * std::sin(2.0 * M_PI * 1500.0 * i / 48000.0);
        }
        return v;
    };

    // Ukur "keluasan": energi selisih (side) relatif terhadap jumlah (mid).
    auto sideRatio = [&](const std::vector<float>& l,
                         const std::vector<float>& r) {
        double side = 0.0;
        double mid = 0.0;
        for (size_t i = 0; i < l.size(); ++i) {
            const double s = (l[i] - r[i]) * 0.5;
            const double m = (l[i] + r[i]) * 0.5;
            side += s * s;
            mid += m * m;
        }
        return side / (mid + 1e-12);
    };

    auto l0 = makeL();
    auto r0 = makeR();

    const double base = sideRatio(l0, r0);

    // Netral (width 1, depth 0) harus benar-benar tidak mengubah buffer.
    auto lNeutral = makeL();
    auto rNeutral = makeR();

    SpatialFieldProcessor neutral;
    neutral.setWidth(1.0f);
    neutral.setDepth(0.0f);
    neutral.process(lNeutral.data(), rNeutral.data(), frames);

    check(
        std::memcmp(lNeutral.data(), l0.data(),
                    l0.size() * sizeof(float)) == 0,
        "width 1 + depth 0 = bypass bit-exact (sebelumnya: no-op juga, tapi\n"
        "        sekarang karena matematikanya netral, bukan karena stub)"
    );

    // Lebar: width 1.6 harus menaikkan rasio side.
    auto lWide = makeL();
    auto rWide = makeR();

    SpatialFieldProcessor wider;
    wider.setWidth(1.6f);
    wider.setDepth(0.0f);
    wider.process(lWide.data(), rWide.data(), frames);

    const double wide = sideRatio(lWide, rWide);

    std::printf("        (side/mid: %.4f -> %.4f)\n", base, wide);

    check(wide > base * 1.5, "width 1.6 melebarkan (side/mid naik >50%)");

    // Sempit: width 0.4 harus menurunkan rasio side.
    auto lNarrow = makeL();
    auto rNarrow = makeR();

    SpatialFieldProcessor narrower;
    narrower.setWidth(0.4f);
    narrower.setDepth(0.0f);
    narrower.process(lNarrow.data(), rNarrow.data(), frames);

    const double narrow = sideRatio(lNarrow, rNarrow);

    check(narrow < base * 0.5, "width 0.4 menyempitkan");

    // Depth: harus menambahkan ruang tanpa mengubah level secara liar.
    auto lDeep = makeL();
    auto rDeep = makeR();

    SpatialFieldProcessor deep;
    deep.setWidth(1.0f);
    deep.setDepth(0.35f);
    deep.process(lDeep.data(), rDeep.data(), frames);

    const double deepRatio = sideRatio(lDeep, rDeep);

    std::printf("        (side/mid dengan depth 0.35: %.4f)\n", deepRatio);

    check(deepRatio != base, "depth mengubah citra");

    // Tanpa umpan silang, depth pada sinyal yang identik L=R tidak akan
    // menghasilkan apa pun. Dengan umpan silang + delay, ia harus
    // menghasilkan perbedaan.
    auto lSame = makeL();
    auto rSame = makeL();

    SpatialFieldProcessor cross;
    cross.setWidth(1.0f);
    cross.setDepth(0.6f);
    cross.process(lSame.data(), rSame.data(), frames);

    double diff = 0.0;
    for (int i = 0; i < frames; ++i) {
        diff += std::fabs(lSame[i] - rSame[i]);
    }

    check(diff > 1.0, "umpan silang menciptakan perbedaan L/R dari input mono");
}

// =====================================================
// MAIN
// =====================================================

int main() {

    std::printf("=== TEST IMMERSIVE CHAIN ===\n");
    std::printf("Membuktikan 3 kelas immersive tidak lagi stub\n");

    testBrainwaveAdds();
    testHarmonicProducesHarmonics();
    testSpatialWidens();

    std::printf("\n========================================\n");
    std::printf("HASIL: %d lulus, %d gagal\n", gPass, gFail);
    std::printf("========================================\n");

    return gFail == 0 ? 0 : 1;
}
