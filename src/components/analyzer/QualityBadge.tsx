// src/components/analyzer/QualityBadge.tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';

interface QualityBadgeProps {
  badge: '✅ LOSSLESS' | '⚠️ SUSPICIOUS' | '❌ FAKE' | '🎵 COMPRESSED';
  score: number;
  size?: 'small' | 'medium' | 'large';
}

export const QualityBadge: React.FC<QualityBadgeProps> = ({ 
  badge, 
  score, 
  size = 'medium' 
}) => {
  const { theme } = useTheme();
  const { colors, spacing } = theme;

  const getBadgeColor = () => {
    switch (badge) {
      case '✅ LOSSLESS': return colors.status.success;
      case '⚠️ SUSPICIOUS': return colors.status.warning;
      case '❌ FAKE': return colors.status.error;
      case '🎵 COMPRESSED': return colors.primary[500];
      default: return colors.text.secondary;
    }
  };

  const getIcon = () => {
    switch (badge) {
      case '✅ LOSSLESS': return 'checkmark-circle';
      case '⚠️ SUSPICIOUS': return 'alert-circle';
      case '❌ FAKE': return 'close-circle';
      case '🎵 COMPRESSED': return 'musical-notes';
      default: return 'information-circle';
    }
  };

  const paddingSize = {
    small: spacing.xs,
    medium: spacing.sm,
    large: spacing.md,
  }[size];

  const fontSize = {
    small: 10,
    medium: 12,
    large: 14,
  }[size];

  return (
    <View style={[
      styles.container,
      {
        backgroundColor: getBadgeColor() + '20',
        paddingHorizontal: paddingSize,
        paddingVertical: paddingSize / 2,
        borderRadius: 16,
      }
    ]}>
      <Ionicons 
        name={getIcon()} 
        size={fontSize + 2} 
        color={getBadgeColor()} 
      />
      <Text style={[
        styles.text,
        {
          color: getBadgeColor(),
          fontSize,
          marginLeft: spacing.xs,
        }
      ]}>
        {badge} • {score}%
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  text: {
    fontWeight: '600',
  },
});