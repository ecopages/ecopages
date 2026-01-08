import type { EcoComponent, HtmlTemplateProps } from '@ecopages/core';
import type { JSX } from 'react';
import { Head } from '@/includes/head';
import { EcoPropsScript } from '@/lib/react-router';

const HtmlTemplate: EcoComponent<HtmlTemplateProps, JSX.Element> = ({
	children,
	metadata,
	headContent,
	language = 'en',
	pageProps,
}) => {
	return (
		<html lang={language}>
			<Head metadata={metadata}>{headContent}</Head>
			<EcoPropsScript data={pageProps} />
			{children}
		</html>
	);
};

HtmlTemplate.config = {
	dependencies: {
		components: [Head],
	},
};

export default HtmlTemplate;
