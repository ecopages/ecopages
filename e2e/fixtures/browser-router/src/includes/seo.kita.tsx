import type { PageMetadataProps } from '@ecopages/core';

export function Seo({ title, description }: PageMetadataProps) {
	return (
		<>
			<title>{title}</title>
			<meta name="description" content={description} />
		</>
	);
}
