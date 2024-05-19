const filesToIgnore = ['.test.ts', 'build.ts'];
const glob = new Bun.Glob('src/**/*.ts');
let files = await Array.fromAsync(glob.scan({ cwd: '.' }));
files = files.filter((file) => !filesToIgnore.some((ignore) => file.includes(ignore)));

export const build = await Bun.build({
  entrypoints: files,
  outdir: 'dist',
  root: './src',
  target: 'bun',
  minify: true,
  format: 'esm',
  splitting: true,
  sourcemap: 'external',
});

if (!build.success) {
  for (const log of build.logs) {
    console.log('[lite-elements]', log);
  }
}
