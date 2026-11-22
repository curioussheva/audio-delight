import React, { memo, useCallback } from "react";
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
import { SwitchToDspButton } from "@/features/equalizer/components/SwitchToDspButton";

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
 *
 * Per-node render (2026-11-22):
 *  - Audit: subscreen ini bukan memo dan melanggan 6 nilai + 5 aksi
 *    store di INDUK — tiap tick drag slider intensitas/frekuensi,
 *    tiap ganti template, tiap ganti pita binaural me-render ulang
 *    SELURUH subscreen: 7 chip template, 5 chip binaural, TuningControl,
 *    HeadphoneSection, kedua slider, catatan, tombol. Selector-nya
 *    memang sudah per nilai (bukan seluruh store), tapi pemiliknya
 *    induk, jadi nilainya tidak melindungi apa pun.
 *  - Sesudah: shell memo ini TIDAK melanggan playerStore sama sekali
 *    (hanya tema). Tiap seksi memo di bawah MEMILIKI selector-nya
 *    sendiri: drag intensitas → hanya IntensityCard; ganti template →
 *    hanya TemplateCard (+ FrequencyCard/IntensityCard bila nilainya
 *    ikut berubah lewat store); ganti binaural → hanya BrainwaveCard.
 *    TuningControl + HeadphoneSection sudah memo dan memiliki
 *    langganannya sendiri — dibungkus kartu memo statis. Peringatan
 *    "Intensitas 0%" di kartu binaural memakai selector boolean
 *    (`resonanceIntensity === 0`) supaya kartu itu tidak bangun tiap
 *    tick drag intensitas — hanya saat 0% dilintasi.
 *    Tombol DSP memo tanpa prop (SwitchToDspButton, commit BitPerfect).
 */
export const SolfeggioSubscreen = memo(function SolfeggioSubscreen() {
  const { theme } = useTheme();
  const { colors, spacing } = theme;

  const info = MODE_INFO.immersive;

  return (
    <View
      style={[styles.wrap, { marginHorizontal: spacing.md, gap: spacing.md }]}
    >
      <Text style={[styles.description, { color: colors.text.secondary }]}>
        {info.description}
      </Text>

      <TemplateCard />
      <FrequencyCard />
      <TuningCard />
      <IntensityCard />
      <BrainwaveCard />
      <HeadphoneCard />

      {/* P2 audit BitPerfect/Solfeggio 2026-11-20: teks lama "tidak berlaku
          di mode ini" tidak tepat — nilai widener DSP menggerakkan lebar
          spatial di sini, jadi kontrolnya memang diatur di tab DSP tapi
          nilainya berlaku. */}
      <Text style={[styles.note, { color: colors.text.tertiary }]}>
        Kontrol EQ/DSP lain diatur di tab DSP (nilainya tetap berlaku di sini).
      </Text>

      {/* Pindah ke DSP — jalan keluar di bawah layar (P2 audit
          BitPerfect/Solfeggio 2026-11-20): BitPerfect punya tombol ini;
          Solfeggio — layar terpanjang di tab — tidak punya, padahal
          pemilih mode ada di atas dan mengharuskan scroll ke atas. */}
      <SwitchToDspButton />
    </View>
  );
});

/** Aksen sebagai teks di atas permukaan kartu — pola Equalizer. */
function useAccentOnSecondary(): string {
  const { theme } = useTheme();
  const { colors } = theme;
  return accentOn([colors.primary[500]], colors.background.secondary, [
    colors.text.primary,
    colors.text.secondary,
  ]);
}

function useCardStyle() {
  const { theme } = useTheme();
  const { colors, spacing } = theme;
  return {
    colors,
    spacing,
    card: {
      backgroundColor: colors.background.secondary,
      borderColor: colors.border.medium,
      padding: spacing.md,
    },
  };
}

/**
 * Kartu Template Solfeggio — hanya render ulang bila template aktif
 * berganti. Drag slider lain tidak menyentuhnya.
 */
const TemplateCard = memo(function TemplateCard() {
  const { colors, spacing, card } = useCardStyle();
  const accentOnSecondary = useAccentOnSecondary();
  const solfeggioTemplateId = usePlayerStore((s) => s.solfeggioTemplateId);
  const setSolfeggioTemplate = usePlayerStore((s) => s.setSolfeggioTemplate);

  const activeTemplate = getSolfeggioTemplate(solfeggioTemplateId);
  const isCustom = solfeggioTemplateId === CUSTOM_TEMPLATE_ID;

  return (
    <View style={[styles.card, card]}>
      <View style={styles.rowBetween}>
        <Text style={[styles.displayTitle, { color: colors.text.primary }]}>
          Template Solfeggio
        </Text>
        <Text style={[styles.value, { color: accentOnSecondary }]}>
          {isCustom ? "Kustom" : activeTemplate?.name}
        </Text>
      </View>
      <Text style={[styles.cardHint, { color: colors.text.tertiary }]}>
        Pilih frekuensi + intensitas awal. Mengubah slider di bawah sesudahnya
        tidak mengunci template — status jadi Kustom.
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
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
              <Text style={[styles.chipFreq, { color: colors.text.secondary }]}>
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
  );
});

/**
 * Kartu Frekuensi resonator — hanya render ulang bila frekuensi
 * berubah (drag slider ini, atau ganti template). Drag intensitas
 * tidak menyentuhnya.
 */
