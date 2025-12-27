// Build worker.js using Bun's bundler
import { build } from "bun";

const result = await build({
  entrypoints: ["./viewer/lib/worker.js"],
  outdir: "./public",
  target: "bun", // Use bun target for worker
  minify: false, // Keep readable for debugging
  sourcemap: "external",
});

if (result.success) {
  console.log("Worker built successfully!");
  for (const output of result.outputs) {
    console.log(`  ${output.path} (${output.size} bytes)`);
  }
} else {
  console.error("Build failed:");
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}
