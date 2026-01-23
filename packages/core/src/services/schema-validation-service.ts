import type { StandardSchema, StandardSchemaIssue } from './validation/standard-schema.types.ts';

export interface ValidationResult<T = unknown> {
	success: boolean;
	data?: T;
	errors?: Array<{
		message: string;
		path?: Array<string | number>;
	}>;
}

export interface ValidationSource {
	body?: unknown;
	query?: Record<string, string>;
	headers?: Record<string, string>;
}

export interface ValidationSchemas {
	body?: StandardSchema;
	query?: StandardSchema;
	headers?: StandardSchema;
}

export interface ValidatedData {
	body?: unknown;
	query?: unknown;
	headers?: unknown;
}

/**
 * Service for validating request data using Standard Schema compliant validators.
 *
 * This service provides a unified interface for validating HTTP request data (body, query parameters, headers)
 * using any validation library that implements the Standard Schema specification.
 *
 * @example Using with Zod
 * ```typescript
 * import { z } from 'zod';
 * import { SchemaValidationService } from './schema-validation-service.ts';
 *
 * const service = new SchemaValidationService();
 * const result = await service.validateRequest(
 *   { body: { title: 'Hello', count: 42 } },
 *   { body: z.object({ title: z.string(), count: z.number() }) }
 * );
 *
 * if (result.success) {
 *   console.log(result.data.body);
 * }
 * ```
 *
 * @example Using with Valibot
 * ```typescript
 * import * as v from 'valibot';
 *
 * const result = await service.validateRequest(
 *   { query: { page: '1' } },
 *   { query: v.object({ page: v.string() }) }
 * );
 * ```
 *
 * @example Using with ArkType
 * ```typescript
 * import { type } from 'arktype';
 *
 * const result = await service.validateRequest(
 *   { headers: { 'authorization': 'Bearer token' } },
 *   { headers: type({ authorization: 'string' }) }
 * );
 * ```
 *
 * @example Multiple sources
 * ```typescript
 * const result = await service.validateRequest(
 *   {
 *     body: { title: 'Post' },
 *     query: { format: 'json' },
 *     headers: { 'content-type': 'application/json' }
 *   },
 *   {
 *     body: z.object({ title: z.string() }),
 *     query: v.object({ format: v.string() }),
 *     headers: type({ 'content-type': 'string' })
 *   }
 * );
 * ```
 *
 * Supported libraries: Zod, Valibot, ArkType, Effect Schema (with standardSchemaV1 wrapper)
 */
export class SchemaValidationService {
	/**
	 * Validates request data against provided schemas.
	 *
	 * Validates body, query parameters, and headers against their respective schemas.
	 * All validations are performed, and errors are aggregated from all sources.
	 *
	 * @param source - The data to validate (body, query, headers)
	 * @param schemas - The Standard Schema validators for each source
	 * @returns Validation result with validated data or aggregated errors
	 *
	 * @example
	 * ```typescript
	 * const result = await service.validateRequest(
	 *   { body: { name: 'John', age: 30 } },
	 *   { body: z.object({ name: z.string(), age: z.number() }) }
	 * );
	 *
	 * if (result.success) {
	 *   const validated = result.data.body;
	 * } else {
	 *   console.error(result.errors);
	 * }
	 * ```
	 */
	async validateRequest(
		source: ValidationSource,
		schemas: ValidationSchemas,
	): Promise<ValidationResult<ValidatedData>> {
		const validated: ValidatedData = {};
		const allErrors: Array<{ message: string; path?: Array<string | number> }> = [];

		if (schemas.body && source.body !== undefined) {
			const result = await this.validateWithSchema(schemas.body, source.body);
			if (!result.success) {
				allErrors.push(...(result.errors || []));
			} else {
				validated.body = result.data;
			}
		}

		if (schemas.query && source.query) {
			const result = await this.validateWithSchema(schemas.query, source.query);
			if (!result.success) {
				allErrors.push(...(result.errors || []));
			} else {
				validated.query = result.data;
			}
		}

		if (schemas.headers && source.headers) {
			const result = await this.validateWithSchema(schemas.headers, source.headers);
			if (!result.success) {
				allErrors.push(...(result.errors || []));
			} else {
				validated.headers = result.data;
			}
		}

		if (allErrors.length > 0) {
			return { success: false, errors: allErrors };
		}

		return { success: true, data: validated };
	}

	/**
	 * Validates a single value against a Standard Schema.
	 *
	 * @param schema - The Standard Schema validator
	 * @param data - The data to validate
	 * @returns Validation result with validated data or errors
	 */
	private async validateWithSchema<T>(schema: StandardSchema, data: unknown): Promise<ValidationResult<T>> {
		try {
			const resultOrPromise = schema['~standard'].validate(data);
			const result = resultOrPromise instanceof Promise ? await resultOrPromise : resultOrPromise;

			if (result.issues) {
				return {
					success: false,
					errors: result.issues.map((issue: StandardSchemaIssue) => ({
						message: issue.message,
						path: issue.path?.map((p) => (typeof p === 'object' && 'key' in p ? p.key : p)) as
							| Array<string | number>
							| undefined,
					})),
				};
			}

			return { success: true, data: result.value as T };
		} catch (error) {
			return {
				success: false,
				errors: [
					{
						message: error instanceof Error ? error.message : 'Validation failed',
					},
				],
			};
		}
	}
}
