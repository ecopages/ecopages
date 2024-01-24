import fs from "fs";
import path from "path";

let scriptPath = path.join(process.cwd(), "lib", "cli", "eco-pages.ts");

let binPath = path.join(process.cwd(), "node_modules", ".bin", "eco-pages");

fs.symlinkSync(scriptPath, binPath, "file");
fs.chmodSync(binPath, "755");
