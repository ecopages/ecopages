const glob = new Bun.Glob('packages/**/*/jsr.json');

for await (const jsrJson of glob.scan()) {
  const packageJson = jsrJson.replace('jsr.json', 'package.json');
  const packageConfig = await Bun.file(packageJson).json();
  const packageVersion = packageConfig.version;
  const jsrConfig = await Bun.file(jsrJson).text();
  const modifiedConfig = jsrConfig.replaceAll('${version}', packageVersion);
  await Bun.write(jsrJson, modifiedConfig);
}

export type {};
