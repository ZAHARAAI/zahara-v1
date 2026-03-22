"use client";

import { useEffect, useState } from "react";

/**
 * Returns true when the current session is a guest (demo) session.
 *
 * Reads the zahara_is_guest cookie which is intentionally NOT httpOnly
 * so client components can show/hide the guest banner without an extra
 * server round-trip.
 *
 * Starts as false during SSR to avoid hydration mismatch, then updates
 * on mount once document.cookie is available.
 */
export function useIsGuest(): boolean {
  const [isGuest, setIsGuest] = useState(false);

  useEffect(() => {
    const cookies = document.cookie.split(";");
    const guestCookie = cookies.find((c) =>
      c.trim().startsWith("zahara_is_guest="),
    );
    const value = guestCookie?.split("=")?.[1]?.trim();
    setIsGuest(value === "true");
  }, []);

  return isGuest;
}
