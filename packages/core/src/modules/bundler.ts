export const bundleFile = async ({
  entrypoint,
  outdir,
  root,
}: { entrypoint: string; outdir: string; root: string }) => {
  const build = await Bun.build({
    entrypoints: [entrypoint],
    outdir,
    root,
    target: 'browser',
    minify: true,
    format: 'esm',
    splitting: true,
    naming: '[name].[ext]',
  });

  return build;
};
