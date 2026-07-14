import type { StandardSchemaV1 } from '@standard-schema/spec';

/**
 * Ecopages aliases for the official Standard Schema V1 types.
 * @see https://standardschema.dev
 */
export type StandardSchema<Input = unknown, Output = Input> = StandardSchemaV1<Input, Output>;

export type StandardSchemaResult<Output> = StandardSchemaV1.Result<Output>;

export type StandardSchemaSuccessResult<Output> = StandardSchemaV1.SuccessResult<Output>;

export type StandardSchemaFailureResult = StandardSchemaV1.FailureResult;

export type StandardSchemaIssue = StandardSchemaV1.Issue;

export type InferOutput<T extends StandardSchemaV1> = StandardSchemaV1.InferOutput<T>;

export type { StandardSchemaV1 } from '@standard-schema/spec';
