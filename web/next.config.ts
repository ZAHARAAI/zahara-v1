import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Disable the client-side router cache so navigating back to a page
    // always re-runs useEffect and fetches fresh data.
    // Without this, Next.js 14+ caches page segments for 30s, causing
    // stale Audit/Clinic data after actions like cancel.
    staleTimes: {
      dynamic: 0,
      static: 0,
    },
  },
};

export default nextConfig;
