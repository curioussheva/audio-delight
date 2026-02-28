/**
 * SavePresetModal — Week 4
 * Dialog untuk simpan EQ setting saat ini sebagai custom preset
 */
import React, { useState } from 'react';
import {
  Modal, View, Text, TextInput, StyleSheet,
  TouchableOpacity, KeyboardAvoidingView, Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Colors } from '../../constants/colors';
import { useEQStore } from '../../store/useEQStore';
import { createCustomPreset, saveCustomPreset } from '../../services/PresetStorage';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSaved: (presetName: string) => void;
}

export function SavePresetModal({ visible, onClose, onSaved }: Props) {
  const { bands } = useEQStore();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const preset = createCustomPreset(name.trim(), bands.map(b => b.gain));
    await saveCustomPreset(preset);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSaving(false);
    setName('');
    onSaved(name.trim());
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} />
        <View style={styles.dialog}>
          <Text style={styles.title}>Simpan Preset</Text>
          <Text style={styles.subtitle}>EQ setting saat ini akan disimpan</Text>

          <TextInput
            style={styles.input}
            placeholder="Nama preset (contoh: Bass Boost Saya)"
            placeholderTextColor={Colors.textMuted}
            value={name}
            onChangeText={setName}
            autoFocus
            maxLength={32}
            returnKeyType="done"
            onSubmitEditing={handleSave}
          />

          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.btnCancel} onPress={onClose}>
              <Text style={styles.btnCancelText}>Batal</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btnSave, !name.trim() && styles.btnSaveDisabled]}
              onPress={handleSave}
              disabled={!name.trim() || saving}
            >
              <Text style={styles.btnSaveText}>{saving ? 'Menyimpan...' : 'Simpan'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex:1, justifyContent:'center', alignItems:'center' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor:'rgba(0,0,0,0.7)' },
  dialog: {
    width: '85%', backgroundColor:'#111520',
    borderRadius:20, padding:24, gap:12,
    borderWidth:1, borderColor:Colors.border,
  },
  title: { fontSize:18, fontWeight:'800', color:Colors.text },
  subtitle: { fontSize:12, color:Colors.textMuted },
  input: {
    borderWidth:1, borderColor:Colors.borderStrong,
    borderRadius:12, padding:14,
    color:Colors.text, fontSize:14,
    backgroundColor:Colors.surface,
  },
  btnRow: { flexDirection:'row', gap:10, marginTop:4 },
  btnCancel: { flex:1, padding:14, borderRadius:12, borderWidth:1, borderColor:Colors.border, alignItems:'center' },
  btnCancelText: { color:Colors.textMuted, fontWeight:'600' },
  btnSave: { flex:1, padding:14, borderRadius:12, backgroundColor:Colors.accent, alignItems:'center' },
  btnSaveDisabled: { opacity:0.4 },
  btnSaveText: { color:'#fff', fontWeight:'800' },
});
