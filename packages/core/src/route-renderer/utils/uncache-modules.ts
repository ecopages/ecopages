/**
 * @function uncacheModules
 * @description
 * This function uncache the modules. It uses a regex to match the modules to uncache.
 * Regex is created using the rootDir and srcDir from the global ecoConfig.
 */
export function uncacheModules(): void {
  const { srcDir, rootDir } = globalThis.ecoConfig;

  const regex = new RegExp(`${rootDir}/${srcDir}/.*`);

  for (const key in require.cache) {
    if (regex.test(key)) {
      delete require.cache[key];
    }
  }
}
