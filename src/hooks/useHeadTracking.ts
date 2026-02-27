import { useEffect, useRef } from 'react';
import { Gyroscope } from 'expo-sensors';
import { useSpatialStore } from '../store/useSpatialStore';
import { AUDIO_CONFIG } from '../constants/eq';

/**
 * useHeadTracking
 * Maps gyroscope rotation to 3D spatial position.
 * Only active when headTrackingEnabled is true in spatial store.
 */
export function useHeadTracking() {
  const { headTrackingEnabled, setPosition } = useSpatialStore();
  const rotationRef = useRef({ x: 0, y: 0, z: 0 });

  useEffect(() => {
    if (!headTrackingEnabled) return;

    Gyroscope.setUpdateInterval(AUDIO_CONFIG.GYRO_UPDATE_MS);

    const subscription = Gyroscope.addListener(({ x, y, z }) => {
      // Integrate rotation over time (simplified, no drift correction)
      rotationRef.current = {
        x: rotationRef.current.x + x * (AUDIO_CONFIG.GYRO_UPDATE_MS / 1000),
        y: rotationRef.current.y + y * (AUDIO_CONFIG.GYRO_UPDATE_MS / 1000),
        z: rotationRef.current.z + z * (AUDIO_CONFIG.GYRO_UPDATE_MS / 1000),
      };

      const { x: rx, y: ry } = rotationRef.current;

      // Map rotation angles to 3D position
      // rx = pitch (up/down tilt) → y-axis
      // ry = yaw (left/right turn) → x-axis
      setPosition({
        x: Math.sin(ry) * 3,   // Left(-3) to Right(+3)
        y: Math.sin(-rx) * 1.5, // Down(-1.5) to Up(+1.5)
        z: Math.cos(ry) * -3,   // Back to Front
      });
    });

    return () => {
      subscription.remove();
    };
  }, [headTrackingEnabled, setPosition]);

  // Reset accumulated rotation
  const resetTracking = () => {
    rotationRef.current = { x: 0, y: 0, z: 0 };
  };

  return { resetTracking };
}
