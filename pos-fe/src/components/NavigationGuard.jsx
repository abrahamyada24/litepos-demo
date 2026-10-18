"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Swal from 'sweetalert2';

const NavigationGuardContext = createContext(null);

export function NavigationGuardProvider({ children }) {
  const guard = useRef(null);
  const busy = useRef(false);
  const router = useRouter();
  const setGuard = useCallback(value => {
    guard.current = value;
    return () => { if (guard.current === value) guard.current = null; };
  }, []);
  const confirmNavigation = useCallback(async () => {
    const current = guard.current;
    if (!current?.isDirty()) return true;
    if (busy.current) return false;
    busy.current = true;
    try {
      const result = await Swal.fire({
        title: 'Perubahan belum disimpan',
        text: 'Simpan perubahan sebelum meninggalkan pengaturan?',
        icon: 'warning', showDenyButton: true, showCancelButton: true,
        confirmButtonText: 'Simpan dan lanjutkan', denyButtonText: 'Buang perubahan',
        cancelButtonText: 'Tetap di sini', confirmButtonColor: '#2563eb',
        denyButtonColor: '#dc2626', allowOutsideClick: false,
      });
      if (result.isConfirmed) return await current.save();
      if (result.isDenied) { current.discard(); return true; }
      return false;
    } finally { busy.current = false; }
  }, []);

  useEffect(() => {
    const beforeUnload = event => {
      if (guard.current?.isDirty()) { event.preventDefault(); event.returnValue = ''; }
    };
    // Back/forward membutuhkan pemulihan URL sebelum dialog asinkron dibuka.
    // Listener capture dijalankan sebelum listener router Next.
    const popState = event => {
      const current = guard.current;
      if (!current?.isDirty()) return;
      event.stopImmediatePropagation();
      const destination = window.location.href;
      window.history.pushState(current.historyState, '', current.url);
      void confirmNavigation().then(allowed => {
        if (allowed) router.replace(destination);
      });
    };
    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener('popstate', popState, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      window.removeEventListener('popstate', popState, true);
    };
  }, [confirmNavigation, router]);

  const value = useMemo(() => ({ setGuard, confirmNavigation, isDirty: () => Boolean(guard.current?.isDirty()) }), [setGuard, confirmNavigation]);
  return <NavigationGuardContext.Provider value={value}>{children}</NavigationGuardContext.Provider>;
}

export const useNavigationGuard = () => useContext(NavigationGuardContext);

export default function GuardedLink({ onNavigate, href, ...props }) {
  const navigation = useNavigationGuard();
  const router = useRouter();
  return <Link {...props} href={href} onNavigate={event => {
    if (!navigation?.isDirty()) { onNavigate?.(event); return; }
    event.preventDefault();
    void navigation.confirmNavigation().then(allowed => {
      if (allowed) router.push(typeof href === 'string' ? href : href.pathname);
    });
  }}/>;
}
