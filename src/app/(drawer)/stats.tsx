// src/app/(drawer)/stats.tsx
//
// Statistik Mendengarkan / "Wrapped" lokal (item 10 deep-insight §6).
//
// Semua angka dihitung LOKAL dari SQLite perangkat ini — tidak ada data
// yang keluar kecuali lewat tombol Bagikan (Share sheet, teks).
//
// ── Yang TIDAK ada di layar ini (dicatat jujur, bukan disembunyikan) ──
// - Kartu gambar (image) untuk dibagikan: TIDAK ADA. Tidak ada pustaka
//   tangkap-layar di dependensi (react-native-view-shot tidak terpasang)
//   dan tugas melarang tambah dependensi berat — jadi Bagikan mengirim
//   teks ringkasan lewat Share sheet bawaan React Native, bukan gambar.
//   Bila suatu saat view-shot ditambahkan, kartu gambar bisa dirender
//   dari tampilan yang sama.
// - Jam didengarkan HISTORIS: tidak ada (recent_plays.play_duration
//   selalu 0 sejak dulu). Jam baru terhitung sejak versi ini
//   (daily_listening) — lihat catatan kaki di bawah layar.

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import {
  CalendarDays,
  Clock,
  Flame,
  Music2,
  Play,
  Share2,
  TrendingUp,
} from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/shared/context/ThemeContext";
import { DrawerMenuButton } from "@/shared/components/ui/DrawerMenuButton";
import { EmptyState } from "@/shared/components/ui/EmptyState";
import { PristineButton } from "@/shared/components/ui/PristineButton";
import { useToastStore } from "@/shared/store/toastStore";
import { FONT_FAMILY } from "@/shared/constants/themes/base";
import { accentOn } from "@/shared/utils/contrast";
import { getStats } from "@/features/stats/api/statsService";
import {
  buildShareText,
  formatListeningDuration,
  STATS_RANGE_DEFS,
  STATS_RANGES,
  type ListeningStats,
  type StatsRange,
} from "@/features/stats/utils/listeningStats";

