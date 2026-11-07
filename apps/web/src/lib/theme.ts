import { useEffect, useState } from 'react';
import { useStore } from '../store/designStore';

function systemDark() {
  return (
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
  );
}

/** Applies the theme preference to <html> and returns whether dark mode is active. */
export function useThemeEffect(): boolean {
  const pref = useStore((s) => s.theme);
  const [sys, setSys] = useState(systemDark());
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const on = () => setSys(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const dark = pref === 'dark' || (pref === 'system' && sys);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);
  return dark;
}

/** Reads a CSS custom property (for chart libraries that need concrete colours). */
export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function useIsDark(): boolean {
  const pref = useStore((s) => s.theme);
  return pref === 'dark' || (pref === 'system' && !!systemDark());
}
