import type { EcoComponent, EcoPagesElement, PageHeadProps } from '@ecopages/core';
import { Seo } from '@/includes/seo.kita';

export const Head: EcoComponent<PageHeadProps<EcoPagesElement>, EcoPagesElement> = ({ metadata, children }) => {
	return (
		<head>
			<meta charset="UTF-8" />
			<meta name="viewport" content="width=device-width, initial-scale=1" />
			<Seo {...metadata} />
			{children}
		</head>
	);
};
