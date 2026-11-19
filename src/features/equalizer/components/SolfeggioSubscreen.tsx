import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import Slider from "@react-native-community/slider";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/shared/context/ThemeContext";
import { FONT_FAMILY, BASE_RADIUS } from "@/shared/constants/themes/base";
import { accentOn } from "@/shared/utils/contrast";
import { MODE_INFO } from "@/features/equalizer/api/modeInfo";
import {
  CUSTOM_TEMPLATE_ID,
  SOLFEGGIO_FREQ_MAX,
  SOLFEGGIO_FREQ_MIN,
  SOLFEGGIO_TEMPLATES,
  getSolfeggioTemplate,
} from "@/features/equalizer/api/solfeggioTemplates";
import {
  BRAINWAVE_BANDS,
  matchBrainwaveBand,
} from "@/features/equalizer/api/brainwaveBands";
import { TuningControl } from "@/features/player/components/TuningControl";
import { HeadphoneSection } from "@/features/headphone/components/HeadphoneSection";
import { usePlayerStore } from "@/features/player/store/playerStore";

/**
 * Subscreen Solfeggio (mode immersive): template + tuning + intensitas master.
 *
 * - Template: 7 frekuensi Solfeggio (396–963 Hz), masing-masing dengan
 *   intensitas default. Memilih template mengatur frekuensi + intensitas,
 *   live ke NativeDSPModule lewat playerStore. Template hanya titik awal:
 *   mengubah slider intensitas atau frekuensi sesudahnya membuat template
 *   aktif jadi "Kustom". Asosiasi ditulis sebagai atribusi tradisional,
 *   bukan klaim medis/penyembuhan.
 * - Frekuensi: slider 100–2000 Hz (jepit di store) untuk pilihan kustom.
 * - Tuning: TuningControl bersama (dipakai juga settings) — preset A=440 /
 *   A=432, stepper ±5 sen, nonaktif di Bit-Perfect.
 * - Intensitas: slider master 0–100% (resonansi + exciter + spatial
 *   bersama, dan volume denyut binaural), default 50%, live ke
 *   NativeDSPModule.setResonanceIntensity lewat playerStore — dorong
 *   native di-throttle 100 ms, tulis storage saat drag selesai (P2 audit
 *   BitPerfect/Solfeggio 2026-11-20).
 * - Denyut Binaural (2026-11-20): binaural beat akhirnya dihidupkan.
 *   Chip Mati + 5 pita (Delta 2,5 / Theta 6 / Alpha 10 / Beta 18 /
 *   Gamma 40 Hz) — frekuensi denyut yang benar-benar dimainkan native
 *   (carrier tetap 200 Hz). Volume denyut mengikuti Intensitas; hanya
 *   terdengar lewat headphone/IEM. Asosiasi pita atribusi tradisional,
 *   bukan klaim medis.
 * - Kontrol EQ/DSP diatur di tab DSP; nilainya tetap berlaku di sini
 *   (mis. lebar widener → lebar spatial; koreksi headphone punya seksi
 *   sendiri di bawah). Yang tidak berlaku: EQ 10-band, bass, reverb,
 *   HRTF, dan master gain.
 */
