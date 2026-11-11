import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
} from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { useTheme } from "@/shared/context/ThemeContext";
import { accentOn } from "@/shared/utils/contrast";

export const SleepTimerModal = ({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) => {
  const { setSleepTimer, sleepTimerEnd } = usePlayerStore();
  const { theme } = useTheme();
  const { colors, isDark } = theme;
  const [now, setNow] = useState(() => Date.now());

  // U-P2-13: sheet dulu selalu gelap (rgba(10,22,40,0.9) + teks #FFF +
  // aksen #00D4AA) di semua tema — pengguna tema terang mendapat sheet
  // gelap yang tidak mengikuti tema. Sekarang semua warna dari token
  // tema: latar elevated, teks text.primary, aksen lewat accentOn di atas
  // elevated (diukur rumus contrast.ts: Noir perak 8,30, Porcelain
  // bronze 6,29 — lolos AA 4,5).
  const accentColor = accentOn(
    [colors.accent.primary],
    colors.background.elevated,
    [colors.text.primary],
  );

  // Tick tiap detik selama modal terbuka dan timer berjalan, supaya sisa
  // waktu yang ditampilkan tidak basi.
  useEffect(() => {
    if (!visible || sleepTimerEnd === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [visible, sleepTimerEnd]);

  const options = [
    { label: "Off", value: null },
    { label: "15 Minutes", value: 15 },
    { label: "30 Minutes", value: 30 },
    { label: "45 Minutes", value: 45 },
    { label: "60 Minutes", value: 60 },
  ];

  const remainingMs =
    sleepTimerEnd !== null ? Math.max(0, sleepTimerEnd - now) : null;
  // Menit tersisa dibulatkan ke atas: timer 15 menit yang baru dipilih
  // (sisa 14,9 menit) tetap cocok dengan opsi 15, bukan tanpa opsi.
  const remainingMin =
    remainingMs !== null ? Math.ceil(remainingMs / 60000) : null;

  const isActive = (value: number | null) =>
    value === null
      ? sleepTimerEnd === null
      : remainingMin !== null &&
        remainingMin > value - 15 &&
        remainingMin <= value;

  const formatRemaining = (ms: number) => {
    const totalSeconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const handleSelect = (val: number | null) => {
    setSleepTimer(val);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <BlurView
          intensity={40}
          tint={isDark ? "dark" : "light"}
          style={[
            styles.content,
            {
              backgroundColor: colors.background.elevated,
              borderColor: colors.border.light,
            },
          ]}
        >
          <View
            style={[styles.handle, { backgroundColor: colors.border.light }]}
          />
          <Text style={[styles.title, { color: colors.text.primary }]}>
            Sleep Timer
          </Text>
          {remainingMs !== null && (
            <Text style={[styles.remaining, { color: accentColor }]}>
              {remainingMs > 0
                ? `Time remaining: ${formatRemaining(remainingMs)}`
                : "Timer finished"}
            </Text>
          )}

          {options.map((opt) => {
            const active = isActive(opt.value);
            return (
              <TouchableOpacity
                key={opt.label}
                style={[
                  styles.option,
                  { borderBottomColor: colors.border.light },
                ]}
                onPress={() => handleSelect(opt.value)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text
                  style={[
                    styles.optionText,
                    { color: colors.text.primary },
                    active ? { color: accentColor } : null,
                  ]}
                >
                  {opt.label}
                </Text>
                {active ? (
                  <Ionicons name="checkmark" size={20} color={accentColor} />
                ) : (
                  opt.value !== null && (
                    <Ionicons
                      name="time-outline"
                      size={20}
                      color={colors.text.tertiary}
                    />
                  )
                )}
              </TouchableOpacity>
            );
          })}
        </BlurView>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end" },
  content: {
    padding: 25,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderWidth: 1,
  },
  handle: {
    width: 40,
    height: 4,
    alignSelf: "center",
    borderRadius: 2,
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 20,
    textAlign: "center",
  },
  remaining: {
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 12,
  },
  option: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 18,
    borderBottomWidth: 0.5,
  },
  optionText: { fontSize: 16, fontWeight: "500" },
});
