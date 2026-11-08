import { eco } from '@ecopages/core';
import type { HtmlTemplateProps } from '@ecopages/core';
import type { ReactNode } from 'react';
import { escapePageDataJson } from '@ecopages/react/serialize-page-data-script';
import { Head } from '@/includes/head';

const HtmlTemplate = eco.component<HtmlTemplateProps, ReactNode>({
	dependencies: {
		components: [Head],
	},

	render: ({ children, metadata, headContent, language = 'en', pageProps }) => (
		<html lang={language}>
			<Head metadata={metadata}>{headContent}</Head>
			<body>
				<script
					id="__ECO_PAGE_DATA__"
					type="application/json"
					dangerouslySetInnerHTML={{ __html: escapePageDataJson(pageProps) }}
				/>
				{children}
			</body>
		</html>
	),
});

export default HtmlTemplate;
