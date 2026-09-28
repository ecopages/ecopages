import type { HtmlDocumentContribution } from '../../../services/html/html-transformer.service.ts';
import type { PageMetadataProps, PageRobotsMetadata } from '../../../types/public-types.ts';
import { escapeHtmlAttribute } from '../../../utils/html-escaping.ts';

/**
 * Builds a head contribution for non-default `metadata.robots` values.
 *
 * @remarks
 * When `robots` is omitted or matches the default `index,follow` behaviour,
 * no tag is emitted (Next.js parity). Otherwise a single
 * `<meta name="robots" content="...">` contribution is returned.
 */
export function buildRobotsMetaContribution(
	metadata: Pick<PageMetadataProps, 'robots'>,
): HtmlDocumentContribution | undefined {
	const content = formatRobotsMetaContent(metadata.robots);
	if (!content) {
		return undefined;
	}

	return {
		placement: 'head-append',
		html: `<meta name="robots" content="${escapeHtmlAttribute(content)}">`,
	};
}

/**
 * Formats robots directives for a meta tag, or `undefined` when defaults apply.
 */
export function formatRobotsMetaContent(robots: PageRobotsMetadata | undefined): string | undefined {
	if (!robots) {
		return undefined;
	}

	const index = robots.index !== false;
	const follow = robots.follow !== false;
	const directives: string[] = [];

	if (!index) {
		directives.push('noindex');
	}
	if (!follow) {
		directives.push('nofollow');
	}
	if (robots.nocache) {
		directives.push('nocache');
	}

	if (directives.length === 0) {
		return undefined;
	}

	return directives.join(', ');
}
