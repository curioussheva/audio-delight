import { useEffect } from 'react';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function Index() {
  useEffect(() => {
    AsyncStorage.getItem('onboarding-done').then(done => {
      if (done) {
        router.replace('/(tabs)/player');
      } else {
        router.replace('/onboarding/welcome');
      }
    });
  }, []);
  return null;
}
