import { faker } from '@faker-js/faker';
import { auth } from './auth.server';
import { db } from './db.server';
import { posts } from './schema';

const adminUser = await auth.api.signUpEmail({
	body: {
		email: 'admin@test.com',
		password: 'password',
		name: 'Admin User',
	},
});

await db.insert(posts).values(
	Array.from({ length: 10 }, () => ({
		title: faker.lorem.sentence(),
		slug: faker.lorem.slug(),
		content: faker.lorem.paragraphs(3),
		excerpt: faker.lorem.paragraph(),
		published_at: faker.date.past(),
		authorId: adminUser.user.id,
	})),
);

console.log('Seeded 10 posts. Sign in as admin@test.com / password');
