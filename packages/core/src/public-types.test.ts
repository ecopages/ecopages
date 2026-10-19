import { describe, expectTypeOf, it } from 'vitest';
import type { ApiHandlerContext, EcoMiddleware, Middleware } from './index.ts';

describe('@ecopages/core root public types', () => {
	it('exports EcoMiddleware as the context-inferring Middleware helper', () => {
		type AuthContext = ApiHandlerContext<Request, unknown> & { user: string };

		expectTypeOf<EcoMiddleware<AuthContext>>().toEqualTypeOf<Middleware<Request, unknown, AuthContext>>();
	});
});
