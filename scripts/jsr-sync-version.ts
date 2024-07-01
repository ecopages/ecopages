import rootPackage from '../package.json';

if (!rootPackage.version) {
  throw new Error('Root package.json does not have a version');
}
const glob = new Bun.Glob('packages/**/*/jsr.json');

for await (const jsrJson of glob.scan()) {
  const packageJson = jsrJson.replace('jsr.json', 'package.json');
  const modifiedPackageJsonConfig = await Bun.file(packageJson).json();
  modifiedPackageJsonConfig.version = rootPackage.version;
  const jsrConfig = await Bun.file(jsrJson).text();
  const modifiedJsrConfig = jsrConfig.replaceAll('${version}', modifiedPackageJsonConfig.version);
  await Bun.write(packageJson, JSON.stringify(modifiedPackageJsonConfig, null, 2));
  await Bun.write(jsrJson, modifiedJsrConfig);
}
