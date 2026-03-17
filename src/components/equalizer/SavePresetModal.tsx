import React, { useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';


interface Props {
  visible: boolean;
  onSave: (name: string) => void;
  onClose: () => void;
}

export const SavePresetModal: React.FC<Props> = ({ visible, onSave, onClose }) => {
  const { theme } = useTheme(); // Gunakan theme di sini
  const [name, setName] = useState('');

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.7)' }]}>
        <View style={[styles.content, { backgroundColor: theme.colors.background.secondary }]}>
          <Text style={[styles.title, { color: theme.colors.text.primary }]}>Simpan Preset</Text>
          <TextInput
            style={[styles.input, { 
              backgroundColor: theme.colors.background.tertiary,
              color: theme.colors.text.primary,
              borderColor: theme.colors.background.tertiary,
              borderWidth: 1
            }]}
            placeholder="Nama Preset..."
            placeholderTextColor={theme.colors.text.tertiary}
            value={name}
            onChangeText={setName}
          />
          {/* ... sisanya gunakan warna dari theme.colors.primary ... */}
        </View>
      </View>
    </Modal>
  );
};


const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 30 },
  content: { backgroundColor: '#162539', borderRadius: 16, padding: 20 },
  title: { color: '#FFF', fontSize: 18, fontWeight: 'bold', marginBottom: 15 },
  input: { backgroundColor: '#0A1628', color: '#FFF', padding: 12, borderRadius: 8, marginBottom: 20 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end' },
  btn: { padding: 10, marginLeft: 10 },
  btnText: { color: '#C8D4E0' },
  saveBtn: { backgroundColor: '#00D4AA', borderRadius: 8, paddingHorizontal: 20 },
  saveBtnText: { color: '#0A1628', fontWeight: 'bold' }
});


