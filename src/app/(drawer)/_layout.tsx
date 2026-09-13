import { Drawer } from "expo-router/drawer";
import { GestureHandlerRootView } from "react-native-gesture-handler";

export default function DrawerLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Drawer
        screenOptions={{
          headerShown: false,
          drawerStyle: {
            backgroundColor: "#0A0A0A",
            width: 280,
          },
          drawerActiveTintColor: "#00D4AA",
          drawerInactiveTintColor: "#888",
        }}
      >
        <Drawer.Screen
          name="(tabs)"
          options={{ drawerLabel: "Library", title: "Library" }}
        />
        <Drawer.Screen
          name="playlist"
          options={{ drawerLabel: "Playlist", title: "Playlist" }}
        />
        <Drawer.Screen
          name="about"
          options={{ drawerLabel: "About", title: "About" }}
        />
        <Drawer.Screen
          name="settings"
          options={{ drawerLabel: "Settings", title: "Settings" }}
        />
        <Drawer.Screen
          name="song/[id]"
          options={{ drawerItemStyle: { display: "none" } }}
        />
      </Drawer>
    </GestureHandlerRootView>
  );
} 