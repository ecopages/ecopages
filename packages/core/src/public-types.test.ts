import { describe, expectTypeOf, it } from 'vitest';
import type {
	ApiHandler,
	ApiHandlerContext,
	EcoMiddleware,
	HtmlOptions,
	Middleware,
	MiddlewareList,
	RouteOptions,
} from './index.ts';

describe('@ecopages/core root public types', () => {
	it('exports EcoMiddleware as the context-inferring Middleware helper', () => {
		type AuthContext = ApiHandlerContext<Request, unknown> & { user: string };

		expectTypeOf<EcoMiddleware<AuthContext>>().toEqualTypeOf<Middleware<Request, unknown, AuthContext>>();
	});

	it('types the middleware list of a handler and of route options as one MiddlewareList', () => {
		expectTypeOf<ApiHandler<string, Request, unknown>['middleware']>().toEqualTypeOf<
			MiddlewareList<Request, unknown> | undefined
		>();
		expectTypeOf<RouteOptions<Request, unknown>['middleware']>().toEqualTypeOf<
			MiddlewareList<Request, unknown> | undefined
		>();
	});

	it('types the children and headContent of an eco.html() shell with its element type', () => {
		type ShellElement = { kind: 'shell-element' };
		type ShellProps = Parameters<HtmlOptions<ShellElement>['render']>[0];

		expectTypeOf<ShellProps['children']>().toEqualTypeOf<ShellElement>();
		expectTypeOf<ShellProps['headContent']>().toEqualTypeOf<ShellElement | undefined>();
	});
});
