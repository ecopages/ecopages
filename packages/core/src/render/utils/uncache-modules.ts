/**
 * @function uncacheModules
 * @description
 * This function uncache the modules. It uses a regex to match the modules to uncache.
 * Regex is based on the srcDir, componentsDir, layoutsDir, pagesDir, includesDir, and globalDir.
 */
export function uncacheModules(): void {
  const { srcDir, componentsDir, layoutsDir, pagesDir, includesDir, globalDir, templatesExt } = globalThis.ecoConfig;

  const regex = new RegExp(
    `${srcDir}/(${componentsDir}|${layoutsDir}|${pagesDir}|${includesDir}|${globalDir})|(${templatesExt.join(',')})`,
  );

  for (const key in require.cache) {
    if (regex.test(key)) {
      delete require.cache[key];
    }
  }
}
