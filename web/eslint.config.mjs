import next from "eslint-config-next";

// eslint-config-next 16 exports a flat config array directly; the older
// next.coreWebVitals / next.typescript entry points are gone, and spreading
// them throws before a single file is linted.
const config = [
  { ignores: [".next/**", "node_modules/**"] },
  ...next,
];

export default config;
