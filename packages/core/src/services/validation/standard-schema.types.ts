/**
 * Standard Schema interface for universal validation.
 * Compatible with Zod, Valibot, ArkType, Effect Schema, and other validation libraries.
 *
 * @see https://standardschema.dev
 *
 * @example Using with Zod
 * ```typescript
 * import { z } from 'zod';
 *
 * const bodySchema = z.object({
 *   title: z.string().min(1),
 *   content: z.string()
 * });
 *
 * app.post('/posts', async (ctx) => {
 *   const { title, content } = ctx.body;
 *   return ctx.json({ id: 1, title, content });
 * }, {
 *   schema: { body: bodySchema }
 * });
 * ```
 */
export interface StandardSchema<Input = unknown, Output = Input> {
	readonly '~standard': {
		readonly version: 1;
		readonly vendor: string;
		readonly validate: (value: unknown) => StandardSchemaResult<Output> | Promise<StandardSchemaResult<Output>>;
		readonly types?: {
			readonly input: Input;
			readonly output: Output;
		};
	};
}

/**
 * Result of Standard Schema validation.
 */
export type StandardSchemaResult<Output> = StandardSchemaSuccessResult<Output> | StandardSchemaFailureResult;

/**
 * Successful validation result.
 */
export interface StandardSchemaSuccessResult<Output> {
	readonly value: Output;
	readonly issues?: undefined;
}

/**
 * Failed validation result.
 */
export interface StandardSchemaFailureResult {
	readonly value?: undefined;
	readonly issues: ReadonlyArray<StandardSchemaIssue>;
}

/**
 * Validation issue details.
 */
export interface StandardSchemaIssue {
	readonly message: string;
	readonly path?: ReadonlyArray<PropertyKey | { key: PropertyKey }>;
}

/**
 * Infers the output type from a Standard Schema.
 */
export type InferOutput<T extends StandardSchema> = T extends StandardSchema<any, infer O> ? O : never;
