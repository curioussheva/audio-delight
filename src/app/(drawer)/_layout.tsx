import { Drawer } from "expo-router/drawer";
import { Music, Activity, Settings, Info } from "lucide-react-native";
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

        // ← Tambahkan ini untuk membantu safe area di dalam Drawer + Tabs
        sceneContainerStyle: {
          backgroundColor: colors.background.primary,
        },
      }}
    >
      <Drawer.Screen
        name="(tabs)"
        options={{
          title: "Library",
          drawerIcon: ({ color }) => <Music size={22} color={color} />,
        }}
      />

      <Drawer.Screen
        name="analyzer"
        options={{
          title: "FLAC Analyzer",
          drawerIcon: ({ color }) => <Activity size={22} color={color} />,
        }}
      />

      <Drawer.Screen
        name="settings"
        options={{
          title: "Settings",
          drawerIcon: ({ color }) => <Settings size={22} color={color} />,
        }}
      />

      <Drawer.Screen
        name="about"
        options={{
          title: "About",
          drawerIcon: ({ color }) => <Info size={22} color={color} />,
        }}
      />
    </Drawer>
  );
}
