import { Drawer } from "expo-router/drawer";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/context/ThemeContext";
import CustomDrawer from "@/shared/components/navigation/CustomDrawer";

export default function DrawerLayout() {
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <Drawer
      drawerContent={(props) => <CustomDrawer {...props} />}
      screenOptions={{
        headerShown: false,
        drawerStyle: {
          backgroundColor: colors.background.primary,
          width: 280,
        },
        drawerActiveTintColor: colors.primary[500],
        drawerInactiveTintColor: colors.text.secondary,
      }}
    >
      {/* Tabs: Library, Equalizer, Visualizer */}
      <Drawer.Screen
        name="(tabs)"
        options={{
          title: "Library",
          drawerIcon: ({ color }) => (
            <Ionicons name="musical-notes" size={22} color={color} />
          ),
        }}
      />
      
      {/* Drawer-only: FLAC Analyzer */}
      <Drawer.Screen
        name="analyzer"
        options={{
          title: "FLAC Analyzer",
          drawerIcon: ({ color }) => (
            <Ionicons name="analytics" size={22} color={color} />
          ),
        }}
      />
      
      <Drawer.Screen
        name="settings"
        options={{
          title: "Settings",
          drawerIcon: ({ color }) => (
            <Ionicons name="settings-outline" size={22} color={color} />
          ),
        }}
      />
      
      <Drawer.Screen
        name="about"
        options={{
          title: "About",
          drawerIcon: ({ color }) => (
            <Ionicons name="information-circle-outline" size={22} color={color} />
          ),
        }}
      />
    </Drawer>
  );
}
 