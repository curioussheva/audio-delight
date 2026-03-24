import React from "react";
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

  const options = [
    { label: "Off", value: null },
    { label: "15 Minutes", value: 15 },
    { label: "30 Minutes", value: 30 },
    { label: "45 Minutes", value: 45 },
    { label: "60 Minutes", value: 60 },
  ];

  const handleSelect = (val: number | null) => {
    setSleepTimer(val);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <Pressable style={styles.overlay} onPress={onClose}>
        <BlurView intensity={40} tint="dark" style={styles.content}>
          <View style={styles.handle} />
          <Text style={styles.title}>Sleep Timer</Text>

          {options.map((opt) => (
            <TouchableOpacity
              key={opt.label}
              style={styles.option}
              onPress={() => handleSelect(opt.value)}
            >
              <Text
                style={[
                  styles.optionText,
                  sleepTimerEnd ? styles.activeText : null,
                ]}
              >
                {opt.label}
              </Text>
              {opt.value !== null && (
                <Ionicons
                  name="time-outline"
                  size={20}
                  color="rgba(255,255,255,0.3)"
                />
              )}
            </TouchableOpacity>
          ))}
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
