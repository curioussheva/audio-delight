import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  memo,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
  Pressable,
  Dimensions,
  ScrollView,
  LayoutAnimation,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Save,
  Share2,
  Zap,
  RotateCcw,
  Eye,
  EyeOff,
  ChevronLeft,
  ChevronRight,
} from "lucide-react-native";

import { GestureHandlerRootView } from "react-native-gesture-handler";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useTheme } from "@/shared/context/ThemeContext";
import { FONT_FAMILY, BASE_RADIUS } from "@/shared/constants/themes/base";
import { ConfirmDialog } from "@/shared/components/ui/ConfirmDialog";
import { ScreenHeader } from "@/shared/components/ui/ScreenHeader";
import { ScreenList } from "@/shared/components/ui/ScreenList";
import type { ScrollableListHandle } from "@/shared/components/ui/ScreenList";
import {
  useEqBandListState,
  useEqEffectsState,
  useEqGraphState,
  useEqMasterState,
  useEqPresetState,
  useIsDSPDisabled,
} from "@/features/equalizer/hooks/useEqualizer";
import { useToastStore } from "@/shared/store/toastStore";
import { accentOn, pickReadable, AA_NORMAL } from "@/shared/utils/contrast";
import {
  usePlayerStore,
  type AudioMode,
} from "@/features/player/store/playerStore";
import { FrequencyGraph } from "@/features/equalizer/components/Graph";
import {
  EqualizerBand,
  BAND_WIDTH,
} from "@/features/equalizer/components/Band";
import { BandScale } from "@/features/equalizer/components/BandScale";
import { VerticalSlider } from "@/features/equalizer/components/VerticalSlider";
import {
  canScrollLeft,
  canScrollRight,
  computeScrollIndicator,
  formatBandFrequency,
  formatBandFrequencyFull,
  pageScrollOffset,
  visibleBandRange,
} from "@/features/equalizer/utils/scrollIndicator";
import {
  useEqualizerStore,
  dbToGain,
  gainToDb,
  formatMasterGainDb,
  MASTER_GAIN_DB_MIN,
  MASTER_GAIN_DB_RANGE,
} from "@/features/equalizer/store/equalizerStore";
import { PresetChip } from "@/features/equalizer/components/PresetChip";
import { SavePresetModal } from "@/features/equalizer/components/SavePresetModal";
import { HeadphoneSection } from "@/features/headphone/components/HeadphoneSection";
import { useHeadphoneCorrection } from "@/features/headphone/hooks/useHeadphoneCorrection";
import { useHrtfGate } from "@/features/hrtf/hooks/useHrtfGate";
import { useHrtfStore } from "@/features/hrtf/store/hrtfStore";
import { useConvolverStore } from "@/features/convolver/store/convolverStore";
import {
  combinedCurveGains,
  parseCorrectionPresetText,
} from "@/features/equalizer/api/correctionResponse";
import { MODE_INFO } from "@/features/equalizer/api/modeInfo";
import { SolfeggioSubscreen } from "@/features/equalizer/components/SolfeggioSubscreen";
import { TuningControl } from "@/features/player/components/TuningControl";
import { BitPerfectSubscreen } from "@/features/equalizer/components/BitPerfectSubscreen";
import { useBitPerfectStatus } from "@/features/player/hooks/useBitPerfectStatus";
import { describeBitPerfectPath } from "@/features/player/api/bitPerfectPath";
import {
  DEFAULT_VISIBLE_SECTIONS,
  VISIBLE_SECTIONS_KEY,
  parseVisibleSections,
  serializeVisibleSections,
  type VisibleSections,
} from "@/features/equalizer/utils/visibleSections";
import { FLOATING_PLAYER_CLEARANCE } from "@/features/player/layout";
// Bagikan preset EQ sebagai file (2026-11-20, item 8 deep-insight).
import { sharePresetFile } from "@/features/settings/backupIO";

const { width } = Dimensions.get("window");

/** Label mode yang jujur - dibaca dari state, bukan dikarang di UI. */
const MODE_LABELS: Record<string, string> = {
  bitperfect: "BIT-PERFECT",
  "bit-perfect": "BIT-PERFECT",
  dsp: "DSP",
  immersive: "SOLFEGGIO",
};

// Label preset reverb Bahasa Indonesia (dulu Inggris di tengah UI
// Indonesia) — urutan SAMA dengan REVERB_PRESET_MAP (0..6). "Plate"
// tetap — itu nama jenis reverb, bukan ukuran ruang.
const REVERB_LABELS = [
  "Tanpa Reverb",
  "Ruang Kecil",
  "Ruang Sedang",
  "Ruang Besar",
  "Aula Sedang",
  "Aula Besar",
  "Plate",
];

// Format nilai slider efek — fungsi MODUL (referensi stabil) supaya
// React.memo VerticalSlider tidak batal tiap render oleh closure inline.
// Murni dari v, tanpa closure; tampilan akhir tidak berubah.
const formatBassBoostDb = (v: number): string =>
  v <= 0 ? "0 dB" : `+${((v / 1000) * 12).toFixed(1)} dB`;
const formatWidthMultiplier = (v: number): string =>
  `×${(1 + v / 1000).toFixed(2)}`;
const formatMasterGainSliderValue = (v: number): string =>
  formatMasterGainDb(v + MASTER_GAIN_DB_MIN);

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

