import { SchemaError, validateStandardSchema } from './validate-standard-schema.ts';
import type { StandardSchema, StandardSchemaIssue } from './standard-schema.types.ts';

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
	params?: Record<string, string>;
}

export interface ValidationSchemas {
	body?: StandardSchema;
	query?: StandardSchema;
	headers?: StandardSchema;
	params?: StandardSchema;
}

export interface ValidatedData {
	body?: unknown;
	query?: unknown;
	headers?: unknown;
	params?: unknown;
}

type ValidationOutcome =
	| { source: keyof ValidationSchemas; success: true; data: unknown }
	| {
			source: keyof ValidationSchemas;
			success: false;
			errors: Array<{ message: string; path?: Array<string | number> }>;
	  };

/**
 * Validates the request parts that have schemas and collects every failure.
 *
 * @remarks
 * A declared body schema also receives `undefined`, allowing Standard Schema
 * validators to reject a missing required body or accept an optional one.
 */
export async function validateRequest(
	source: ValidationSource,
	schemas: ValidationSchemas,
): Promise<ValidationResult<ValidatedData>> {
	const requested: Array<{ source: keyof ValidationSchemas; schema: StandardSchema; value: unknown }> = [];
	if (schemas.body) requested.push({ source: 'body', schema: schemas.body, value: source.body });
	if (schemas.query && source.query !== undefined) {
		requested.push({ source: 'query', schema: schemas.query, value: source.query });
	}
	if (schemas.headers && source.headers !== undefined) {
		requested.push({ source: 'headers', schema: schemas.headers, value: source.headers });
	}
	if (schemas.params && source.params !== undefined) {
		requested.push({ source: 'params', schema: schemas.params, value: source.params });
	}

	const outcomes: ValidationOutcome[] = await Promise.all(
		requested.map(async ({ source: part, schema, value }): Promise<ValidationOutcome> => {
			try {
				const data = await validateStandardSchema(schema, value);
				return { source: part, success: true, data };
			} catch (error) {
				if (error instanceof SchemaError) {
					return {
						source: part,
						success: false,
						errors: error.issues.map((issue: StandardSchemaIssue) => ({
							message: issue.message,
							path: issue.path?.map((segment) =>
								typeof segment === 'object' && 'key' in segment ? segment.key : segment,
							) as Array<string | number> | undefined,
						})),
					};
				}

				return {
					source: part,
					success: false,
					errors: [{ message: error instanceof Error ? error.message : 'Validation failed' }],
				};
			}
		}),
	);

	const errors = outcomes.flatMap((outcome) => (outcome.success ? [] : outcome.errors));
	if (outcomes.some((outcome) => !outcome.success)) {
		return { success: false, errors };
	}

	const data: ValidatedData = {};
	for (const outcome of outcomes) {
		if (!outcome.success) continue;
		data[outcome.source] = outcome.data;
	}
	return { success: true, data };
}
