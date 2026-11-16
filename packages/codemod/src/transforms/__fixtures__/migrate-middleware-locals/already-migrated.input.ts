import { createMiddleware } from '@ecopages/core';

export const auth = createMiddleware(async (ctx, next) => next({ session: 1 }));
