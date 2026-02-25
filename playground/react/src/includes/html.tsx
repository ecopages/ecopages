import { eco } from '@ecopages/core';
import type { HtmlTemplateProps } from '@ecopages/core';
import type { ReactNode } from 'react';
import { Head } from '@/includes/head';
import { EcoPropsScript } from '@ecopages/react-router';

const HtmlTemplate = eco.component<HtmlTemplateProps, ReactNode>({
	dependencies: {
		components: [Head],
	},

	render: ({ children, metadata, headContent, pageProps, language = 'en' }) => {
		return (
			<html lang={language as string}>
				<Head metadata={metadata}>
					{headContent}
					<EcoPropsScript data={pageProps} />
				</Head>
				{children as ReactNode}
			</html>
		);
	},
});

export default HtmlTemplate;
