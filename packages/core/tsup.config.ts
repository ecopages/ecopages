import { defineConfig } from 'tsup';

const entry = [
  'src/index.ts',
  'src/modules/deps-manager.module.ts',
  'src/utils/add-base-url-to-pathname.ts',
  'src/route-renderer/integration-renderer.ts',
  'src/utils/deep-merge.ts',
  'src/utils/invariant.ts',
  'src/utils/app-logger.ts',
  'src/loaders/inline-postcss.loader.ts',
  'src/loaders/mdx.loader.ts',
];

export default defineConfig({
  entry,
  format: ['esm'],
  splitting: false,
  sourcemap: true,
  outDir: 'dist',
  clean: true,
  dts: true,
  external: ['bun'],
});
