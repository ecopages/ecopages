/**
 * In-memory exact-match search over a small set of documents.
 *
 * Matching is AND across distinct query tokens, exact whole-token match (no
 * fuzzy/substring matching). Ranking is term-frequency with a title boost —
 * enough for a small curated wiki without a search library.
 */

/**
 * A string index signature here would widen `keyof` to `string` and collapse
 * `Omit<T, "content">` (used by `SearchResult`) back to `unknown` for every
 * field — extend via intersection instead (e.g. `SearchDocument & { category: string }`).
 */
export type SearchDocument = {
	id: string;
	title: string;
	content: string;
	url: string;
};

export type SearchOptions = {
	page?: number;
	limit?: number;
};

export type SearchResult<T extends SearchDocument> = Omit<T, 'content'> & {
	snippet: string;
	score: number;
};

export type SearchResponse<T extends SearchDocument> = {
	query: string;
	page: number;
	pageSize: number;
	total: number;
	totalPages: number;
	results: SearchResult<T>[];
};

const TITLE_MATCH_WEIGHT = 3;
const CONTENT_MATCH_WEIGHT = 1;
const SNIPPET_RADIUS = 60;

/** Lowercases and splits on non-alphanumeric runs. Exported so UI can highlight matches consistently. */
export function tokenize(text: string): string[] {
	return text
		.toLowerCase()
		.split(/[^\p{L}\p{N}]+/u)
		.filter(Boolean);
}

function buildSnippet(content: string, queryTokens: string[]): string {
	const lower = content.toLowerCase();
	let matchIndex = -1;
	for (const token of queryTokens) {
		const index = lower.indexOf(token);
		if (index !== -1 && (matchIndex === -1 || index < matchIndex)) {
			matchIndex = index;
		}
	}

	if (matchIndex === -1) {
		return content.slice(0, SNIPPET_RADIUS * 2).trim();
	}

	const start = Math.max(0, matchIndex - SNIPPET_RADIUS);
	const end = Math.min(content.length, matchIndex + SNIPPET_RADIUS);
	const prefix = start > 0 ? '…' : '';
	const suffix = end < content.length ? '…' : '';
	return `${prefix}${content.slice(start, end).trim()}${suffix}`;
}

type IndexedDocument<T extends SearchDocument> = {
	document: T;
	titleTokens: Set<string>;
	contentTokenCounts: Map<string, number>;
};

export function createSearchIndex<T extends SearchDocument>(documents: T[]) {
	const indexed: IndexedDocument<T>[] = documents.map((document) => {
		const titleTokens = new Set(tokenize(document.title));
		const contentTokenCounts = new Map<string, number>();
		for (const token of tokenize(document.content)) {
			contentTokenCounts.set(token, (contentTokenCounts.get(token) ?? 0) + 1);
		}
		return { document, titleTokens, contentTokenCounts };
	});

	function search(query: string, options: SearchOptions = {}): SearchResponse<T> {
		const limit = options.limit ?? 10;
		const requestedPage = options.page ?? 1;
		const queryTokens = [...new Set(tokenize(query))];

		if (queryTokens.length === 0) {
			return {
				query,
				page: 1,
				pageSize: limit,
				total: 0,
				totalPages: 0,
				results: [],
			};
		}

		const matches: Array<{ document: T; score: number }> = [];

		for (const entry of indexed) {
			let score = 0;
			let matchedAllTokens = true;

			for (const token of queryTokens) {
				const inTitle = entry.titleTokens.has(token);
				const contentCount = entry.contentTokenCounts.get(token) ?? 0;

				if (!inTitle && contentCount === 0) {
					matchedAllTokens = false;
					break;
				}

				score += (inTitle ? TITLE_MATCH_WEIGHT : 0) + contentCount * CONTENT_MATCH_WEIGHT;
			}

			if (matchedAllTokens) {
				matches.push({ document: entry.document, score });
			}
		}

		matches.sort((a, b) => b.score - a.score || a.document.title.localeCompare(b.document.title));

		const total = matches.length;
		const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
		const page = total === 0 ? 1 : Math.min(Math.max(1, requestedPage), totalPages);
		const start = (page - 1) * limit;
		const pageMatches = matches.slice(start, start + limit);

		const results: SearchResult<T>[] = pageMatches.map(({ document, score }) => {
			const { content, ...rest } = document;
			return { ...rest, snippet: buildSnippet(content, queryTokens), score };
		});

		return { query, page, pageSize: limit, total, totalPages, results };
	}

	return { search };
}
