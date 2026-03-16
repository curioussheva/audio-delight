import React from 'react';
import { ScrollView, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

interface FileFilterBarProps {
  selectedType: string;
  onSelectType: (type: string) => void;
}

const FILE_TYPES = [
  { label: 'All', value: '' },
  { label: 'FLAC', value: 'flac' },
  { label: 'DSD', value: 'dsf' },
  { label: 'WAV', value: 'wav' },
  { label: 'M4A', value: 'm4a' },
  { label: 'M3U', value: 'm3u' },
];

export const FileFilterBar: React.FC<FileFilterBarProps> = ({ 
  selectedType, 
  onSelectType 
}) => {
  const { theme } = useTheme();
  const { colors, spacing } = theme;

  // Helper untuk mendapatkan warna string dari objek palet atau string langsung
  const getActiveColor = () => {
    return typeof colors.primary === 'string' ? colors.primary : colors.primary[500];
  };

  return (
    <ScrollView 
      horizontal 
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {FILE_TYPES.map((type) => {
        const isActive = selectedType === type.value;
        const activeColor = getActiveColor();

        return (
          <TouchableOpacity
            key={type.label}
            onPress={() => onSelectType(type.value)}
            style={[
              styles.chip,
              { 
                backgroundColor: isActive ? activeColor : colors.background.elevated,
                borderColor: isActive ? activeColor : colors.border.medium,
                marginRight: spacing.sm,
              }
            ]}
          >
            <Text style={[
              styles.chipText, // Gunakan style teks yang benar
              { color: isActive ? '#FFF' : colors.text.secondary }
            ]}>
              {type.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
