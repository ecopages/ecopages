import type { EcoComponent, EcoPagesElement, HtmlTemplateProps } from '@ecopages/core';
import { Head } from '@/includes/head.kita';

const HtmlTemplate: EcoComponent<HtmlTemplateProps, EcoPagesElement> = ({
	children,
	metadata,
	headContent,
	language = 'en',
}) => {
	return (
		<html lang={language}>
			<Head metadata={metadata}>{headContent}</Head>
			<body>{children as 'safe'}</body>
		</html>
	);
};

HtmlTemplate.config = {
	dependencies: {
		components: [Head],
	},
};

export default HtmlTemplate;
