import type { PageProps } from '@ecopages/core';

export default function BlogPost({ params, query }: PageProps) {
	return (
		<div>
			<h1 safe>
				Catch All {JSON.stringify(params || [])} {JSON.stringify(query || [])}
			</h1>
		</div>
	);
}
