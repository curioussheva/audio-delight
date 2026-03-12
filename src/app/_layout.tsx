import { Drawer } from 'expo-router/drawer';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';

// Komponen untuk drawer yang menggunakan safe area
function DrawerContent() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets(); // ← AMBIL INSETS
  
  return (
    <Drawer
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.background.primary },
        headerTintColor: theme.colors.text.primary,
        drawerStyle: { 
          backgroundColor: theme.colors.background.secondary,
          paddingTop: insets.top, // ← TERAPKAN SAFE AREA
          paddingBottom: insets.bottom,
        },
        drawerActiveTintColor: theme.colors.primary[500],
        drawerInactiveTintColor: theme.colors.text.secondary,
        drawerLabelStyle: { fontSize: 16, marginLeft: -16 },
      }}
    >
      <Drawer.Screen
        name="(tabs)"
        options={{
          drawerLabel: 'Home',
          title: 'PristineAudio',
          drawerIcon: ({ color }) => <Ionicons name="home" size={24} color={color} />,
        }}
      />
      <Drawer.Screen
        name="playlists"
        options={{
          drawerLabel: 'Playlists',
          title: 'Playlists',
          drawerIcon: ({ color }) => <Ionicons name="list" size={24} color={color} />,
        }}
      />
      <Drawer.Screen
        name="search"
        options={{
          drawerLabel: 'Search',
          title: 'Search',
          drawerIcon: ({ color }) => <Ionicons name="search" size={24} color={color} />,
        }}
      />
      <Drawer.Screen
        name="settings"
        options={{
          drawerLabel: 'Settings',
          title: 'Settings',
          drawerIcon: ({ color }) => <Ionicons name="settings" size={24} color={color} />,
        }}
      />
      <Drawer.Screen
        name="about"
        options={{
          drawerLabel: 'About',
          title: 'About',
          drawerIcon: ({ color }) => <Ionicons name="information-circle" size={24} color={color} />,
        }}
      />
    </Drawer>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <SafeAreaProvider> {/* ← SUDAH BAIK */}
          <StatusBar style="light" />
          <DrawerContent />
        </SafeAreaProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}