const MiniSwitch = memo(
  ({
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
    // EQ-19: tampilkan nilai TERSIMPAN, bukan nilai efektif. Dulu
    // `on = value && !disabled` — saat sakelar master mati, thumb +
    // label semua switch efek jadi abu-abu (terbaca OFF) walau
    // flag-nya ON; begitu master dinyalakan switch "ajaib" kembali
    // menyala. Yang benar: switch menunjukkan flag-nya (sama seperti
    // `accessibilityState.checked: value` yang sudah jujur selama
    // ini), sementara `disabled` hanya meredupkan wadahnya (opacity)
    // + menonaktifkan sentuhan. Keadaan "master mati" dijelaskan
    // caption kartu ("Sakelar master mati — semua efek di bawah tidak
    // memproses"), bukan dengan memalsukan tampilan switch.
    const on = value;

    return (
      <View
        style={[
          styles.miniSwitchContainer,
          stacked && styles.miniSwitchStacked,
          disabled && { opacity: 0.5 },
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
  },
);

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
        // FASE 3 EQ: keadaan mati DULU tertiary di atas tombol tertiary
        // (terukur 3,94–4,34 — di bawah AA di 3 dari 4 tema). Secondary
        // tetap redup tapi lolos di semua tema.
        color={shown ? colors.text.primary : colors.text.secondary}
      />
      <Text
        style={[
          styles.viewBtnText,
          {
            color: shown ? colors.text.primary : colors.text.secondary,
          },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
};

// ─── SEKSI LAYAR EQ (opsi 2, log #16) ──────────────────────────────────────
// Tiap seksi adalah komponen `memo` yang melanggan HANYA potongan store
// yang dibutuhkannya (hook `useEq*State` di useEqualizer.ts). Induk
// `EqualizerScreen` TIDAK lagi melanggan store EQ utuh, jadi tick drag
// satu nilai tidak me-render ulang seluruh layar:
// - tick widener -> hanya EqEffectsCard (yang melanggan virtualizerLevel)
// - tick band/kurva -> hanya EqGraphCard + EqBandDetailCard (bands)
// - tick bass/gain -> EqEffectsCard (+ EqGraphCard bila pill clip berubah)
// - preset/gate -> hanya seksi yang melanggan nilai itu
// Perilaku identik: guard DSP (bit-perfect/immersive = beku), master OFF =
// tab read-only, dan semua nilai tetap update saat nilainya sendiri berubah.

const EqResetButton = memo(({ onPress }: { onPress: () => void }) => {
  const { theme } = useTheme();
  const colors = theme.colors;
  const spacing = theme.spacing;
  const isEQEnabled = useEqualizerStore((s) => s.isEQEnabled);
  const isDSPDisabled = useIsDSPDisabled();
  const disabled = isDSPDisabled || !isEQEnabled;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.resetBtn,
        { padding: spacing.sm, minWidth: 44, minHeight: 44 },
        disabled && { opacity: 0.4 },
      ]}
      accessibilityRole="button"
      accessibilityLabel="Reset DSP ke pengaturan netral"
      accessibilityState={{ disabled }}
    >
      <RotateCcw size={18} color={colors.text.secondary} />
    </TouchableOpacity>
  );
});

const EqHeadphoneGate = memo(() => {
  const isEQEnabled = useEqualizerStore((s) => s.isEQEnabled);
  const isDSPDisabled = useIsDSPDisabled();
  return <HeadphoneSection disabled={isDSPDisabled || !isEQEnabled} />;
});

const EqMasterCard = memo(() => {
  const { theme } = useTheme();
  const colors = theme.colors;
  const spacing = theme.spacing;
  const { isEQEnabled, isDSPDisabled, toggleEQ } = useEqMasterState();
  const masterColor = accentOn(
    [colors.accent.green],
    colors.background.secondary,
    [colors.text.primary, colors.text.secondary],
  );
  return (
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
            <Text style={[styles.displayTitle, { color: colors.text.primary }]}>
              Pemrosesan DSP
            </Text>
            <Text style={[styles.cardHint, { color: colors.text.secondary }]}>
              EQ, bass boost, pelebar stereo, reverb, HRTF, koreksi headphone,
              dan master gain hanya berlaku saat ini menyala.
            </Text>
          </View>
          {/* D6: sakelar master dibungkus Pressable 44×44 seperti
            MiniSwitch (U-P2-01) — Switch default tingginya di bawah
            44dp. Switch di dalam pointerEvents="none", hanya visual;
            peran switch + label pindah ke pembungkus. */}
          <Pressable
            onPress={() => {
              if (!isDSPDisabled) void toggleEQ();
            }}
            disabled={isDSPDisabled}
            style={styles.miniSwitchHit}
            accessibilityRole="switch"
            accessibilityLabel="Pemrosesan DSP"
            accessibilityState={{
              checked: isEQEnabled,
              disabled: isDSPDisabled,
            }}
          >
            <Switch
              value={isEQEnabled}
              onValueChange={toggleEQ}
              disabled={isDSPDisabled}
              trackColor={{
                false: colors.background.tertiary,
                true: masterColor,
              }}
              thumbColor={isEQEnabled ? masterColor : colors.text.tertiary}
              pointerEvents="none"
            />
          </Pressable>
        </View>
      </View>
    </>
  );
});

const EqGraphCard = memo(({ width }: { width: number }) => {
  const { theme } = useTheme();
  const colors = theme.colors;
  const spacing = theme.spacing;
  const {
    bands: currentBands,
    isBassEnabled,
    bassStrength,
    masterGain,
    isEQEnabled,
    updateBandGain,
    flushBandDrag,
  } = useEqGraphState();
  const audioMode = usePlayerStore((s) => s.audioMode);
  // Mode apa pun selain `dsp` membekukan kontrol di layar ini.
  const isDSPFrozen = audioMode !== "dsp";

  // Koreksi headphone — dipasang di level seksi grafik (bukan induk)
  // supaya sinkronisasi perangkat tetap jalan walau seksi lain yang
  // me-render ulang, dan supaya layar ini bisa menggambar kurva
  // gabungan (koreksi + EQ). Satu-satunya pemanggil hook ini di layar.
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
    isEQEnabled &&
    correctionEnabled &&
    activeProfile !== null;
  const showCombinedCurve = correctionProcessing && correctionForCurve !== null;
  const combinedGains = useMemo(
    () =>
      showCombinedCurve && correctionForCurve
        ? combinedCurveGains(currentBands, correctionForCurve)
        : null,
    [showCombinedCurve, correctionForCurve, currentBands],
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

  return (
    <>
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
        {/* GRAPH SECTION — B3: saat DSP bypass (mode non-DSP atau
            sakelar master mati), graph meredup + label BYPASS supaya
            kurva tidak terlihat seolah memproses. */}
        <FrequencyGraph
          bands={currentBands}
          combinedGains={combinedGains}
          width={width - spacing.md * 2 - spacing.sm * 2 - 2}
          height={140}
          disabled={isDSPFrozen || !isEQEnabled}
          onBandChange={updateBandGain}
          // (Item 7) Drag kurva dilepas: flush nilai akhir band
          // SEKARANG (store + native), tanpa tunggu trailing ≤100 ms.
          onDragEnd={flushBandDrag}
          // Peringatan clip menghitung bass + gain juga (pill
          // grafik): bass 0..+12 dB bila sakelarnya menyala,
          // master gain −12..+12 dB.
          bassBoostDb={isBassEnabled ? (bassStrength / 1000) * 12 : 0}
          masterGainDb={gainToDb(masterGain)}
        />
        {(isDSPFrozen || !isEQEnabled) && (
          <Text style={[styles.bypassLabel, { color: colors.text.tertiary }]}>
            BYPASS — kurva tidak memproses
          </Text>
        )}
        {/* Keterangan kurva (lihat graphCaption di atas). */}
        <Text style={[styles.graphCaption, { color: colors.text.tertiary }]}>
          {graphCaption}
        </Text>
      </View>
    </>
  );
});

interface EqPresetCardProps {
  onRequestSave: () => void;
  onRequestDelete: (id: string, name: string) => void;
}

const EqPresetCard = memo(
  ({ onRequestSave, onRequestDelete }: EqPresetCardProps) => {
    const { theme } = useTheme();
    const colors = theme.colors;
    const spacing = theme.spacing;
    const {
      allPresets,
      activePresetId,
      isEQEnabled,
      isDSPDisabled,
      applyPreset,
    } = useEqPresetState();
    const showToast = useToastStore((s) => s.showToast);

    // FASE 4: terapkan preset + toast sukses. Toast hanya boleh muncul
    // bila preset BENAR-BENAR diterapkan ke suara: saat sakelar master
    // mati, chip sudah disabled (tidak bisa ditekan) — guard ini
    // pertahanan kedua supaya tidak ada jalur yang men-toast bohong
    // ("diterapkan" padahal rantai bypass).
    const handleApplyPresetWithToast = useCallback(
      (id: string, name: string) => {
        if (isDSPDisabled || !isEQEnabled) return;
        applyPreset(id);
        showToast(`Preset "${name}" diterapkan.`, "success");
      },
      [isDSPDisabled, isEQEnabled, applyPreset, showToast],
    );

    // Preset custom bisa DISIMPAN tapi dulu tidak bisa DIHAPUS dari UI.
    // Tekan lama untuk menghapus (dialog konfirmasi di induk).
    const handlePresetLongPress = useCallback(
      (id: string, name: string, isCustom?: boolean) => {
        if (!isCustom) return;
        onRequestDelete(id, name);
      },
      [onRequestDelete],
    );

    // Bagikan preset yang sedang AKTIF sebagai file JSON — yang dibagikan
    // adalah bunyinya saat ini (kurva + bass/widener/reverb yang sedang
    // berlaku), bukan salinan preset tersimpan. Nilai dibaca dari store
    // saat tombol ditekan (getState, tanpa langganan) supaya seksi ini
    // tidak ikut render ulang tiap tick drag. Berbagi tidak mengubah
    // suara, jadi tombol ini tidak ikut dibekukan saat DSP mati.
    const handleSharePreset = useCallback(async () => {
      const st = useEqualizerStore.getState();
      const presetName =
        allPresets.find((p) => p.id === activePresetId)?.name ??
        "Preset Kustom";
      const result = await sharePresetFile({
        name: presetName,
        bands: st.bands,
        bassBoost: st.bassStrength,
        virtualizer: st.virtualizerLevel,
        reverb: st.reverbPreset,
      });
      if (result.kind === "exported") {
        showToast("Preset siap dibagikan.", "success");
      } else {
        showToast(result.error, "error");
      }
    }, [allPresets, activePresetId, showToast]);
    const onSharePress = useCallback(() => {
      void handleSharePreset();
    }, [handleSharePreset]);

    return (
      <>
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
          <View style={styles.graphPreset}>
            <View style={[styles.sectionHeader, { marginBottom: spacing.sm }]}>
              <Text
                style={[styles.sectionTitle, { color: colors.text.secondary }]}
              >
                PROFIL SUARA
              </Text>
              {/* D5: tombol simpan berteks, bukan ikon saja. */}
              <TouchableOpacity
                onPress={onRequestSave}
                disabled={isDSPDisabled}
                accessibilityRole="button"
                accessibilityLabel="Simpan profil saat ini"
                style={[styles.iconBtn, isDSPDisabled && { opacity: 0.4 }]}
              >
                <Save size={18} color={colors.text.primary} />
                <Text
                  style={[styles.saveBtnText, { color: colors.text.primary }]}
                >
                  Simpan
                </Text>
              </TouchableOpacity>
              {/* Bagikan preset aktif sebagai file (item 8
                  deep-insight, 2026-11-20): tidak mengubah suara,
                  jadi tetap aktif walau DSP mati. */}
              <TouchableOpacity
                onPress={onSharePress}
                accessibilityRole="button"
                accessibilityLabel="Bagikan profil aktif sebagai file"
                style={styles.iconBtn}
              >
                <Share2 size={18} color={colors.text.primary} />
                <Text
                  style={[styles.saveBtnText, { color: colors.text.primary }]}
                >
                  Bagikan
                </Text>
              </TouchableOpacity>
            </View>
            {/* U-P2-45: hapus preset custom lewat long-press DULU
                tanpa petunjuk apa pun — user tidak bisa tahu
                aksinya ada. (Penghapusannya sendiri sudah benar:
                Alert konfirmasi + hanya untuk preset custom.) */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator
              style={styles.presetScroll}
              contentContainerStyle={{ paddingRight: spacing.sm }}
            >
              {allPresets.map((p) => (
                <PresetChip
                  key={p.id}
                  presetId={p.id}
                  presetName={p.name}
                  label={p.name}
                  isActive={activePresetId === p.id}
                  onPress={handleApplyPresetWithToast}
                  onLongPress={handlePresetLongPress}
                  isCustom={p.isCustom}
                  accessibilityHint={
                    p.isCustom ? "Tekan lama untuk menghapus" : undefined
                  }
                  disabled={isDSPDisabled || !isEQEnabled}
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
              Geser untuk profil lain · tekan lama untuk menghapus.
            </Text>
          </View>
        </View>
      </>
    );
  },
);

const EqBandDetailCard = memo(() => {
  const { theme } = useTheme();
  const colors = theme.colors;
  const spacing = theme.spacing;
  const {
    bands: currentBands,
    isEQEnabled,
    isDSPDisabled,
    updateBandGain,
    flushBandDrag,
  } = useEqBandListState();

  // Metrik scroll strip DETAIL BAND untuk bar indikator geser horizontal
  // (2026-11-20). State ini PINDAH ke seksi ini dari induk: scroll strip
  // sebelumnya me-render ulang SELURUH layar tiap frame scroll.
  const [bandScroll, setBandScroll] = useState({
    offsetX: 0,
    contentWidth: 0,
    layoutWidth: 0,
  });
  const bandIndicator = computeScrollIndicator(bandScroll);
  const firstBandFreq = currentBands[0]?.frequency;
  const lastBandFreq = currentBands[currentBands.length - 1]?.frequency;

  // Tombol geser ‹ › strip DETAIL BAND (2026-11-20): bar indikator saja
  // tidak cukup — strip tetap dikira cuma 5 slider (screenshot HP 08:05).
  // Ref ke FlatList lewat ScreenList.listRef; geser satu halaman
  // (selebar area tampak), nonaktif di ujung.
  const bandListRef = useRef<ScrollableListHandle | null>(null);
  const canBandScrollLeft = canScrollLeft(bandScroll);
  const canBandScrollRight = canScrollRight(bandScroll);
  const scrollBandPage = useCallback(
    (direction: -1 | 1) => {
      const next = pageScrollOffset(bandScroll, direction);
      bandListRef.current?.scrollToOffset({ offset: next, animated: true });
    },
    [bandScroll],
  );

  // Legenda hidup: band mana yang tampak sekarang ("Band 1–5 dari 10").
  const bandRange = visibleBandRange({
    ...bandScroll,
    bandCount: currentBands.length,
    bandWidth: BAND_WIDTH,
    contentPadding: spacing.sm,
  });
  const visibleFirstBandFreq = currentBands[bandRange.firstIndex]?.frequency;
  const visibleLastBandFreq = currentBands[bandRange.lastIndex]?.frequency;

  return (
    <>
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
        <View
          style={[
            styles.bandDetail,
            {
              borderTopWidth: 0,
              marginTop: 0,
              paddingTop: 0,
            },
          ]}
        >
          <Text
            style={[styles.detailBandTitle, { color: colors.text.secondary }]}
          >
            DETAIL BAND
          </Text>
          {/* Legenda: apa strip ini — EQ parametrik 10 band,
              tiap band ±10 dB, 0 dB = netral. Dulu hanya petunjuk
              "10 band · geser untuk 1k–16k": cukup sebagai
              petunjuk geser, tapi tidak menjelaskan apa yang
              disetel (screenshot 2026-11-20 08:05). Rentang band
              yang tampak ada di baris legenda hidup di bawah bar
              indikator. */}
          <Text style={[styles.bandHint, { color: colors.text.tertiary }]}>
            EQ parametrik 10 band · tiap band ±10 dB · 0 dB = netral
          </Text>
          {/* Skala dB di kiri strip + daftar band. Skala satu kolom
              untuk seluruh strip (semua fader ±10 dB, geometri
              sama); daftar menyusut selebar kolom (~28dp) — harga
              skala, band yang tampak jadi ~4,2 bukan 5. */}
          <View style={styles.bandStripRow}>
            <BandScale dimmed={!isEQEnabled || isDSPDisabled} />
            <View style={styles.bandStripList}>
              {/* U-P2-53: daftar band lewat pola daftar bersama.
                  Jalur yang dipilih tetap FlatList (horizontal +
                  bersarang di ScrollView — lihat chooseListKind);
                  `directionalLockEnabled` dipertahankan supaya
                  tidak bentrok dengan scroll utama. */}
              <ScreenList
                horizontal
                nestedInScrollView
                listRef={bandListRef}
                // Indikator bawaan dimatikan: tipis + memudar di
                // Android, itu sebabnya strip dikira cuma 5 slider
                // — bar indikator permanen di bawah strip yang
                // menggantikannya.
                showsHorizontalScrollIndicator={false}
                data={currentBands}
                keyExtractor={(item) => item.frequency.toString()}
                renderItem={({ item, index }) => (
                  <EqualizerBand
                    frequency={item.frequency}
                    gain={item.gain}
                    index={index}
                    onValueChange={updateBandGain}
                    // (Item 7) Drag fader dilepas: flush nilai akhir
                    // band SEKARANG (store + native).
                    onDragEnd={flushBandDrag}
                    disabled={!isEQEnabled || isDSPDisabled}
                  />
                )}
                contentContainerStyle={{ paddingHorizontal: spacing.sm }}
                directionalLockEnabled={true}
                scrollEventThrottle={16}
                onScroll={(e) => {
                  // Nilai event DITANGKAP dulu di sini: React Native
                  // mendaur-ulang synthetic event — membaca
                  // e.nativeEvent di dalam updater setState bisa
                  // berjalan sesudah event dilepas (nativeEvent null)
                  // dan melempar TypeError (Metro, sesi 80289).
                  const offsetX = e.nativeEvent.contentOffset.x;
                  setBandScroll((s) => ({
                    ...s,
                    offsetX,
                  }));
                }}
                onContentSizeChange={(w) =>
                  setBandScroll((s) => ({ ...s, contentWidth: w }))
                }
                onLayout={(e) => {
                  // Sama seperti onScroll di atas: tangkap dulu
                  // sebelum setState (synthetic event didaur ulang).
                  const layoutWidth = e.nativeEvent.layout.width;
                  setBandScroll((s) => ({
                    ...s,
                    layoutWidth,
                  }));
                }}
              />
            </View>
          </View>
          {/* Bar indikator geser horizontal + tombol geser ‹ ›:
              label ujung = frekuensi band pertama/terakhir (format
              sama dengan label di bawah fader), thumb = porsi
              tampak + posisi scroll. Tombol menggeser satu halaman
              dan nonaktif di ujung. Baris ini bukan lagi dekoratif
              murni (tombolnya kontrol) — hanya track-nya yang
              disembunyikan dari aksesibilitas. */}
          <View style={styles.bandScrollIndicator}>
            <TouchableOpacity
              onPress={() => scrollBandPage(-1)}
              disabled={!canBandScrollLeft}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Geser band ke kiri"
              accessibilityState={{ disabled: !canBandScrollLeft }}
              style={[
                styles.bandScrollButton,
                { borderColor: colors.border.medium },
                !canBandScrollLeft && styles.bandScrollButtonDisabled,
              ]}
            >
              <ChevronLeft size={18} color={colors.text.secondary} />
            </TouchableOpacity>
            <Text
              style={[styles.bandScrollLabel, { color: colors.text.tertiary }]}
            >
              {firstBandFreq !== undefined
                ? formatBandFrequency(firstBandFreq)
                : ""}
            </Text>
            <View
              style={[
                styles.bandScrollTrack,
                { backgroundColor: colors.border.medium },
              ]}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <View
                style={[
                  styles.bandScrollThumb,
                  {
                    backgroundColor: colors.text.secondary,
                    width: `${bandIndicator.thumbWidthPct}%`,
                    left: `${bandIndicator.thumbLeftPct}%`,
                  },
                ]}
              />
            </View>
            <Text
              style={[styles.bandScrollLabel, { color: colors.text.tertiary }]}
            >
              {lastBandFreq !== undefined
                ? formatBandFrequency(lastBandFreq)
                : ""}
            </Text>
            <TouchableOpacity
              onPress={() => scrollBandPage(1)}
              disabled={!canBandScrollRight}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Geser band ke kanan"
              accessibilityState={{ disabled: !canBandScrollRight }}
              style={[
                styles.bandScrollButton,
                { borderColor: colors.border.medium },
                !canBandScrollRight && styles.bandScrollButtonDisabled,
              ]}
            >
              <ChevronRight size={18} color={colors.text.secondary} />
            </TouchableOpacity>
          </View>
          {/* Legenda hidup: band mana yang tampak sekarang —
              diperbarui mengikuti scroll ("Band 1–5 dari 10"). */}
          {visibleFirstBandFreq !== undefined &&
            visibleLastBandFreq !== undefined && (
              <Text
                style={[styles.bandLegend, { color: colors.text.tertiary }]}
              >
                Band {bandRange.firstIndex + 1}–{bandRange.lastIndex + 1} dari{" "}
                {currentBands.length} ·{" "}
                {formatBandFrequencyFull(visibleFirstBandFreq)}–
                {formatBandFrequencyFull(visibleLastBandFreq)}
              </Text>
            )}
        </View>
      </View>
    </>
  );
});

const EqEffectsCard = memo(() => {
  const { theme } = useTheme();
  const colors = theme.colors;
  const spacing = theme.spacing;
  const {
    bassStrength,
    virtualizerLevel,
    reverbPreset,
    masterGain,
    isBassEnabled,
    isVirtualizerEnabled,
    isReverbEnabled,
    isEQEnabled,
    isDSPDisabled,
    setBassEnabled,
    setVirtualizerEnabled,
    setReverbEnabled,
    setBassBoost,
    setVirtualizer,
    setReverb,
    setMasterGain,
    flushBassBoostDrag,
    flushVirtualizerDrag,
    flushMasterGainDrag,
  } = useEqEffectsState();
  const showToast = useToastStore((s) => s.showToast);

  // Callback stabil untuk anak yang di-memo: meneruskan callback inline
  // dari render akan membatalkan React.memo tiap render.
  const handleMasterGainChange = useCallback(
    (v: number) => setMasterGain(dbToGain(v + MASTER_GAIN_DB_MIN)),
    [setMasterGain],
  );

  // HRTF — virtual speaker (langkah 7, 2026-11-19): toggle sendiri di
  // luar preset; gate hook dipakai juga di sini supaya seksi ini tahu
  // perangkat aktif headphone atau bukan. Gate utama hidup di
  // ThemedStack (_layout.tsx).
  const { hrtfAllowed } = useHrtfGate();
  const hrtfEnabled = useHrtfStore((s) => s.isHrtfEnabled);
  const setHrtfEnabled = useHrtfStore((s) => s.setHrtfEnabled);

  // Convolver — impulse response (2026-11-20): toggle sendiri di luar
  // preset (sama seperti HRTF). TANPA gate headphone: IR adalah ruang,
  // bukan efek headphone-only — bekerja di speaker juga. Toggle menyala
  // tanpa IR = passthrough (node inert, bukan bisu).
  const convolverEnabled = useConvolverStore((s) => s.isConvolverEnabled);
  const setConvolverEnabled = useConvolverStore((s) => s.setConvolverEnabled);
  const convolverIr = useConvolverStore((s) => s.ir);
  const loadConvolverIr = useConvolverStore((s) => s.loadIr);
  const clearConvolverIr = useConvolverStore((s) => s.clearIr);

  const handlePickIr = useCallback(async () => {
    const result = await loadConvolverIr();
    if (result.ok) {
      showToast(
        "IR dimuat — nyalakan convolver untuk mendengar ruangnya.",
        "success",
      );
    } else if (!result.canceled && result.error) {
      showToast(result.error, "error");
    }
  }, [loadConvolverIr, showToast]);

  const handleClearIr = useCallback(async () => {
    await clearConvolverIr();
    showToast("IR dihapus.", "info");
  }, [clearConvolverIr, showToast]);

  // Warna aksen dipilih lewat pengukuran terhadap permukaan tempat ia dipakai.
  const onCard = colors.background.secondary;
  const accentTextFallback = [colors.text.primary, colors.text.secondary];
  const bassColor = accentOn(
    [colors.accent.orange],
    onCard,
    accentTextFallback,
  );
  const widthColor = accentOn([colors.accent.blue], onCard, accentTextFallback);
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
  const hrtfColor = accentOn(
    [colors.accent.primary],
    onCard,
    accentTextFallback,
  );
  // Convolver: satu keluarga aksen dengan HRTF (keduanya efek ruang /
  // spasial, bukan nada).
  const convolverColor = accentOn(
    [colors.accent.primary],
    onCard,
    accentTextFallback,
  );

  return (
    <>
      <View
        style={[
          styles.effectsSection,
          { paddingHorizontal: spacing.md, marginBottom: spacing.lg },
        ]}
      >
        {/* F3: penjelasan di tempat kontrolnya, bukan cuma di banner
            atas yang bisa ter-scroll menjauh. */}
        {isDSPDisabled && (
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
        {/* Sakelar master mati (mode DSP): semua efek di bawah tidak
            memproses — caption di tempatnya supaya tidak ada yang
            mengira slider yang redup masih berpengaruh. */}
        {!isEQEnabled && !isDSPDisabled && (
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
            Sakelar master mati — semua efek di bawah tidak memproses.
          </Text>
        )}
        {/* SLIDER VERTIKAL BASS + PELEBAR STEREO + MASTER GAIN —
            opsi B Fase 3 (keputusan csheva 2026-11-18 08:08): dua knob
            diganti fader vertikal ala slider GAIN kanan Neutron,
            bahasa visual yang sama dengan fader band (track 160px,
            tick, fill, thumb kotak). Rentang nilai 0..1000 sama persis
            dengan knob lama dan dengan yang diterima Kotlin (bass
            0..+12 dB, widener width 1.0..2.0), jadi tanpa konversi.
            Tiap slider punya MiniSwitch enable sendiri di atasnya
            (tanpa label teks — nama efek sudah di label slider).
            Master gain MENYUSUL 2026-11-19: mesin native-nya sudah
            lengkap (setMasterGain -> GainNode), hanya belum ada
            kontrolnya. Slider ketiga, PREAMP skala dB −12..+12
            simetris (0 dB = netral, tengah slider) sejak 2026-11-19
            — konvensi preamp umum (Poweramp ±12 dB). VerticalSlider
            hanya mendukung min 0, jadi domain slider 0..24 dipetakan
            ke dB (nilai − 12); konversi dB↔linear (10^(dB/20)) hanya
            di batas layar ini — store + native tetap linear.
            Tanpa MiniSwitch — gain bukan efek yang bisa OFF; lantai
            −12 dB = 0,25×, BUKAN senyap (mute lewat volume). */}
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
                value={isBassEnabled}
                onValueChange={setBassEnabled}
                disabled={isDSPDisabled || !isEQEnabled}
                color={bassColor}
                stacked
                hideLabel
              />
              <VerticalSlider
                label="BASS BOOST"
                value={bassStrength}
                onChange={setBassBoost}
                // (Item 7) Drag dilepas: flush nilai akhir bass
                // SEKARANG (pusher + store), tanpa tunggu trailing.
                onDragEnd={flushBassBoostDrag}
                color={bassColor}
                disabled={!isBassEnabled || isDSPDisabled || !isEQEnabled}
                // Tampil dB, bukan %: bass bersifat addition dalam dB
                // (low-shelf 100 Hz, 0..+12 dB — cerminkan
                // kMaxBassBoostDb di NativeDSPModule.kt). % menyesatkan
                // karena menyiratkan skala linear.
                formatValue={formatBassBoostDb}
              />
            </View>
            <View style={styles.sliderCol}>
              <MiniSwitch
                label="PELEBAR STEREO"
                value={isVirtualizerEnabled}
                onValueChange={setVirtualizerEnabled}
                disabled={isDSPDisabled || !isEQEnabled}
                color={widthColor}
                stacked
                hideLabel
              />
              <VerticalSlider
                label="PELEBAR STEREO"
                value={virtualizerLevel}
                onChange={setVirtualizer}
                // (Item 7) Drag dilepas: flush nilai akhir widener
                // SEKARANG (pusher + store), tanpa tunggu trailing.
                onDragEnd={flushVirtualizerDrag}
                color={widthColor}
                disabled={
                  !isVirtualizerEnabled || isDSPDisabled || !isEQEnabled
                }
                // Tampil pengali lebar, bukan %: width 1.0..2.0
                // (side ×1.00 = stereo asli). % menyesatkan karena
                // 0% terbaca "mati" padahal itu stereo asli.
                formatValue={formatWidthMultiplier}
              />
            </View>
            <View style={styles.sliderCol}>
              {/* Spacer setinggi baris MiniSwitch (44) supaya
                  label/track/nilai ketiga kolom sejajar. Kolom ini
                  tanpa switch (gain bukan efek yang bisa OFF);
                  tanpa spacer, "MASTER GAIN" naik ke baris switch
                  dan seluruh kolomnya bergeser ke atas (screenshot
                  2026-11-20 00:27: "−12 dB" melayang di tengah
                  kartu, lebih tinggi dari "0 dB"/"×1.00"). */}
              <View style={styles.miniSwitchHit} accessible={false} />
              <VerticalSlider
                label="MASTER GAIN"
                value={gainToDb(masterGain) - MASTER_GAIN_DB_MIN}
                onChange={handleMasterGainChange}
                // (Item 7) Drag dilepas: flush nilai akhir gain
                // SEKARANG (native + store), tanpa tunggu trailing.
                onDragEnd={flushMasterGainDrag}
                color={masterColor}
                disabled={isDSPDisabled || !isEQEnabled}
                maxValue={MASTER_GAIN_DB_RANGE}
                formatValue={formatMasterGainSliderValue}
              />
            </View>
          </View>
        </View>

        {/* HRTF — VIRTUAL SPEAKER (langkah 7, 2026-11-19).
            BUKAN pelebar stereo: widener melebarkan sumbu L–R
            (tetap "di dalam kepala"), HRTF menaruh suara di ruang
            3D via HRIR — virtual speaker ±30° di depan. Toggle
            sendiri, di luar preset; hanya di headphone (gate:
            headset/usb/bluetooth — speaker/line_out dimatikan
            otomatis, lihat useHrtfGate). */}
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
            label="HRTF — VIRTUAL SPEAKER"
            value={hrtfEnabled}
            onValueChange={setHrtfEnabled}
            disabled={isDSPDisabled || !isEQEnabled || !hrtfAllowed}
            color={hrtfColor}
          />
          <Text
            style={[
              styles.disabledCaption,
              {
                color: colors.text.secondary,
                paddingHorizontal: spacing.md,
                marginTop: spacing.sm,
              },
            ]}
          >
            {hrtfAllowed
              ? "Virtual speaker ±30° di depan — suara keluar dari kepala. Hanya di headphone; di speaker Bluetooth tidak terdengar."
              : "Hanya di headphone — colok headphone / DAC / TWS untuk menyalakan HRTF."}
          </Text>
        </View>

        {/* CONVOLVER — IMPULSE RESPONSE (2026-11-20).
            File IR .wav pilihan user (concert hall, tube amp,
            karakter headphone) ala convolver ViPER4Android —
            "ruang" sebagai fitur, bukan sekadar efek. Toggle
            sendiri, di luar preset; TANPA gate headphone (IR
            bekerja di speaker juga). IR di-resample ke laju
            stream; maks ~2 detik sesudah resample. Tanpa IR,
            toggle menyala pun passthrough. */}
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
            label="CONVOLVER — IMPULSE RESPONSE"
            value={convolverEnabled}
            onValueChange={setConvolverEnabled}
            disabled={isDSPDisabled || !isEQEnabled}
            color={convolverColor}
          />
          <Text
            style={[
              styles.disabledCaption,
              {
                color: colors.text.secondary,
                paddingHorizontal: spacing.md,
                marginTop: spacing.sm,
              },
            ]}
          >
            {convolverIr
              ? `${convolverIr.name} · ${(convolverIr.sampleRateHz / 1000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} kHz · ${convolverIr.taps.toLocaleString("id-ID")} tap · ${(convolverIr.durationMs / 1000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} dtk`
              : "Belum ada IR — pilih file .wav (ruang konser, ampli tabung, karakter headphone)."}
          </Text>
          <View
            style={[
              styles.reverbRow,
              { marginHorizontal: spacing.md, marginTop: spacing.sm },
            ]}
          >
            <TouchableOpacity
              onPress={handlePickIr}
              disabled={isDSPDisabled || !isEQEnabled}
              style={[
                styles.reverbBox,
                {
                  backgroundColor: colors.background.tertiary,
                  borderColor: colors.border.medium,
                  padding: spacing.md,
                  minHeight: 44,
                  flex: 1,
                  alignItems: "center",
                  justifyContent: "center",
                },
                (isDSPDisabled || !isEQEnabled) && {
                  opacity: 0.4,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Pilih file IR (.wav)"
            >
              <Text
                style={{
                  fontFamily: FONT_FAMILY.medium,
                  fontSize: 13,
                  color: colors.text.primary,
                }}
              >
                PILIH FILE IR (.WAV)
              </Text>
            </TouchableOpacity>
            {convolverIr ? (
              <TouchableOpacity
                onPress={handleClearIr}
                disabled={isDSPDisabled || !isEQEnabled}
                style={[
                  styles.reverbBox,
                  {
                    backgroundColor: colors.background.tertiary,
                    borderColor: colors.border.medium,
                    padding: spacing.md,
                    minHeight: 44,
                    flex: 1,
                    alignItems: "center",
                    justifyContent: "center",
                  },
                  (isDSPDisabled || !isEQEnabled) && {
                    opacity: 0.4,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Hapus IR"
              >
                <Text
                  style={{
                    fontFamily: FONT_FAMILY.medium,
                    fontSize: 13,
                    color: colors.text.primary,
                  }}
                >
                  HAPUS
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <Text
            style={[
              styles.disabledCaption,
              {
                color: colors.text.secondary,
                paddingHorizontal: spacing.md,
                marginTop: spacing.sm,
              },
            ]}
          >
            Convolver duduk sesudah reverb, sebelum HRTF — ekor IR ikut
            ter-spatialisasi. Biasanya pakai salah satu: IR atau reverb, bukan
            keduanya.
          </Text>
        </View>

        {/* REVERB PRESET SELECTOR — DIPULIHKAN 2026-11-19.
            Disembunyikan 2026-11-18 karena engine reverb masih STUB
            (keputusan 2026-11-14); syarat "sampai engine C++ ada"
            kini terpenuhi (ReverbNode Freeverb di DSPChain), jadi
            kontrolnya kembali. Koreksi catatan: yang disembunyikan
            dulu adalah stepper ini (REVERB_LABELS + tombol
            mundur/maju, U-P2-40), BUKAN komponen ReverbDropdown —
            komponen itu tidak pernah terpasang di layar ini dan
            dihapus di ronde clean-cozy 2026-11-19 (0 pemakai).
            Stepper dipulihkan verbatim. */}
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
            value={isReverbEnabled}
            onValueChange={setReverbEnabled}
            disabled={isDSPDisabled || !isEQEnabled}
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
                  (reverbPreset - 1 + REVERB_LABELS.length) %
                  REVERB_LABELS.length;
                setReverb(prev);
              }}
              disabled={!isReverbEnabled || isDSPDisabled || !isEQEnabled}
              style={[
                styles.reverbStepBtn,
                {
                  backgroundColor: colors.background.tertiary,
                  borderColor: colors.border.medium,
                },
                (!isReverbEnabled || isDSPDisabled || !isEQEnabled) && {
                  opacity: 0.4,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Preset reverb sebelumnya: ${REVERB_LABELS[(reverbPreset - 1 + REVERB_LABELS.length) % REVERB_LABELS.length]}`}
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
                (!isReverbEnabled || isDSPDisabled || !isEQEnabled) && {
                  opacity: 0.4,
                },
              ]}
              disabled={!isReverbEnabled || isDSPDisabled || !isEQEnabled}
              onPress={() => {
                const next = (reverbPreset + 1) % REVERB_LABELS.length;
                setReverb(next);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Reverb: ${REVERB_LABELS[reverbPreset]}. Ketuk untuk preset berikutnya, tombol kiri untuk sebelumnya.`}
            >
              <Text
                style={[styles.reverbLabel, { color: colors.text.secondary }]}
              >
                LINGKUNGAN
              </Text>
              <View style={styles.reverbValueRow}>
                <Text style={[styles.reverbValue, { color: reverbColor }]}>
                  {REVERB_LABELS[reverbPreset]}
                </Text>
                <ChevronRight size={16} color={colors.text.secondary} />
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </>
  );
});

// ─── MAIN SCREEN ─────────────────────────────────────────────────────────

// Bottom padding: ruang untuk tab bar + FloatingPlayer (FLOATING_PLAYER_CLEARANCE).
const LIST_BOTTOM_PADDING = FLOATING_PLAYER_CLEARANCE + 20;

export default function EqualizerScreen() {
  const { theme } = useTheme();
  const colors = theme.colors;
  const spacing = theme.spacing;

  // Opsi 2: induk TIDAK lagi melanggan store EQ utuh — hanya audioMode
  // (pemilih mode + subtitle mesin) dan isEQEnabled (subtitle mesin).
  // Semua nilai EQ dibaca seksi memo di bawah lewat hook per seksi.
  const audioMode = usePlayerStore((s) => s.audioMode);
  const setAudioMode = usePlayerStore((s) => s.setAudioMode);
  const isEQEnabled = useEqualizerStore((s) => s.isEQEnabled);
  // FASE 4: umpan balik sukses preset ("Preset diterapkan" dst.) kini
  // memakai toast global — sebelumnya tap preset tanpa umpan balik apa
  // pun selain perubahan suara/kurva.
  const showToast = useToastStore((s) => s.showToast);

  // Status tanpa-MMAP di tab mode (keputusan 2026-11-16 19:07): tampilkan
  // di sini, bukan notifikasi sekali — persisten, terlihat di semua mode
  // begitu verdict diketahui (bit-perfect pernah dicoba dan exclusive
  // ditolak). Subscreen bit-perfect sudah menampilkannya saat mode itu
  // aktif; baris di bawah membuatnya terlihat juga dari mode lain.
  const bpStatus = useBitPerfectStatus();
  const bpVerdict = describeBitPerfectPath(bpStatus);

  const [isModalVisible, setModalVisible] = useState(false);

  // FASE 3 EQ — tiga konfirmasi Alert.alert diganti ConfirmDialog
  // (satu pola dialog, mengikuti Library): reset DSP, hapus preset
  // custom, dan pindah ke Bit-Perfect. Redaksi pesan TIDAK berubah.
  const [resetDialogVisible, setResetDialogVisible] = useState(false);
  const [deletePresetTarget, setDeletePresetTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [bitPerfectDialogVisible, setBitPerfectDialogVisible] = useState(false);

  const [visibleSections, setVisibleSections] = useState<VisibleSections>(
    DEFAULT_VISIBLE_SECTIONS,
  );
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
      serializeVisibleSections(visibleSections),
    ).catch(() => {});
  }, [visibleSections, sectionsLoaded]);

  const toggleSection = (section: keyof typeof visibleSections) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setVisibleSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  // Callback stabil untuk EqPresetCard (memo): buka modal simpan +
  // dialog hapus preset. Identitas stabil supaya memo tidak batal.
  const openSaveModal = useCallback(() => setModalVisible(true), []);
  const openDeletePresetDialog = useCallback(
    (id: string, name: string) => setDeletePresetTarget({ id, name }),
    [],
  );

  const handleReset = () => {
    setResetDialogVisible(true);
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
      : audioMode === "dsp" && isEQEnabled
        ? "MESIN AKTIF"
        : "MESIN BYPASS";

  // Tiga mode, masing-masing punya mesinnya sendiri. Pemrosesan DSP (EQ,
  // bass, pelebar, reverb, HRTF, koreksi headphone, master gain) HANYA
  // hidup di mode `dsp`; Immersive memakai rantai resonansinya sendiri
  // dan tidak memakai seksi di bawah.
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
      // FASE 3 EQ: konfirmasi pindah mode kini ConfirmDialog (bukan
      // Alert.alert) — redaksi pesan sama persis; bukan destruktif
      // (ganti mode), jadi tombol konfirmasi bukan merah.
      setBitPerfectDialogVisible(true);
      return;
    }

    void setAudioMode(mode);
  };

  // Warna aksen dipilih lewat pengukuran terhadap permukaan tempat ia dipakai.
  //
  // Rantai lama (`accent?.orange ?? status.warning ?? primary[500]`) gagal
  // kontras di banyak tema: primary[500] pada tema gelap justru warna gelap
  // (charcoal-black 1.12:1, midnight-blue 1.30:1), sehingga fader dan label
  // nyaris tak terlihat. `accentOn` mengembalikan aksen tema selama terbaca,
  // dan jatuh ke warna teks kalau tidak.
  const onCard = colors.background.secondary;
  const accentTextFallback = [colors.text.primary, colors.text.secondary];
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
            actions={<EqResetButton onPress={handleReset} />}
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
                      borderColor: isActive
                        ? masterColor
                        : colors.border.medium,
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
                          : // FASE 3 EQ: hint nonaktif DULU tertiary di
                            // atas tombol tertiary (terukur 3,94–4,34 —
                            // di bawah AA di 3 dari 4 tema). Secondary
                            // tetap redup tapi lolos di semua tema.
                            colors.text.secondary,
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
              <EqMasterCard />

              {/* 1. KOREKSI HEADPHONE — diletakkan PALING ATAS karena diproses
              paling awal di DSPChain (sebelum EQ). Koreksi menetralkan alat,
              EQ menyetel selera; menaruh kontrol EQ di atas akan menyesatkan
              tentang urutan yang sebenarnya. */}
              {visibleSections.headphone && <EqHeadphoneGate />}

              {/* 2. KARTU GRAFIK — hanya grafik (clean-cozy 2026-11-19):
              preset dan detail band keluar jadi seksi sendiri (3 dan 4
              di bawah) supaya kartu tidak bersarang dan toggle
              PRESET/MIXER tetap berfungsi walau GRAFIK disembunyikan.
              Grafik bisa diseret (edit utama). */}
              {visibleSections.graph && (
                <EqGraphCard
                  width={width - spacing.md * 2 - spacing.sm * 2 - 2}
                />
              )}

              {/* 3. PROFIL SUARA — seksi sendiri (clean-cozy 2026-11-19):
              dulu bersarang di dalam kartu GRAFIK, jadi toggle PRESET
              tidak berfungsi bila GRAFIK disembunyikan. Chip menerapkan
              preset ke suara (disabled saat sakelar master mati); tombol
              Simpan hanya menyimpan racikan — tetap aktif. */}
              {visibleSections.preset && (
                <EqPresetCard
                  onRequestSave={openSaveModal}
                  onRequestDelete={openDeletePresetDialog}
                />
              )}

              {/* 4. DETAIL BAND — seksi sendiri (clean-cozy 2026-11-19):
              dulu sub-bagian di dalam kartu GRAFIK; sekarang toggle
              MIXER berfungsi walau GRAFIK disembunyikan. Grafik drag
              tetap edit utama; slider untuk presisi per band. */}
              {visibleSections.mixer && <EqBandDetailCard />}

              {/* 5. EFFECTS SECTION (SLIDERS & REVERB) */}
              {visibleSections.effects && <EqEffectsCard />}

              {/* 6. TUNING (NADA DASAR) — kontrol yang sama dengan Solfeggio
              (TuningControl bersama, tanpa state baru): preset A=440 /
              A=432, stepper ±5 sen, rentang ±100 sen. Retune GLOBAL
              (playerStore.tuningCents): berlaku di DSP + Solfeggio dan
              TIDAK ikut sakelar master di atas (setTuningCents →
              setPitchRatio tidak memeriksa isEQEnabled). Diletakkan di
              luar seksi EFEK supaya tidak dikira efek yang mati saat
              master OFF. Bit-Perfect: tab DSP ini tidak tampil di sana
              (BitPerfectSubscreen yang tampil), dan TuningControl
              sendiri juga nonaktif bila audioMode bit-perfect. */}
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
                <Text
                  style={[styles.cardTitle, { color: colors.text.primary }]}
                >
                  Tuning (Nada Dasar)
                </Text>
                <Text
                  style={[
                    styles.cardHint,
                    { color: colors.text.tertiary, marginBottom: spacing.sm },
                  ]}
                >
                  Tinggi nada lagu tanpa mengubah tempo (A=440 standar, A=432
                  Verdi). Berlaku di DSP dan Solfeggio — tidak ikut sakelar
                  master.
                </Text>
                <TuningControl />
              </View>
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
          useEqualizerStore.getState().saveCustomPreset(n);
          setModalVisible(false);
          // FASE 4: simpan preset kini ber-toast (dulu diam).
          showToast(`Preset "${n}" disimpan.`, "success");
        }}
        onClose={() => setModalVisible(false)}
      />
      {/* FASE 3 EQ — dialog konfirmasi (satu pola, bukan Alert.alert). */}
      <ConfirmDialog
        visible={resetDialogVisible}
        title="Reset DSP"
        message="Kembalikan ke pengaturan netral? Kurva, bass, pelebar, reverb, master gain, HRTF, convolver, dan koreksi headphone ikut direset."
        confirmLabel="Reset"
        onConfirm={() => {
          setResetDialogVisible(false);
          useEqualizerStore.getState().resetToDefault();
          // FASE 4: reset tetap lewat ConfirmDialog — toast ini hanya
          // umpan balik SESUDAH konfirmasi. Guard: toast hanya bila EQ
          // menyala — saat sakelar mati tidak ada suara yang direset.
          if (useEqualizerStore.getState().isEQEnabled) {
            showToast("DSP direset ke pengaturan netral.", "info");
          }
        }}
        onCancel={() => setResetDialogVisible(false)}
      />
      <ConfirmDialog
        visible={deletePresetTarget !== null}
        title="Hapus preset"
        message={
          deletePresetTarget ? `Hapus "${deletePresetTarget.name}"?` : undefined
        }
        confirmLabel="Hapus"
        onConfirm={() => {
          // FASE 4: hapus tetap lewat ConfirmDialog — toast ini hanya
          // umpan balik SESUDAH konfirmasi.
          const name = deletePresetTarget?.name;
          if (deletePresetTarget)
            useEqualizerStore
              .getState()
              .deleteCustomPreset(deletePresetTarget.id);
          setDeletePresetTarget(null);
          if (name) showToast(`Preset "${name}" dihapus.`, "info");
        }}
        onCancel={() => setDeletePresetTarget(null)}
      />
      <ConfirmDialog
        visible={bitPerfectDialogVisible}
        title="Aktifkan Bit-Perfect?"
        message="Mode ini menonaktifkan semua DSP (EQ, Bass, Reverb) — hanya fade anti-klik yang tetap jalan. Pemutaran tetap berjalan walau device tidak mendukung jalur langsung; saat itu audio lewat mixer Android."
        confirmLabel="Aktifkan"
        destructive={false}
        onConfirm={() => {
          setBitPerfectDialogVisible(false);
          void setAudioMode("bit-perfect");
        }}
        onCancel={() => setBitPerfectDialogVisible(false)}
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
    fontFamily: FONT_FAMILY.bold,
  },
  modeHint: {
    fontSize: 11,
    fontFamily: FONT_FAMILY.regular,
    marginTop: 2,
    textAlign: "center",
  },
  // Deskripsi satu kalimat mode aktif di bawah sakelar mode (B5).
  modeDescription: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.regular,
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
    borderRadius: BASE_RADIUS.md,
  },
  // U-P2-01: minHeight 36 lama, di bawah 44dp.
  viewBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: BASE_RADIUS.xl,
    minHeight: 44,
  },
  viewBtnText: {
    fontSize: 10,
    fontFamily: FONT_FAMILY.bold,
    letterSpacing: 1,
  },
  resetBtn: { alignItems: "center", justifyContent: "center" },
  card: {
    borderRadius: BASE_RADIUS.lg,
    borderWidth: 1,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardTitle: { fontSize: 14, fontFamily: FONT_FAMILY.bold },
  // P2 audit BitPerfect/Solfeggio 2026-11-20: keluarga tab EQ nol
  // Playfair — satu-satunya tanpa suara display. Satu jenjang display
  // (h4, 20/28 — seperti statusValue Analyzer): hanya judul kartu utama
  // ("Pemrosesan DSP") yang memakai displayBold, sisanya tetap Inter.
  displayTitle: {
    fontSize: 20,
    fontFamily: FONT_FAMILY.displayBold,
    lineHeight: 28,
  },
  cardHint: {
    fontSize: 11,
    fontFamily: FONT_FAMILY.regular,
    lineHeight: 16,
    marginTop: 2,
  },
  graphCard: {
    minHeight: 160,
    borderRadius: BASE_RADIUS.xl,
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
    fontFamily: FONT_FAMILY.regular,
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
    fontFamily: FONT_FAMILY.bold,
    letterSpacing: 1.5,
    marginBottom: 4,
    textAlign: "center",
  },
  bandHint: {
    fontSize: 10,
    textAlign: "center",
    marginBottom: 4,
  },
  // Baris strip DETAIL BAND: kolom skala dB di kiri + daftar band.
  bandStripRow: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  bandStripList: {
    flex: 1,
  },
  // Bar indikator geser horizontal strip DETAIL BAND: satu baris,
  // tombol geser mengapit label ujung + track; thumb bergerak mengikuti
  // scroll.
  bandScrollIndicator: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    paddingHorizontal: 8,
  },
  // Tombol geser ‹ ›: lingkaran 32dp, target sentuh 44 lewat hitSlop 6.
  bandScrollButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  bandScrollButtonDisabled: {
    opacity: 0.35,
  },
  // Legenda hidup di bawah bar indikator: band yang tampak sekarang.
  bandLegend: {
    fontSize: 10,
    textAlign: "center",
    marginTop: 4,
  },
  bandScrollLabel: {
    fontSize: 10,
    fontFamily: FONT_FAMILY.medium,
    width: 28,
    textAlign: "center",
  },
  bandScrollTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  bandScrollThumb: {
    position: "absolute",
    top: 0,
    bottom: 0,
    borderRadius: 2,
  },
  effectsSection: { gap: 12 },
  effectItem: {
    borderRadius: BASE_RADIUS.xl,
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
  // U-P2-01: penangkap sentuh MiniSwitch (lihat komentar di komponen).
  miniSwitchHit: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  miniSwitchLabel: {
    fontSize: 11,
    fontFamily: FONT_FAMILY.bold,
    letterSpacing: 1.5,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: 32,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: FONT_FAMILY.bold,
    letterSpacing: 1.5,
  },
  presetHint: { fontSize: 11, fontFamily: FONT_FAMILY.regular },
  // F3: caption "kenapa nonaktif" di tempat kontrolnya.
  disabledCaption: { fontSize: 11, fontFamily: FONT_FAMILY.regular },
  bypassLabel: {
    fontSize: 11,
    fontFamily: FONT_FAMILY.semiBold,
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
    fontFamily: FONT_FAMILY.semiBold,
  },
  presetScroll: { flexGrow: 0 },
});
