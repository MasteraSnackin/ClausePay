import { build } from "esbuild";

await build({
  entryPoints: ["scripts/vercel-api-entry.ts"],
  outfile: "api/index.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  sourcemap: true,
  packages: "external"
});
