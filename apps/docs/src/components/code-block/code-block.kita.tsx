import type { EcoComponent } from '@ecopages/core';
import { type BundledLanguage, codeToHtml } from 'shiki';

export const CodeBlock: EcoComponent<{
	children?: string;
	code?: string;
	lang?: BundledLanguage;
}> = async ({ children, code, lang }) => {
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

	const unformattedCode = getCodeWithinCodeTag(childrenOrCode).trim();

	const safeHtml = await codeToHtml(unformattedCode, {
		lang: language,
		themes: {
			light: 'light-plus',
			dark: 'dark-plus',
		},
	});

	return <div class="code-block">{safeHtml as 'safe'}</div>;
};

CodeBlock.config = {
	dependencies: {
		stylesheets: ['./code-block.css'],
	},
};
