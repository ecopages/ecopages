import { HttpError } from '@ecopages/core/errors';
import { dbService } from '@/lib/db';
import { AdminPostList } from '@/views/admin/post-list.kita';
import { PostEditor } from '@/views/admin/post-editor.kita';
import path from 'node:path';
import { ImageProcessor } from '@ecopages/image-processor';
import { imageProcessorConfig } from '../../eco.config';
import type { BunHandlerContext } from '@ecopages/core/adapters/bun';
import type { Session } from './auth';

type AuthenticatedContext = BunHandlerContext<{ session: Session }>;

const imageProcessor = new ImageProcessor(imageProcessorConfig, {
	readCache: async () => null,
	writeCache: async () => {},
});

export async function uploadImage(ctx: AuthenticatedContext) {
	const formData = await ctx.request.formData();
	const file = formData.get('file');

	if (!file || !(file instanceof Blob)) {
		throw new Error('No file uploaded');
	}

	const buffer = await file.arrayBuffer();
	const ext = path.extname(file.name || '') || '.png';
	const timestamp = Date.now();
	const randomId = Math.random().toString(36).slice(2);
	const filename = `${timestamp}-${randomId}${ext}`;

	const uploadPath = path.join(process.cwd(), 'src/images', filename);

	await Bun.write(uploadPath, buffer);

	const result = await imageProcessor.processImage(uploadPath);

	if (!result) {
		throw new Error('Failed to process image');
	}

	return Response.json({ url: result.attributes.src });
}

export async function list(ctx: AuthenticatedContext) {
	const posts = await dbService.getAllPosts();
	return ctx.render(AdminPostList, { posts });
}

export async function newPost(ctx: AuthenticatedContext) {
	return ctx.render(PostEditor, {});
}

export async function createPost(ctx: AuthenticatedContext) {
	const formData = await ctx.request.formData();
	const session = ctx.session;
	dbService.createPost({
		title: formData.get('title') as string,
		slug: formData.get('slug') as string,
		content: formData.get('content') as string,
		excerpt: formData.get('excerpt') as string,
		authorId: session.user.id,
	});
	return Response.redirect('/admin');
}

export async function editPost(ctx: AuthenticatedContext) {
	const id = Number.parseInt((ctx.request as any).params.id);
	const posts = await dbService.getAllPosts();
	const post = posts.find((p) => p.id === id);
	if (!post) throw HttpError.NotFound('Post not found');
	return ctx.render(PostEditor, { post });
}

export async function updatePost(ctx: AuthenticatedContext) {
	const id = Number.parseInt((ctx.request as any).params.id);
	const body = await ctx.request.formData();
	dbService.updatePost(id, {
		title: body.get('title') as string,
		slug: body.get('slug') as string,
		content: body.get('content') as string,
		excerpt: body.get('excerpt') as string,
	});
	return Response.redirect('/admin');
}

export async function deletePost(ctx: AuthenticatedContext) {
	const id = Number.parseInt((ctx.request as any).params.id);
	dbService.deletePost(id);
	return Response.redirect('/admin');
}
