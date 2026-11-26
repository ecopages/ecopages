/**
 * Canonical site origin shared by `eco.config.ts` (`baseUrl`) and the document head.
 *
 * @remarks
 * Resolves `ECOPAGES_BASE_URL` (also set by `--base-url`) and falls back to the dev server origin, mirroring
 * Core's own `baseUrl` default. Keep both consumers on this module so canonical links and the Sitemap agree.
 */
export const siteOrigin = (process.env.ECOPAGES_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/u, '');

/**
 * Joins the site origin and a Page pathname with exactly one slash.
 */
export function absoluteUrl(pathname: string): string {
	return `${siteOrigin}/${pathname.replace(/^\/+/u, '')}`;
}
