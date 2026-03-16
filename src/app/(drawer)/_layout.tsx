import { Drawer } from 'expo-router/drawer';
import CustomDrawer from '@/components/navigation/CustomDrawer';
import { useTheme } from '@/context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';

export default function DrawerLayout() {
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <Drawer
      drawerContent={(props) => <CustomDrawer {...props} />}
      screenOptions={{
        headerShown: false,
        drawerType: 'slide', // Efek geser premium
        drawerStyle: {
          width: 280,
          backgroundColor: colors.background.primary,
        },
        drawerActiveBackgroundColor: 'rgba(0, 212, 170, 0.1)',
        drawerActiveTintColor: colors.primary[500],
        drawerInactiveTintColor: colors.text.secondary,
        drawerLabelStyle: {
          marginLeft: -15,
          fontSize: 15,
          fontWeight: '600',
        },
      }}
    >
      <Drawer.Screen
        name="(tabs)"
        options={{
          drawerLabel: 'Music Library',
          drawerIcon: ({ color }) => <Ionicons name="musical-notes" size={22} color={color} />,
        }}
      />
      <Drawer.Screen
        name="settings"
        options={{
          drawerLabel: 'Audio Settings',
          drawerIcon: ({ color }) => <Ionicons name="settings" size={22} color={color} />,
        }}
      />
    </Drawer>
  );
}
