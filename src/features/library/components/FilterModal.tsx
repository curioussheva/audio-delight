// components/library/FilterModal.tsx
import React from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { SORT_GROUPS, FILTER_GROUPS } from "@/constants/libraryOptions";

interface FilterModalProps {
  visible: boolean;
  onClose: () => void;
  sortBy: string;
  filterBy: string;
  onSortChange: (id: string) => void;
  onFilterChange: (id: string) => void;
  colors: any;
}

export const FilterModal: React.FC<FilterModalProps> = ({
  visible,
  onClose,
  sortBy,
  filterBy,
  onSortChange,
  onFilterChange,
  colors,
}) => {
  const handleSortChange = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSortChange(id);
  };

  const handleFilterChange = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onFilterChange(id);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View
          style={[
            styles.content,
            { backgroundColor: colors.background.secondary },
          ]}
        >
          <View style={styles.handle} />

          <Text style={[styles.title, { color: colors.text.primary }]}>
            Sort & Filter
          </Text>

          <ScrollView
            style={styles.scrollView}
            showsVerticalScrollIndicator={false}
          >
            <Section title="SORT BY">
              {SORT_GROUPS.map((opt) => (
                <OptionRow
                  key={opt.id}
                  label={opt.label}
                  selected={sortBy === opt.id}
                  onPress={() => handleSortChange(opt.id)}
                  colors={colors}
                />
              ))}
            </Section>

            <Section title="FILTER BY">
              {FILTER_GROUPS.map((opt) => (
                <OptionRow
                  key={opt.id}
                  label={opt.label}
                  selected={filterBy === opt.id}
                  onPress={() => handleFilterChange(opt.id)}
                  colors={colors}
                />
              ))}
            </Section>
          </ScrollView>

          <TouchableOpacity
            style={[styles.applyBtn, { backgroundColor: colors.primary[500] }]}
            onPress={onClose}
            activeOpacity={0.8}
          >
            <Text style={styles.applyBtnText}>SELESAI</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    <View style={styles.optionsContainer}>{children}</View>
  </View>
);

const OptionRow: React.FC<{
  label: string;
  selected: boolean;
  onPress: () => void;
  colors: any;
}> = ({ label, selected, onPress, colors }) => (
  <TouchableOpacity
    style={styles.optionRow}
    onPress={onPress}
    activeOpacity={0.7}
  >
    <Text
      style={[
        styles.optionText,
        {
          color: selected ? colors.primary[500] : colors.text.primary,
          fontWeight: selected ? "600" : "400",
        },
      ]}
    >
      {label}
    </Text>
    {selected && (
      <Ionicons name="checkmark" size={22} color={colors.primary[500]} />
    )}
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  content: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 34,
    maxHeight: "80%",
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: "#444",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 20,
    textAlign: "center",
  },
  scrollView: {
    maxHeight: 400,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#888",
    marginBottom: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  optionsContainer: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 12,
    overflow: "hidden",
  },
  optionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  optionText: {
    fontSize: 16,
  },
  applyBtn: {
    height: 52,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 20,
  },
  applyBtnText: {
    fontWeight: "800",
    fontSize: 16,
    color: "#000",
    letterSpacing: 0.5,
  },
});
