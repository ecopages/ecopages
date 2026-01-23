export type Post = {
	slug: string;
	title: string;
	content: string;
};

export const posts: Post[] = [
	{ slug: 'hello-world', title: 'Hello World', content: 'This is the first post using explicit routing!' },
	{
		slug: 'ecopages-rocks',
		title: 'Ecopages Rocks',
		content: 'Building static sites with dynamic capabilities is fun.',
	},
];
