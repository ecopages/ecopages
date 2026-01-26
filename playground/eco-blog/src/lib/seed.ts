import { faker } from '@faker-js/faker';
import { db } from './shared-db';
import { posts } from './schema';
import { logger } from './logger';
import { auth } from './auth';

async function seed() {
	logger.info('Seeding database...');

	try {
		const adminUser = await auth.api.signUpEmail({
			body: {
				email: 'admin@test.com',
				password: 'password',
				name: 'Admin User',
			},
		});

		logger.info('Admin user created: admin@test.com / password');

		const newPosts: (typeof posts.$inferInsert)[] = [];

		for (let i = 0; i < 10; i++) {
			newPosts.push({
				title: faker.lorem.sentence(),
				slug: faker.lorem.slug(),
				content: faker.lorem.paragraphs(3),
				excerpt: faker.lorem.paragraph(),
				published_at: faker.date.past(),
				authorId: adminUser.user.id,
			});
		}

		await db.insert(posts).values(newPosts);

		logger.info('Seeding completed successfully');
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.error('Seeding failed:', errorMessage);
		process.exit(1);
	}
}

seed();
