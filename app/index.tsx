import { Redirect } from 'expo-router';
import { useAppStore } from '../src/store/useAppStore';

export default function Index() {
  const { onboardingComplete } = useAppStore();
  return (
    <Redirect href={onboardingComplete ? '/(tabs)/player' : '/onboarding/welcome'} />
  );
}
