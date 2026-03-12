import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/context/ThemeContext';
import { EqualizerBand } from '@/types/equalizer';
import { saveCustomPreset } from '@/services/PresetStorage';

interface SavePresetModalProps {
  visible: boolean;
  onClose: () => void;
  onSaved: (name: string) => void;
  currentBands: EqualizerBand[];
}

export const SavePresetModal: React.FC<SavePresetModalProps> = ({
  visible,
  onClose,
  onSaved,
  currentBands,
}) => {
  const { theme } = useTheme();
  const { colors, spacing } = theme;
  const [presetName, setPresetName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!presetName.trim()) {
      Alert.alert('Error', 'Nama preset tidak boleh kosong');
      return;
    }

    setIsSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const newPreset = {
        id: `custom_${Date.now()}`,
        name: presetName.trim(),
        description: 'Custom preset',
        bands: currentBands.map((band, index) => ({
          ...band,
          id: index,
        })),
      };

      await saveCustomPreset(newPreset);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSaved(presetName);
      setPresetName('');
      onClose();
    } catch (error) {
      Alert.alert('Error', 'Gagal menyimpan preset');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
        <View style={[styles.modal, { 
          backgroundColor: colors.background.primary,
          borderRadius: 16,
          padding: spacing.lg,
          width: '80%',
        }]}>
          <Text style={[styles.title, { 
            color: colors.text.primary,
            fontSize: 18,
            fontWeight: '700',
            marginBottom: spacing.md,
          }]}>
            Simpan Preset
          </Text>

          <TextInput
            style={[styles.input, { 
              backgroundColor: colors.background.secondary,
              color: colors.text.primary,
              padding: spacing.md,
              borderRadius: 8,
              marginBottom: spacing.lg,
            }]}
            placeholder="Nama preset"
            placeholderTextColor={colors.text.tertiary}
            value={presetName}
            onChangeText={setPresetName}
            autoFocus
          />

          <View style={[styles.buttons, { 
            flexDirection: 'row',
            gap: spacing.md,
          }]}>
            <TouchableOpacity
              style={[styles.button, { 
                flex: 1,
                backgroundColor: colors.background.secondary,
                padding: spacing.md,
                borderRadius: 8,
                alignItems: 'center',
              }]}
              onPress={onClose}
              disabled={isSaving}
            >
              <Text style={{ color: colors.text.secondary }}>Batal</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, { 
                flex: 1,
                backgroundColor: colors.primary[500],
                padding: spacing.md,
                borderRadius: 8,
                alignItems: 'center',
              }]}
              onPress={handleSave}
              disabled={isSaving}
            >
              <Text style={{ color: colors.background.primary }}>
                {isSaving ? 'Menyimpan...' : 'Simpan'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    // style di-inline
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  input: {
    // style di-inline
  },
  buttons: {
    flexDirection: 'row',
  },
  button: {
    flex: 1,
    alignItems: 'center',
  },
});