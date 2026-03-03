import { eco } from '@ecopages/core';
import type { EcoPagesElement, PageMetadataProps } from '@ecopages/core';

type SeoProps = {
	metadata: PageMetadataProps;
};

export const Seo = eco.component<SeoProps, EcoPagesElement>({
	render: ({ metadata }) => {
		return (
			<>
				<title>{metadata.title}</title>
				<meta name="description" content={metadata.description} />
			</>
		);
	},
});
