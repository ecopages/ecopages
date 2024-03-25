import { Glob } from "bun";

/**
 * @function buildScripts
 * @description
 * Build the scripts based on the eco config.
 * The glob pattern looks for all the files with the dependency prefix in the src directory.
 * The dependency prefix is defined in the eco config, default is "script". i.e. "my-component.script.ts"
 */
export async function buildScripts() {
  const { ecoConfig: config } = globalThis;

  const glob = new Glob(`${config.srcDir}/**/*.${config.scriptDescriptor}.{ts,tsx}`);
  const scannedFiles = glob.scanSync({ cwd: "." });
  const scripts = Array.from(scannedFiles);

  const build = await Bun.build({
    entrypoints: scripts,
    outdir: config.distDir,
    root: config.srcDir,
    target: "browser",
    minify: true, // !config.watchMode,
    format: "esm",
    splitting: true,
  });

  if (!build.success) build.logs.forEach((log) => console.log(log));
}
