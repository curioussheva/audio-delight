import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

interface PresetChipProps {
  label: string;
  isActive: boolean;
  onPress: () => void;
  disabled?: boolean;
}

export const PresetChip: React.FC<PresetChipProps> = ({ label, isActive, onPress, disabled }) => {
  const { theme } = useTheme();

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.chip,
        { backgroundColor: theme.colors.background.secondary },
        // PERBAIKAN: Gunakan spread operator (...) untuk menggabungkan objek style
        isActive && { 
          backgroundColor: theme.colors.primary[500],
          // Tambahkan efek glow untuk kesan premium
          shadowColor: theme.colors.primary[500],
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
          elevation: 5 
        }
      ]}
    >
      <Text style={[
        styles.text,
        { color: theme.colors.text.secondary },
        isActive && { color: '#000', fontWeight: 'bold' }
      ]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 10,
    height: 36,
    justifyContent: 'center',
    // Penting untuk shadow di iOS
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  text: { fontSize: 13, letterSpacing: 0.5 }
});
