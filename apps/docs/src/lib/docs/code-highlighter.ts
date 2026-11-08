import { createHighlighter } from 'shiki';
import type { RadiantCodeTabItem } from '@/components/code-tabs/code-tabs.script';
import { readSnippet } from './snippet-include';

import { DOCS_SHIKI_THEMES } from './shiki-themes';

const SHELL_LANG = 'shellscript';
const DEFAULT_LANG = 'tsx';
const PRELOADED_LANGS = [SHELL_LANG, DEFAULT_LANG, 'typescript', 'javascript', 'json', 'css', 'html', 'jsonc', 'mdx'];

const LANG_BY_EXTENSION: Record<string, string> = {
	ts: 'typescript',
	tsx: 'tsx',
	js: 'javascript',
	jsx: 'jsx',
	mjs: 'javascript',
	json: 'json',
	css: 'css',
	html: 'html',
	mdx: 'mdx',
	sh: SHELL_LANG,
};

const SHELL_COMMAND = /^\s*(?:\$\s*)?(?:npm|npx|pnpm|pnpx|yarn|bun|bunx|deno|node|git|cd|curl|echo|ecopages)\b/;

const highlighter = await createHighlighter({
	themes: Object.values(DOCS_SHIKI_THEMES),
	langs: PRELOADED_LANGS,
});

/**
 * Picks the language of a tab: an explicit `lang`, then the extension of a file-like label, then shell
 * for install commands, and `tsx` otherwise.
 */
export function inferTabLang(tab: { label: string; code: string; lang?: string }): string {
	if (tab.lang) {
		return tab.lang;
	}
	const extension = tab.label.match(/\.([a-z]+)$/i)?.[1]?.toLowerCase();
	if (extension && LANG_BY_EXTENSION[extension]) {
		return LANG_BY_EXTENSION[extension];
	}
	return SHELL_COMMAND.test(tab.code) ? SHELL_LANG : DEFAULT_LANG;
}

/**
 * A tab whose source lives in a repository file, as `file` plus an optional `#region`, like a fenced
 * block's `file="..."`.
 *
 * @remarks
 * MDX removes up to two columns of indentation from every continuation line of a template literal, so
 * indented code cannot be written reliably in a `code` prop. A `file` tab keeps it exact.
 */
export type CodeTabFileSource = { id: string; label: string; file: string; region?: string; lang?: string };

/** What a `CodeTabs` page may pass: a tab as the component takes it, or one read from a file. */
export type CodeTabSource = RadiantCodeTabItem | CodeTabFileSource;

/**
 * Highlights one tab with the shared Shiki instance, wrapped in the figure that styles fenced blocks.
 *
 * @remarks
 * Runs on the server only. The result is a rich tab: `html` is the markup and `content` the exact source
 * the Copy button writes, so indentation and line breaks survive in both.
 */
export function highlightCodeTab(
	source: Extract<RadiantCodeTabItem, { code: string }> | CodeTabFileSource,
): Extract<RadiantCodeTabItem, { html: string }> {
	const tab =
		'file' in source
			? { ...source, code: readSnippet({ file: source.file, region: source.region }) }
			: source;
	const lang = inferTabLang(tab);
	const html = highlighter.codeToHtml(tab.code, {
		lang: highlighter.getLoadedLanguages().includes(lang) ? lang : 'text',
		themes: DOCS_SHIKI_THEMES,
		defaultColor: false,
	});

	return {
		id: tab.id,
		label: tab.label,
		html: `<figure data-rehype-pretty-code-figure>${html}</figure>`,
		content: tab.code,
	};
}
