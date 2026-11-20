import { useMutation } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';

import { sendJobLocation } from './deliveryService';
import type { DeliveryLocation } from './types';

/** Foreground-only tracking. Never requests background permission. */
const TRACK_DURATION_MS = 15_000;
const TRACK_INTERVAL_MS = 5_000;

export type TrackingState = 'idle' | 'tracking' | 'done' | 'denied' | 'error';

export function useForegroundLocation(jobId: string) {
  const [state, setState] = useState<TrackingState>('idle');
  const [lastLocation, setLastLocation] = useState<DeliveryLocation | null>(null);
  const stoppedRef = useRef(false);
  const mountedRef = useRef(true);

  const mutation = useMutation({ mutationFn: (coords: { latitude: number; longitude: number }) =>
    sendJobLocation(jobId, coords.latitude, coords.longitude),
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stoppedRef.current = true;
    };
  }, []);

  const stop = useCallback(() => {
    stoppedRef.current = true;
    if (mountedRef.current) setState('done');
  }, []);

  const start = useCallback(async () => {
    stoppedRef.current = false;
    setState('tracking');

    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') {
      if (mountedRef.current) setState('denied');
      return;
    }

    const startedAt = Date.now();
    while (!stoppedRef.current && Date.now() - startedAt < TRACK_DURATION_MS) {
      try {
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const job = await mutation.mutateAsync({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        if (!mountedRef.current) return;
        setLastLocation(job.location ?? null);
      } catch {
        if (mountedRef.current) setState('error');
        return;
      }
      if (stoppedRef.current || Date.now() - startedAt >= TRACK_DURATION_MS) break;
      await new Promise((resolve) => setTimeout(resolve, TRACK_INTERVAL_MS));
    }
    if (mountedRef.current) setState('done');
  }, [mutation]);

  return {
    state,
    start,
    stop,
    lastLocation,
    isTracking: state === 'tracking',
    durationSeconds: TRACK_DURATION_MS / 1000,
  };
}
