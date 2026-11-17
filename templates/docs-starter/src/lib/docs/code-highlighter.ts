import type { RadiantCodeTabItem } from '@/components/code-tabs/code-tabs.script';
import { highlightToHtml } from './pierre-highlight';

const SHELL_LANG = 'shellscript';
const DEFAULT_LANG = 'tsx';

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

/** What a `CodeTabs` page may pass: a tab as the component takes it. */
export type CodeTabSource = RadiantCodeTabItem;

/**
 * Highlights one tab with Pierre, wrapped in the figure that styles fenced blocks.
 *
 * @remarks
 * Runs on the server only. The result is a rich tab: `html` is the markup and `content` the exact source
 * the Copy button writes, so indentation and line breaks survive in both. Only inline tabs
 * are supported.
 */
export function highlightCodeTab(
	tab: Extract<RadiantCodeTabItem, { code: string }>,
): Extract<RadiantCodeTabItem, { html: string }> {
	const lang = inferTabLang(tab);
	const html = highlightToHtml(tab.code, lang);

	return {
		id: tab.id,
		label: tab.label,
		html: `<figure data-rehype-pretty-code-figure>${html}</figure>`,
		content: tab.code,
	};
}
