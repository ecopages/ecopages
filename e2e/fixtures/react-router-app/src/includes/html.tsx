import { eco } from '@ecopages/core';
import type { HtmlTemplateProps } from '@ecopages/core';
import type { ReactNode } from 'react';
import { Head } from '@/includes/head';
import { EcoPropsScript } from '@ecopages/react-router';

const HtmlTemplate = eco.component<HtmlTemplateProps, ReactNode>({
	dependencies: {
		components: [Head],
	},

	render: ({ children, metadata, headContent, language = 'en', pageProps }) => (
		<html lang={language}>
			<Head metadata={metadata}>
				{headContent}
				<EcoPropsScript data={pageProps} />
			</Head>
			<body>{children}</body>
		</html>
	),
});

export default HtmlTemplate;
