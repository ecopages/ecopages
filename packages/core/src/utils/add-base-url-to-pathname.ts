/**
 * This module contains a simple utility function to add base url to the given url
 * @module
 */

import path from 'node:path';

/**
 * It adds the base url configured in ecoConfig to the given relative url
 * @function addBaseUrlToPathname
 * @param {string} url
 * @description
 */
export function addBaseUrlToPathname(url: string): string {
  return path.join(globalThis.ecoConfig.baseUrl, url);
}
