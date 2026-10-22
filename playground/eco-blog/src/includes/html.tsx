import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { Head } from '@/includes/head';

/** Radiant UI themes switch on the `dark` class; keep it in step with the system preference. */
const themeScript = `(()=>{const m=matchMedia('(prefers-color-scheme: dark)');const a=()=>document.documentElement.classList.toggle('dark',m.matches);a();m.addEventListener('change',a);})();`;

export default eco.html<JsxRenderable>({
	dependencies: {
		scripts: [{ content: themeScript }],
	},
	render: ({ children, metadata, headContent, language = 'en' }) => (
		<html lang={language}>
			<Head metadata={metadata}>{headContent}</Head>
			{children}
		</html>
	),
});
