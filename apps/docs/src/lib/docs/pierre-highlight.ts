import { codeToTokens, isSupportedLanguage, type Lang, type ThemedToken } from '@pierre/highlights';
import { darkPlus, lightPlus } from '@pierre/highlights/themes';

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };

export type HighlightedCode = {
	/** One entry per source line, each a list of colored runs. */
	lines: ThemedToken[][];
	/** The `--shiki-*` custom properties for the foreground and background of both themes, as a `style` value. */
	rootStyle: string;
};

/**
 * Returns the fence language when Pierre has a grammar or alias for it, and `text` otherwise.
 *
 * @remarks
 * Pierre throws on a language it does not know, and a docs page must still render a block whose language is a typo
 * or has no grammar, so the unknown names fall back to unhighlighted text instead of failing the build.
 */
export function resolveLanguage(name: string | undefined): Lang {
	return name && isSupportedLanguage(name) ? name : 'text';
}

/**
 * Tokenizes code with the VS Code Light+ and Dark+ pair, naming the colors `--shiki-light` and `--shiki-dark`.
 *
 * @remarks
 * The custom property prefix is `--shiki-` because the docs stylesheet, written for Shiki's multi-theme output,
 * selects those names. `codeToHtml` is not used because it emits no line elements, and the stylesheet lays the lines
 * out as a grid of `.line` spans. One final newline is dropped first, because Pierre would return an empty last line
 * for it and a numbered gutter would draw it as a line of its own.
 */
export function highlightCode(source: string, language: string | undefined): HighlightedCode {
	const { tokens, rootStyle } = codeToTokens(source.replace(/\n$/, ''), {
		lang: resolveLanguage(language),
		themes: { light: lightPlus, dark: darkPlus },
		defaultColor: false,
		cssVariablePrefix: '--shiki-',
	});
	return { lines: tokens, rootStyle: rootStyle ?? '' };
}

/** The `style` value of a token: its theme colors and font flags as CSS declarations. */
export function tokenStyle(token: ThemedToken): string {
	return Object.entries(token.htmlStyle ?? {})
		.map(([property, value]) => `${property}:${value}`)
		.join(';');
}

const escapeHtml = (text: string) => text.replace(/[&<>]/g, (character) => ESCAPES[character]);

/** Highlights code into a `pre > code` string whose lines are `.line` spans, for pages that build their markup as text. */
export function highlightToHtml(source: string, language: string | undefined): string {
	const { lines, rootStyle } = highlightCode(source, language);
	const rendered = lines.map((line) => {
		const tokens = line.map((token) => `<span style="${tokenStyle(token)}">${escapeHtml(token.content)}</span>`);
		return `<span class="line">${tokens.join('')}</span>`;
	});
	return `<pre style="${rootStyle}" tabindex="0"><code>${rendered.join('\n')}</code></pre>`;
}
