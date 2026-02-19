import { eco } from '@ecopages/core';
import { BaseLayout } from '@/layouts/base-layout';
import { getAllAuthorIds, getAuthor } from '@/mocks/data';

type AuthorProps = {
	slug: string;
	name: string;
	bio: string;
};

export default eco.page<AuthorProps>({
	dependencies: {
		components: [BaseLayout],
	},

	staticPaths: async () => {
		return { paths: getAllAuthorIds() };
	},

	staticProps: async ({ pathname }) => {
		const id = pathname.params.id as string;
		const author = getAuthor(id);
		if (!author) throw new Error(`Author with id "${id}" not found`);
		return {
			props: {
				slug: author.slug,
				name: author.name,
				bio: author.bio,
			},
		};
	},

	metadata: async ({ props: { name, slug } }) => {
		return {
			title: `Author | ${slug}`,
			description: `This is the bio of ${name}`,
		};
	},

	layout: BaseLayout,

	render: ({ params, query, name, bio, slug }) => {
		return (
			<div>
				<h1 safe>
					Author {params?.id} {JSON.stringify(query || [])}
				</h1>
				<h2 safe>{name}</h2>
				<p safe>{bio}</p>
				<p safe>{slug}</p>
			</div>
		);
	},
});
