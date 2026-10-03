---
'@ecopages/core': minor
---

An HTML Page `<script src="./app.ts">` without `type="module"` has its types stripped instead of shipping TypeScript; its top-level functions stay global, as in any classic script. A classic script that uses `import`, `export`, or `import.meta` is now an error asking for `type="module"`, instead of failing in the browser.

Script assets accept `skipHmr: true`, which bundles the script in the asset pipeline while HMR is active instead of rebuilding it as an ES module in the HMR pipeline. HTML Pages set it for these classic scripts.
