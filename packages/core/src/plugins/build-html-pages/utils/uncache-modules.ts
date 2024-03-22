import type { EcoPagesConfig } from "@types";

/**
 * @function uncacheModules
 * @description
 * This function uncache the modules. It uses a regex to match the modules to uncache.
 * Rwgex is based on the srcDir, componentsDir, layoutsDir, pagesDir, includesDir, and globalDir.
 */
export function uncacheModules(config: EcoPagesConfig): void {
  const regex = new RegExp(
    `${config.srcDir}/(${config.componentsDir}|${config.layoutsDir}|${config.pagesDir}|${config.includesDir}|${config.globalDir})|\\.kita`
  );

  Object.keys(require.cache).forEach((key) => {
    if (regex.test(key)) {
      delete require.cache[key];
    }
  });
}
