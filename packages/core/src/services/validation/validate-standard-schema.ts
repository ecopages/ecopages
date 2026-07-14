import type { StandardSchemaV1 } from '@standard-schema/spec';
import { SchemaError } from '@standard-schema/utils';

export { SchemaError } from '@standard-schema/utils';

/**
 * Validates a value with any Standard Schema-compliant validator.
 * Throws {@link SchemaError} when validation fails.
 */
export async function validateStandardSchema<T>(schema: StandardSchemaV1<unknown, T>, value: unknown): Promise<T> {
	const resultOrPromise = schema['~standard'].validate(value);
	const result = resultOrPromise instanceof Promise ? await resultOrPromise : resultOrPromise;

	if (result.issues) {
		throw new SchemaError(result.issues);
	}

	return result.value;
}
