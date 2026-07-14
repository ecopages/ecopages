import { codeToHtml } from 'shiki';
import { componentExampleCode, configExampleCode, pageExampleCode } from './examples.ts';

export { componentExampleCode, configExampleCode, pageExampleCode } from './examples.ts';

export const configExample = await codeToHtml(configExampleCode, {
	lang: 'tsx',
	themes: { light: 'light-plus', dark: 'dark-plus' },
	defaultColor: false,
});

export const componentExample = await codeToHtml(componentExampleCode, {
	lang: 'tsx',
	themes: { light: 'light-plus', dark: 'dark-plus' },
	defaultColor: false,
});

export const pageExample = await codeToHtml(pageExampleCode, {
	lang: 'tsx',
	themes: { light: 'light-plus', dark: 'dark-plus' },
	defaultColor: false,
});
