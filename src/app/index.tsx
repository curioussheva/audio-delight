import React, { useState, useEffect } from "react";
import { Redirect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { View, ActivityIndicator, Text } from "react-native";

export default function Index() {
  const [hasOnboarded, setHasOnboarded] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const checkOnboarding = async () => {
      try {
        const value = await AsyncStorage.getItem("has_onboarded");
        if (isMounted) {
          setHasOnboarded(value === "true");
        }
      } catch (err) {
        console.error("Failed to read onboarding status:", err);
        if (isMounted) {
          setError("Gagal memuat status onboarding");
          setHasOnboarded(false); // fallback ke onboarding jika error
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
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#00D4AA" />
        <Text style={{ marginTop: 16, color: "#888" }}>Memuat...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Text style={{ color: "red" }}>{error}</Text>
      </View>
    );
  }

  // Typed routes aktif → gunakan object form agar aman dari type error
  return hasOnboarded ? (
    <Redirect href={{ pathname: "/(drawer)/(tabs)/library" }} />
  ) : (
    <Redirect href={{ pathname: "/onboarding" }} />
  );
}
