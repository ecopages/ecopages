export function addBaseToUrl(url: string) {
  return `${import.meta.env.ECO_PAGES_BASE_URL}/${url}`;
}
