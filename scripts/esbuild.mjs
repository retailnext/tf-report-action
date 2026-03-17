import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/action/main.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node24",
  outfile: "dist/index.js",
  sourcemap: true,
  external: [
    "node:fs",
    "node:https",
    "node:path",
    "node:os",
    "node:stream",
    "node:url",
    "node:child_process",
    "node:crypto",
    "node:buffer",
    "node:events",
    "node:util",
    "node:net",
    "node:tls",
    "node:http",
    "node:zlib",
  ],
  treeShaking: true,
});
