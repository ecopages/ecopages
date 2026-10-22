import { expect, test, type Page } from '@playwright/test';

async function signIn(page: Page) {
	await page.goto('/login');
	await page.getByLabel('Email').fill('admin@test.com');
	await page.getByLabel('Password').fill('password');
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).toHaveURL(/\/admin$/);
}

async function findPostId(page: Page, postSlug: string) {
	await page.goto('/admin');
	const href = await page
		.locator('tr', { hasText: postSlug })
		.getByRole('link', { name: /^Edit/ })
		.getAttribute('href');
	return Number(href?.split('/').pop());
}

test.describe('Public blog', () => {
	test('lists the seeded posts and opens one', async ({ page }) => {
		await page.goto('/');
		const firstPost = page.locator('.post-card__link').first();
		const title = (await firstPost.textContent())?.trim() ?? '';

		await firstPost.click();

		await expect(page).toHaveURL(/\/posts\/[a-z0-9-]+$/);
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
	});

	test('answers 404 for an unknown post', async ({ request }) => {
		expect((await request.get('/posts/no-such-post')).status()).toBe(404);
	});

	test('sends a signed-out visitor from the admin to the login page', async ({ page }) => {
		await page.goto('/admin');
		await expect(page).toHaveURL(/\/login$/);
	});

	test('rejects an admin write without a session', async ({ request }) => {
		const response = await request.post('/api/posts', { form: { title: 'x' }, maxRedirects: 0 });
		expect(response.status()).toBe(303);
		expect(response.headers().location).toMatch(/\/login$/);
	});
});

test.describe.serial('Admin', () => {
	const slug = `e2e-${Date.now()}`;
	let page: Page;

	test.beforeAll(async ({ browser }) => {
		page = await browser.newPage();
		await signIn(page);
	});

	test.afterAll(async () => {
		await page.close();
	});

	test('creates a post that the home page lists at once', async () => {
		await page.goto('/admin/new');
		await page.getByLabel('Title').fill(`Written in e2e ${slug}`);
		await page.getByLabel('Slug').fill(slug);
		await page.locator('.ProseMirror').click();
		await page.keyboard.type('Hello from the e2e suite.');
		await page.getByRole('button', { name: 'Publish post' }).click();

		await expect(page).toHaveURL(/\/admin$/);
		await page.goto('/');
		await expect(page.getByRole('link', { name: `Written in e2e ${slug}` })).toBeVisible();
		await page.goto(`/posts/${slug}`);
		await expect(page.getByText('Hello from the e2e suite.')).toBeVisible();
	});

	test('edits the post', async () => {
		await page.goto('/admin');
		await page.locator('tr', { hasText: slug }).getByRole('link', { name: /^Edit/ }).click();
		await page.getByLabel('Title').fill(`Edited in e2e ${slug}`);
		await page.getByRole('button', { name: 'Update post' }).click();

		await expect(page).toHaveURL(/\/admin$/);
		await page.goto(`/posts/${slug}`);
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Edited in e2e ${slug}`);
	});

	test('renders a post body as Markdown without running HTML from it', async () => {
		const unsafeSlug = `${slug}-unsafe`;
		await page.request.post('/api/posts', {
			form: {
				title: 'Unsafe body',
				slug: unsafeSlug,
				content:
					'# Heading\n\n<script>window.__injected = true</script>\n\n[bad](javascript:alert(1)) [good](https://ecopages.app)',
			},
			maxRedirects: 0,
		});

		await page.goto(`/posts/${unsafeSlug}`);
		await expect(page.getByRole('heading', { level: 2, name: 'Heading' })).toBeVisible();
		await expect(page.getByText('<script>window.__injected = true</script>')).toBeVisible();
		expect(
			await page.evaluate(() => 'window.__injected' in window && (window as { __injected?: boolean }).__injected),
		).toBeFalsy();
		await expect(page.getByRole('link', { name: 'good' })).toHaveAttribute('href', 'https://ecopages.app');
		await expect(page.locator('.post__body a', { hasText: 'bad' })).not.toHaveAttribute('href', /.*/);

		await page.request.post(`/api/posts/${await findPostId(page, unsafeSlug)}/delete`, { maxRedirects: 0 });
	});

	test('answers 400 for an invalid slug', async () => {
		const response = await page.request.post('/api/posts', {
			form: { title: 'Bad', slug: 'Not A Slug', content: 'x' },
			maxRedirects: 0,
		});
		expect(response.status()).toBe(400);
	});

	test('deletes the post', async () => {
		await page.goto('/admin');
		page.once('dialog', (dialog) => dialog.accept());
		await page
			.locator('tr', { hasText: slug })
			.getByRole('button', { name: /^Delete/ })
			.click();

		await expect(page).toHaveURL(/\/admin$/);
		await expect(page.locator('tr', { hasText: slug })).toHaveCount(0);
		expect((await page.request.get(`/posts/${slug}`)).status()).toBe(404);
		await page.goto('/');
		await expect(page.getByRole('link', { name: `Edited in e2e ${slug}` })).toHaveCount(0);
	});
});
