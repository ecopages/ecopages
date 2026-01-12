import { eco } from '@ecopages/core';
import type { HtmlTemplateProps } from '@ecopages/core';
import type { ReactNode } from 'react';
import { Head } from '@/includes/head';

const HtmlTemplate = eco.component<HtmlTemplateProps, ReactNode>({
	dependencies: {
		components: [Head],
	},

	render: ({ children, metadata, headContent, language = 'en' }) => {
		return (
			<html lang={language}>
				<Head metadata={metadata}>{headContent}</Head>
				{children}
			</html>
		);
	},
});

export default HtmlTemplate;
