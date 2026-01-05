"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { trackEvent } from "@/lib/analytics";

/**
 * Tracks page views, session duration, and user activity
 * Include once in the app shell
 */
export function AnalyticsTracker() {
  const pathname = usePathname();
  const sessionStartRef = React.useRef<number>(Date.now());
  const lastActivityRef = React.useRef<number>(Date.now());
  const pageViewTracked = React.useRef<string | null>(null);

  // Track page views
  React.useEffect(() => {
    if (pathname && pathname !== pageViewTracked.current) {
      pageViewTracked.current = pathname;
      trackEvent("page_view", {
        path: pathname,
        referrer: typeof document !== "undefined" ? document.referrer : null,
        screen_width: typeof window !== "undefined" ? window.innerWidth : null,
        screen_height: typeof window !== "undefined" ? window.innerHeight : null
      });
    }
  }, [pathname]);

  // Track session start and device info
  React.useEffect(() => {
    const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const isMobile = /iPhone|iPad|iPod|Android/i.test(userAgent);
    const isTablet = /iPad|Android/i.test(userAgent) && !/Mobile/i.test(userAgent);
    
    let browser = "Unknown";
    if (userAgent.includes("Chrome") && !userAgent.includes("Edg")) browser = "Chrome";
    else if (userAgent.includes("Safari") && !userAgent.includes("Chrome")) browser = "Safari";
    else if (userAgent.includes("Firefox")) browser = "Firefox";
    else if (userAgent.includes("Edg")) browser = "Edge";

    let os = "Unknown";
    if (userAgent.includes("Mac")) os = "macOS";
    else if (userAgent.includes("Windows")) os = "Windows";
    else if (userAgent.includes("Linux")) os = "Linux";
    else if (userAgent.includes("iPhone") || userAgent.includes("iPad")) os = "iOS";
    else if (userAgent.includes("Android")) os = "Android";

    trackEvent("session_start", {
      device: isMobile ? "mobile" : isTablet ? "tablet" : "desktop",
      browser,
      os,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      language: typeof navigator !== "undefined" ? navigator.language : null
    });

    // Track session end on unload
    const handleUnload = () => {
      const duration = Math.round((Date.now() - sessionStartRef.current) / 1000);
      // Use sendBeacon for reliable unload tracking
      if (typeof navigator !== "undefined" && navigator.sendBeacon) {
        navigator.sendBeacon(
          "/api/analytics/event",
          JSON.stringify({
            event_type: "session_end",
            metadata: {
              duration_seconds: duration,
              pages_viewed: pageViewTracked.current
            }
          })
        );
      }
    };

    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, []);

  // Track user activity (clicks, scrolls) for engagement
  React.useEffect(() => {
    const handleActivity = () => {
      const now = Date.now();
      // Only track if 30+ seconds since last activity (debounce)
      if (now - lastActivityRef.current > 30000) {
        lastActivityRef.current = now;
        trackEvent("user_active", {
          path: pathname,
          session_duration_seconds: Math.round((now - sessionStartRef.current) / 1000)
        });
      }
    };

    window.addEventListener("click", handleActivity);
    window.addEventListener("scroll", handleActivity);
    
    return () => {
      window.removeEventListener("click", handleActivity);
      window.removeEventListener("scroll", handleActivity);
    };
  }, [pathname]);

  return null;
}

