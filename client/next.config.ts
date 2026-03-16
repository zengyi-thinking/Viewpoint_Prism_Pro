import type { NextConfig } from "next";

const internalApiUrl =
  process.env.INTERNAL_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:7871";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${internalApiUrl}/api/:path*`,
      },
      {
        source: '/storage/:path*',
        destination: `${internalApiUrl}/storage/:path*`,
      },
    ];
  },
};

export default nextConfig;
