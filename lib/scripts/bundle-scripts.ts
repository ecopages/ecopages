import { Glob } from "bun";
import { DIST_DIR } from "root/lib/global/constants";

const glob = new Glob("src/**/*.script.ts");
const scannedFiles = glob.scanSync({ cwd: "." });
const scripts = Array.from(scannedFiles);

export async function buildScripts() {
  const build = await Bun.build({
    entrypoints: scripts,
    outdir: DIST_DIR,
    target: "browser",
    minify: true,
  });

  build.logs.forEach((log) => console.log(log));

  const buildSuccesful = build.success;

  console.log(buildSuccesful ? "💫 Build succesful" : "🚨 Build failed");
}
