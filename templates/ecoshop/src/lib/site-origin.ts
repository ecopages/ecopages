import { resolveUrl } from './store-urls';

/**
 * The site's public origin: `eco.config.ts` (`baseUrl`), canonical links, JSON-LD, `/llms.txt`, MCP results and
 * the trusted origin of the cart, agent tool and MCP endpoints all read it.
 *
 * @remarks
 * Resolves `ECOPAGES_BASE_URL` (also set by `--base-url`) and falls back to the dev server origin, mirroring
 * Core's own `baseUrl` default.
 */
export const siteOrigin = (process.env.ECOPAGES_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/u, '');

/**
 * Joins the site origin and a Page pathname with exactly one slash.
 */
export function absoluteUrl(pathname: string): string {
	return resolveUrl(siteOrigin, pathname);
}