export function SolfeggioSubscreen() {
  const { theme } = useTheme();
  const { colors, spacing } = theme;
  const resonanceIntensity = usePlayerStore((s) => s.resonanceIntensity);
  const setResonanceIntensity = usePlayerStore((s) => s.setResonanceIntensity);
  const solfeggioFreq = usePlayerStore((s) => s.solfeggioFreq);
  const solfeggioTemplateId = usePlayerStore((s) => s.solfeggioTemplateId);
  const setSolfeggioFreq = usePlayerStore((s) => s.setSolfeggioFreq);
  const setSolfeggioTemplate = usePlayerStore((s) => s.setSolfeggioTemplate);
  const setAudioMode = usePlayerStore((s) => s.setAudioMode);
  const brainwaveFreq = usePlayerStore((s) => s.brainwaveFreq);
  const setBrainwaveFreq = usePlayerStore((s) => s.setBrainwaveFreq);
  // Tulis storage tertunda saat drag slider selesai (P2 audit).
  const persistSolfeggioNow = usePlayerStore((s) => s.persistSolfeggioNow);

  const info = MODE_INFO.immersive;
  // Nilai % sebagai teks aksen — pola Equalizer: aksen dipakai selama
  // terbaca di atas permukaan kartu (background.secondary).
  const accentOnSecondary = accentOn(
    [colors.primary[500]],
    colors.background.secondary,
    [colors.text.primary, colors.text.secondary],
  );

  const activeTemplate = getSolfeggioTemplate(solfeggioTemplateId);
  const isCustom = solfeggioTemplateId === CUSTOM_TEMPLATE_ID;
  // Pita denyut yang benar-benar dimainkan native untuk frekuensi
  // tersimpan (ambang sama dengan ImmersiveStage).
  const activeBand = matchBrainwaveBand(brainwaveFreq);

  return (
    <View
      style={[styles.wrap, { marginHorizontal: spacing.md, gap: spacing.md }]}
    >
      <Text style={[styles.description, { color: colors.text.secondary }]}>
        {info.description}
      </Text>

      {/* Template Solfeggio */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.background.secondary,
            borderColor: colors.border.medium,
            padding: spacing.md,
          },
        ]}
      >
        <View style={styles.rowBetween}>
          <Text style={[styles.displayTitle, { color: colors.text.primary }]}>
            Template Solfeggio
          </Text>
          <Text style={[styles.value, { color: accentOnSecondary }]}>
            {isCustom ? "Kustom" : activeTemplate?.name}
          </Text>
        </View>
        <Text style={[styles.cardHint, { color: colors.text.tertiary }]}>
          Pilih frekuensi + intensitas awal. Mengubah slider di bawah
          sesudahnya tidak mengunci template — status jadi Kustom.
        </Text>
        <View style={[styles.chipGrid, { marginTop: spacing.sm }]}>
          {SOLFEGGIO_TEMPLATES.map((template) => {
            const active = template.id === solfeggioTemplateId;
            return (
              <Pressable
                key={template.id}
                onPress={() => {
                  // P2 audit: chip dulu tanpa umpan balik tekan/haptic
                  // (TuningControl di layar yang sama memberi haptic).
                  void Haptics.impactAsync(
                    Haptics.ImpactFeedbackStyle.Light,
                  );
                  void setSolfeggioTemplate(template.id);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Template ${template.name}, ${template.freq} Hz`}
                style={({ pressed }) => [
                  styles.chip,
                  {
                    borderColor: active
                      ? colors.primary[500]
                      : colors.border.medium,
                    borderWidth: active ? 2 : 1,
                    backgroundColor: active
                      ? colors.background.tertiary
                      : colors.background.secondary,
                  },
                  pressed && styles.pressed,
                ]}
              >
                <Text
                  style={[
                    styles.chipName,
                    {
                      color: colors.text.primary,
                      fontFamily: active
                        ? FONT_FAMILY.bold
                        : FONT_FAMILY.semiBold,
                    },
                  ]}
                >
                  {template.name}
                </Text>
                <Text
                  style={[styles.chipFreq, { color: colors.text.secondary }]}
                >
                  {template.freq} Hz
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={[styles.cardHint, { color: colors.text.tertiary }]}>
          {isCustom
            ? "Kustom — frekuensi atau intensitas diubah dari template."
            : activeTemplate?.association}
        </Text>
      </View>

      {/* Frekuensi resonator */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.background.secondary,
            borderColor: colors.border.medium,
            padding: spacing.md,
          },
        ]}
      >
        <View style={styles.rowBetween}>
          <Text style={[styles.cardTitle, { color: colors.text.primary }]}>
            Frekuensi
          </Text>
          <Text style={[styles.value, { color: accentOnSecondary }]}>
            {Math.round(solfeggioFreq)} Hz
          </Text>
        </View>
        <Slider
          style={styles.slider}
          minimumValue={SOLFEGGIO_FREQ_MIN}
          maximumValue={SOLFEGGIO_FREQ_MAX}
          step={1}
          value={solfeggioFreq}
          onValueChange={setSolfeggioFreq}
          onSlidingComplete={() => void persistSolfeggioNow()}
          minimumTrackTintColor={colors.primary[500]}
          maximumTrackTintColor={colors.background.tertiary}
          thumbTintColor={colors.primary[500]}
          accessibilityLabel="Frekuensi Solfeggio"
          accessibilityRole="adjustable"
        />
        <Text style={[styles.cardHint, { color: colors.text.tertiary }]}>
          Frekuensi resonator — pilih template di atas atau geser sendiri
          (100–2000 Hz).
        </Text>
      </View>

      {/* Tuning (Nada Dasar) */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.background.secondary,
            borderColor: colors.border.medium,
            padding: spacing.md,
          },
        ]}
      >
        <Text style={[styles.cardTitle, { color: colors.text.primary }]}>
          Tuning (Nada Dasar)
        </Text>
        <Text
          style={[
            styles.cardHint,
            { color: colors.text.tertiary, marginBottom: spacing.sm },
          ]}
        >
          Tinggi nada lagu tanpa mengubah tempo (A=440 standar, A=432 Verdi).
          Berlaku di mode ini dan DSP.
        </Text>
        <TuningControl />
      </View>

      {/* Intensitas master */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.background.secondary,
            borderColor: colors.border.medium,
            padding: spacing.md,
          },
        ]}
      >
        <View style={styles.rowBetween}>
          <Text style={[styles.cardTitle, { color: colors.text.primary }]}>
            Intensitas
          </Text>
          <Text style={[styles.value, { color: accentOnSecondary }]}>
            {Math.round(resonanceIntensity * 100)}%
          </Text>
        </View>
        <Slider
          style={styles.slider}
          minimumValue={0}
          maximumValue={1}
          step={0.01}
          value={resonanceIntensity}
          onValueChange={setResonanceIntensity}
          onSlidingComplete={() => void persistSolfeggioNow()}
          minimumTrackTintColor={colors.primary[500]}
          maximumTrackTintColor={colors.background.tertiary}
          thumbTintColor={colors.primary[500]}
          accessibilityLabel="Intensitas Solfeggio"
          accessibilityRole="adjustable"
        />
        <Text style={[styles.cardHint, { color: colors.text.tertiary }]}>
          Intensitas master — resonansi, exciter, spatial, dan volume
          denyut binaural diatur bersama.
        </Text>
      </View>

      {/* Denyut Binaural — tahap Brainwave di akhir rantai Immersive
          (2026-11-20): binaural beat akhirnya dihidupkan. Chip Mati + 5
          pita; yang dimainkan native selalu salah satu dari 2,5/6/10/18/
          40 Hz (carrier tetap 200 Hz). Volume denyut mengikuti
          Intensitas di atas — intensitas 0 = denyut tidak terdengar.
          Hanya terdengar lewat headphone/IEM; di speaker, kedua kanal
          bercampur di udara dan denyutnya hilang. Asosiasi pita atribusi
          tradisional, bukan klaim medis. Kartu ini hanya ada di mode
          Immersive (subscreen ini tidak dirender di mode lain), dan
          keluar dari mode ini me-reset denyut di native ke 0. */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.background.secondary,
            borderColor: colors.border.medium,
            padding: spacing.md,
          },
        ]}
      >
        <View style={styles.rowBetween}>
          <Text style={[styles.cardTitle, { color: colors.text.primary }]}>
            Denyut Binaural
          </Text>
          <Text style={[styles.value, { color: accentOnSecondary }]}>
            {activeBand.name}
          </Text>
        </View>
        <View style={[styles.chipGrid, { marginTop: spacing.sm }]}>
          {BRAINWAVE_BANDS.map((band) => {
            const active = band.id === activeBand.id;
            return (
              <Pressable
                key={band.id}
                onPress={() => {
                  void Haptics.impactAsync(
                    Haptics.ImpactFeedbackStyle.Light,
                  );
                  void setBrainwaveFreq(band.freq);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Denyut binaural ${band.name}${band.freq > 0 ? `, ${band.freq} Hz` : ", mati"}`}
                style={({ pressed }) => [
                  styles.chip,
                  {
                    borderColor: active
                      ? colors.primary[500]
                      : colors.border.medium,
                    borderWidth: active ? 2 : 1,
                    backgroundColor: active
                      ? colors.background.tertiary
                      : colors.background.secondary,
                  },
                  pressed && styles.pressed,
                ]}
              >
                <Text
                  style={[
                    styles.chipName,
                    {
                      color: colors.text.primary,
                      fontFamily: active
                        ? FONT_FAMILY.bold
                        : FONT_FAMILY.semiBold,
                    },
                  ]}
                >
                  {band.name}
                </Text>
                <Text
                  style={[styles.chipFreq, { color: colors.text.secondary }]}
                >
                  {band.freq > 0 ? `${band.freq} Hz` : "Tidak aktif"}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={[styles.cardHint, { color: colors.text.tertiary }]}>
          {activeBand.freq > 0
            ? activeBand.association
            : "Tidak ada denyut — hanya musik + resonator."}
        </Text>
        <Text style={[styles.cardHint, { color: colors.text.tertiary }]}>
          Hanya terdengar lewat headphone/IEM. Kekuatan denyut mengikuti
          slider Intensitas.
        </Text>
        {resonanceIntensity === 0 && brainwaveFreq > 0 && (
          <Text style={[styles.cardHint, { color: colors.text.tertiary }]}>
            Intensitas 0% — denyut tidak terdengar; naikkan Intensitas.
          </Text>
        )}
      </View>

      {/* Koreksi headphone (B-HPIMM) — berlaku di Solfeggio: native
          menerapkannya di akhir rantai Immersive, dengan switch yang sama
          seperti di DSP. Tanpa `disabled`: seksi ini TIDAK beku di sini,
          tidak seperti seksi DSP lain di mode ini.
          P2 audit BitPerfect/Solfeggio 2026-11-20: dulu tampil telanjang
          tanpa kartu, judulnya 16 mengalahkan judul kartu 14 di
          sekelilingnya. Kini dibungkus kartu yang sama seperti seksi lain
          (inCard: padding + judul disamakan). */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.background.secondary,
            borderColor: colors.border.medium,
            padding: spacing.md,
          },
        ]}
      >
        <HeadphoneSection inCard />
      </View>

      {/* P2 audit BitPerfect/Solfeggio 2026-11-20: teks lama "tidak berlaku
          di mode ini" tidak tepat — nilai widener DSP menggerakkan lebar
          spatial di sini, jadi kontrolnya memang diatur di tab DSP tapi
          nilainya berlaku. */}
      <Text style={[styles.note, { color: colors.text.tertiary }]}>
        Kontrol EQ/DSP lain diatur di tab DSP (nilainya tetap berlaku di
        sini).
      </Text>

      {/* Pindah ke DSP — jalan keluar di bawah layar (P2 audit
          BitPerfect/Solfeggio 2026-11-20): BitPerfect punya tombol ini;
          Solfeggio — layar terpanjang di tab — tidak punya, padahal
          pemilih mode ada di atas dan mengharuskan scroll ke atas. */}
      <Pressable
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: colors.primary[500] },
          pressed && styles.pressed,
        ]}
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          void setAudioMode("dsp");
        }}
        accessibilityRole="button"
        accessibilityLabel="Pindah ke mode DSP"
      >
        <Text style={[styles.buttonText, { color: colors.text.inverse }]}>
          Pindah ke DSP
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: 16,
  },
  description: {
    fontSize: 13,
    fontFamily: FONT_FAMILY.regular,
    lineHeight: 19,
  },
  card: {
    borderRadius: BASE_RADIUS.xl,
    borderWidth: 1,
  },
  cardTitle: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.bold,
  },
  // P2 audit BitPerfect/Solfeggio 2026-11-20: keluarga tab EQ nol
  // Playfair — satu-satunya tanpa suara display. Satu jenjang display
  // (h4, 20/28 — seperti statusValue Analyzer): judul kartu utama tiap
  // layar memakai displayBold, sisanya tetap Inter. Di layar ini
  // jangkarnya judul "Template Solfeggio".
  displayTitle: {
    fontSize: 20,
    fontFamily: FONT_FAMILY.displayBold,
    lineHeight: 28,
  },
  cardHint: {
    fontSize: 11,
    fontFamily: FONT_FAMILY.regular,
    lineHeight: 16,
    marginTop: 4,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  value: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.bold,
  },
  slider: {
    width: "100%",
    height: 40,
  },
  chipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    // P2 audit BitPerfect/Solfeggio 2026-11-20: flexGrow: 1 dulu membuat
    // chip ke-7 (sendirian di baris terakhir 3/3/1) melar selebar baris.
    // Lebar dikunci: 3 chip per baris, semua sama besar.
    flexGrow: 0,
    flexBasis: "31%",
    borderRadius: BASE_RADIUS.md,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: "center",
  },
  chipName: {
    fontSize: 13,
    fontFamily: FONT_FAMILY.bold,
  },
  chipFreq: {
    fontSize: 11,
    fontFamily: FONT_FAMILY.regular,
    marginTop: 2,
  },
  note: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.regular,
    lineHeight: 17,
  },
  // Tombol "Pindah ke DSP" — sama seperti BitPerfectSubscreen.
  button: {
    borderRadius: BASE_RADIUS.md,
    paddingVertical: 12,
    alignItems: "center",
  },
  buttonText: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.bold,
  },
  // Umpan balik tekan (P2 audit): Pressable tanpa style pressed terasa
  // mati — samakan dengan TuningControl (haptic) + opacity.
  pressed: {
    opacity: 0.7,
  },
});
