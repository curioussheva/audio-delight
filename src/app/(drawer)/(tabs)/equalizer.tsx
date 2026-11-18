import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
  Pressable,
  Dimensions,
  ScrollView,
  Alert,
  LayoutAnimation,
  UIManager,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Save,
  Zap,
  RotateCcw,
  Eye,
  EyeOff,
} from "lucide-react-native";

import { GestureHandlerRootView } from "react-native-gesture-handler";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useTheme } from "@/shared/context/ThemeContext";
import { ScreenHeader } from "@/shared/components/ui/ScreenHeader";
import { ScreenList } from "@/shared/components/ui/ScreenList";
import { useEqualizer } from "@/features/equalizer/hooks/useEqualizer";
import {
  accentOn,
  pickReadable,
  AA_NORMAL,
} from "@/shared/utils/contrast";
import {
  usePlayerStore,
  type AudioMode,
} from "@/features/player/store/playerStore";
import { FrequencyGraph } from "@/features/equalizer/components/Graph";
import { EqualizerBand } from "@/features/equalizer/components/Band";
import { VerticalSlider } from "@/features/equalizer/components/VerticalSlider";
import { PresetChip } from "@/features/equalizer/components/PresetChip";
import { SavePresetModal } from "@/features/equalizer/components/SavePresetModal";
import { HeadphoneSection } from "@/features/headphone/components/HeadphoneSection";
import { useHeadphoneCorrection } from "@/features/headphone/hooks/useHeadphoneCorrection";
import {
  combinedCurveGains,
  parseCorrectionPresetText,
} from "@/features/equalizer/api/correctionResponse";
import { MODE_INFO } from "@/features/equalizer/api/modeInfo";
import { SolfeggioSubscreen } from "@/features/equalizer/components/SolfeggioSubscreen";
import { BitPerfectSubscreen } from "@/features/equalizer/components/BitPerfectSubscreen";
import { useBitPerfectStatus } from "@/features/player/hooks/useBitPerfectStatus";
import { describeBitPerfectPath } from "@/features/player/api/bitPerfectPath";
import {
  DEFAULT_VISIBLE_SECTIONS,
  VISIBLE_SECTIONS_KEY,
  parseVisibleSections,
  type VisibleSections,
} from "@/features/equalizer/utils/visibleSections";
import { FLOATING_PLAYER_CLEARANCE } from "@/features/player/layout";

if (
  require("react-native").Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width } = Dimensions.get("window");

/** Label mode yang jujur - dibaca dari state, bukan dikarang di UI. */
const MODE_LABELS: Record<string, string> = {
  bitperfect: "BIT-PERFECT",
  "bit-perfect": "BIT-PERFECT",
  dsp: "DSP",
  immersive: "SOLFEGGIO",
};

// ─── MINI COMPONENTS ─────────────────────────────────────────────────────

interface MiniSwitchProps {
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
  color: string;
  label: string;
  /** Tata letak bertumpuk (label/switch di tengah kolom) untuk baris knob. */
  stacked?: boolean;
  /** Sembunyikan label teks — nama efek sudah ditampilkan knob di bawahnya. */
  hideLabel?: boolean;
}

const MiniSwitch = ({
  value,
  onValueChange,
  disabled,
  color,
  label,
  stacked,
  hideLabel,
}: MiniSwitchProps) => {
  const { theme } = useTheme();
  const colors = theme.colors;
  const on = value && !disabled;

  return (
    <View
      style={[
        styles.miniSwitchContainer,
        stacked && styles.miniSwitchStacked,
      ]}
    >
      {!hideLabel && (
        <Text
          style={[
            styles.miniSwitchLabel,
            { color: on ? color : colors.text.secondary },
          ]}
        >
          {label}
        </Text>
      )}
      {/* U-P2-01: Switch di-scale 0,8 lama → area sentuh ~41×25, di bawah
          44dp. Switch sendiri tidak menerima hitSlop yang andal, jadi
          dibungkus Pressable 44×44 yang jadi penangkap sentuh (Switch di
          dalam pointerEvents="none", hanya visual; peran switch + label
          pindah ke pembungkus supaya screen reader tetap membaca satu
          kontrol). */}
      <Pressable
        onPress={() => {
          if (!disabled) onValueChange(!value);
        }}
        disabled={disabled}
        style={styles.miniSwitchHit}
        accessibilityRole="switch"
        accessibilityLabel={label}
        accessibilityState={{ checked: value, disabled: !!disabled }}
      >
        <Switch
          value={value}
          onValueChange={onValueChange}
          disabled={disabled}
          // Track OFF dulu `#222` di atas kartu `#0A0A0A` - rasio 1.24, praktis
          // tak terlihat. Sekarang dari token supaya terbaca di semua tema.
          trackColor={{
            false: colors.background.tertiary,
            true: color + "55",
          }}
          thumbColor={on ? color : colors.text.tertiary}
          style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
          pointerEvents="none"
        />
      </Pressable>
    </View>
  );
};

