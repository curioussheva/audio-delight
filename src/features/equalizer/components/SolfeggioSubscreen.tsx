import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import Slider from "@react-native-community/slider";
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
 *   bersama), default 50%, live ke NativeDSPModule.setResonanceIntensity
 *   lewat playerStore — pola setBassBoost, tanpa throttle.
 * - Tidak ada kontrol binaural: binaural beat tidak diimplementasikan.
 * - Kontrol EQ/DSP tidak berlaku di mode ini; mereka tinggal di tab DSP.
 *   Pengecualian: koreksi headphone (B-HPIMM) — seksi di bawah, tanpa
 *   `disabled`, jadi switch-nya bisa dipakai di sini sama seperti di DSP.
 *   Native menerapkan preset yang sama di akhir rantai Immersive.
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
          <Text style={[styles.cardTitle, { color: colors.text.primary }]}>
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
                onPress={() => setSolfeggioTemplate(template.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Template ${template.name}, ${template.freq} Hz`}
                style={[
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
          Tidak berlaku di mode Bit-Perfect.
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
          minimumTrackTintColor={colors.primary[500]}
          maximumTrackTintColor={colors.background.tertiary}
          thumbTintColor={colors.primary[500]}
          accessibilityLabel="Intensitas Solfeggio"
          accessibilityRole="adjustable"
        />
        <Text style={[styles.cardHint, { color: colors.text.tertiary }]}>
          Intensitas master — resonansi, exciter, dan spatial diatur bersama.
        </Text>
      </View>

      {/* Koreksi headphone (B-HPIMM) — berlaku di Solfeggio: native
          menerapkannya di akhir rantai Immersive, dengan switch yang sama
          seperti di DSP. Tanpa `disabled`: seksi ini TIDAK beku di sini,
          tidak seperti seksi DSP lain di mode ini. */}
      <HeadphoneSection />

      <Text style={[styles.note, { color: colors.text.tertiary }]}>
        Kontrol EQ/DSP lain tidak berlaku di mode ini — atur di tab DSP.
      </Text>
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
    flexGrow: 1,
    flexBasis: "30%",
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
});
