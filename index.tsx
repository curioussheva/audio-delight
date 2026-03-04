import { registerRootComponent } from 'expo';
import { ExpoRoot } from 'expo-router';

// Use any to bypass TypeScript error for require.context
export function App() {
  const ctx = (require as any).context('./src/app');
  return <ExpoRoot context={ctx} />;
}

registerRootComponent(App);