interface SectionToggleProps {
  label: string;
  shown: boolean;
  onPress: () => void;
  /** Ikon saat tampil: "zap" untuk EFEK, mata untuk seksi lain. */
  activeIcon?: "zap";
}

const SectionToggle = ({
  label,
  shown,
  onPress,
  activeIcon,
}: SectionToggleProps) => {
  const { theme } = useTheme();
  const colors = theme.colors;
  const Icon = shown ? (activeIcon === "zap" ? Zap : Eye) : EyeOff;

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.viewBtn, { backgroundColor: colors.background.tertiary }]}
      accessibilityRole="button"
      accessibilityLabel={`Tampilkan atau sembunyikan ${label.toLowerCase()}`}
      accessibilityState={{ expanded: shown }}
    >
      <Icon
        size={12}
        color={shown ? colors.text.primary : colors.text.tertiary}
      />
      <Text
        style={[
          styles.viewBtnText,
          {
            color: shown ? colors.text.primary : colors.text.tertiary,
          },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
};

// ─── MAIN SCREEN ─────────────────────────────────────────────────────────

// Bottom padding: ruang untuk tab bar + FloatingPlayer (FLOATING_PLAYER_CLEARANCE).
const LIST_BOTTOM_PADDING = FLOATING_PLAYER_CLEARANCE + 20;

export default function EqualizerScreen() {
  const { theme } = useTheme();
  const colors = theme.colors;
  const spacing = theme.spacing;

  const eq = useEqualizer();
  const { audioMode, setAudioMode } = usePlayerStore();

  // Status tanpa-MMAP di tab mode (keputusan 2026-11-16 19:07): tampilkan
  // di sini, bukan notifikasi sekali — persisten, terlihat di semua mode
  // begitu verdict diketahui (bit-perfect pernah dicoba dan exclusive
  // ditolak). Subscreen bit-perfect sudah menampilkannya saat mode itu
  // aktif; baris di bawah membuatnya terlihat juga dari mode lain.
  const bpStatus = useBitPerfectStatus();
  const bpVerdict = describeBitPerfectPath(bpStatus);

  const [isModalVisible, setModalVisible] = useState(false);

  const [visibleSections, setVisibleSections] =
    useState<VisibleSections>(DEFAULT_VISIBLE_SECTIONS);
  const [sectionsLoaded, setSectionsLoaded] = useState(false);

  // U-P2-44: pilihan tampil/sembunyi DULU reset tiap kali layar dibuka
  // ulang. Sekarang dimuat dari AsyncStorage saat mount dan disimpan tiap
  // berubah. Guard `sectionsLoaded` mencegah nilai default menimpa nilai
  // tersimpan sebelum muat selesai.
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(VISIBLE_SECTIONS_KEY)
      .then((raw) => {
        if (!cancelled) setVisibleSections(parseVisibleSections(raw));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setSectionsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!sectionsLoaded) return;
    AsyncStorage.setItem(
      VISIBLE_SECTIONS_KEY,
      JSON.stringify(visibleSections),
    ).catch(() => {});
  }, [visibleSections, sectionsLoaded]);

  const toggleSection = (section: keyof typeof visibleSections) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setVisibleSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const handleReset = () => {
    Alert.alert("Reset DSP", "Kembalikan ke pengaturan netral?", [
      { text: "Batal", style: "cancel" },
      {
        text: "Reset",
        style: "destructive",
        onPress: () => eq.resetToDefault(),
      },
    ]);
  };

  // Preset custom bisa DISIMPAN tapi dulu tidak bisa DIHAPUS dari UI - aksi
  // `deletePreset` ada di store tapi nol pemanggil. Tekan lama untuk menghapus.
  const handlePresetLongPress = (
    id: string,
    name: string,
    isCustom?: boolean,
  ) => {
    if (!isCustom) return;

    Alert.alert("Hapus preset", `Hapus "${name}"?`, [
      { text: "Batal", style: "cancel" },
      {
        text: "Hapus",
        style: "destructive",
        onPress: () => eq.deletePreset(id),
      },
    ]);
  };

  const modeLabel =
    MODE_LABELS[String(audioMode ?? "")] ??
    String(audioMode ?? "-").toUpperCase();

  // U-P2-42: subtitle DULU "MESIN {isEQEnabled ? "AKTIF" : "BYPASS"}" —
  // di mode Solfeggio "BYPASS" terbaca sebagai "tidak ada pemrosesan",
  // padahal rantai resonansi Solfeggio tetap memproses (ImmersiveStage:
  // solfeggio 528 Hz + harmonic exciter + spatial, intensitas default 0,5;
  // yang mati hanya brainwave, freq 0). Label sekarang menyebut apa yang
  // benar-benar berjalan per mode. Bonus: di bit-perfect, isEQEnabled yang
  // true dulu salah menampilkan "AKTIF" padahal DSP dilewati.
  const engineLabel =
    audioMode === "immersive"
      ? "MESIN DSP BYPASS · RESONANSI AKTIF"
      : audioMode === "dsp" && eq.isEQEnabled
        ? "MESIN AKTIF"
        : "MESIN BYPASS";

  // Tiga mode, masing-masing punya mesinnya sendiri. Pemrosesan DSP (EQ, bass,
  // pelebar, koreksi headphone) HANYA hidup di mode `dsp`; Immersive memakai
  // rantai resonansinya sendiri dan tidak memakai seksi di bawah.
  const modes: Array<{ id: AudioMode; label: string; hint: string }> = [
    { id: "bit-perfect", label: "Bit-Perfect", hint: "tanpa DSP" },
    { id: "dsp", label: "DSP", hint: "EQ & efek" },
    { id: "immersive", label: "Solfeggio", hint: "resonansi" },
  ];

  // B4: pindah ke Bit-Perfect dari tab ini minta konfirmasi yang sama
  // dengan settings.tsx — redaksi Alert disamakan (DSP mati).
  const handleSelectMode = (mode: AudioMode) => {
    if (mode === audioMode) return;

    if (mode === "bit-perfect") {
      Alert.alert(
        "Aktifkan Bit-Perfect?",
        "Mode ini menonaktifkan semua DSP (EQ, Bass, Reverb) — hanya fade anti-klik yang tetap jalan. Pemutaran tetap berjalan walau device tidak mendukung jalur langsung; saat itu audio lewat mixer Android.",
        [
          { text: "Batal", style: "cancel" },
          {
            text: "Aktifkan",
            onPress: () => void setAudioMode("bit-perfect"),
          },
        ],
      );
      return;
    }

    void setAudioMode(mode);
  };

  // Mode apa pun selain `dsp` membekukan kontrol di layar ini.
  const isDSPFrozen = audioMode !== "dsp";

  // Koreksi headphone — dipasang di level layar (bukan hanya di
  // HeadphoneSection) supaya sinkronisasi perangkat tetap jalan walau
  // seksi Headphone tertutup, dan supaya layar ini bisa menggambar kurva
  // gabungan (koreksi + EQ). Dua pemakai hook yang sama tidak masalah:
  // efeknya idempotent dan membaca store yang sama.
  const { activeProfile, enabled: correctionEnabled } =
    useHeadphoneCorrection();

  // Kurva gabungan (koreksi + EQ) — dihitung dari teks preset profil
  // aktif. `HeadphoneProfile.filters` selalu kosong (importPreset
  // menyimpannya tanpa rincian), jadi parse dari presetText di sini;
  // gagal parse -> null -> kurva gabungan disembunyikan, bukan ditebak.
  // Profil yang filternya sudah terisi (di masa depan) dipakai langsung.
  const correctionForCurve = useMemo(() => {
    if (!activeProfile) return null;
    if (activeProfile.filters.length > 0) {
      return {
        filters: activeProfile.filters,
        preampDb: activeProfile.preampDb,
      };
    }
    const parsed = parseCorrectionPresetText(activeProfile.presetText);
    return parsed && parsed.filters.length > 0 ? parsed : null;
  }, [activeProfile]);

  // Koreksi benar-benar memproses hanya bila mode DSP + sakelar master
  // menyala + koreksi aktif + ada profil. Di luar itu kurva gabungan
  // disembunyikan (tidak menduplikasi kurva EQ).
  const correctionProcessing =
    audioMode === "dsp" &&
    eq.isEQEnabled &&
    correctionEnabled &&
    activeProfile !== null;
  const showCombinedCurve =
    correctionProcessing && correctionForCurve !== null;
  const combinedGains = useMemo(
    () =>
      showCombinedCurve && correctionForCurve
        ? combinedCurveGains(eq.currentBands, correctionForCurve)
        : null,
    [showCombinedCurve, correctionForCurve, eq.currentBands],
  );

  // Keterangan di bawah grafik — menyebut apa yang ditampilkan, bukan
  // menebak. Cabang tengah: koreksi aktif tapi teks presetnya tidak bisa
  // di-parse (kurva gabungan tidak tersedia, bukan salah tampil).
  const graphCaption =
    showCombinedCurve && activeProfile
      ? `Garis utuh: EQ manual · Garis putus-putus: koreksi ${activeProfile.name} + EQ (yang kamu dengar)`
      : correctionProcessing && activeProfile
        ? `Koreksi ${activeProfile.name} aktif — kurva gabungan tidak tersedia (profil tanpa rincian filter)`
        : "Kurva EQ manual — koreksi headphone tidak aktif";

  // Warna aksen dipilih lewat pengukuran terhadap permukaan tempat ia dipakai.
  //
  // Rantai lama (`accent?.orange ?? status.warning ?? primary[500]`) gagal
  // kontras di banyak tema: primary[500] pada tema gelap justru warna gelap
  // (charcoal-black 1.12:1, midnight-blue 1.30:1), sehingga fader dan label
  // nyaris tak terlihat. `accentOn` mengembalikan aksen tema selama terbaca,
  // dan jatuh ke warna teks kalau tidak.
  const onCard = colors.background.secondary;

  const accentTextFallback = [colors.text.primary, colors.text.secondary];

  const bassColor = accentOn(
    [colors.accent.orange],
    onCard,
    accentTextFallback,
  );
  const widthColor = accentOn(
    [colors.accent.blue],
    onCard,
    accentTextFallback,
  );
  const masterColor = accentOn(
    [colors.accent.green],
    onCard,
    accentTextFallback,
  );

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background.primary }]}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: LIST_BOTTOM_PADDING }}
        >
          {/* HEADER — U-P2-53: header bersama (ScreenHeader). Judul 24/900
              + subjudul 10px lama jadi 20/700 + 13px — perubahan visual
              kecil yang disengaja demi satu pola header. Tombol reset
              pindah ke slot `actions`; perilakunya tidak berubah. */}
          <ScreenHeader
            title="Audio Mode"
            subtitle={`MODE ${modeLabel} · ${engineLabel}`}
            style={{ paddingHorizontal: spacing.md, paddingVertical: 16 }}
            actions={
              <TouchableOpacity
                onPress={handleReset}
                disabled={eq.isDSPDisabled}
                style={[
                  styles.resetBtn,
                  { padding: spacing.sm, minWidth: 44, minHeight: 44 },
                  eq.isDSPDisabled && { opacity: 0.4 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Reset DSP ke pengaturan netral"
                accessibilityState={{ disabled: eq.isDSPDisabled }}
              >
                <RotateCcw size={18} color={colors.text.secondary} />
              </TouchableOpacity>
            }
          />

          {/* 0. PEMILIH MODE - tiga mode, tiga mesin.
              Mode `bit-perfect` melewati DSP, mode `immersive` memakai rantai
              resonansi sendiri. Keduanya membekukan seksi DSP di bawah; hanya
              `dsp` yang menghidupkannya. Kontrol mode ada DI SINI supaya orang
              tidak perlu pindah layar untuk membuat kontrol di layar ini
              berfungsi - dan supaya jelas mode mana yang sedang memproses. */}
          <View style={[styles.modeWrap, { marginHorizontal: spacing.md }]}>
            {modes.map((m) => {
              const isActive = audioMode === m.id;
              const bg = isActive ? masterColor : colors.background.tertiary;
              return (
                <TouchableOpacity
                  key={m.id}
                  onPress={() => handleSelectMode(m.id)}
                  style={[
                    styles.modeBtn,
                    {
                      backgroundColor: bg,
                      borderColor: isActive ? masterColor : colors.border.medium,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  accessibilityLabel={`Mode ${m.label} - ${m.hint}`}
                >
                  <Text
                    style={[
                      styles.modeLabel,
                      {
                        color: pickReadable(
                          [colors.text.inverse, colors.text.primary],
                          bg,
                          AA_NORMAL,
                        ),
                      },
                    ]}
                  >
                    {m.label}
                  </Text>
                  <Text
                    style={[
                      styles.modeHint,
                      {
                        color: isActive
                          ? pickReadable(
                              [colors.text.inverse, colors.text.secondary],
                              bg,
                              AA_NORMAL,
                            )
                          : colors.text.tertiary,
                      },
                    ]}
                  >
                    {m.hint}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Deskripsi mode aktif (B5): sakelar di atas harus menyebut apa
              yang dilakukan tiap mode, bukan cuma namanya. */}
          <Text
            style={[
              styles.modeDescription,
              {
                color: colors.text.secondary,
                marginHorizontal: spacing.md,
                marginBottom: spacing.md,
              },
            ]}
          >
            {MODE_INFO[audioMode].description}
          </Text>

          {/* Status tanpa-MMAP di tab mode (keputusan 2026-11-16 19:07):
              hanya muncul kalau exclusive PERNAH ditolak (tone fallback) —
              sebelum bit-perfect dicoba, verdict belum tahu dan baris ini
              tidak tampil. Kata-katanya bicara soal penolakan yang
              teramati, bukan mekanisme (MMAP) yang tidak terukur dari
              sinyal ini. */}
          {bpVerdict.tone === "fallback" && (
            <Text
              style={[
                styles.modeDescription,
                {
                  color: colors.accent.orange,
                  marginHorizontal: spacing.md,
                  marginBottom: spacing.md,
                },
              ]}
            >
              Bit-perfect: exclusive ditolak di perangkat ini — audio lewat
              mixer (fallback shared).
            </Text>
          )}

          {/* TOGGLE SEKSI (hanya DSP — subscreen lain tidak punya seksi
              ini). Di bawah header + deskripsi mode supaya tidak
              menenggelamkan pemilih mode; flexWrap supaya kelima tombol
              tetap terjangkau di layar sempit tanpa layout rusak. */}
          {audioMode === "dsp" && (
            <View
              style={[
                styles.viewControls,
                {
                  backgroundColor: colors.background.secondary,
                  borderColor: colors.border.medium,
                  marginHorizontal: spacing.md,
                  marginBottom: spacing.md,
                },
              ]}
            >
              <SectionToggle
                label="GRAFIK"
                shown={visibleSections.graph}
                onPress={() => toggleSection("graph")}
              />
              <SectionToggle
                label="HEADPHONE"
                shown={visibleSections.headphone}
                onPress={() => toggleSection("headphone")}
              />
              <SectionToggle
                label="EFEK"
                shown={visibleSections.effects}
                onPress={() => toggleSection("effects")}
                activeIcon="zap"
              />
              <SectionToggle
                label="MIXER"
                shown={visibleSections.mixer}
                onPress={() => toggleSection("mixer")}
              />
              <SectionToggle
                label="PRESET"
                shown={visibleSections.preset}
                onPress={() => toggleSection("preset")}
              />
            </View>
          )}

          {/* Subscreen DSP — seluruh konten DSP lama, verbatim, hanya
              dibungkus kondisional per mode (Ide 1). */}
          {audioMode === "dsp" && (
            <>
          {/* 0a. SAKELAR UTAMA.
              Dulu layar ini TIDAK punya sakelar master: `isEQEnabled` bernilai
              false secara default dan hanya pernah dimatikan
              (`setEQEnabled(false)`) dari _layout. Artinya seluruh kontrol di
              layar ini tersambung ke engine yang tidak pernah menyala - orang
              menggeser slider, tidak terjadi apa pun, tanpa penjelasan. */}
          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.background.secondary,
                borderColor: colors.border.medium,
                marginHorizontal: spacing.md,
                padding: spacing.md,
                marginBottom: spacing.md,
              },
            ]}
          >
            <View style={styles.rowBetween}>
              <View style={{ flex: 1, marginRight: spacing.md }}>
                <Text style={[styles.cardTitle, { color: colors.text.primary }]}>
                  Pemrosesan DSP
                </Text>
                <Text style={[styles.cardHint, { color: colors.text.secondary }]}>
                  EQ, bass boost, pelebar stereo, dan koreksi headphone hanya
                  berlaku saat ini menyala.
                </Text>
              </View>
              {/* D6: sakelar master dibungkus Pressable 44×44 seperti
                  MiniSwitch (U-P2-01) — Switch default tingginya di bawah
                  44dp. Switch di dalam pointerEvents="none", hanya visual;
                  peran switch + label pindah ke pembungkus. */}
              <Pressable
                onPress={() => {
                  if (!eq.isDSPDisabled) void eq.toggleEQ();
                }}
                disabled={eq.isDSPDisabled}
                style={styles.miniSwitchHit}
                accessibilityRole="switch"
                accessibilityLabel="Pemrosesan DSP"
                accessibilityState={{
                  checked: eq.isEQEnabled,
                  disabled: eq.isDSPDisabled,
                }}
              >
                <Switch
                  value={eq.isEQEnabled}
                  onValueChange={eq.toggleEQ}
                  disabled={eq.isDSPDisabled}
                  trackColor={{
                    false: colors.background.tertiary,
                    true: masterColor,
                  }}
                  thumbColor={eq.isEQEnabled ? masterColor : colors.text.tertiary}
                  pointerEvents="none"
                />
              </Pressable>
            </View>
          </View>

          {/* 1. KOREKSI HEADPHONE — diletakkan PALING ATAS karena diproses
              paling awal di DSPChain (sebelum EQ). Koreksi menetralkan alat,
              EQ menyetel selera; menaruh kontrol EQ di atas akan menyesatkan
              tentang urutan yang sebenarnya. */}
          {visibleSections.headphone && (
            <HeadphoneSection disabled={eq.isDSPDisabled} />
          )}

          {/* 2. KARTU GRAFIK — satu unit edit EQ (declutter 2026-11-18):
              preset + grafik + detail band. Preset langsung mengubah
              grafik, jadi chip-nya di dalam kartu yang sama, bukan seksi
              terpisah. Grafik bisa diseret (edit utama); slider band
              tinggal di "DETAIL BAND" yang bisa dilipat. */}
          {visibleSections.graph && (
            <View
              style={[
                styles.graphCard,
                {
                  backgroundColor: colors.background.secondary,
                  borderColor: colors.border.medium,
                  marginHorizontal: spacing.md,
                  marginBottom: spacing.md,
                  padding: spacing.sm,
                },
              ]}
            >
              {/* Preset — di atas grafik (kontrol dulu, baru hasilnya). */}
              {visibleSections.preset && (
                <View style={styles.graphPreset}>
                  <View
                    style={[
                      styles.sectionHeader,
                      { marginBottom: spacing.sm },
                    ]}
                  >
                    <Text
                      style={[
                        styles.sectionTitle,
                        { color: colors.text.secondary },
                      ]}
                    >
                      PROFIL SUARA
                    </Text>
                    {/* D5: tombol simpan berteks, bukan ikon saja. */}
                    <TouchableOpacity
                      onPress={() => setModalVisible(true)}
                      disabled={eq.isDSPDisabled}
                      accessibilityRole="button"
                      accessibilityLabel="Simpan profil saat ini"
                      style={[
                        styles.iconBtn,
                        eq.isDSPDisabled && { opacity: 0.4 },
                      ]}
                    >
                      <Save size={18} color={colors.text.primary} />
                      <Text
                        style={[
                          styles.saveBtnText,
                          { color: colors.text.primary },
                        ]}
                      >
                        Simpan
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {/* U-P2-45: hapus preset custom lewat long-press DULU
                      tanpa petunjuk apa pun — user tidak bisa tahu
                      aksinya ada. (Penghapusannya sendiri sudah benar:
                      Alert konfirmasi + hanya untuk preset custom.) */}
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.presetScroll}
                    contentContainerStyle={{ paddingRight: spacing.sm }}
                  >
                    {eq.allPresets.map((p) => (
                      <PresetChip
                        key={p.id}
                        label={p.name}
                        isActive={eq.activePresetId === p.id}
                        onPress={() => eq.applyPreset(p.id)}
                        onLongPress={() =>
                          handlePresetLongPress(p.id, p.name, p.isCustom)
                        }
                        accessibilityHint={
                          p.isCustom
                            ? "Tekan lama untuk menghapus"
                            : undefined
                        }
                        disabled={eq.isDSPDisabled}
                      />
                    ))}
                  </ScrollView>
                  <Text
                    style={[
                      styles.presetHint,
                      {
                        color: colors.text.tertiary,
                        marginTop: spacing.xs,
                      },
                    ]}
                  >
                    Tekan lama untuk menghapus.
                  </Text>
                </View>
              )}
              {/* GRAPH SECTION — B3: saat DSP bypass (mode non-DSP atau
                  sakelar master mati), graph meredup + label BYPASS supaya
                  kurva tidak terlihat seolah memproses. */}
              <FrequencyGraph
                bands={eq.currentBands}
                combinedGains={combinedGains}
                width={width - spacing.md * 2 - spacing.sm * 2 - 2}
                height={140}
                disabled={isDSPFrozen || !eq.isEQEnabled}
                onBandChange={(index, gain) =>
                  eq.updateBandGain(index, gain)
                }
              />
              {(isDSPFrozen || !eq.isEQEnabled) && (
                <Text
                  style={[
                    styles.bypassLabel,
                    { color: colors.text.tertiary },
                  ]}
                >
                  BYPASS — kurva tidak memproses
                </Text>
              )}
              {/* Keterangan kurva (lihat graphCaption di atas). */}
              <Text
                style={[
                  styles.graphCaption,
                  { color: colors.text.tertiary },
                ]}
              >
                {graphCaption}
              </Text>
              {/* DETAIL BAND — slider band sebagai sub-bagian yang bisa
                  dilipat (toggle MIXER). Grafik drag tetap edit utama;
                  slider untuk presisi per band. */}
              {visibleSections.mixer && (
                <View
                  style={[
                    styles.bandDetail,
                    { borderTopColor: colors.border.medium },
                  ]}
                >
                  <Text
                    style={[
                      styles.detailBandTitle,
                      { color: colors.text.secondary },
                    ]}
                  >
                    DETAIL BAND
                  </Text>
                  {/* U-P2-53: daftar band lewat pola daftar bersama.
                      Jalur yang dipilih tetap FlatList (horizontal +
                      bersarang di ScrollView — lihat chooseListKind);
                      `directionalLockEnabled` dipertahankan supaya tidak
                      bentrok dengan scroll utama. */}
                  <ScreenList
                    horizontal
                    nestedInScrollView
                    showsHorizontalScrollIndicator={false}
                    data={eq.currentBands}
                    keyExtractor={(item) => item.frequency.toString()}
                    renderItem={({ item, index }) => (
                      <EqualizerBand
                        frequency={item.frequency}
                        gain={item.gain}
                        onValueChange={(v) => eq.updateBandGain(index, v)}
                        disabled={!eq.isEQEnabled || eq.isDSPDisabled}
                      />
                    )}
                    contentContainerStyle={{ paddingHorizontal: spacing.sm }}
                    directionalLockEnabled={true}
                  />
                </View>
              )}
            </View>
          )}

          {/* 5. EFFECTS SECTION (SLIDERS & REVERB) */}
          {visibleSections.effects && (
            <View
              style={[
                styles.effectsSection,
                { paddingHorizontal: spacing.md, marginBottom: spacing.lg },
              ]}
            >
              {/* F3: penjelasan di tempat kontrolnya, bukan cuma di banner
                  atas yang bisa ter-scroll menjauh. */}
              {eq.isDSPDisabled && (
                <Text
                  style={[
                    styles.disabledCaption,
                    {
                      color: colors.text.tertiary,
                      paddingHorizontal: spacing.md,
                      marginBottom: spacing.sm,
                    },
                  ]}
                >
                  Nonaktif di mode ini — pindah ke DSP untuk menyetel.
                </Text>
              )}
              {/* SLIDER VERTIKAL BASS + PELEBAR STEREO — opsi B Fase 3
                  (keputusan csheva 2026-11-18 08:08): dua knob diganti
                  fader vertikal ala slider GAIN kanan Neutron, bahasa
                  visual yang sama dengan fader band (track 160px, tick,
                  fill, thumb kotak). Rentang nilai 0..1000 sama persis
                  dengan knob lama dan dengan yang diterima Kotlin (bass
                  0..+12 dB, widener width 1.0..2.0), jadi tanpa konversi.
                  Tiap slider punya MiniSwitch enable sendiri di atasnya
                  (tanpa label teks — nama efek sudah di label slider).
                  Main gain TIDAK ada di layar ini: `setMasterGain` hanya
                  ada di antarmuka native + spec, nol pemanggil di `src/`
                  (tidak ada kontrol gain master di store/hook) — opsi B
                  hanya mencakup dua kontrol yang memang ada. */}
              <View
                style={[
                  styles.effectItem,
                  {
                    backgroundColor: colors.background.secondary,
                    borderColor: colors.border.medium,
                    paddingVertical: spacing.md,
                  },
                ]}
              >
                <View style={styles.sliderRow}>
                  <View style={styles.sliderCol}>
                    <MiniSwitch
                      label="BASS BOOST"
                      value={eq.isBassEnabled}
                      onValueChange={eq.setBassEnabled}
                      disabled={eq.isDSPDisabled}
                      color={bassColor}
                      stacked
                      hideLabel
                    />
                    <VerticalSlider
                      label="BASS BOOST"
                      value={eq.bassStrength}
                      onChange={eq.setBassBoost}
                      color={bassColor}
                      disabled={!eq.isBassEnabled || eq.isDSPDisabled}
                    />
                  </View>
                  <View style={styles.sliderCol}>
                    <MiniSwitch
                      label="PELEBAR STEREO"
                      value={eq.isVirtualizerEnabled}
                      onValueChange={eq.setVirtualizerEnabled}
                      disabled={eq.isDSPDisabled}
                      color={widthColor}
                      stacked
                      hideLabel
                    />
                    <VerticalSlider
                      label="PELEBAR STEREO"
                      value={eq.virtualizerLevel}
                      onChange={eq.setVirtualizer}
                      color={widthColor}
                      disabled={
                        !eq.isVirtualizerEnabled || eq.isDSPDisabled
                      }
                    />
                  </View>
                </View>
              </View>

              {/* REVERB — DISEMBUNYIKAN 2026-11-18 (declutter layar EQ).
                  Engine reverb masih STUB (keputusan 2026-11-14):
                  `setReverbPreset` native tidak memproses apa pun, jadi
                  kontrolnya tidak ditampilkan supaya tidak terlihat
                  seperti kontrol hidup. Kembalikan blok ini saat engine
                  reverb beneran ada di C++. State reverb di store tetap
                  dipertahankan karena preset menyimpannya sebagai bagian
                  profil penuh (applyPreset/saveCustomPreset). */}
            </View>
          )}

            </>
          )}

          {/* Subscreen Solfeggio / Bit-Perfect — shell sementara, diganti
              langkah berikut ronde ini (lihat komponen masing-masing). */}
          {audioMode === "immersive" && <SolfeggioSubscreen />}
          {audioMode === "bit-perfect" && <BitPerfectSubscreen />}
        </ScrollView>
      </GestureHandlerRootView>
      <SavePresetModal
        visible={isModalVisible}
        onSave={(n) => {
          eq.savePreset(n);
          setModalVisible(false);
        }}
        onClose={() => setModalVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // PEMILIH MODE - tiga tombol berdampingan. Target sentuh 44dp (Apple HIG);
  // sebelumnya kontrol mode nyaris tak bisa ditekan di layar kecil.
  modeWrap: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  modeBtn: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  modeLabel: {
    fontSize: 13,
    fontWeight: "700",
  },
  modeHint: {
    fontSize: 11,
    marginTop: 2,
    textAlign: "center",
  },
  // Deskripsi satu kalimat mode aktif di bawah sakelar mode (B5).
  modeDescription: {
    fontSize: 12,
    lineHeight: 17,
  },

  container: { flex: 1 },
  viewControls: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 12,
  },
  // U-P2-01: minHeight 36 lama, di bawah 44dp.
  viewBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    minHeight: 44,
  },
  viewBtnText: { fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  resetBtn: { alignItems: "center", justifyContent: "center" },
  card: {
    borderRadius: 16,
    borderWidth: 1,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardTitle: { fontSize: 14, fontWeight: "800" },
  cardHint: { fontSize: 11, lineHeight: 16, marginTop: 2 },
  warningCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: 16,
    borderWidth: 1,
  },
  warningText: { flex: 1, fontSize: 12, lineHeight: 17 },
  graphCard: {
    minHeight: 160,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  // Preset di dalam kartu grafik — melebar penuh (kartu memakai
  // alignItems center, jadi perlu alignSelf stretch).
  graphPreset: {
    alignSelf: "stretch",
    marginBottom: 4,
  },
  // Keterangan kurva di bawah grafik.
  graphCaption: {
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
    marginTop: 4,
    paddingHorizontal: 8,
  },
  // Detail band di dalam kartu grafik — dipisah garis atas.
  bandDetail: {
    alignSelf: "stretch",
    borderTopWidth: 1,
    marginTop: 8,
    paddingTop: 8,
  },
  detailBandTitle: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.5,
    marginBottom: 4,
    textAlign: "center",
  },
  effectsSection: { gap: 12 },
  effectItem: {
    borderRadius: 20,
    borderWidth: 1,
  },
  miniSwitchContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    // U-P2-01: 32 lama; baris mengikuti tinggi target sentuh 44.
    minHeight: 44,
  },
  // Varian bertumpuk untuk baris knob: switch di tengah kolom, label
  // (bila tidak disembunyikan) di atasnya.
  miniSwitchStacked: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 0,
  },
  sliderRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "flex-start",
    paddingHorizontal: 8,
  },
  sliderCol: {
    flex: 1,
    alignItems: "center",
  },
  // U-P2-01: penangkap sentuh MiniSwitch (lihat komentar di komponen).
  miniSwitchHit: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  miniSwitchLabel: { fontSize: 11, fontWeight: "900", letterSpacing: 1.5 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: 32,
  },
  sectionTitle: { fontSize: 11, fontWeight: "900", letterSpacing: 1.5 },
  presetHint: { fontSize: 11 },
  // F3: caption "kenapa nonaktif" di tempat kontrolnya.
  disabledCaption: { fontSize: 11 },
  bypassLabel: {
    fontSize: 11,
    fontWeight: "600",
    marginTop: 4,
    textAlign: "center",
  },
  iconBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minWidth: 44,
    minHeight: 44,
    paddingHorizontal: 8,
  },
  saveBtnText: {
    fontSize: 12,
    fontWeight: "600",
  },
  presetScroll: { flexGrow: 0 },
});
