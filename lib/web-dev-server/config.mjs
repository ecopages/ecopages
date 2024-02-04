import { gzipSupportMiddleware } from "./middleware/rewrite-index.mjs";

const args = process.argv.slice(2);
const WATCH_MODE = args.includes("--watch");
const OPEN = args.includes("--open");

export default {
  open: OPEN,
  rootDir: "./.eco",
  port: 3000,
  middleware: WATCH_MODE ? [] : [gzipSupportMiddleware],
  watch: WATCH_MODE,
};
