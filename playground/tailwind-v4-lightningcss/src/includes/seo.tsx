import type { EcoComponent, PageMetadataProps } from '@ecopages/core';
import type { ReactNode } from 'react';

export const Seo: EcoComponent<PageMetadataProps, ReactNode> = ({ title, description, keywords }) => {
	return (
		<>
			<title>{title}</title>
			{description && <meta name="description" content={description} />}
			{keywords && <meta name="keywords" content={keywords.join(', ')} />}
		</>
	);
};
