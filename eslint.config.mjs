import coreWebVitals from "eslint-config-next/core-web-vitals";

const config = [
  { ignores: [".next/**", "node_modules/**", "test-results/**", "playwright-report/**"] },
  ...coreWebVitals,
  {
    rules: {
      "@next/next/no-img-element": "off",
      // eslint-config-next 16 enables the React Compiler-era hook rules, which
      // flag established imperative patterns here (canvas refs in the graph,
      // SSE kick-off effects). Adopt them in a dedicated refactoring pass
      // instead of silently inside a dependency upgrade.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
      "react-hooks/refs": "off",
    },
  },
];

export default config;
