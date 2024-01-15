import { rewriteIndex, rewriteIndexWithGzSupport } from "./middleware/rewrite-index.mjs";

const args = process.argv.slice(2);
const WATCH_MODE = args.includes("--watch");

export default {
  open: false,
  rootDir: "./dist",
  port: import.meta.env || 3000,
  middleware: WATCH_MODE ? [rewriteIndex] : [rewriteIndexWithGzSupport],
  watch: WATCH_MODE,
};
