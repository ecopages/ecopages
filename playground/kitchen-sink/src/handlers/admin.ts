import crypto from 'node:crypto';
import { defineGroupHandler } from '@ecopages/core';
import { z } from 'zod';
import { liveAnnouncements } from '@/data/demo-data';
import { adminOnlyMiddleware, requestInfoMiddleware } from './demo-middleware';

const adminHeadersSchema = z.object({
	'x-kitchen-role': z.enum(['admin', 'viewer']).optional(),
});

const createAnnouncementSchema = z.object({
	title: z.string().trim().min(1),
	message: z.string().trim().min(1),
});

export const adminGroup = defineGroupHandler({
	prefix: '/api/v1/admin',
	middleware: [requestInfoMiddleware, adminOnlyMiddleware],
	routes: (define) => [
		define({
			path: '/announcements',
			method: 'GET',
			schema: {
				headers: adminHeadersSchema,
			},
			handler: async ({ locals, response }) => {
				return response.json({
					announcements: liveAnnouncements,
					requestId: locals.requestInfo?.requestId,
				});
			},
		}),
		define({
			path: '/announcements',
			method: 'POST',
			schema: {
				body: createAnnouncementSchema,
				headers: adminHeadersSchema,
			},
			handler: async ({ body, locals, response }) => {
				const { title, message } = body;

				const announcement = {
					createdAt: new Date().toISOString(),
					createdBy: locals.viewerRole ?? 'admin',
					id: crypto.randomUUID().slice(0, 8),
					message,
					title,
				};

				liveAnnouncements.unshift(announcement);

				return response.status(201).json(announcement);
			},
		}),
	],
});
