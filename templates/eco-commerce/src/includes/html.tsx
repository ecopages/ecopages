import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { Head } from '@/includes/head';

export default eco.html<JsxRenderable>({
	render: ({ children, metadata, headContent, language = 'en' }) => (
		<html lang={language}>
			<Head metadata={metadata}>{headContent}</Head>
			{children as 'safe'}
		</html>
	),
});
