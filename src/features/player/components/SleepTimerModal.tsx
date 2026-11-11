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

export const SleepTimerModal = ({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) => {
  const { setSleepTimer, sleepTimerEnd } = usePlayerStore();
  const [now, setNow] = useState(() => Date.now());

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
        <BlurView intensity={40} tint="dark" style={styles.content}>
          <View style={styles.handle} />
          <Text style={styles.title}>Sleep Timer</Text>
          {remainingMs !== null && (
            <Text style={styles.remaining}>
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
                style={styles.option}
                onPress={() => handleSelect(opt.value)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text
                  style={[
                    styles.optionText,
                    active ? styles.activeText : null,
                  ]}
                >
                  {opt.label}
                </Text>
                {active ? (
                  <Ionicons name="checkmark" size={20} color="#00D4AA" />
                ) : (
                  opt.value !== null && (
                    <Ionicons
                      name="time-outline"
                      size={20}
                      color="rgba(255,255,255,0.3)"
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
    backgroundColor: "rgba(10, 22, 40, 0.9)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignSelf: "center",
    borderRadius: 2,
    marginBottom: 20,
  },
  title: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 20,
    textAlign: "center",
  },
  remaining: {
    color: "#00D4AA",
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
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  optionText: { color: "#FFF", fontSize: 16, fontWeight: "500" },
  activeText: { color: "#00D4AA" },
});
