import config from "eslint-config-next/core-web-vitals";

export default [
  ...config,
  // Keep config files clean without noisy default-export warnings.
  {
    files: ["**/*.config.{js,cjs,mjs,ts,cts,mts}"],
    rules: {
      "import/no-anonymous-default-export": "off",
    },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
    ],
  },
];


