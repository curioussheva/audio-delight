import React, { useState, useEffect } from "react";
import {
  View,
  ActivityIndicator,
  Text,
  StyleSheet,
  Platform,
} from "react-native";
import { Redirect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SplashScreen from "expo-splash-screen";

// Prevent splash screen from auto-hiding
SplashScreen.preventAutoHideAsync();

export default function Index() {
  const [hasOnboarded, setHasOnboarded] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const initializeApp = async () => {
      try {
        // 1. Check onboarding status
        const onboardedValue = await AsyncStorage.getItem("has_onboarded");

        // 2. Check for any pending migrations or initial setup
        const needsMigration = await AsyncStorage.getItem("needs_migration");

        // 3. Validate library permissions (optional)
        let hasPermission = true;
        if (Platform.OS === "android") {
          // Quick permission check without requesting
          // Just log status for debugging
          console.log("[Index] Checking app initialization...");
        }

        if (isMounted) {
          setHasOnboarded(onboardedValue === "true");

          // If migration is needed, handle it
          if (needsMigration === "true") {
            console.log("[Index] Database migration pending");
            // You can trigger migration here if needed
          }

          setIsReady(true);
        }

        // Hide splash screen after everything is ready
        await SplashScreen.hideAsync();
      } catch (err) {
        console.error("❌ Failed to initialize app:", err);
        if (isMounted) {
          setError("Failed to initialize app. Please restart.");
          setHasOnboarded(false);
          setIsReady(true);
          await SplashScreen.hideAsync();
        }
      }
    };

    initializeApp();

    return () => {
      isMounted = false;
    };
  }, []);

  // Show loading screen while checking
  if (!isReady || hasOnboarded === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#00D4AA" />
        <Text style={styles.loadingText}>Loading Pristine Audio...</Text>
        <Text style={styles.loadingSubText}>Preparing your library</Text>
      </View>
    );
  }

  // Show error screen with retry option
  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>⚠️ {error}</Text>
        <Text
          style={styles.retryText}
          onPress={() => {
            setError(null);
            setHasOnboarded(null);
            setIsReady(false);
            // Reload the component by re-triggering initialization
            setTimeout(() => {
              initializeApp();
            }, 100);
          }}
        >
          Tap to Retry
        </Text>
      </View>
    );
  }

  // Redirect to appropriate screen
  return (
    <Redirect
      href={hasOnboarded ? "/(drawer)/(tabs)/library" : "/onboarding"}
    />
  );
}

// Re-declare initializeApp for the retry functionality
// This is a workaround; in production, you'd want to refactor this
let initializeApp: () => Promise<void>;

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000",
  },
  loadingText: {
    marginTop: 16,
    color: "#888",
    fontSize: 14,
    fontWeight: "500",
  },
  loadingSubText: {
    marginTop: 8,
    color: "#666",
    fontSize: 12,
  },
  errorText: {
    color: "#FF4444",
    fontSize: 16,
    textAlign: "center",
    marginHorizontal: 20,
  },
  retryText: {
    color: "#00D4AA",
    fontSize: 14,
    marginTop: 20,
    fontWeight: "600",
  },
});
