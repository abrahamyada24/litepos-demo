"use client";

import AuthGuard from '@/components/AuthGuard';
import DeviceTheme from '@/components/DeviceTheme';

export default function PosLayout({ children }) {
  return <AuthGuard><DeviceTheme />{children}</AuthGuard>;
}