const FrequencyCard = memo(function FrequencyCard() {
  const { colors, card } = useCardStyle();
  const accentOnSecondary = useAccentOnSecondary();
  const solfeggioFreq = usePlayerStore((s) => s.solfeggioFreq);
  const setSolfeggioFreq = usePlayerStore((s) => s.setSolfeggioFreq);
  // Tulis storage tertunda saat drag slider selesai (P2 audit).
  const persistSolfeggioNow = usePlayerStore((s) => s.persistSolfeggioNow);
  const handleSlidingComplete = useCallback(
    () => void persistSolfeggioNow(),
    [persistSolfeggioNow],
  );

  return (
    <View style={[styles.card, card]}>
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
        onSlidingComplete={handleSlidingComplete}
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
  );
});

/**
 * Kartu Tuning — tanpa langganan store sendiri; TuningControl sudah
 * memo dan memiliki tuningCents/audioMode-nya sendiri. Kartu ini
 * statis, tidak bangun saat slider/template/binaural berubah.
 */
const TuningCard = memo(function TuningCard() {
  const { colors, spacing, card } = useCardStyle();
  return (
    <View style={[styles.card, card]}>
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
  );
});

/**
 * Kartu Intensitas master — hanya render ulang bila intensitas
 * berubah (drag slider ini, atau ganti template). Drag frekuensi
 * dan ganti binaural tidak menyentuhnya.
 */
const IntensityCard = memo(function IntensityCard() {
  const { colors, card } = useCardStyle();
  const accentOnSecondary = useAccentOnSecondary();
  const resonanceIntensity = usePlayerStore((s) => s.resonanceIntensity);
  const setResonanceIntensity = usePlayerStore((s) => s.setResonanceIntensity);
  const persistSolfeggioNow = usePlayerStore((s) => s.persistSolfeggioNow);
  const handleSlidingComplete = useCallback(
    () => void persistSolfeggioNow(),
    [persistSolfeggioNow],
  );

  return (
    <View style={[styles.card, card]}>
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
        onSlidingComplete={handleSlidingComplete}
        minimumTrackTintColor={colors.primary[500]}
        maximumTrackTintColor={colors.background.tertiary}
        thumbTintColor={colors.primary[500]}
        accessibilityLabel="Intensitas Solfeggio"
        accessibilityRole="adjustable"
      />
      <Text style={[styles.cardHint, { color: colors.text.tertiary }]}>
        Intensitas master — resonansi, exciter, spatial, dan volume denyut
        binaural diatur bersama.
      </Text>
    </View>
  );
});

/**
 * Kartu Denyut Binaural — hanya render ulang bila pita binaural
 * berganti, atau saat intensitas MELINTASI 0% (peringatan di bawah).
 * Tick drag intensitas di atas 0% tidak menyentuhnya: peringatan
 * memakai selector boolean, bukan nilai intensitasnya.
 */
const BrainwaveCard = memo(function BrainwaveCard() {
  const { colors, spacing, card } = useCardStyle();
  const accentOnSecondary = useAccentOnSecondary();
  const brainwaveFreq = usePlayerStore((s) => s.brainwaveFreq);
  const setBrainwaveFreq = usePlayerStore((s) => s.setBrainwaveFreq);
  const intensityIsZero = usePlayerStore((s) => s.resonanceIntensity === 0);

  // Pita denyut yang benar-benar dimainkan native untuk frekuensi
  // tersimpan (ambang sama dengan ImmersiveStage).
  const activeBand = matchBrainwaveBand(brainwaveFreq);

  return (
    <View style={[styles.card, card]}>
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
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
              <Text style={[styles.chipFreq, { color: colors.text.secondary }]}>
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
        Hanya terdengar lewat headphone/IEM. Kekuatan denyut mengikuti slider
        Intensitas.
      </Text>
      {intensityIsZero && brainwaveFreq > 0 && (
        <Text style={[styles.cardHint, { color: colors.text.tertiary }]}>
          Intensitas 0% — denyut tidak terdengar; naikkan Intensitas.
        </Text>
      )}
    </View>
  );
});

/**
 * Kartu Koreksi headphone (B-HPIMM) — berlaku di Solfeggio: native
 * menerapkannya di akhir rantai Immersive, dengan switch yang sama
 * seperti di DSP. Tanpa `disabled`: seksi ini TIDAK beku di sini,
 * tidak seperti seksi DSP lain di mode ini.
 * P2 audit BitPerfect/Solfeggio 2026-11-20: dulu tampil telanjang
 * tanpa kartu, judulnya 16 mengalahkan judul kartu 14 di
 * sekelilingnya. Kini dibungkus kartu yang sama seperti seksi lain
 * (inCard: padding + judul disamakan).
 * Kartu ini statis — HeadphoneSection sudah memo dan memiliki
 * langganannya sendiri.
 */
const HeadphoneCard = memo(function HeadphoneCard() {
  const { card } = useCardStyle();
  return (
    <View style={[styles.card, card]}>
      <HeadphoneSection inCard />
    </View>
  );
});

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
  // Umpan balik tekan (P2 audit): Pressable tanpa style pressed terasa
  // mati — samakan dengan TuningControl (haptic) + opacity.
  pressed: {
    opacity: 0.7,
  },
});