export default function StatsScreen() {
  const { theme } = useTheme();
  const { colors, spacing } = theme;
  const insets = useSafeAreaInsets();
  const showToast = useToastStore((s) => s.showToast);

  const [range, setRange] = useState<StatsRange>("30d");
  const [stats, setStats] = useState<ListeningStats | null>(null);
  const [loading, setLoading] = useState(true);

  const accentOnPrimary = accentOn(
    [colors.primary[500]],
    colors.background.primary,
    [colors.text.primary, colors.text.secondary],
  );

  const load = useCallback(() => {
    setLoading(true);
    try {
      setStats(getStats(range));
    } catch (e) {
      console.warn("[Stats] gagal memuat statistik:", e);
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(load, [load]);
  // Angka berubah saat lagu diputar di layar lain — baca ulang tiap
  // kali layar ini dibuka (drawer tidak me-remount layar yang sudah
  // pernah dibuka).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const handleShare = useCallback(async () => {
    if (!stats || stats.totalPlays === 0) {
      showToast("Belum ada data untuk dibagikan.", "info");
      return;
    }
    try {
      await Share.share({
        message: buildShareText(stats, STATS_RANGE_DEFS[range].label),
      });
    } catch (e) {
      console.warn("[Stats] berbagi gagal:", e);
      showToast("Gagal membuka berbagi.", "error");
    }
  }, [stats, range, showToast]);

  const summaryCards = stats
    ? [
        {
          icon: <Clock size={20} color={accentOnPrimary} strokeWidth={2.2} />,
          value: formatListeningDuration(stats.totalSeconds),
          label: "Jam Didengarkan",
        },
        {
          icon: <Play size={20} color={accentOnPrimary} strokeWidth={2.2} />,
          value: `${stats.totalPlays}x`,
          label: "Total Pemutaran",
        },
        {
          icon: <Music2 size={20} color={accentOnPrimary} strokeWidth={2.2} />,
          value: String(stats.distinctTracks),
          label: "Lagu Berbeda",
        },
        {
          icon: (
            <CalendarDays size={20} color={accentOnPrimary} strokeWidth={2.2} />
          ),
          value: String(stats.distinctDays),
          label: "Hari Aktif",
        },
      ]
    : [];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background.primary }]}
      contentContainerStyle={{
        paddingTop: insets.top + 8,
        paddingBottom: 100,
        paddingHorizontal: 20,
      }}
    >
      <View style={styles.menuRow}>
        <DrawerMenuButton />
      </View>

      {/* Judul */}
      <View style={{ marginTop: spacing.xxl }}>
        <Text
          style={[
            styles.title,
            { color: colors.text.primary, fontFamily: FONT_FAMILY.bold },
          ]}
        >
          Statistik Mendengarkan
        </Text>
        <Text
          style={[
            styles.subtitle,
            { color: colors.text.tertiary, marginTop: spacing.xs },
          ]}
        >
          Dihitung lokal di perangkat ini — tidak ada data yang dikirim ke mana
          pun.
        </Text>
      </View>

      {/* Rentang */}
      <View style={[styles.rangeRow, { marginTop: spacing.lg }]}>
        {STATS_RANGES.map((r) => {
          const active = r === range;
          return (
            <TouchableOpacity
              key={r}
              onPress={() => setRange(r)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Rentang ${STATS_RANGE_DEFS[r].label}`}
              style={[
                styles.rangeChip,
                {
                  backgroundColor: active
                    ? colors.primary[500]
                    : colors.background.secondary,
                  borderColor: colors.border.medium,
                },
              ]}
            >
              <Text
                style={[
                  styles.rangeChipText,
                  {
                    color: active
                      ? colors.background.primary
                      : colors.text.primary,
                    fontFamily: FONT_FAMILY.semiBold,
                  },
                ]}
              >
                {STATS_RANGE_DEFS[r].label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading || !stats ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary[500]} />
        </View>
      ) : stats.totalPlays === 0 ? (
        <EmptyState
          title="Belum ada statistik"
          message="Putar lagu dulu — artis teratas, jam mendengarkan, dan streak muncul setelah ada lagu yang diputar."
          icon={<TrendingUp size={48} color={colors.text.tertiary} />}
          style={{ marginTop: spacing.xxl }}
        />
      ) : (
        <>
          {/* Streak */}
          <View
            style={[
              styles.streakBanner,
              {
                backgroundColor: colors.background.secondary,
                borderColor: colors.border.medium,
                marginTop: spacing.lg,
              },
            ]}
          >
            <Flame size={28} color={accentOnPrimary} strokeWidth={2.2} />
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Text
                style={[
                  styles.streakValue,
                  {
                    color: colors.text.primary,
                    fontFamily: FONT_FAMILY.bold,
                  },
                ]}
              >
                Streak {stats.streakDays} hari
              </Text>
              <Text
                style={[styles.streakLabel, { color: colors.text.tertiary }]}
              >
                Hari berturut-turut dengan setidaknya satu lagu diputar.
              </Text>
            </View>
          </View>

          {/* Ringkasan 2x2 */}
          <View style={[styles.grid, { marginTop: spacing.md }]}>
            {summaryCards.map((c) => (
              <View
                key={c.label}
                style={[
                  styles.card,
                  {
                    backgroundColor: colors.background.secondary,
                    borderColor: colors.border.medium,
                  },
                ]}
              >
                {c.icon}
                <Text
                  style={[
                    styles.cardValue,
                    {
                      color: colors.text.primary,
                      fontFamily: FONT_FAMILY.bold,
                      marginTop: spacing.sm,
                    },
                  ]}
                >
                  {c.value}
                </Text>
                <Text
                  style={[styles.cardLabel, { color: colors.text.tertiary }]}
                >
                  {c.label}
                </Text>
              </View>
            ))}
          </View>

          {/* Artis teratas */}
          {stats.topArtists.length > 0 && (
            <View style={{ marginTop: spacing.xl }}>
              <Text
                style={[
                  styles.sectionTitle,
                  {
                    color: colors.text.secondary,
                    fontFamily: FONT_FAMILY.semiBold,
                  },
                ]}
              >
                ARTIS TERATAS
              </Text>
              {stats.topArtists.map((a, i) => (
                <View
                  key={a.name}
                  style={[
                    styles.rankRow,
                    { borderBottomColor: colors.border.medium },
                  ]}
                >
                  <Text
                    style={[
                      styles.rankNum,
                      {
                        color: accentOnPrimary,
                        fontFamily: FONT_FAMILY.bold,
                      },
                    ]}
                  >
                    {i + 1}
                  </Text>
                  <Text
                    style={[
                      styles.rankName,
                      {
                        color: colors.text.primary,
                        fontFamily: FONT_FAMILY.semiBold,
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {a.name}
                  </Text>
                  <Text
                    style={[styles.rankCount, { color: colors.text.tertiary }]}
                  >
                    {a.plays}x
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Lagu teratas */}
          {stats.topTracks.length > 0 && (
            <View style={{ marginTop: spacing.xl }}>
              <Text
                style={[
                  styles.sectionTitle,
                  {
                    color: colors.text.secondary,
                    fontFamily: FONT_FAMILY.semiBold,
                  },
                ]}
              >
                LAGU TERATAS
              </Text>
              {stats.topTracks.map((t, i) => (
                <View
                  key={t.id}
                  style={[
                    styles.rankRow,
                    { borderBottomColor: colors.border.medium },
                  ]}
                >
                  <Text
                    style={[
                      styles.rankNum,
                      {
                        color: accentOnPrimary,
                        fontFamily: FONT_FAMILY.bold,
                      },
                    ]}
                  >
                    {i + 1}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.rankName,
                        {
                          color: colors.text.primary,
                          fontFamily: FONT_FAMILY.semiBold,
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {t.title}
                    </Text>
                    {t.artist ? (
                      <Text
                        style={[
                          styles.rankSub,
                          { color: colors.text.tertiary },
                        ]}
                        numberOfLines={1}
                      >
                        {t.artist}
                      </Text>
                    ) : null}
                  </View>
                  <Text
                    style={[styles.rankCount, { color: colors.text.tertiary }]}
                  >
                    {t.plays}x
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Bagikan */}
          <View style={{ marginTop: spacing.xl }}>
            <PristineButton
              label="Bagikan Statistik"
              onPress={() => void handleShare()}
              variant="primary"
              fullWidth
              icon={<Share2 size={16} color={colors.accent.onPrimary} />}
            />
          </View>

          {/* Catatan kaki — jujur soal batas data. */}
          <Text
            style={[
              styles.footnote,
              { color: colors.text.tertiary, marginTop: spacing.lg },
            ]}
          >
            Jam didengarkan mulai dihitung sejak versi ini — putaran sebelum
            pembaruan ini tidak punya data durasi, jadi hanya jumlah putaran,
            artis, dan lagu teratas yang tampil untuk rentang lama.
          </Text>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  menuRow: { flexDirection: "row", alignItems: "center" },
  title: { fontSize: 24, letterSpacing: 0.3 },
  subtitle: { fontSize: 13, lineHeight: 18 },
  rangeRow: { flexDirection: "row", gap: 8 },
  rangeChip: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  rangeChipText: { fontSize: 13 },
  loading: { marginTop: 64, alignItems: "center" },
  streakBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  streakValue: { fontSize: 18 },
  streakLabel: { fontSize: 12, lineHeight: 16, marginTop: 2 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  card: {
    flexGrow: 1,
    flexBasis: "45%",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  cardValue: { fontSize: 20 },
  cardLabel: { fontSize: 12, marginTop: 2 },
  sectionTitle: { fontSize: 12, letterSpacing: 1.2, marginBottom: 4 },
  rankRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 12,
  },
  rankNum: { fontSize: 16, width: 20, textAlign: "center" },
  rankName: { flex: 1, fontSize: 15 },
  rankSub: { fontSize: 12, marginTop: 1 },
  rankCount: { fontSize: 13 },
  footnote: { fontSize: 12, lineHeight: 17 },
});
