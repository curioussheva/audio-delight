import React, { useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, runOnJS, withSpring } from 'react-native-reanimated';
import { Canvas, Circle, Line, vec } from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';

interface Props {
  x: number; y: number;
  onPositionChange: (x: number, y: number) => void;
  size?: number; disabled?: boolean;
}

const XR = 5, YR = 2;

export function XYPad({ x, y, onPositionChange, size = 260, disabled = false }: Props) {
  const dotX = useSharedValue(((x + XR) / (XR * 2)) * size);
  const dotY = useSharedValue(((YR - y) / (YR * 2)) * size);
  const startX = useSharedValue(dotX.value);
  const startY = useSharedValue(dotY.value);
  const scale = useSharedValue(1);

  const cl = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  const emit = useCallback((px: number, py: number) => {
    const nx = (px / size) * (XR * 2) - XR;
    const ny = YR - (py / size) * (YR * 2);
    onPositionChange(Math.round(cl(nx, -XR, XR) * 10) / 10, Math.round(cl(ny, -YR, YR) * 10) / 10);
  }, [size, onPositionChange]);

  const haptic = useCallback(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light), []);

  const pan = Gesture.Pan()
    .enabled(!disabled)
    .onBegin(() => { startX.value = dotX.value; startY.value = dotY.value; scale.value = withSpring(1.3); runOnJS(haptic)(); })
    .onUpdate((e) => {
      const nx = cl(startX.value + e.translationX, 0, size);
      const ny = cl(startY.value + e.translationY, 0, size);
      dotX.value = nx; dotY.value = ny;
      runOnJS(emit)(nx, ny);
    })
    .onEnd(() => { scale.value = withSpring(1); });

  const tap = Gesture.Tap()
    .enabled(!disabled)
    .onEnd((e) => {
      const nx = cl(e.x, 0, size); const ny = cl(e.y, 0, size);
      dotX.value = withSpring(nx); dotY.value = withSpring(ny);
      runOnJS(emit)(nx, ny); runOnJS(haptic)();
    });

  const dotStyle = useAnimatedStyle(() => ({
    position: 'absolute', left: dotX.value - 20, top: dotY.value - 20,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(99,120,255,0.2)', borderWidth: 2, borderColor: '#6378ff',
    transform: [{ scale: scale.value }], alignItems: 'center', justifyContent: 'center',
  }));

  const cx = ((x + XR) / (XR * 2)) * size;
  const cy = ((YR - y) / (YR * 2)) * size;

  return (
    <View style={styles.container}>
      <View style={[styles.topLabels, { width: size + 48 }]}>
        <Text style={styles.label}>← L</Text>
        <Text style={[styles.label, { color: '#6378ff', letterSpacing: 2 }]}>PAN / ELEVATION</Text>
        <Text style={styles.label}>R →</Text>
      </View>
      <GestureDetector gesture={Gesture.Race(pan, tap)}>
        <View style={[styles.pad, { width: size, height: size }, disabled && styles.padDisabled]}>
          <Canvas style={{ width: size, height: size, position: 'absolute' }}>
            <Line p1={vec(size/2,0)} p2={vec(size/2,size)} color="rgba(99,120,255,0.18)" strokeWidth={1}/>
            <Line p1={vec(0,size/2)} p2={vec(size,size/2)} color="rgba(99,120,255,0.18)" strokeWidth={1}/>
            <Line p1={vec(size/4,0)} p2={vec(size/4,size)} color="rgba(99,120,255,0.07)" strokeWidth={1}/>
            <Line p1={vec(size*3/4,0)} p2={vec(size*3/4,size)} color="rgba(99,120,255,0.07)" strokeWidth={1}/>
            <Line p1={vec(0,size/4)} p2={vec(size,size/4)} color="rgba(99,120,255,0.07)" strokeWidth={1}/>
            <Line p1={vec(0,size*3/4)} p2={vec(size,size*3/4)} color="rgba(99,120,255,0.07)" strokeWidth={1}/>
            <Circle cx={cx} cy={cy} r={35} color="rgba(99,120,255,0.06)"/>
            <Circle cx={cx} cy={cy} r={60} color="rgba(99,120,255,0.03)"/>
          </Canvas>
          <Animated.View style={dotStyle} pointerEvents="none">
            <View style={styles.dotCore}/>
          </Animated.View>
        </View>
      </GestureDetector>
      <View style={[styles.readout, { width: size + 48 }]}>
        <Text style={styles.readoutText}>Pan: {x > 0 ? '+' : ''}{x.toFixed(1)}</Text>
        <Text style={styles.readoutText}>|</Text>
        <Text style={styles.readoutText}>Elev: {y > 0 ? '+' : ''}{y.toFixed(1)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems:'center', gap:4 },
  topLabels: { flexDirection:'row', justifyContent:'space-between', paddingHorizontal:4 },
  label: { fontSize:10, color:'#5a6080' },
  pad: { backgroundColor:'#0a0c14', borderRadius:16, borderWidth:1, borderColor:'rgba(99,120,255,0.2)', overflow:'hidden' },
  padDisabled: { opacity:0.4 },
  dotCore: { width:10, height:10, borderRadius:5, backgroundColor:'#6378ff' },
  readout: { flexDirection:'row', justifyContent:'center', gap:12 },
  readoutText: { fontSize:11, color:'#6378ff', fontVariant:['tabular-nums'] },
});
