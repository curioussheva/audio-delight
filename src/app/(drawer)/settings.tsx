import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Modal,
  FlatList,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

// Lucide Icons
import {
  Palette,
  Cpu,
  Music,
  Info,
  Brush,
  Moon,
  Sun,
  ChevronRight,
  CheckCircle,
  RefreshCw,
  Sparkles,
  Database,
} from "lucide-react-native";
import { useLibraryStore } from "@/features/library/store/libraryStore"; // Pastikan path benar
import { BackgroundScanTask } from "@/features/library/services/BackgroundScanTask";
import { MetadataEnricher } from "@/features/library/services/MetadataEnricher";
import { UnifiedScanService } from "@/features/library/services/UnifiedScanService";
import { ScanAbortedError } from "@/features/library/services/ScanDiffEngine";
import { useRefreshStore } from "@/shared/store/refreshStore";
import { formatRescanToast } from "@/features/library/utils/rescanMessage";

import * as Haptics from "expo-haptics";

import { useTheme } from "@/shared/context/ThemeContext";
import { ScreenHeader } from "@/shared/components/ui/ScreenHeader";
import { SectionCard } from "@/shared/components/ui/SectionCard";
import { ConfirmDialog } from "@/shared/components/ui/ConfirmDialog";
import { PristineButton } from "@/shared/components/ui/PristineButton";
import { useToastStore } from "@/shared/store/toastStore";
import { FONT_FAMILY } from "@/shared/constants/themes/base";
import { pickReadable, accentOn, compositeOver, AA_NORMAL } from "@/shared/utils/contrast";
import { useAudioOutput } from "@/features/hardware/hooks/useAudioOutput";
import { useDSPProcessingGate } from "@/features/hardware/hooks/useDSPProcessingGate";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { TuningControl } from "@/features/player/components/TuningControl";
import { useBitPerfectStatus } from "@/features/player/hooks/useBitPerfectStatus";
import { ThemePicker } from "@/shared/components/ui/ThemePicker";
import type { Theme } from "@/constants/themes/types";
import { DEFAULT_THEME } from "@/constants/theme";
import OnlineMetadataService from "@/features/library/services/OnlineMetadataService";

import { Zap, ShieldCheck, TriangleAlert } from "lucide-react-native";
import { useEqualizerStore } from "@/features/equalizer/store/equalizerStore";
import { useEqualizer } from "@/features/equalizer/hooks/useEqualizer";
import { useHeadphoneStore } from "@/features/headphone/store/headphoneStore";
import Constants from "expo-constants";

// Versi dibaca dari app.json seperti About — sebelumnya hardcoded
// "1.0.0 (Build 2026)" sementara app.json sudah 1.0.37.
const APP_VERSION =
  Constants.expoConfig?.version ??
  (Constants.manifest as { version?: string } | null)?.version ??
  "-";

// ─── Reusable Sub Components ────────────────────────────────────────────────

type SectionHeaderProps = {
  icon: React.ReactNode;
  title: string;
  colors: Theme["colors"];
  spacing: Theme["spacing"];
  collapsible?: boolean;
  expanded?: boolean;
  onPress?: () => void;
  rightSlot?: React.ReactNode;
};

const SectionHeader: React.FC<SectionHeaderProps> = ({
  icon,
  title,
  colors,
  spacing,
  collapsible = false,
  expanded,
  onPress,
  rightSlot,
}) => {
  const Wrapper = collapsible ? TouchableOpacity : View;

  return (
    <Wrapper
      style={[
        styles.sectionHeader,
        {
          padding: spacing.md,
          borderBottomColor: colors.background.tertiary,
        },
      ]}
      onPress={onPress}
      // U-P2-33: header lipat dulu tanpa role/state — pembaca layar tidak
      // tahu ini tombol, apalagi sedang terbuka atau tertutup. Props
      // aksesibilitas hanya dipasang saat collapsible (View polos tidak
      // perlu jadi tombol).
      {...(collapsible
        ? {
            accessibilityRole: "button" as const,
            accessibilityLabel: `${title}, bagian ${expanded ? "terbuka" : "tertutup"}`,
            accessibilityState: { expanded: !!expanded },
          }
        : {})}
    >
      <View style={styles.row}>
        {icon}
        <Text
          style={[
            styles.sectionTitle,
            { color: colors.text.primary, marginLeft: spacing.sm },
          ]}
        >
          {title}
        </Text>
      </View>

      <View style={styles.row}>
        {rightSlot}
        {collapsible && (
          <ChevronRight
            size={20}
            color={colors.text.secondary}
            style={{ transform: [{ rotate: expanded ? "90deg" : "0deg" }] }}
          />
        )}
      </View>
    </Wrapper>
  );
};

type SettingRowProps = {
  colors: Theme["colors"];
  spacing: Theme["spacing"];
  children: React.ReactNode;
  bordered?: boolean;
};

