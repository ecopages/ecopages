import type { EcoComponent, PageMetadataProps } from '@ecopages/core';
import type { JSX } from 'react';

export const Seo: EcoComponent<PageMetadataProps, JSX.Element> = ({ title, description, keywords }) => {
	return (
		<>
			<title>{title}</title>
			{description && <meta name="description" content={description} />}
			{keywords && <meta name="keywords" content={keywords.join(', ')} />}
		</>
	);
};
