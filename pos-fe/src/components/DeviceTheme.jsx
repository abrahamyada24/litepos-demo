"use client";

import { useEffect } from 'react';
import { applyWebTheme, DEVICE_PREFERENCES_KEY, getDevicePreferences } from '@/utils/devicePreferences';

export default function DeviceTheme() {
  useEffect(() => {
    const applySavedTheme = () => applyWebTheme(getDevicePreferences().theme);
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
    const handleStorage = (event) => {
      if (event.key === DEVICE_PREFERENCES_KEY || event.key === null) applySavedTheme();
    };

    applySavedTheme();
    systemTheme.addEventListener('change', applySavedTheme);
    window.addEventListener('litepos-device-preferences', applySavedTheme);
    window.addEventListener('storage', handleStorage);
    return () => {
      systemTheme.removeEventListener('change', applySavedTheme);
      window.removeEventListener('litepos-device-preferences', applySavedTheme);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  return null;
}
