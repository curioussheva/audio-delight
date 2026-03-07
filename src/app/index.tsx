# Buat file index.tsx sekarang
cat > src/app/index.tsx << 'EOF'
import { Redirect } from 'expo-router';

export default function Index() {
  return <Redirect href="/(tabs)/library" />;
}
EOF