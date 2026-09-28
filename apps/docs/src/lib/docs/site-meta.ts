/**
 * SEO and site-origin helpers for the docs app.
 *
 * @remarks
 * Mirrored from `templates/docs-starter/src/lib/docs/site-meta.ts` on purpose:
 * the starter must stay self-contained, so this module is kept in sync rather than shared.
 */
import { getDocsLlmUrlFromPathname } from './docs-llm-url';

export const ECOPAGES_GITHUB = 'https://github.com/ecopages/ecopages';
export const SITE_NAME = 'Ecopages';
export const DEFAULT_OG_IMAGE_PATH = '/assets/images/default-og.png';
export const DEFAULT_SITE_ORIGIN = 'https://ecopages.app';
export const DOCS_SITEMAP_EXTRA_URLS = ['/llms.txt', '/skill.txt'] as const;

/**
 * Reads the site origin from the environment.
 *
 * @remarks
 * Vite surfaces `ECOPAGES_BASE_URL` on `import.meta.env` in app code, while tsx-run
 * scripts only see `process.env`. Both are checked so one helper serves both contexts.
 */
function envSiteOrigin(): string | undefined {
	return import.meta.env?.ECOPAGES_BASE_URL ?? process.env.ECOPAGES_BASE_URL;
}

/**
 * Canonical origin for `eco.config.ts` `setBaseUrl()`, LLM index links, and SEO helpers.
 */
export function configuredSiteOrigin(): string {
	return envSiteOrigin() ?? DEFAULT_SITE_ORIGIN;
}

/**
 * Strips trailing slashes from a site origin so URL interpolation cannot produce `//`.
 */
export function normalizeSiteOrigin(origin: string): string {
	return origin.replace(/\/+$/, '');
}

function resolvedOrigin(origin?: string): string {
	return normalizeSiteOrigin(origin ?? configuredSiteOrigin());
}

/**
 * Joins a site origin with a pathname into an absolute URL.
 */
export function absoluteUrl(pathname: string, origin?: string): string {
	const base = resolvedOrigin(origin);
	if (!pathname || pathname === '/') {
		return `${base}/`;
	}

	const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
	return `${base}${path}`;
}

function isAbsoluteHttpUrl(value: string): boolean {
	try {
		const parsed = new URL(value);
		return parsed.protocol === 'http:' || parsed.protocol === 'https:';
	} catch {
		return false;
	}
}

/**
 * Resolves `metadata.image` (public path, `public/...`, or absolute `http(s)` URL) to an absolute URL.
 */
export function absoluteImageUrl(image: string | undefined, origin?: string): string {
	const raw = image?.trim() || DEFAULT_OG_IMAGE_PATH;
	if (isAbsoluteHttpUrl(raw)) {
		return raw;
	}

	const withoutPublic = raw.replace(/^public\//, '/');
	const path = withoutPublic.startsWith('/') ? withoutPublic : `/${withoutPublic}`;
	return absoluteUrl(path, origin);
}

export function ogTypeForPathname(pathname: string | undefined): 'website' | 'article' {
	if (!pathname || pathname === '/') {
		return 'website';
	}

	return pathname.startsWith('/docs/') ? 'article' : 'website';
}

export type DocsPageHeadLinks = {
	canonical: string | null;
	markdownAlternate: string | null;
};

/**
 * Canonical and Markdown alternate URLs emitted in docs HTML `<head>`.
 */
export function docsPageHeadLinks(pathname: string | undefined, origin?: string): DocsPageHeadLinks {
	if (!pathname) {
		return { canonical: null, markdownAlternate: null };
	}

	const llmPath = getDocsLlmUrlFromPathname(pathname);
	return {
		canonical: absoluteUrl(pathname, origin),
		markdownAlternate: llmPath ? absoluteUrl(llmPath, origin) : null,
	};
}

export type SoftwareApplicationJsonLd = {
	'@context': 'https://schema.org';
	'@type': 'SoftwareApplication';
	name: string;
	description: string;
	url: string;
	applicationCategory: string;
	operatingSystem: string;
	license: string;
	sameAs: string[];
};

/**
 * Homepage identity for agents that parse JSON-LD.
 */
export function homepageSoftwareApplicationJsonLd(description: string, origin?: string): SoftwareApplicationJsonLd {
	return {
		'@context': 'https://schema.org',
		'@type': 'SoftwareApplication',
		name: SITE_NAME,
		description,
		url: absoluteUrl('/', origin),
		applicationCategory: 'DeveloperApplication',
		operatingSystem: 'Any',
		license: 'https://opensource.org/licenses/MIT',
		sameAs: [ECOPAGES_GITHUB],
	};
}
