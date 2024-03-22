/**
 * @function addBaseToUrl
 * @param {string} url
 * @description
 * Add base url to the given url
 */
export function addBaseToUrl(url: string) {
  const { ecoConfig } = globalThis;
  return `${ecoConfig.baseUrl}/${url}`;
}
