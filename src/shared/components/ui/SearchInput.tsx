// src/shared/components/ui/SearchInput.tsx
//
// Bar pencarian (Fase 2 redesign) — ikon search + input + tombol hapus.
// Dipakai pertama kali di Fase 3 (Search); dibangun di Fase 2 sebagai
// komponen inti. Radius kecil (sm) seperti bar pencarian yang sudah
// ada; tombol hapus muncul hanya bila ada teks.
import React, { useCallback } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
} from "react-native";
import { Search, X } from "lucide-react-native";

import { useThemedStyles } from "@/shared/hooks/useThemedStyles";
import { useTheme } from "@/shared/context/ThemeContext";
import { buildSearchInputStyles } from "@/shared/utils/uiStyles";
import type { Theme } from "@/shared/constants/themes/types";

export interface SearchInputProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  onSubmitEditing?: () => void;
  accessibilityLabel?: string;
}

export function SearchInput({
  value,
  onChangeText,
  placeholder = "Cari lagu, artis, album...",
  autoFocus = false,
  onSubmitEditing,
  accessibilityLabel = "Cari",
}: SearchInputProps) {
  const { theme } = useTheme();
  const styles = useThemedStyles(
    useCallback((t: Theme) => buildSearchInputStyles(t), []),
  );

  return (
    <View style={styles.container}>
      <Search size={20} color={theme.colors.text.secondary} />
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.text.tertiary}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmitEditing}
        autoFocus={autoFocus}
        accessibilityLabel={accessibilityLabel}
      />
      {value ? (
        <TouchableOpacity
          onPress={() => onChangeText("")}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Hapus pencarian"
        >
          <X size={20} color={theme.colors.text.secondary} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
