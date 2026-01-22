import { describe, expect, test } from 'bun:test';
import { HttpError } from './http-error.ts';

describe('HttpError', () => {
	describe('constructor', () => {
		test('creates error with status and message', () => {
			const error = new HttpError(400, 'Bad request');

			expect(error).toBeInstanceOf(Error);
			expect(error).toBeInstanceOf(HttpError);
			expect(error.status).toBe(400);
			expect(error.message).toBe('Bad request');
			expect(error.name).toBe('HttpError');
			expect(error.details).toBeUndefined();
		});

		test('creates error with details', () => {
			const details = { field: 'email', reason: 'invalid format' };
			const error = new HttpError(400, 'Validation failed', details);

			expect(error.details).toEqual(details);
		});
	});

	describe('toJSON', () => {
		test('serializes error without details', () => {
			const error = new HttpError(404, 'Not found');

			expect(error.toJSON()).toEqual({
				error: 'Not found',
				status: 404,
			});
		});

		test('serializes error with details', () => {
			const details = { body: [{ path: ['title'], message: 'Required' }] };
			const error = new HttpError(400, 'Validation failed', details);

			expect(error.toJSON()).toEqual({
				error: 'Validation failed',
				status: 400,
				details,
			});
		});
	});

	describe('toResponse', () => {
		test('creates Response with correct status and body', async () => {
			const error = new HttpError(403, 'Access denied');
			const response = error.toResponse();

			expect(response).toBeInstanceOf(Response);
			expect(response.status).toBe(403);
			expect(response.headers.get('content-type')).toContain('application/json');

			const body = await response.json();
			expect(body).toEqual({ error: 'Access denied', status: 403 });
		});
	});

	describe('factory methods', () => {
		test('BadRequest creates 400 error', () => {
			const error = HttpError.BadRequest();
			expect(error.status).toBe(400);
			expect(error.message).toBe('Bad Request');
		});

		test('BadRequest accepts custom message and details', () => {
			const details = { field: 'name' };
			const error = HttpError.BadRequest('Invalid input', details);

			expect(error.message).toBe('Invalid input');
			expect(error.details).toEqual(details);
		});

		test('Unauthorized creates 401 error', () => {
			const error = HttpError.Unauthorized();
			expect(error.status).toBe(401);
			expect(error.message).toBe('Unauthorized');
		});

		test('Unauthorized accepts custom message', () => {
			const error = HttpError.Unauthorized('Token expired');
			expect(error.message).toBe('Token expired');
		});

		test('Forbidden creates 403 error', () => {
			const error = HttpError.Forbidden();
			expect(error.status).toBe(403);
			expect(error.message).toBe('Forbidden');
		});

		test('Forbidden accepts custom message', () => {
			const error = HttpError.Forbidden('Admin access required');
			expect(error.message).toBe('Admin access required');
		});

		test('NotFound creates 404 error', () => {
			const error = HttpError.NotFound();
			expect(error.status).toBe(404);
			expect(error.message).toBe('Not Found');
		});

		test('NotFound accepts custom message', () => {
			const error = HttpError.NotFound('Post not found');
			expect(error.message).toBe('Post not found');
		});

		test('Conflict creates 409 error', () => {
			const error = HttpError.Conflict();
			expect(error.status).toBe(409);
			expect(error.message).toBe('Conflict');
		});

		test('Conflict accepts custom message and details', () => {
			const details = { resource: 'user', conflict: 'email already exists' };
			const error = HttpError.Conflict('Resource conflict', details);

			expect(error.message).toBe('Resource conflict');
			expect(error.details).toEqual(details);
		});

		test('InternalServerError creates 500 error', () => {
			const error = HttpError.InternalServerError();
			expect(error.status).toBe(500);
			expect(error.message).toBe('Internal Server Error');
		});

		test('InternalServerError accepts custom message', () => {
			const error = HttpError.InternalServerError('Database connection failed');
			expect(error.message).toBe('Database connection failed');
		});
	});
});
