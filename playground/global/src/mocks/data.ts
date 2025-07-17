import { faker } from '@faker-js/faker';

export const blogPosts = Array.from({ length: 10 }, (_, index) => ({
	slug: `post-${index + 1}`,
	title: faker.book.title(),
	text: faker.lorem.paragraphs(3),
	authorId: faker.person.fullName(),
}));

export const authors = Array.from({ length: 10 }, (_, index) => ({
	id: `author-${index + 1}`,
	slug: faker.lorem.slug({ min: 1, max: 3 }),
	name: faker.person.fullName(),
	bio: faker.lorem.paragraphs(1),
}));

export const getBlogPost = (slug: string) => {
	return blogPosts.find((post) => post.slug === slug);
};

export const getAuthor = (id: string) => {
	return authors.find((author) => author.id === id);
};

export const getAllBlogPostSlugs = () => {
	return blogPosts.map((post) => ({ params: { slug: post.slug } }));
};

export const getAllAuthorIds = () => {
	return authors.map((author) => ({ params: { id: author.id } }));
};
