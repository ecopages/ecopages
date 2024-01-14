import { rewriteIndex } from "./middleware/rewrite-index.mjs";

export default {
  open: false,
  rootDir: "./dist",
  port: import.meta.env || 3000,
  middleware: [rewriteIndex],
};
