// components/library/EmptyLibrary.tsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface EmptyLibraryProps {
  colors: any;
  onScan: () => void;
}

export const EmptyLibrary: React.FC<EmptyLibraryProps> = ({ colors, onScan }) => (
  <View style={styles.container}>
    <Ionicons
      name="musical-notes-outline"
      size={80}
      color={colors.text.tertiary}
    />
    <Text style={[styles.title, { color: colors.text.secondary }]}>
      Library Anda masih kosong
    </Text>
    <Text style={[styles.subtitle, { color: colors.text.tertiary }]}>
      Pindai folder musik untuk menemukan lagu-lagu Anda
    </Text>
    <TouchableOpacity
      style={[styles.scanBtn, { 
        borderColor: colors.primary[500],
        backgroundColor: `${colors.primary[500]}10`
      }]}
      onPress={onScan}
      activeOpacity={0.8}
    >
      <Text style={{ color: colors.primary[500], fontWeight: "700" }}>
        SCAN PERANGKAT
      </Text>
    </TouchableOpacity>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingTop: 100,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 20,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
  scanBtn: {
    borderWidth: 1.5,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 24,
  },
}); 