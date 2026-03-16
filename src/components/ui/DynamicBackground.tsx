import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';

export const DynamicBackground = ({ artwork }: { artwork?: string }) => (
  <View style={StyleSheet.absoluteFill}>
    <Image 
      source={{ uri: artwork || 'placeholder_uri' }} 
      style={StyleSheet.absoluteFill} 
    />
    <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
    <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(10, 22, 40, 0.5)' }]} />
  </View>
);
