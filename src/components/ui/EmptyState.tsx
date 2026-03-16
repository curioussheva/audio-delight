// src/components/ui/EmptyState.tsx
import { View, Text } from 'react-native';
export const EmptyState = () => (
  <View style={{flex:1, justifyContent:'center', alignItems:'center'}}>
    <Text style={{color: '#888'}}>Tidak ada lagu terpilih</Text>
  </View>
);
