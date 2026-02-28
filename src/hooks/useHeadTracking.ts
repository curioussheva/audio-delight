import { useEffect, useRef } from 'react';
import { Gyroscope } from 'expo-sensors';
import { useSpatialStore } from '../store/useSpatialStore';

const GYRO_UPDATE_MS = 50;

export function useHeadTracking() {
  const { isHeadTrackingEnabled, setPosition } = useSpatialStore();
  const rotationRef = useRef({ x: 0, y: 0, z: 0 });

  useEffect(() => {
    if (!isHeadTrackingEnabled) return;

    Gyroscope.setUpdateInterval(GYRO_UPDATE_MS);
    const sub = Gyroscope.addListener(({ x, y, z }) => {
      rotationRef.current = {
        x: rotationRef.current.x + x * (GYRO_UPDATE_MS / 1000),
        y: rotationRef.current.y + y * (GYRO_UPDATE_MS / 1000),
        z: rotationRef.current.z + z * (GYRO_UPDATE_MS / 1000),
      };
      const { x: rx, y: ry } = rotationRef.current;
      setPosition({
        x: Math.round(Math.sin(ry) * 30) / 10,
        y: Math.round(Math.sin(-rx) * 15) / 10,
        z: Math.round(Math.cos(ry) * -30) / 10,
      });
    });
    return () => sub.remove();
  }, [isHeadTrackingEnabled, setPosition]);

  return {
    resetTracking: () => { rotationRef.current = { x: 0, y: 0, z: 0 }; },
  };
}
