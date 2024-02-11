import type { EcoPagesConfig } from "root/lib/eco-pages.types";

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