const SettingRow: React.FC<SettingRowProps> = ({
  colors,
  spacing,
  children,
  bordered = true,
}) => (
  <View
    style={[
      styles.settingRow,
      {
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        borderTopColor: colors.background.tertiary,
        borderTopWidth: bordered ? 1 : 0,
      },
    ]}
  >
    {children}
  </View>
);

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const router = useRouter();
  const { theme, isDarkMode, toggleTheme, setTheme } = useTheme();
  const { colors, spacing } = theme;

  // Aksen sebagai TEKS/IKON — pola Equalizer: aksen dipakai selama terbaca di
  // atas permukaan, jatuh ke warna teks bila tidak. primary[500] mentah
  // gagal 4,5 di 9/22 tema (teks) dan gagal 3,0 di 8 tema (ikon).
  const accentOnSecondary = accentOn(
    [colors.primary[500]],
    colors.background.secondary,
    [colors.text.primary, colors.text.secondary],
  );
  const accentOnTertiary = accentOn(
    [colors.primary[500]],
    colors.background.tertiary,
    [colors.text.primary, colors.text.secondary],
  );
  // Teks di atas tombol primary[500] — pola PresetChip Equalizer (token tema,
  // bukan literal): inverse dulu, lalu background.primary.
  const onAccent =
    pickReadable(
      [colors.text.inverse, colors.background.primary, colors.text.primary],
      colors.primary[500],
      AA_NORMAL,
    ) ?? colors.background.primary;

  // FASE 3 Settings: seksi memakai SectionCard (Fase 2) — permukaan
  // elevated + radius md + bayangan md + hairline border dari token.
  // padding 0: header/baris di dalam sudah mengatur paddingnya sendiri
  // (SectionHeader padding md, SettingRow padding sm/md); padding kartu
  // akan menggandakannya. marginBottom tetap seperti Section lokal dulu.
  const sectionCardStyle: ViewStyle = {
    marginBottom: spacing.md,
    padding: 0,
    overflow: "hidden",
  };

  // FASE 3 Settings: teks status yang terbaca — status.error/warning
  // mentah gagal AA (4,5) sebagai teks di tema terang (diukur dulu:
  // error 3,57–4,33, warning 3,69–4,27 di Porcelain/Hearth).
  // pickReadable mempertahankan hue (merah/kuning) dengan jatuh ke
  // varian gelap (#B91C1C / #92400E) hanya di tema terang; di tema
  // gelap warna status asli tetap dipakai.
  const errorOnSecondary =
    pickReadable(
      [colors.status.error, "#B91C1C", "#991B1B"],
      colors.background.secondary,
      AA_NORMAL,
    ) ?? colors.status.error;
  // Tombol reset: teks di atas tint error 20% — diukur terhadap KOMPOSIT
  // tint di atas primary (compositeOver), bukan terhadap primary di
  // bawahnya: status.error lolos di atas primary Porcelain tapi hanya
  // 3,92 di atas kompositnya (diukur).
  const errorOnResetBg =
    pickReadable(
      [colors.status.error, "#B91C1C", "#991B1B"],
      compositeOver(colors.status.error + "20", colors.background.primary),
      AA_NORMAL,
    ) ?? colors.status.error;
  const warnOnSecondary =
    pickReadable(
      [colors.status.warning, "#92400E", "#78350F"],
      colors.background.secondary,
      AA_NORMAL,
    ) ?? colors.status.warning;
  const warnOnTertiary =
    pickReadable(
      [colors.status.warning, "#92400E", "#78350F"],
      colors.background.tertiary,
      AA_NORMAL,
    ) ?? colors.status.warning;

  const showToast = useToastStore((s) => s.showToast);

  const {
    isAutoScanEnabled,
    toggleAutoScanEnabled, // Gunakan action yang sesuai di store kamu
    // Auto Enriching: gerbang start OTOMATIS worker enrichment.
    isAutoEnrichingEnabled,
    toggleAutoEnrichingEnabled,
    // Rescan: kunci scan — tombol diganti spinner saat scan jalan.
    isManualScanning,
    isAutoScanning,
  } = useLibraryStore();

  // --- 2. EXISTING STATES ---
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [showDacSettings, setShowDacSettings] = useState(false);
  const [showAudioSettings, setShowAudioSettings] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showLibrarySettings, setShowLibrarySettings] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  // Rescan (full scan manual) dari Settings — spinner lokal +
  // kunci store (lihat handleRescan).
  const [isRescanning, setIsRescanning] = useState(false);
  // FASE 3 Settings: konfirmasi destruktif/berdampak lewat ConfirmDialog
  // (bukan dialog sistem) — pola Fase 3 Library/EQ.
  const [showClearCacheConfirm, setShowClearCacheConfirm] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showBitPerfectConfirm, setShowBitPerfectConfirm] = useState(false);

  // Jalur output audio yang sebenarnya: SEMUA perangkat (speaker, jack, USB
  // DAC, Bluetooth, HDMI). Modul lama yang hanya melihat USB DAC
  // (USBDACModule/useUSBDAC) sudah dihapus 2026-10-08: metode
  // setSampleRate/setExclusiveMode-nya tidak punya JNI dan selalu mengembalikan
  // sukses palsu.
  const {
    devices: outputDevices,
    currentDevice: activeOutputDevice,
    status: outputStatus,
    bluetoothCodec,
    loading: outputLoading,
    error: outputError,
    refresh: refreshOutput,
    selectDevice: selectOutputDevice,
  } = useAudioOutput();

  // Sakelar diagnostik: bandingkan "dengan DSP" vs "tanpa DSP" saat pemutaran,
  // tanpa build ulang. Lihat useDSPProcessingGate.
  const dspGate = useDSPProcessingGate();

  const [showEQPicker, setShowEQPicker] = useState(false);

  const { activePresetId, applyPreset, setEQEnabled, resetToDefault } =
    useEqualizerStore();

  // N9: picker preset lewat guard DSP (useEqualizer), bukan store mentah:
  // di mode bit-perfect/immersive preset tidak boleh mengubah bands di
  // store, dan daftar memakai allPresets (bawaan + custom user).
  // applyPreset mentah di atas tetap dipakai doResetAll (reset ke netral,
  // bukan pilihan preset user).
  const {
    applyPreset: applyPresetGuarded,
    allPresets,
    isDSPDisabled,
  } = useEqualizer();

  const { resetAll: resetHeadphoneAll } = useHeadphoneStore();

  const {
    playbackSpeed,
    setPlaybackSpeed,
    setTuningCents,
    audioMode, // <--- Add this
    setAudioMode, // <--- Add this
  } = usePlayerStore();

  // 🔥 Status JUJUR: audioMode hanya mencatat pilihan user. AAudio bisa
  // menolak exclusive → fallback shared diam-diam. Tanpa ini UI bilang
  // "Bit-Perfect Mode" padahal mixer masih menyentuh sampel.
  const bpStatus = useBitPerfectStatus();

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleClearCache = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setShowClearCacheConfirm(true);
  };

  const doClearCache = async () => {
    setShowClearCacheConfirm(false);
    setIsClearing(true);
    const success = await OnlineMetadataService.clearArtistCache();
    setIsClearing(false);
    if (success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast("Cache telah dibersihkan.", "success");
    } else {
      // U-P2-47: dulu gagal diam-diam — tidak ada umpan balik
      // apa pun bila clearArtistCache() mengembalikan false.
      // Samakan dengan handleResetAll yang punya umpan balik "Gagal".
      showToast("Cache gagal dibersihkan. Coba lagi.", "error");
    }
  };

  const handleResetAll = () => {
    setShowResetConfirm(true);
  };

  const doResetAll = async () => {
    setShowResetConfirm(false);
    // Dulu tombol ini palsu: langsung tampil "Sukses" tanpa
    // mereset apa pun. Sekarang tiap pengaturan dikembalikan
    // ke nilai default-nya (lihat store masing-masing).
    try {
      // Reset tema = kembali ke default aplikasi (pristine-ember
      // sejak Fase 1), bukan tema lama yang di-hardcode.
      await setTheme(DEFAULT_THEME.id);
      // Reset mengembalikan Auto Discovery ke default OFF
      // (+ batalkan background task) dan Auto Enriching ke default ON.
      // Initial scan tidak punya toggle — reset tidak menyentuhnya.
      if (isAutoScanEnabled) {
        toggleAutoScanEnabled();
        await BackgroundScanTask.unregister().catch((err) =>
          console.warn("[Settings] BackgroundTask unregister failed:", err),
        );
      }
      if (!isAutoEnrichingEnabled) {
        toggleAutoEnrichingEnabled();
      }
      // I2-revisi: reset online/wifi tidak ada lagi — pengaturannya
      // dihapus (online hanya di [id].tsx).
      applyPreset("flat");
      // U-P1-24: lubang fix 90181498 — applyPreset("flat") hanya
      // mereset band EQ. bassStrength/virtualizerLevel/reverbPreset
      // tetap tersimpan dan kembali saat EQ dinyalakan. resetToDefault
      // (equalizerStore) mengembalikan ketiganya ke 0 (netral).
      // Dipanggil SEBELUM setEQEnabled(false) supaya nilai netral
      // sempat didorong ke native selagi EQ masih aktif.
      await resetToDefault();
      await setEQEnabled(false);
      await resetHeadphoneAll();
      setPlaybackSpeed(1.0);
      setTuningCents(0);
      setAudioMode("dsp");
      showToast("Semua pengaturan telah direset", "success");
    } catch (e) {
      console.warn("[Settings] Reset All gagal:", e);
      showToast("Sebagian pengaturan gagal direset. Coba lagi.", "error");
    }
  };

  const handleToggleAutoScan = async (value: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleAutoScanEnabled(); // update store dulu (optimistic)

    if (value) {
      // Aktifkan → daftarkan background task (interval 240 menit —
      // less aggressive: koleksi berubah jarang, resume quickDiff
      // sudah menangkap perubahan saat app dibuka).
      const ok = await BackgroundScanTask.register(240).catch((err) => {
        console.warn("[Settings] BackgroundTask register failed:", err);
        return false;
      });
      if (ok) {
        console.log("[Settings] Background scan registered");
      } else {
        // U-P1-25: rollback optimistis — register mengembalikan false
        // (izin media/notifikasi ditolak, atau exception) berarti tidak ada
        // pemindaian background yang berjalan. Kembalikan toggle ke OFF
        // dan beri tahu user; dulu toggle dibiarkan ON padahal tidak ada
        // scan yang jalan.
        toggleAutoScanEnabled();
        showToast(
          "Auto Discovery gagal diaktifkan. Pemindaian latar tidak bisa didaftarkan. Periksa izin media & notifikasi, lalu coba lagi.",
          "error",
        );
      }
    } else {
      // Matikan → batalkan background task
      await BackgroundScanTask.unregister().catch((err) =>
        console.warn("[Settings] BackgroundTask unregister failed:", err),
      );
      console.log("[Settings] Background scan unregistered");
    }
  };

  // Auto Enriching — toggle baru (default ON). ON = kuras antrean yang
  // terakumulasi selama OFF (worker keluar sendiri bila antrean kosong);
  // OFF = hentikan worker background yang sedang jalan (antrean
  // persisten — tidak hilang, terkuras lewat aksi eksplisit berikutnya:
  // modal manual / Rescan / toggle ini di-ON-kan lagi). Tanpa efek
  // samping lain (tanpa izin / registrasi task), jadi tidak ada
  // rollback seperti handleToggleAutoScan.
  const handleToggleAutoEnriching = (value: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleAutoEnrichingEnabled();
    if (value) {
      void MetadataEnricher.startBackgroundWorker(undefined, {
        isPlaying: () => usePlayerStore.getState().isPlaying,
      }).catch((err) =>
        console.warn("[Settings] Auto Enriching start failed:", err),
      );
    } else {
      MetadataEnricher.stop();
      console.log("[Settings] Auto Enriching dimatikan — worker dihentikan");
    }
  };

  // Rescan Library — full scan manual dari Settings. Memakai
  // UnifiedScanService.manualScan yang SAMA dengan manual rescan
  // Library (bukan jalur scan kedua): full diff MediaStore. Kunci
  // scan dihormati dua lapis — tombol diganti spinner saat scan jalan
  // (store flag) + handler memeriksa ulang via getState (balapan tap)
  // — tanpa error mentah ke user. Feedback selesai/gagal lewat toast
  // (pola Fase 4).
  const handleRescan = async () => {
    const { isManualScanning: manualRunning, isAutoScanning: autoRunning } =
      useLibraryStore.getState();
    if (isRescanning || manualRunning || autoRunning) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsRescanning(true);
    try {
      const result = await UnifiedScanService.manualScan((progress) => {
        useLibraryStore.getState().updateManualScanProgress(progress);
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast(formatRescanToast(result), "success");
    } catch (error) {
      if (error instanceof ScanAbortedError) {
        // Dibatalkan dari Library (tombol batal) saat Rescan Settings
        // sedang jalan — bukan kegagalan.
        showToast("Rescan dibatalkan.", "info");
      } else {
        console.error("[Settings] Rescan failed:", error);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        showToast("Rescan gagal. Coba lagi.", "error");
      }
    } finally {
      setIsRescanning(false);
      // FASE 4: jangan refresh langsung — bump, biar subscriber yang
      // refresh lewat SATU jalur (dengan guard scan + dedup). Bump juga
      // saat scan GAGAL: DB bisa tertulis sebagian, UI harus menampilkan
      // keadaan sebenarnya. (Pola yang sama dengan handleManualRescan
      // di Library; asal di sini "settings".)
      useRefreshStore.getState().bumpRefreshKey("manual-scan", "settings");
    }
  };

  // ─── Handler tambahan ─────────────────────────────────────────────────────────

  const handleSpeedChange = (delta: number) => {
    const current = playbackSpeed ?? 1.0;
    const next = Math.round((current + delta) * 4) / 4; // step 0.25, hindari float error
    const clamped = Math.min(2.0, Math.max(0.5, next));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPlaybackSpeed(clamped);
  };

  // 🔥 FASE R (2026-11-11): retune — preset tuning + geser halus ±5 sen.
  // -31.77 sen = A=432 (Verdi): 1200*log2(432/440). Store men-clamp ±100 sen.
  // UI-nya pindah ke TuningControl (dipakai settings + subscreen Solfeggio);
  // reset-all di bawah tetap memakai setTuningCents(0) langsung.

  // ─── Mode selector ─────────────────────────────────────────────
  //
  // Tiga mode, live - tidak ada restart stream, jadi perpindahan berlaku pada
  // frame berikutnya. Ini menggantikan sakelar on/off lama yang menggabungkan
  // "mode pemrosesan" dengan "syarat jalur" menjadi satu tombol.
  const AUDIO_MODES = [
    {
      id: "bit-perfect" as const,
      label: "Bit-Perfect",
      hint: "Tanpa DSP sama sekali. Butuh jalur langsung ke DAC - kalau tidak, tetap berbunyi lewat mixer.",
      Icon: ShieldCheck,
      color: colors.status.warning,
    },
    {
      id: "dsp" as const,
      label: "DSP",
      hint: "EQ, bass boost, limiter, stereo width aktif.",
      Icon: Zap,
      color: accentOnSecondary,
    },
    {
      id: "immersive" as const,
      label: "Solfeggio",
      hint: "DSP + resonansi solfeggio, harmonic, spatial.",
      Icon: Sparkles,
      color: accentOn(
        [colors.primary[400] ?? colors.primary[500]],
        colors.background.secondary,
        [colors.text.primary, colors.text.secondary],
      ),
    },
  ];

  const handleSelectMode = (mode: "bit-perfect" | "dsp" | "immersive") => {
    if (mode === audioMode) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Bit-perfect perlu penjelasan karena efeknya paling terasa: DSP mati.
    // Mode lain langsung jalan - audio tidak pernah diblokir.
    if (mode === "bit-perfect") {
      setShowBitPerfectConfirm(true);
      return;
    }

    setAudioMode(mode);
  };

  // ─── Sections ─────────────────────────────────────────────

  const renderTampilan = () => (
    <SectionCard style={sectionCardStyle}>
      <SectionHeader
        icon={
          <Palette size={24} color={accentOnSecondary} strokeWidth={2.2} />
        }
        title="Tampilan"
        colors={colors}
        spacing={spacing}
      />

      {/* Tema */}
      <TouchableOpacity
        onPress={() => setShowThemePicker(true)}
        style={[
          styles.settingRow,
          {
            paddingVertical: spacing.sm,
            paddingHorizontal: spacing.md,
            borderBottomWidth: 1,
            borderBottomColor: colors.background.tertiary,
          },
        ]}
      >
        <View style={styles.row}>
          <Brush size={20} color={colors.text.secondary} strokeWidth={2.2} />
          <Text style={{ color: colors.text.primary, marginLeft: spacing.sm }}>
            Tema
          </Text>
        </View>
        <View style={styles.row}>
          <View
            style={[
              styles.themeColorDot,
              { backgroundColor: colors.primary[500], marginRight: spacing.xs },
            ]}
          />
          <Text
            style={{ color: colors.text.secondary, marginRight: spacing.xs }}
          >
            {theme.name}
          </Text>
          <ChevronRight
            size={20}
            color={colors.text.secondary}
            strokeWidth={2.5}
          />
        </View>
      </TouchableOpacity>

      {/* Mode Gelap */}
      <View
        style={[
          styles.settingRow,
          { paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
        ]}
      >
        <View style={styles.row}>
          {isDarkMode ? (
            <Moon size={20} color={colors.text.secondary} strokeWidth={2.2} />
          ) : (
            <Sun size={20} color={colors.text.secondary} strokeWidth={2.2} />
          )}
          <Text style={{ color: colors.text.primary, marginLeft: spacing.sm }}>
            Mode Gelap
          </Text>
        </View>
        <Switch
          value={isDarkMode}
          onValueChange={toggleTheme}
          trackColor={{
            false: colors.background.tertiary,
            true: colors.primary[500],
          }}
          thumbColor={isDarkMode ? colors.text.primary : colors.text.secondary}
        />
      </View>
    </SectionCard>
  );

  // ─── renderAudioOutput ────────────────────────────────────────────────────────
  //
  // Section jalur output audio. Menggantikan section "USB DAC" yang lama, yang
  // hanya melihat perangkat USB sehingga speaker/jack/Bluetooth/HDMI tidak
  // pernah bisa dipilih - dan yang pilihan device-nya tidak sampai ke native.
  //
  // Semua perangkat di sini benar-benar bisa dipilih: pilihannya diteruskan ke
  // engine dan stream dibuka ulang di perangkat itu, dengan laju dihitung dari
  // kapabilitas perangkat BARU.
  const renderAudioOutput = () => {
    // F1 (2026-11-16): label jalur dari STATUS STREAM LIVE, bukan dari
    // klasifikasi statis per tipe device (yang terbalik: speaker/headset
    // ditandai mustahil padahal exclusive justru hanya mungkin lewat jalur
    // internal di HP ber-MMAP). Saat pause/belum siap, verdict bisa basi —
    // tampilkan "belum diketahui".
    const pathLabel =
      bpStatus.unavailable || bpStatus.stale
        ? "belum diketahui"
        : bpStatus.isBitPerfect
          ? "jalur langsung — bit-perfect aktif"
          : bpStatus.rateMismatch
            ? "jalur langsung — laju berbeda (ada resampling)"
            : bpStatus.exclusiveFailed
              ? "lewat mixer sistem — device menolak jalur langsung"
              : "belum diketahui";

    return (
      <SectionCard style={sectionCardStyle}>
        <SectionHeader
          icon={
            <Cpu size={24} color={accentOnSecondary} strokeWidth={2.2} />
          }
          title="Audio Output"
          colors={colors}
          spacing={spacing}
          collapsible
          expanded={showDacSettings}
          onPress={() => setShowDacSettings((v) => !v)}
          rightSlot={
            activeOutputDevice ? (
              <View
                style={[
                  styles.statusDot,
                  {
                    backgroundColor: outputStatus?.honored
                      ? colors.status.success
                      : colors.status.warning,
                  },
                ]}
              />
            ) : null
          }
        />

        {showDacSettings && (
          <View style={{ padding: spacing.md }}>
            {(outputError) && (
              <View
                style={[
                  styles.alertBox,
                  {
                    backgroundColor: colors.status.error + "20",
                    borderColor: colors.status.error,
                  },
                ]}
              >
                <Text style={{ color: errorOnSecondary, fontSize: 12 }}>
                  Error: {outputError}
                </Text>
              </View>
            )}

            {/* Perangkat yang SEDANG mengeluarkan suara.
                Ini yang boleh disebut namanya - bukan yang dipilih. Kalau
                pilihan DAC tidak dihormati, di sini yang muncul speaker
                internal. */}
            <View
              style={{
                backgroundColor: colors.background.tertiary,
                borderRadius: spacing.sm,
                padding: spacing.sm,
                marginBottom: spacing.md,
              }}
            >
              <Text
                style={{
                  color: colors.text.secondary,
                  fontSize: 10,
                  letterSpacing: 0.6,
                }}
              >
                OUTPUT AKTIF
              </Text>
              <Text
                style={{
                  color: colors.text.primary,
                  fontFamily: FONT_FAMILY.semiBold,
                  marginTop: 2,
                }}
              >
                {activeOutputDevice
                  ? activeOutputDevice.name
                  : "Dikelola sistem"}
              </Text>
              <Text
                style={{
                  color: outputStatus?.honored
                    ? colors.text.secondary
                    : warnOnTertiary,
                  fontSize: 11,
                  marginTop: 2,
                }}
              >
                {activeOutputDevice
                  ? `${activeOutputDevice.id} • ${activeOutputDevice.sampleRate / 1000} kHz maks • ${pathLabel}`
                  : "Tidak ada perangkat spesifik yang dipilih - Android menentukan sendiri."}
              </Text>

              {/* Codec Bluetooth: A2DP selalu lossy, dan tanpa ini user hanya
                  melihat "tidak bit-perfect" tanpa tahu penyebabnya. */}
              {activeOutputDevice?.type === "bluetooth" && (
                <Text
                  style={{
                    color: colors.text.secondary,
                    fontSize: 11,
                    marginTop: spacing.xs,
                    lineHeight: 15,
                  }}
                >
                  {bluetoothCodec.connected
                    ? `A2DP aktif${bluetoothCodec.deviceName ? ` ke ${bluetoothCodec.deviceName}` : ""}. Lossy — sampel di-encode ulang, bit-perfect tidak mungkin. Codec tidak bisa dibaca Android.`
                    : "Tidak ada perangkat A2DP terhubung (atau izin Bluetooth belum diberikan)."}
                </Text>
              )}

              {/* Pilihan tidak dihormati: DAC dipilih tapi stream tetap keluar
                  di perangkat lain. Dulu ini tidak terlihat sama sekali. */}
              {outputStatus && outputStatus.requested > 0 && !outputStatus.honored && (
                <Text
                  style={{
                    color: warnOnSecondary,
                    fontSize: 11,
                    marginTop: spacing.xs,
                    lineHeight: 15,
                  }}
                >
                  Perangkat {outputStatus.requested} diminta tapi stream memakai{" "}
                  {outputStatus.actual}. Android mengabaikan permintaannya -
                  audio keluar dari perangkat lain.
                </Text>
              )}

              {/* Laju stream berbeda dari laju file: sampel dikonversi. */}
              {outputStatus && outputStatus.actual > 0 && !outputStatus.rateHonored && (
                <Text
                  style={{
                    color: colors.text.secondary,
                    fontSize: 11,
                    marginTop: spacing.xs,
                    lineHeight: 15,
                  }}
                >
                  Laju stream belum sama dengan laju file - sampel masih
                  dikonversi.
                </Text>
              )}
            </View>

            {/* Scan Button */}
            <TouchableOpacity
              onPress={async () => {
                await refreshOutput();
              }}
              disabled={outputLoading}
              style={[
                styles.pill,
                {
                  backgroundColor: colors.primary[500],
                  marginBottom: spacing.md,
                },
              ]}
            >
              <Text style={{ color: onAccent, fontSize: 12 }}>
                {outputLoading ? "Scanning..." : "Pindai Perangkat Output"}
              </Text>
            </TouchableOpacity>

            {/* Daftar SEMUA perangkat output */}
            {outputDevices.length > 0 && (
              <View style={{ marginBottom: spacing.md }}>
                <Text
                  style={{
                    color: colors.text.secondary,
                    fontSize: 12,
                    marginBottom: spacing.xs,
                  }}
                >
                  Perangkat Tersedia ({outputDevices.length}):
                </Text>
                {outputDevices.map((device) => {
                  const isActive = activeOutputDevice?.id === device.id;
                  return (
                    <TouchableOpacity
                      key={device.id}
                      onPress={() => selectOutputDevice(device.id)}
                      style={[
                        styles.dacItem,
                        isActive && {
                          backgroundColor: colors.primary[500] + "25",
                        },
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            color: colors.text.primary,
                            fontFamily: FONT_FAMILY.semiBold,
                          }}
                        >
                          {device.name}
                        </Text>
                        <Text
                          style={{ color: colors.text.secondary, fontSize: 11 }}
                        >
                          {device.id} • {device.sampleRate / 1000} kHz •{" "}
                          {device.type}
                          {device.exclusive ? " • jalur langsung" : ""}
                        </Text>
                      </View>
                      {isActive && (
                        <CheckCircle
                          size={22}
                          color={accentOnSecondary}
                          strokeWidth={2.5}
                        />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {outputDevices.length === 0 && !outputLoading && (
              <Text
                style={{
                  color: colors.text.secondary,
                  fontSize: 12,
                  marginBottom: spacing.md,
                }}
              >
                Belum ada perangkat terbaca. Tekan pindai.
              </Text>
            )}

            {/* Mode bit-perfect - hanya masuk akal kalau jalurnya sanggup. */}
            <SettingRow colors={colors} spacing={spacing}>
              <View style={{ flex: 1, marginRight: spacing.sm }}>
                <Text style={{ color: colors.text.primary }}>
                  Bit-Perfect Mode
                </Text>
                <Text
                  style={{
                    color: colors.text.secondary,
                    fontSize: 11,
                    marginTop: 2,
                    lineHeight: 15,
                  }}
                >
                  {/* F1 (2026-11-16): teks dari status stream live. Toggle
                      TIDAK PERNAH disabled dari tipe device — klasifikasi
                      statis lama ("speaker selalu lewat mixer") terbalik
                      dengan kenyataan; biarkan user mencoba, stream yang
                      memutuskan, dan statusnya dilaporkan di sini. */}
                  {bpStatus.isBitPerfect
                    ? "Exclusive ke perangkat, tanpa DSP."
                    : bpStatus.rateMismatch
                      ? "Exclusive, tapi laju stream berbeda dari file — ada resampling."
                      : bpStatus.exclusiveFailed
                        ? "Device menolak exclusive — audio lewat mixer Android."
                        : "Meminta jalur langsung ke perangkat. Kalau device menolak, audio tetap jalan lewat mixer Android."}
                </Text>
              </View>
              <Switch
                value={audioMode === "bit-perfect"}
                onValueChange={(value) => {
                  // Zustand store yang meneruskan ke engine.
                  setAudioMode(value ? "bit-perfect" : "dsp");
                }}
                trackColor={{
                  false: colors.background.tertiary,
                  true: colors.primary[500],
                }}
                thumbColor={
                  audioMode === "bit-perfect"
                    ? colors.text.primary
                    : colors.text.secondary
                }
              />
            </SettingRow>
          </View>
        )}
      </SectionCard>
    );
  };


  // ─── renderAudio ──────────────────────────────────────────────────────────────

  const renderAudio = () => (
    <SectionCard style={sectionCardStyle}>
      <SectionHeader
        icon={<Music size={24} color={accentOnSecondary} strokeWidth={2.2} />}
        title="Audio"
        colors={colors}
        spacing={spacing}
        collapsible
        expanded={showAudioSettings}
        onPress={() => setShowAudioSettings((v) => !v)}
      />

      {showAudioSettings && (
        <View style={{ paddingBottom: spacing.sm }}>
          {/* ── 1. Mode pemrosesan (3 mode) ──────────────────────────────── */}
          <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.sm }}>
            <Text
              style={{
                color: colors.text.secondary,
                fontSize: 12,
                marginBottom: spacing.xs,
              }}
            >
              Mode Audio
            </Text>

            {AUDIO_MODES.map((m) => {
              const isActive = audioMode === m.id;
              // bit-perfect yang gagal exclusive: tetap berbunyi, tapi
              // kehilangan klaimnya. Ditandai berbeda, TIDAK dimatikan.
              // Verdict live hanya bila tidak basi (saat pause polling
              // berhenti — U-P1-04).
              const isFallback =
                m.id === "bit-perfect" &&
                !bpStatus.stale &&
                bpStatus.exclusiveFailed;

              return (
                <TouchableOpacity
                  key={m.id}
                  onPress={() => handleSelectMode(m.id)}
                  style={[
                    styles.dacItem,
                    isActive && {
                      backgroundColor: colors.primary[500] + "25",
                      borderColor: colors.primary[500],
                    },
                  ]}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <m.Icon
                      size={16}
                      color={isFallback ? colors.status.error : m.color}
                      strokeWidth={2.2}
                    />
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{ color: colors.text.primary, fontFamily: FONT_FAMILY.semiBold }}
                      >
                        {isFallback ? `${m.label} (Fallback)` : m.label}
                      </Text>
                      <Text
                        style={{
                          color: colors.text.secondary,
                          fontSize: 11,
                          marginTop: 2,
                          lineHeight: 15,
                        }}
                      >
                        {isFallback
                          ? "Device menolak exclusive. Tetap berbunyi, tapi lewat mixer sistem — tidak bit-perfect."
                          : m.hint}
                      </Text>
                    </View>
                    {isActive && (
                      <CheckCircle
                        size={20}
                        color={accentOnSecondary}
                        strokeWidth={2.5}
                      />
                    )}
                  </View>

                  {/* Status jalur untuk bit-perfect: dilaporkan, bukan diblokir. */}
                  {m.id === "bit-perfect" && isActive && !isFallback && (
                    <Text
                      style={{
                        color: colors.text.secondary,
                        fontSize: 10,
                        marginTop: 6,
                        marginLeft: 24,
                        lineHeight: 14,
                      }}
                    >
                      {bpStatus.streamExclusive
                        ? `Output tanpa DSP${bpStatus.actualSampleRate > 0 ? ` @ ${bpStatus.actualSampleRate / 1000}kHz` : ""}.`
                        : "Output tanpa DSP. Cocok untuk DAC eksternal."}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>


          {/* ── 1b. Diagnostik: pemrosesan DSP di jalur produksi ────────────────── */}
          {!dspGate.unavailable && (
            <SettingRow colors={colors} spacing={spacing}>
              <View style={{ flex: 1, marginRight: spacing.md }}>
                <Text style={{ color: colors.text.primary, fontFamily: FONT_FAMILY.semiBold }}>
                  Proses DSP di Jalur Audio
                </Text>
                <Text
                  style={{
                    color: colors.text.secondary,
                    fontSize: 11,
                    marginTop: 2,
                    lineHeight: 15,
                  }}
                >
                  {dspGate.enabled
                    ? "Aktif — mode DSP & Solfeggio benar-benar memproses PCM."
                    : "Mati — PCM lewat tanpa diproses. Pakai ini untuk membandingkan suara tanpa build ulang."}
                </Text>
                <Text
                  style={{
                    color: colors.text.secondary,
                    fontSize: 10,
                    marginTop: 4,
                  }}
                >
                  Kontrol diagnostik, bukan preferensi. Tidak disimpan.
                </Text>
              </View>
              <Switch
                value={dspGate.enabled}
                onValueChange={dspGate.setEnabled}
                trackColor={{
                  false: colors.background.tertiary,
                  true: colors.primary[500],
                }}
                thumbColor={
                  dspGate.enabled ? colors.text.primary : colors.text.secondary
                }
              />
            </SettingRow>
          )}


          {/* ── 2. Preset EQ Aktif ─────────────────────────────────────── */}
          <SettingRow colors={colors} spacing={spacing}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text.primary, fontFamily: FONT_FAMILY.semiBold }}>
                Preset EQ Aktif
              </Text>
              <Text
                style={{
                  color: colors.text.secondary,
                  fontSize: 11,
                  marginTop: 2,
                }}
              >
                {/* U-P2-38: label DULU "Default EQ — Preset yang diterapkan
                    saat app dibuka", padahal picker ini memanggil
                    equalizerStore.applyPreset: preset diterapkan LANGSUNG
                    saat dipilih ke native, bukan disimpan untuk dibuka
                    nanti. Label sekarang jujur soal perilakunya. */}
                Preset diterapkan langsung saat dipilih — sama seperti chip
                preset di layar Equalizer.
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setShowEQPicker(true)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                paddingVertical: 4,
                paddingHorizontal: 8,
                borderRadius: 8,
                backgroundColor: colors.background.tertiary,
              }}
            >
              <Text
                style={{
                  color: accentOnTertiary,
                  fontFamily: FONT_FAMILY.bold,
                  fontSize: 13,
                }}
              >
                {allPresets.find((p) => p.id === activePresetId)?.name ??
                  "Flat"}
              </Text>
              <ChevronRight
                size={14}
                color={accentOnTertiary}
                strokeWidth={2.5}
              />
            </TouchableOpacity>
          </SettingRow>

          {/* ── 3. Playback Speed ────────────────────────────────────────── */}
          <SettingRow colors={colors} spacing={spacing}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text.primary, fontFamily: FONT_FAMILY.semiBold }}>
                Playback Speed
              </Text>
              <Text
                style={{
                  color: colors.text.secondary,
                  fontSize: 11,
                  marginTop: 2,
                }}
              >
                Kecepatan putar audio (0.5× – 2.0×).
              </Text>
            </View>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 2 }}
            >
              <TouchableOpacity
                onPress={() => handleSpeedChange(-0.25)}
                disabled={(playbackSpeed ?? 1.0) <= 0.5}
                accessibilityRole="button"
                accessibilityLabel="Kurangi kecepatan putar"
                style={{
                  // U-P2-01: 32×32 lama, di bawah 44dp.
                  width: 44,
                  height: 44,
                  borderRadius: 8,
                  backgroundColor: colors.background.tertiary,
                  justifyContent: "center",
                  alignItems: "center",
                  opacity: (playbackSpeed ?? 1.0) <= 0.5 ? 0.3 : 1,
                }}
              >
                <Text
                  style={{
                    color: colors.text.primary,
                    fontSize: 18,
                    lineHeight: 20,
                  }}
                >
                  −
                </Text>
              </TouchableOpacity>

              <View
                style={{
                  minWidth: 52,
                  alignItems: "center",
                  paddingHorizontal: 4,
                }}
              >
                <Text
                  style={{
                    color: accentOnSecondary,
                    fontFamily: FONT_FAMILY.bold,
                    fontSize: 15,
                  }}
                >
                  {(playbackSpeed ?? 1.0).toFixed(2)}×
                </Text>
              </View>

              <TouchableOpacity
                onPress={() => handleSpeedChange(0.25)}
                disabled={(playbackSpeed ?? 1.0) >= 2.0}
                accessibilityRole="button"
                accessibilityLabel="Tambah kecepatan putar"
                style={{
                  // U-P2-01: 32×32 lama, di bawah 44dp.
                  width: 44,
                  height: 44,
                  borderRadius: 8,
                  backgroundColor: colors.background.tertiary,
                  justifyContent: "center",
                  alignItems: "center",
                  opacity: (playbackSpeed ?? 1.0) >= 2.0 ? 0.3 : 1,
                }}
              >
                <Text
                  style={{
                    color: colors.text.primary,
                    fontSize: 18,
                    lineHeight: 20,
                  }}
                >
                  +
                </Text>
              </TouchableOpacity>
            </View>
          </SettingRow>
        </View>
      )}

      {/* ── 3b. Tuning (Retune) — FASE R ─────────────────────────────────── */}
      <SettingRow colors={colors} spacing={spacing}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text.primary, fontFamily: FONT_FAMILY.semiBold }}>
            Tuning (Nada Dasar)
          </Text>
          <Text
            style={{
              color: colors.text.secondary,
              fontSize: 11,
              marginTop: 2,
            }}
          >
            Tinggi nada lagu tanpa mengubah tempo (A=440 standar, A=432
            Verdi). Tidak berlaku di mode Bit-Perfect.
          </Text>
        </View>
        {/* Kontrolnya di TuningControl — dipakai juga subscreen Solfeggio. */}
        <TuningControl style={{ alignItems: "flex-end" }} />
      </SettingRow>

      {/* ── EQ Picker Modal ──────────────────────────────────────────────── */}
      <Modal
        visible={showEQPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEQPicker(false)}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "flex-end",
            backgroundColor: "rgba(0,0,0,0.6)",
          }}
        >
          <View
            style={{
              backgroundColor: colors.background.secondary,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              paddingBottom: 32,
              maxHeight: "60%",
            }}
          >
            {/* Handle bar */}
            <View
              style={{
                width: 40,
                height: 4,
                borderRadius: 2,
                backgroundColor: colors.text.disabled,
                alignSelf: "center",
                marginTop: 12,
                marginBottom: 16,
              }}
            />

            <Text
              style={{
                color: colors.text.primary,
                fontSize: 16,
                fontFamily: FONT_FAMILY.bold,
                paddingHorizontal: 20,
                marginBottom: 8,
              }}
            >
              Pilih Preset EQ
            </Text>

            <FlatList
              data={allPresets}
              keyExtractor={(p) => p.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    // N9: guard DSP — di mode bit-perfect/immersive jangan
                    // ubah bands di store (dan jangan tutup picker diam-diam:
                    // beri tahu kenapa preset tidak diterapkan).
                    if (isDSPDisabled) {
                      showToast(
                        "Preset EQ tidak aktif di mode Bit-Perfect/Solfeggio — DSP sedang dimatikan.",
                        "info",
                      );
                      return;
                    }
                    applyPresetGuarded(item.id);
                    setShowEQPicker(false);
                  }}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    paddingVertical: 14,
                    paddingHorizontal: 20,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.background.tertiary,
                    backgroundColor:
                      activePresetId === item.id
                        ? colors.primary[500] + "18"
                        : "transparent",
                  }}
                >
                  <View>
                    <Text
                      style={{
                        // FASE 3 Settings: nama preset aktif memakai
                        // text.primary, bukan accentOnSecondary —
                        // aksen di atas tint primary 18% gagal AA
                        // (4,15 Ember / 4,47 Hearth, diukur). Keadaan
                        // aktif tetap ditandai tint + ikon centang.
                        color: colors.text.primary,
                        fontFamily: activePresetId === item.id ? FONT_FAMILY.bold : FONT_FAMILY.medium,
                        fontSize: 14,
                      }}
                    >
                      {item.name}
                    </Text>
                    {item.description && (
                      <Text
                        style={{
                          color: colors.text.secondary,
                          fontSize: 11,
                          marginTop: 2,
                        }}
                      >
                        {item.description}
                      </Text>
                    )}
                  </View>
                  {activePresetId === item.id && (
                    <CheckCircle
                      size={18}
                      color={accentOnSecondary}
                      strokeWidth={2.5}
                    />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </SectionCard>
  );

  const renderLibrary = () => (
    <SectionCard style={sectionCardStyle}>
      <SectionHeader
        icon={
          <Database size={24} color={accentOnSecondary} strokeWidth={2.2} />
        }
        title="Library & Metadata"
        colors={colors}
        spacing={spacing}
        collapsible
        expanded={showLibrarySettings}
        onPress={() => setShowLibrarySettings(!showLibrarySettings)}
      />

      {showLibrarySettings && (
        <View style={{ paddingBottom: spacing.sm }}>
          {/* Settings berbahasa user (2026-11-18): toggle "Pindai
              Awal" DIHAPUS — initial scan jalan secara default saat
              instalasi baru, tanpa setting. Tiga opsi di seksi ini:
              Auto Enriching (default ON — start otomatis worker),
              Auto Discovery (default OFF — deteksi perubahan),
              aksi Rescan (full scan manual). Struktur baris
              mengikuti Fase 3 Settings persis (judul token semiBold,
              deskripsi 11px secondary, 0 fontWeight). */}
          <SettingRow colors={colors} spacing={spacing} bordered={false}>
            <View style={{ flex: 1, marginRight: spacing.md }}>
              <Text style={{ color: colors.text.primary, fontFamily: FONT_FAMILY.semiBold }}>
                Auto Enriching
              </Text>
              <Text
                style={{
                  color: colors.text.secondary,
                  fontSize: 11,
                  marginTop: 2,
                }}
              >
                Otomatis melengkapi metadata lagu di background —
                judul, sampul, dan deteksi Hi-Res palsu. Berjalan
                pelan supaya tidak membebani aplikasi.
              </Text>
            </View>
            <Switch
              value={isAutoEnrichingEnabled}
              onValueChange={handleToggleAutoEnriching}
              trackColor={{
                false: colors.background.tertiary,
                true: colors.primary[500],
              }}
              thumbColor={
                isAutoEnrichingEnabled ? colors.text.primary : colors.text.secondary
              }
            />
          </SettingRow>

          <SettingRow colors={colors} spacing={spacing} bordered={false}>
            <View style={{ flex: 1, marginRight: spacing.md }}>
              <Text style={{ color: colors.text.primary, fontFamily: FONT_FAMILY.semiBold }}>
                Auto Discovery
              </Text>
              <Text
                style={{
                  color: colors.text.secondary,
                  fontSize: 11,
                  marginTop: 2,
                }}
              >
                Otomatis menemukan lagu baru, lagu yang sudah dihapus,
                dan lagu yang berubah — saat aplikasi dibuka atau di
                background.
              </Text>
            </View>
            <Switch
              value={isAutoScanEnabled}
              onValueChange={handleToggleAutoScan}
              trackColor={{
                false: colors.background.tertiary,
                true: colors.primary[500],
              }}
              thumbColor={
                isAutoScanEnabled ? colors.text.primary : colors.text.secondary
              }
            />
          </SettingRow>

          <SettingRow colors={colors} spacing={spacing} bordered={false}>
            <View style={{ flex: 1, marginRight: spacing.md }}>
              <Text style={{ color: colors.text.primary, fontFamily: FONT_FAMILY.semiBold }}>
                Rescan Library
              </Text>
              <Text
                style={{
                  color: colors.text.secondary,
                  fontSize: 11,
                  marginTop: 2,
                }}
              >
                Memindai ulang seluruh library — bisa terasa berat
                sesaat.
              </Text>
            </View>
            {isManualScanning || isAutoScanning || isRescanning ? (
              <ActivityIndicator size="small" color={accentOnSecondary} />
            ) : (
              <PristineButton
                label="Pindai"
                onPress={handleRescan}
                variant="secondary"
                surface={colors.background.secondary}
              />
            )}
          </SettingRow>

          {/* I2-revisi: toggle "Online Artist Metadata" + "Hanya lewat
              Wi-Fi" DIHAPUS — pengaturan izin internet tidak ada lagi.
              Online (MusicBrainz + foto artis) hanya di [id].tsx, dipicu
              tap user; tidak ada lagi yang membaca setting ini. Tombol
              "Kosongkan Cache Gambar Artis" di bawah DIPERTAHANKAN. */}

          <TouchableOpacity
            style={{ padding: spacing.md, alignItems: "center" }}
            onPress={handleClearCache}
            disabled={isClearing}
          >
            {isClearing ? (
              <ActivityIndicator size="small" color={accentOnSecondary} />
            ) : (
              <Text
                style={{
                  color: errorOnSecondary,
                  fontSize: 13,
                  fontFamily: FONT_FAMILY.bold,
                }}
              >
                Kosongkan Cache Gambar Artis
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </SectionCard>
  );

  const renderAbout = () => (
    <SectionCard style={sectionCardStyle}>
      <SectionHeader
        icon={<Info size={24} color={accentOnSecondary} strokeWidth={2.2} />}
        title="Tentang"
        colors={colors}
        spacing={spacing}
        collapsible
        expanded={showAbout}
        onPress={() => setShowAbout((v) => !v)}
      />

      {showAbout && (
        <View style={{ padding: spacing.md }}>
          <View style={{ alignItems: "center", marginBottom: spacing.md }}>
            <Text style={[styles.appName, { color: accentOnSecondary }]}>
              PristineAudio
            </Text>
            <Text style={{ color: colors.text.secondary, fontSize: 12 }}>
              Version {APP_VERSION}
            </Text>
          </View>

          {/* U-P2-37: isi "Tentang" DULU diduplikasi di sini (nama + versi +
              tagline) sementara layar About punya versi lengkapnya sendiri
              (fitur, kontak, banner). Satu sumber sekarang: layar About.
              Di sini tinggal versi + tautan ke sana. */}
          <TouchableOpacity
            onPress={() => router.push("/(drawer)/about")}
            accessibilityRole="button"
            accessibilityLabel="Buka halaman Tentang untuk fitur dan kontak"
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              backgroundColor: colors.background.tertiary,
              borderRadius: 12,
              padding: spacing.md,
            }}
          >
            <Text style={{ color: colors.text.primary }}>
              Fitur, kontak & info aplikasi
            </Text>
            <ChevronRight size={18} color={colors.text.secondary} />
          </TouchableOpacity>
        </View>
      )}
    </SectionCard>
  );

  // ─── Main Render ─────────────────────────────────────────────────────────────

  return (
  <SafeAreaView style={{ flex: 1, backgroundColor: colors.background.primary }}>
    <ScrollView
      style={styles.container}
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingBottom: 48,
      }}
      showsVerticalScrollIndicator={false}
    >
      {/* U-P2-53: header bersama, varian large (judul 32 seperti semula).
          ScrollView sudah punya paddingHorizontal 16, jadi header ini
          tanpa padding horizontal sendiri. */}
      <ScreenHeader
        title="Settings"
        variant="large"
        style={{ paddingHorizontal: 0, marginBottom: spacing.md }}
      />

      {renderTampilan()}
      {renderAudioOutput()}
      {renderAudio()}
      {renderLibrary()}
      {renderAbout()}

      <TouchableOpacity
        onPress={handleResetAll}
        style={[
          styles.resetButton,
          {
            backgroundColor: colors.status.error + "20",
            borderColor: colors.status.error,
            marginTop: spacing.sm,
          },
        ]}
      >
        <RefreshCw
          size={20}
          color={errorOnResetBg}
          strokeWidth={2.5}
          style={{ marginRight: 8 }}
        />
        <Text style={{ color: errorOnResetBg }}>Reset All Settings</Text>
      </TouchableOpacity>

      <ThemePicker
        visible={showThemePicker}
        onClose={() => setShowThemePicker(false)}
      />

      {/* FASE 3 Settings: konfirmasi destruktif/berdampak lewat
          ConfirmDialog — redaksi pesan sama persis dengan dialog
          sistem sebelumnya; umpan balik sukses/gagal lewat toast. */}
      <ConfirmDialog
        visible={showClearCacheConfirm}
        title="Bersihkan Cache"
        message="Foto artis yang sudah diunduh akan dihapus. Lanjutkan?"
        confirmLabel="Bersihkan"
        onConfirm={() => void doClearCache()}
        onCancel={() => setShowClearCacheConfirm(false)}
      />
      <ConfirmDialog
        visible={showResetConfirm}
        title="Reset Settings"
        message="Yakin ingin mereset semua pengaturan ke default?"
        confirmLabel="Reset"
        onConfirm={() => void doResetAll()}
        onCancel={() => setShowResetConfirm(false)}
      />
      <ConfirmDialog
        visible={showBitPerfectConfirm}
        title="Aktifkan Bit-Perfect?"
        message="Mode ini menonaktifkan semua DSP (EQ, Bass, Reverb) — hanya fade anti-klik yang tetap jalan. Pemutaran tetap berjalan walau device tidak mendukung jalur langsung; saat itu audio lewat mixer Android."
        confirmLabel="Aktifkan"
        destructive={false}
        onConfirm={() => {
          setShowBitPerfectConfirm(false);
          setAudioMode("bit-perfect");
        }}
        onCancel={() => setShowBitPerfectConfirm(false)}
      />
    </ScrollView>
  </SafeAreaView>
);
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
  },
  sectionTitle: { fontSize: 18, fontFamily: FONT_FAMILY.bold },
  settingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  row: { flexDirection: "row", alignItems: "center" },
  themeColorDot: { width: 20, height: 20, borderRadius: 4 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  pill: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  resetButton: {
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "center",
  },
  appName: {
    fontSize: 28,
    fontFamily: FONT_FAMILY.displayBold,
    marginBottom: 4,
  },
  // Tambahkan di StyleSheet:
  alertBox: {
    padding: 12,
    borderRadius: 8,
    marginVertical: 8,
  },
  dacItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
  },
});


