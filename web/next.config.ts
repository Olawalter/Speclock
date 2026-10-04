import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // There is no server here and nothing to proxy: the browser talks to GenLayer
  // directly, so an adjudicator nobody hosts is an adjudicator nobody can be
  // asked to change.
  outputFileTracingRoot: __dirname,
};

export default config;
