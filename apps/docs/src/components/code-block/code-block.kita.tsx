import type { EcoComponent } from '@ecopages/core';
import { type BundledLanguage, type BundledTheme, codeToHtml } from 'shiki';

export const CodeBlock: EcoComponent<{
	children?: string;
	code?: string;
	lang?: BundledLanguage;
	theme?: BundledTheme;
}> = async ({ children, code, lang, theme = 'dark-plus' }) => {
	const childrenOrCode = children || code;
	if (!childrenOrCode) throw new Error('No code provided');

	const getCodeLanguageFromString = (code: string) => {
		const match = code.match(/class="language-(\w+)"/);
		return match ? match[1] : 'typescript';
	};

	const getCodeWithinCodeTag = (code: string) => {
		const match = code.match(/<code[^>]*>([\s\S]*?)<\/code>/);
		return match ? match[1] : code;
	};

	const language = lang || getCodeLanguageFromString(childrenOrCode);

	const unformattedCode = getCodeWithinCodeTag(childrenOrCode);

	const safeHtml = await codeToHtml(unformattedCode, {
		lang: language,
		theme,
	});

	return <div class="code-block">{safeHtml as 'safe'}</div>;
};

CodeBlock.config = { importMeta: import.meta, dependencies: { stylesheets: ['./code-block.css'] } };
