import type { EcoComponent, PageMetadataProps } from '@ecopages/core';
import type { ReactNode } from 'react';

export const Seo: EcoComponent<PageMetadataProps, ReactNode> = ({ title, description }) => {
	return (
		<>
			<title>{title}</title>
			<meta name="description" content={description} />
		</>
	);
};
