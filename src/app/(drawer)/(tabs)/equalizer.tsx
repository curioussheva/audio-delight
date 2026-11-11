import React, { useState, useEffect } from "react";
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
  TriangleAlert,
  Zap,
  RotateCcw,
  Eye,
  EyeOff,
  Settings2,
  ChevronLeft,
  ChevronRight,
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
import { HorizontalSlider } from "@/features/equalizer/components/HorizontalSlider";
import { PresetChip } from "@/features/equalizer/components/PresetChip";
import { SavePresetModal } from "@/features/equalizer/components/SavePresetModal";
import { HeadphoneSection } from "@/features/headphone/components/HeadphoneSection";
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
const REVERB_LABELS = [
  "None",
  "Small Room",
  "Medium Room",
  "Large Room",
  "Medium Hall",
  "Large Hall",
  "Plate",
];

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
}

const MiniSwitch = ({
  value,
  onValueChange,
  disabled,
  color,
  label,
}: MiniSwitchProps) => {
  const { theme } = useTheme();
  const colors = theme.colors;
  const on = value && !disabled;

  return (
    <View style={styles.miniSwitchContainer}>
      <Text
        style={[
          styles.miniSwitchLabel,
          { color: on ? color : colors.text.secondary },
        ]}
      >
        {label}
      </Text>
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

// ─── MAIN SCREEN ─────────────────────────────────────────────────────────

// Bottom padding: ruang untuk tab bar + FloatingPlayer (FLOATING_PLAYER_CLEARANCE).
const LIST_BOTTOM_PADDING = FLOATING_PLAYER_CLEARANCE + 20;

export default function EqualizerScreen() {
  const { theme } = useTheme();
  const colors = theme.colors;
  const spacing = theme.spacing;

  const eq = useEqualizer();
  const { audioMode, setAudioMode } = usePlayerStore();

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
    { id: "bit-perfect", label: "Bit-Perfect", hint: "tanpa pemrosesan" },
    { id: "dsp", label: "DSP", hint: "EQ & efek" },
    { id: "immersive", label: "Solfeggio", hint: "resonansi" },
  ];

  // Mode apa pun selain `dsp` membekukan kontrol di layar ini.
  const isDSPFrozen = audioMode !== "dsp";

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
  const reverbColor = accentOn(
    [colors.accent.purple],
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
        {/* UI TOGGLES */}
        <View
          style={[
            styles.viewControls,
            {
              backgroundColor: colors.background.secondary,
              borderBottomColor: colors.border.medium,
            },
          ]}
        >
          <TouchableOpacity
            onPress={() => toggleSection("graph")}
            style={[
              styles.viewBtn,
              { backgroundColor: colors.background.tertiary },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Tampilkan atau sembunyikan grafik"
            accessibilityState={{ expanded: visibleSections.graph }}
          >
            {visibleSections.graph ? (
              <Eye size={12} color={colors.text.primary} />
            ) : (
              <EyeOff size={12} color={colors.text.tertiary} />
            )}
            <Text
              style={[
                styles.viewBtnText,
                {
                  color: visibleSections.graph
                    ? colors.text.primary
                    : colors.text.tertiary,
                },
              ]}
            >
              GRAFIK
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => toggleSection("effects")}
            style={[
              styles.viewBtn,
              { backgroundColor: colors.background.tertiary },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Tampilkan atau sembunyikan efek"
            accessibilityState={{ expanded: visibleSections.effects }}
          >
            {visibleSections.effects ? (
              <Zap size={12} color={colors.text.primary} />
            ) : (
              <EyeOff size={12} color={colors.text.tertiary} />
            )}
            <Text
              style={[
                styles.viewBtnText,
                {
                  color: visibleSections.effects
                    ? colors.text.primary
                    : colors.text.tertiary,
                },
              ]}
            >
              EFEK
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => toggleSection("mixer")}
            style={[
              styles.viewBtn,
              { backgroundColor: colors.background.tertiary },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Tampilkan atau sembunyikan mixer"
            accessibilityState={{ expanded: visibleSections.mixer }}
          >
            {visibleSections.mixer ? (
              <Settings2 size={12} color={colors.text.primary} />
            ) : (
              <EyeOff size={12} color={colors.text.tertiary} />
            )}
            <Text
              style={[
                styles.viewBtnText,
                {
                  color: visibleSections.mixer
                    ? colors.text.primary
                    : colors.text.tertiary,
                },
              ]}
            >
              MIXER
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: LIST_BOTTOM_PADDING }}
        >
          {/* HEADER — U-P2-53: header bersama (ScreenHeader). Judul 24/900
              + subjudul 10px lama jadi 20/700 + 13px — perubahan visual
              kecil yang disengaja demi satu pola header. Tombol reset
              pindah ke slot `actions`; perilakunya tidak berubah. */}
          <ScreenHeader
            title="Precision DSP"
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
                  onPress={() => void setAudioMode(m.id)}
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
              <Switch
                value={eq.isEQEnabled}
                onValueChange={eq.toggleEQ}
                disabled={eq.isDSPDisabled}
                trackColor={{
                  false: colors.background.tertiary,
                  true: masterColor,
                }}
                thumbColor={eq.isEQEnabled ? masterColor : colors.text.tertiary}
                accessibilityRole="switch"
                accessibilityLabel="Pemrosesan DSP"
                accessibilityState={{
                  checked: eq.isEQEnabled,
                  disabled: eq.isDSPDisabled,
                }}
              />
            </View>
          </View>

          {/* 0b. Mode Bit-Perfect memblokir seluruh DSP. Dulu kontrol hanya
              diam-diam tidak bereaksi (`if (isDSPDisabled) return`) tanpa
              penjelasan apa pun di layar. */}
          {isDSPFrozen && (
            <View
              style={[
                styles.warningCard,
                {
                  backgroundColor: colors.background.secondary,
                  borderColor: colors.status.error,
                  marginHorizontal: spacing.md,
                  padding: spacing.md,
                  marginBottom: spacing.md,
                },
              ]}
            >
              <TriangleAlert size={18} color={colors.status.error} />
              <Text
                style={[
                  styles.warningText,
                  { color: colors.text.primary, marginLeft: spacing.sm },
                ]}
              >
                {audioMode === "bit-perfect"
                  ? "Mode Bit-Perfect aktif — seluruh DSP dilewati supaya " +
                    "output murni. Pilih mode DSP di atas untuk memakai " +
                    "kontrol di layar ini."
                  : "Mode Solfeggio aktif — layar ini mengendalikan mesin " +
                    "DSP, sedangkan Solfeggio memakai rantai resonansinya " +
                    "sendiri. Pilih mode DSP di atas kalau ingin menyetel EQ."}
              </Text>
            </View>
          )}

          {/* 1. KOREKSI HEADPHONE — diletakkan PALING ATAS karena diproses
              paling awal di DSPChain (sebelum EQ). Koreksi menetralkan alat,
              EQ menyetel selera; menaruh kontrol EQ di atas akan menyesatkan
              tentang urutan yang sebenarnya. */}
          <HeadphoneSection />

          {/* 2. GRAPH SECTION */}
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
              <FrequencyGraph
                bands={eq.currentBands}
                width={width - spacing.md * 2 - spacing.sm * 2 - 2}
                height={140}
              />
            </View>
          )}

          {/* 3. EFFECTS SECTION (SLIDERS & REVERB) */}
          {visibleSections.effects && (
            <View
              style={[
                styles.effectsSection,
                { paddingHorizontal: spacing.md, marginBottom: spacing.lg },
              ]}
            >
              {/* BASS SLIDER */}
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
                <MiniSwitch
                  label="BASS BOOST"
                  value={eq.isBassEnabled}
                  onValueChange={eq.setBassEnabled}
                  disabled={eq.isDSPDisabled}
                  color={bassColor}
                />
                <HorizontalSlider
                  label="INTENSITAS"
                  value={eq.bassStrength}
                  onChange={eq.setBassBoost}
                  color={bassColor}
                  disabled={!eq.isBassEnabled || eq.isDSPDisabled}
                />
              </View>

              {/* VIRTUALIZER SLIDER */}
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
                <MiniSwitch
                  label="PELEBAR STEREO"
                  value={eq.isVirtualizerEnabled}
                  onValueChange={eq.setVirtualizerEnabled}
                  disabled={eq.isDSPDisabled}
                  color={widthColor}
                />
                <HorizontalSlider
                  label="LEBAR"
                  value={eq.virtualizerLevel}
                  onChange={eq.setVirtualizer}
                  color={widthColor}
                  disabled={!eq.isVirtualizerEnabled || eq.isDSPDisabled}
                />
              </View>

              {/* REVERB PRESET SELECTOR */}
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
                <MiniSwitch
                  label="REVERB LINGKUNGAN"
                  value={eq.isReverbEnabled}
                  onValueChange={eq.setReverbEnabled}
                  disabled={eq.isDSPDisabled}
                  color={reverbColor}
                />
                {/* U-P2-40: kontrol reverb DULU hanya bisa maju — satu tombol
                    dengan ChevronRight menyiratkan membuka daftar, padahal
                    ketukan hanya memajukan preset (sampai 6 ketukan untuk
                    kembali). Sekarang ada tombol mundur eksplisit di kiri;
                    ChevronRight di kanan jujur berarti "berikutnya". */}
                <View
                  style={[
                    styles.reverbRow,
                    { marginHorizontal: spacing.md, marginTop: spacing.sm },
                  ]}
                >
                  <TouchableOpacity
                    onPress={() => {
                      const prev =
                        (eq.reverbPreset - 1 + REVERB_LABELS.length) %
                        REVERB_LABELS.length;
                      eq.setReverb(prev);
                    }}
                    disabled={!eq.isReverbEnabled || eq.isDSPDisabled}
                    style={[
                      styles.reverbStepBtn,
                      {
                        backgroundColor: colors.background.tertiary,
                        borderColor: colors.border.medium,
                      },
                      (!eq.isReverbEnabled || eq.isDSPDisabled) && {
                        opacity: 0.4,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`Preset reverb sebelumnya: ${REVERB_LABELS[(eq.reverbPreset - 1 + REVERB_LABELS.length) % REVERB_LABELS.length]}`}
                  >
                    <ChevronLeft size={16} color={colors.text.secondary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.reverbBox,
                      {
                        backgroundColor: colors.background.tertiary,
                        borderColor: colors.border.medium,
                        padding: spacing.md,
                        minHeight: 44,
                        flex: 1,
                      },
                      (!eq.isReverbEnabled || eq.isDSPDisabled) && {
                        opacity: 0.4,
                      },
                    ]}
                    disabled={!eq.isReverbEnabled || eq.isDSPDisabled}
                    onPress={() => {
                      const next =
                        (eq.reverbPreset + 1) % REVERB_LABELS.length;
                      eq.setReverb(next);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Reverb: ${REVERB_LABELS[eq.reverbPreset]}. Ketuk untuk preset berikutnya, tombol kiri untuk sebelumnya.`}
                  >
                    <Text
                      style={[
                        styles.reverbLabel,
                        { color: colors.text.secondary },
                      ]}
                    >
                      LINGKUNGAN
                    </Text>
                    <View style={styles.reverbValueRow}>
                      <Text
                        style={[styles.reverbValue, { color: reverbColor }]}
                      >
                        {REVERB_LABELS[eq.reverbPreset]}
                      </Text>
                      <ChevronRight size={16} color={colors.text.secondary} />
                    </View>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          {/* 4. PRESETS */}
          <View
            style={[
              styles.sectionHeader,
              { paddingHorizontal: spacing.md, marginBottom: spacing.sm },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: colors.text.secondary }]}>
              PROFIL SUARA
            </Text>
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
            </TouchableOpacity>
          </View>
          {/* U-P2-45: hapus preset custom lewat long-press DULU tanpa
              petunjuk apa pun — user tidak bisa tahu aksinya ada.
              (Penghapusannya sendiri sudah benar: Alert konfirmasi +
              hanya untuk preset custom.) */}
          <Text
            style={[
              styles.presetHint,
              {
                color: colors.text.tertiary,
                paddingHorizontal: spacing.md,
                marginBottom: spacing.sm,
              },
            ]}
          >
            Tekan lama preset buatanmu untuk menghapusnya.
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={[
              styles.presetScroll,
              { paddingLeft: spacing.md, marginBottom: spacing.lg },
            ]}
            contentContainerStyle={{ paddingRight: spacing.md }}
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
                    ? "Tekan lama untuk menghapus preset ini"
                    : undefined
                }
                disabled={eq.isDSPDisabled}
              />
            ))}
          </ScrollView>

          {/* 5. MIXER SECTION */}
          {visibleSections.mixer && (
            <View
              style={[
                styles.mixerBoard,
                {
                  backgroundColor: colors.background.secondary,
                  borderColor: colors.border.medium,
                  marginHorizontal: spacing.md,
                  paddingVertical: spacing.md,
                  marginBottom: spacing.xl,
                },
              ]}
            >
              {/* U-P2-53: daftar band lewat pola daftar bersama. Jalur yang
                  dipilih tetap FlatList (horizontal + bersarang di
                  ScrollView — lihat chooseListKind); `directionalLockEnabled`
                  dipertahankan supaya tidak bentrok dengan scroll utama. */}
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
    fontSize: 10,
    marginTop: 2,
    textAlign: "center",
  },

  container: { flex: 1 },
  viewControls: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
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
  // U-P2-01: penangkap sentuh MiniSwitch (lihat komentar di komponen).
  miniSwitchHit: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  miniSwitchLabel: { fontSize: 10, fontWeight: "900", letterSpacing: 1.5 },
  reverbRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  reverbStepBtn: {
    minWidth: 44,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  reverbBox: {
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  reverbLabel: { fontSize: 10, fontWeight: "bold", letterSpacing: 1 },
  reverbValueRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  reverbValue: { fontSize: 13, fontWeight: "900" },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: 32,
  },
  sectionTitle: { fontSize: 10, fontWeight: "900", letterSpacing: 1.5 },
  presetHint: { fontSize: 11 },
  iconBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  presetScroll: { flexGrow: 0 },
  mixerBoard: {
    borderRadius: 20,
    borderWidth: 1,
  },
});
