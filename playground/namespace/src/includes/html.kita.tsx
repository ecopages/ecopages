import type { EcoComponent, HtmlTemplateProps } from '@ecopages/core';
import { Head } from '@/includes/head.kita';

const HtmlTemplate: EcoComponent<HtmlTemplateProps, string> = ({
	children,
	metadata,
	headContent,
	language = 'en',
}) => (
	<html lang={language}>
		<Head metadata={metadata}>{headContent as 'safe'}</Head>
		<body>{children as 'safe'}</body>
	</html>
);

HtmlTemplate.config = {
	dependencies: {
		components: [Head],
	},
};

export default HtmlTemplate;
