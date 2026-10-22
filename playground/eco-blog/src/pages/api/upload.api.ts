import path from 'node:path';
import { definePost } from '@ecopages/core';
import { HttpError } from '@ecopages/core/errors';
import { fileSystem } from '@ecopages/file-system';
import { ImageProcessor } from '@ecopages/image-processor';
import { requireSession } from '@/lib/require-session.server';
import { imageProcessorConfig } from '../../../eco.config';

const imageProcessor = new ImageProcessor(imageProcessorConfig, {
	readCache: async () => null,
	writeCache: async () => {},
});

export const POST = definePost({
	middleware: [requireSession],
	handler: async ({ request, response }) => {
		const file = (await request.formData()).get('file');
		if (!(file instanceof File)) throw HttpError.BadRequest('No file uploaded');

		const filename = `${Date.now()}-${crypto.randomUUID()}${path.extname(file.name) || '.png'}`;
		const uploadPath = path.join(imageProcessorConfig.sourceDir, filename);
		await fileSystem.writeAsync(uploadPath, Buffer.from(await file.arrayBuffer()));

		const result = await imageProcessor.processImage(uploadPath);
		if (!result) throw new Error(`Image processing returned nothing for ${filename}`);

		return response.json({ url: result.attributes.src });
	},
});
