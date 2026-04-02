import React, { useState, useEffect } from "react";
import { View, ActivityIndicator, Text, StyleSheet } from "react-native";
import { Redirect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function Index() {
  const [hasOnboarded, setHasOnboarded] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const checkOnboarding = async () => {
      try {
        const value = await AsyncStorage.getItem("has_onboarded");
        if (isMounted) setHasOnboarded(value === "true");
      } catch (err) {
        console.error("❌ Gagal membaca status onboarding:", err);
        if (isMounted) {
          setError("Gagal memuat status onboarding");
          setHasOnboarded(false);
        }
      }
    };

    checkOnboarding();
    return () => {
      isMounted = false;
    };
  }, []);

  if (hasOnboarded === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#00D4AA" />
        <Text style={styles.loadingText}>Memeriksa Status...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  return <Redirect href={hasOnboarded ? "/(tabs)/library" : "/onboarding"} />;
}

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
  },
  errorText: {
    color: "red",
  },
});
