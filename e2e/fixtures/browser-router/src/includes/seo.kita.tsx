import { eco } from '@ecopages/core';
import type { PageMetadataProps } from '@ecopages/core';

export const Seo = eco.component<PageMetadataProps>({
	render: ({ title, description }) => (
		<>
			<title>{title}</title>
			<meta name="description" content={description} />
		</>
	),
});
