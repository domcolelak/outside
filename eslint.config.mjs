import coreWebVitals from "eslint-config-next/core-web-vitals";

const config = [
  { ignores: [".next/**", "node_modules/**", "test-results/**", "playwright-report/**"] },
  ...coreWebVitals,
  {
    files: ["components/agency/ClientPortal.tsx", "app/agency/portal/domain/page.tsx"],
    // White-label logos are caller-configured HTTPS URLs and cannot use a
    // static Next image allowlist. CSP and server validation constrain them.
    rules: { "@next/next/no-img-element": "off" },
  },
];

export default config;
