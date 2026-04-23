import React, { useState, useEffect, useCallback } from "react";
import { View, ActivityIndicator, Text, StyleSheet } from "react-native";
import { Redirect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SplashScreen from "expo-splash-screen";
import { useTheme } from "@/shared/context/ThemeContext"; // Import theme

SplashScreen.preventAutoHideAsync();

export default function Index() {
  const { theme } = useTheme(); // Gunakan theme dari layout parent
  const { colors } = theme;
  const [hasOnboarded, setHasOnboarded] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
 
  const initializeApp = useCallback(async () => {
    try {
      console.log("[BOOT] 1. Index mount started");
      
      // Ambil data secara paralel untuk mempercepat booting
      const [onboardedValue, needsMigration] = await Promise.all([
        AsyncStorage.getItem("has_onboarded"),
        AsyncStorage.getItem("needs_migration")
      ]);

      console.log("[BOOT] 2. Status:", { onboardedValue, needsMigration });

      if (needsMigration === "true") {
        // Jalankan logika migrasi jika diperlukan
      }

      setHasOnboarded(onboardedValue === "true");
      setIsReady(true);
      await SplashScreen.hideAsync();
    } catch (err) {
      console.error("❌ Failed to initialize app:", err);
      setError("Failed to initialize app. Please restart.");
      setIsReady(true);
      await SplashScreen.hideAsync();
    }
  }, []);

  useEffect(() => {
    initializeApp();
  }, [initializeApp]);

  if (!isReady || hasOnboarded === null) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background.primary }]}>
        <ActivityIndicator size="large" color={theme.colors.primary[500]} />
        <Text style={[styles.loadingText, { color: theme.colors.text.secondary }]}>
          Loading Pristine Audio...
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background.primary }]}>
        <Text style={styles.errorText}>⚠️ {error}</Text>
        <Text style={[styles.retryText, { color: theme.colors.primary[500] }]} onPress={initializeApp}>
          Tap to Retry
        </Text>
      </View>
    );
  }

  return <Redirect href={hasOnboarded ? "/(drawer)/(tabs)/library" : "/onboarding"} />;
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 16, fontSize: 14, fontWeight: "500" },
  errorText: { color: "#FF4444", fontSize: 16, textAlign: "center", marginHorizontal: 20 },
  retryText: { fontSize: 14, marginTop: 20, fontWeight: "600" },
});
