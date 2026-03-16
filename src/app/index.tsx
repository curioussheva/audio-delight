import { Redirect } from 'expo-router';
import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function Index() {
  const [hasOnboarded, setHasOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem('has_onboarded').then((val) => {
      setHasOnboarded(val === 'true');
    });
  }, []);

  if (hasOnboarded === null) return null; // Loading state

  // Jika sudah onboarding, masuk ke Drawer (yang di dalamnya ada Tabs)
  // Jika belum, masuk ke screen onboarding
return hasOnboarded ? <Redirect href={"/(drawer)/(tabs)/library" as any} /> : <Redirect href={"/onboarding" as any} />;
}


