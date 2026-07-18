import { createSecurityHeaders } from "./lib/security/headers.mjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Produce a minimal, trace-complete server image. The same artifact is used
  // by the container smoke gate and production deployments.
  output: "standalone",
  async headers() {
    return [
      {
        source: "/:path*",
        // CSP is request-specific and nonce-backed in middleware. Static
        // headers retain the rest of the browser security baseline.
        headers: createSecurityHeaders(process.env.NODE_ENV === "production").filter((header) => header.key !== "Content-Security-Policy"),
      },
    ];
  },
};

export default nextConfig;
