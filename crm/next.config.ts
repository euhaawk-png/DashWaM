import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Meta Embedded Signup requires the Facebook JS SDK.
      "script-src 'self' 'unsafe-inline' https://connect.facebook.net",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob: https:",
      "connect-src 'self' https://graph.facebook.com https://www.facebook.com",
      "frame-src https://www.facebook.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

// The public form embed route must be frameable by any site (iframe embeds).
const embedHeaders = securityHeaders
  .filter((h) => h.key !== "X-Frame-Options")
  .map((h) =>
    h.key === "Content-Security-Policy"
      ? { key: h.key, value: h.value.replace("frame-ancestors 'none'", "frame-ancestors *") }
      : h
  );

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/f/:slug/embed", headers: embedHeaders },
      { source: "/((?!f/.*/embed).*)", headers: securityHeaders },
    ];
  },
};

export default nextConfig;
