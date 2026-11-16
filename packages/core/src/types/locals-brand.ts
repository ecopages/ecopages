/**
 * The key of the brand a made middleware carries, typed with the locals it leaves available.
 *
 * @remarks
 * Only `createMiddleware` and `composeMiddleware` import it, and the package does not export it, so no other code
 * can build an object with the brand: a literal `{}` cannot pose as a middleware that proves a local. A spread copy
 * keeps the brand in its type but not the stages, so `flattenMiddleware` rejects it when the list is defined.
 */
export const localsBrand: unique symbol = Symbol('ecopages.middlewareLocals');
