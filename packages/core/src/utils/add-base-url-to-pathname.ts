import path from 'node:path';

/**
 * @function addBaseUrlToPathname
 * @param {string} url
 * @description
 * Add base url to the given url
 */
export function addBaseUrlToPathname(url: string): string {
  const { ecoConfig } = globalThis;
  return path.join(ecoConfig.baseUrl, url);
}
