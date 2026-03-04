import { View, StyleSheet } from 'react-native';
import { NowPlaying } from '@components/audio/NowPlaying';

export default function PlayerScreen() {
  return (
    <View style={styles.container}>
      <NowPlaying />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A1628',
  },
});
