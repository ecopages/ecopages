import { describe, expectTypeOf, it } from 'vitest';
import type { ApiHandler, HtmlOptions, MiddlewareList, RouteOptions } from './index.ts';

describe('@ecopages/core root public types', () => {
	it('types the middleware list of a handler and of route options as one MiddlewareList', () => {
		expectTypeOf<ApiHandler<string, Request, unknown>['middleware']>().toEqualTypeOf<MiddlewareList | undefined>();
		expectTypeOf<RouteOptions['middleware']>().toEqualTypeOf<MiddlewareList | undefined>();
	});

	it('types the children and headContent of an eco.html() shell with its element type', () => {
		type ShellElement = { kind: 'shell-element' };
		type ShellProps = Parameters<HtmlOptions<ShellElement>['render']>[0];

		expectTypeOf<ShellProps['children']>().toEqualTypeOf<ShellElement>();
		expectTypeOf<ShellProps['headContent']>().toEqualTypeOf<ShellElement | undefined>();
	});
});
