import { defineApiHandler } from '@ecopages/core';
import { HttpError } from '@ecopages/core/errors';
import { z } from 'zod';
import { releaseNotes, showcasePatterns } from '@/data/demo-data';
import { requestInfoMiddleware } from './demo-middleware';

const viewerHeadersSchema = z.object({
	'x-kitchen-role': z.enum(['admin', 'viewer']).optional(),
});

const echoBodySchema = z.object({
	message: z.string().trim().min(1),
	source: z.string().trim().min(1).optional(),
});

const catalogParamsSchema = z.object({
	slug: z.string().trim().min(1),
});

export const ping = defineApiHandler({
	path: '/api/v1/ping',
	method: 'GET',
	middleware: [requestInfoMiddleware],
	schema: {
		headers: viewerHeadersSchema,
	},
	handler: async ({ locals, response }) => {
		return response.json({
			featureFlags: locals.featureFlags,
			ok: true,
			request: locals.requestInfo,
			role: locals.viewerRole,
		});
	},
});

export const echo = defineApiHandler({
	path: '/api/v1/echo',
	method: 'POST',
	middleware: [requestInfoMiddleware],
	schema: {
		body: echoBodySchema,
		headers: viewerHeadersSchema,
	},
	handler: async ({ body, locals, response }) => {
		return response.status(201).json({
			received: body,
			requestId: locals.requestInfo?.requestId,
			sampleCurl:
				'curl -X POST http://localhost:3000/api/v1/echo -H \'content-type: application/json\' -d \'{"message":"hello"}\'',
		});
	},
});

export const catalog = defineApiHandler({
	path: '/api/v1/catalog/:slug',
	method: 'GET',
	middleware: [requestInfoMiddleware],
	schema: {
		params: catalogParamsSchema,
		headers: viewerHeadersSchema,
	},
	handler: async ({ params, response }) => {
		const pattern = showcasePatterns.find((entry) => entry.slug === params.slug);

		if (!pattern) {
			throw HttpError.NotFound('Pattern not found');
		}

		const relatedRelease = releaseNotes.find((release) => release.slug.includes(pattern.slug.split('-')[0] ?? ''));

		return response.json({
			pattern,
			relatedRelease,
		});
	},
});
