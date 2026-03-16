import React, { useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';

interface Props {
  visible: boolean;
  onSave: (name: string) => void;
  onClose: () => void;
}

export const SavePresetModal: React.FC<Props> = ({ visible, onSave, onClose }) => {
  const [name, setName] = useState('');

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.content}>
          <Text style={styles.title}>Simpan Preset Custom</Text>
          <TextInput
            style={styles.input}
            placeholder="Nama Preset (misal: My Bass 2.0)"
            placeholderTextColor="#666"
            value={name}
            onChangeText={setName}
            autoFocus
          />
          <View style={styles.actions}>
            <TouchableOpacity onPress={onClose} style={styles.btn}>
              <Text style={styles.btnText}>Batal</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              onPress={() => { onSave(name); setName(''); }}
              style={[styles.btn, styles.saveBtn]}
            >
              <Text style={styles.saveBtnText}>Simpan</Text>
            </TouchableOpacity>
          </View>
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
