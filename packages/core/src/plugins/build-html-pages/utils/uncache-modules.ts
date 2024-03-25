/**
 * @function uncacheModules
 * @description
 * This function uncache the modules. It uses a regex to match the modules to uncache.
 * Rwgex is based on the srcDir, componentsDir, layoutsDir, pagesDir, includesDir, and globalDir.
 */
export function uncacheModules(): void {
  const { srcDir, componentsDir, layoutsDir, pagesDir, includesDir, globalDir } =
    globalThis.ecoConfig;

  const regex = new RegExp(
    `${srcDir}/(${componentsDir}|${layoutsDir}|${pagesDir}|${includesDir}|${globalDir})|\\.kita`
  );

  Object.keys(require.cache).forEach((key) => {
    if (regex.test(key)) {
      delete require.cache[key];
    }
  });
}
