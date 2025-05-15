import type { BunRequest, Server } from 'bun';
import type { ApiHandler } from '../../public-types';

/**
 * Helper function specifically for Bun to define an API handler with
 * automatically inferred path type for BunRequest.
 *
 * @template TPath The literal string type of the path, inferred from the 'path' property.
 * @param handler The API handler configuration object using BunRequest.
 * @returns The same handler object, strongly typed for Bun.
 */
export function defineApiHandler<TPath extends string>(
  handler: ApiHandler<TPath, BunRequest<TPath>, Server>,
): ApiHandler<TPath, BunRequest<TPath>, Server> {
  return handler;
}
