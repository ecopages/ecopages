import type { localsBrand } from './locals-brand.ts';
import type { FileRouteMiddleware, FileRouteMiddlewareContext, Middleware } from './contracts.ts';

declare const providedBrand: unique symbol;
declare const unknownLocals: unique symbol;

/**
 * What `next(locals)` resolves to: the response of the later stages, labelled with the locals it provided.
 *
 * @remarks
 * The label exists only in the types. It is `Omit<Response, 'clone'>` and not `Response` on purpose: when a
 * stage returns both `next({ ... })` and a bare `Response`, TypeScript merges return types by subtype, and a
 * `Response` subtype would be absorbed into plain `Response`, losing what was provided. Without `clone` it is
 * no subtype, so both survive. The label is invariant in `TLocals` (a function from and to it), so
 * `Provided<{ session }>` is not a subtype of `Provided<{}>`; otherwise a stage that returns `next({ session })`
 * on one path and `next()` on another would be reduced to `{}` and lose `session`. At runtime it is a normal
 * `Response`, and a helper that takes one needs a `Response`: mutate its headers and return it, do not cast.
 */
export type Provided<TLocals extends object> = Omit<Response, 'clone'> & {
	readonly [providedBrand]: (locals: TLocals) => TLocals;
};

/**
 * The `next` a stage calls to continue. Pass the locals the stage provides to later stages and to the handler.
 *
 * @remarks
 * Two overloads instead of one optional parameter: with `locals?: TLocals`, `next<{ session: Session }>()` and
 * `next(cond ? { session } : undefined)` would both type-check while providing nothing at runtime.
 */
export interface ProvideNext {
	(): Promise<Provided<{}>>;
	<TLocals extends object>(locals: TLocals): Promise<Provided<TLocals>>;
}

/**
 * What a stage returns: the result of `next(...)`, or a `Response` that stops the request.
 *
 * @remarks
 * `any` accepts every provided shape; the shape each stage provides is read back from its own return type.
 */
export type StageResult = Provided<any> | Response;

/**
 * The context a stage receives. `locals` holds what the stages before it provided.
 */
export type MiddlewareContext<TLocals extends object = {}> = Omit<FileRouteMiddlewareContext, 'locals'> & {
	readonly locals: Readonly<TLocals>;
};

/**
 * One stage: a function of the context and `next`.
 *
 * @typeParam TIn - The locals provided by the stages before it
 * @typeParam TResult - What it returns, inferred from the body
 */
export type MiddlewareStage<
	TIn extends object = {},
	TResult extends StageResult | Promise<StageResult> = StageResult | Promise<StageResult>,
> = (context: MiddlewareContext<TIn>, next: ProvideNext) => TResult;

/**
 * A middleware made by `createMiddleware` or `composeMiddleware`.
 *
 * @typeParam TLocals - Everything available after it runs: what it provides, and what the stages composed into
 * it provide.
 *
 * @remarks
 * The brand is required and keyed by a symbol the package does not export, so only `createMiddleware` and
 * `composeMiddleware` make one. It is invariant in `TLocals`: a middleware cannot be upcast to one that proves
 * fewer keys, such as `EcoMiddleware` (`{}`), and then listed where the fold would believe it provides nothing.
 * Its runtime value is an identity function that nothing calls.
 */
export interface EcoMiddleware<TLocals extends object = {}> {
	readonly [localsBrand]: (locals: TLocals) => TLocals;
	readonly stages: readonly RuntimeMiddlewareStage[];
}

/**
 * An {@link EcoMiddleware} of any provided locals, for lists and constraints that accept every shape.
 *
 * @remarks
 * `any` widens the check; each middleware's own locals are read back through {@link ListLocals}.
 */
export type AnyEcoMiddleware = EcoMiddleware<any>;

/**
 * An entry of a `middleware` list: a made middleware, or an existing plain `(ctx, next)` function, which
 * provides no locals.
 */
export type MiddlewareEntry = AnyEcoMiddleware | Middleware | FileRouteMiddleware;

/**
 * An entry of an API route or group list. A plain function is typed with the context an API pipeline supplies, so
 * an inline `(ctx, next) => ...` infers its parameters.
 */
export type ApiMiddlewareEntry = AnyEcoMiddleware | Middleware<Request, unknown>;

/**
 * An entry of a page's `middleware` list. A plain function is typed with the context a page pipeline supplies,
 * which carries no `query` or schema results.
 */
export type PageMiddlewareEntry = AnyEcoMiddleware | FileRouteMiddleware;

/**
 * The form a stage takes once running: the pipeline supplies the context and a `next` that merges what a stage
 * provides into `ctx.locals`.
 */
export type RuntimeMiddlewareStage = (context: never, next: never) => unknown;

/** What a stage returns with the locals it provided, or `{}` when it only returns a `Response`. */
export type ProvidedBy<TResult> = [Extract<TResult, Provided<any>>] extends [never]
	? {}
	: ProvidedOf<Extract<TResult, Provided<any>>>;

type ProvidedOf<TResult> = TResult extends Provided<infer TLocals> ? TLocals : never;

type Simplify<T> = { [K in keyof T]: T[K] } & {};

/**
 * Later keys override earlier ones, as the runtime merge does. A union on either side stays a union, so a
 * stage that provides different keys on different paths keeps every earlier local.
 */
export type MergeLocals<TBefore, TAfter> = TBefore extends unknown
	? TAfter extends unknown
		? Simplify<Omit<TBefore, keyof TAfter> & TAfter>
		: never
	: never;

/**
 * What a middleware of unknown locals provides, such as one typed {@link AnyEcoMiddleware}: it may overwrite any
 * key, so it marks the fold instead of naming keys.
 */
type UnknownLocals = { readonly [unknownLocals]: true };

/**
 * What a made middleware leaves available after it runs; nothing for a plain function, and
 * {@link UnknownLocals} for a middleware whose locals are `any` or an index signature.
 */
export type TotalOf<TEntry> =
	TEntry extends EcoMiddleware<infer TLocals>
		? 0 extends 1 & TLocals
			? UnknownLocals
			: string extends keyof TLocals
				? UnknownLocals
				: TLocals
		: {};

/** The locals before an entry of unknown provision: every key stays, typed `unknown`, so a direct read fails. */
type Unproven<TAcc> = TAcc extends unknown ? { [K in keyof TAcc]: unknown } : never;

type Step<TAcc, TTotal> = [Extract<TTotal, UnknownLocals>] extends [never] ? MergeLocals<TAcc, TTotal> : Unproven<TAcc>;

/**
 * The locals after a whole list runs, in order, starting from `TAcc`, the locals a group already provided.
 *
 * @remarks
 * A list whose rest is not a fixed tuple, such as a spread array, may run its elements any number of times or
 * not at all. Its elements can overwrite a key from before, so every key they may provide takes the union of
 * the earlier type and theirs, and a key only they provide may be missing. An entry of unknown locals, such as
 * one typed `AnyEcoMiddleware`, in the fixed part or the rest, may overwrite every key, so each key before it
 * becomes `unknown`: nothing before it is proven, and only a later entry proves a key again.
 */
export type ListLocals<TList extends readonly unknown[], TAcc = {}> = TList extends readonly [
	infer THead,
	...infer TTail,
]
	? ListLocals<TTail, Step<TAcc, TotalOf<THead>>>
	: TList extends readonly []
		? Simplify<TAcc>
		: RestLocals<TAcc, TotalOf<TList[number]>>;

type RestLocals<TAcc, TElement> = [Extract<TElement, UnknownLocals>] extends [never]
	? MaybeOverwritten<TAcc, TElement>
	: Simplify<Unproven<TAcc>>;

type MaybeOverwritten<TAcc, TElement> = TElement extends unknown
	? Simplify<
			Omit<TAcc, keyof TElement> & {
				[K in keyof TElement]: K extends keyof TAcc ? TAcc[K] | TElement[K] : TElement[K] | undefined;
			}
		>
	: never;

/** A middleware, or an inline stage typed from the locals before it: one input of `composeMiddleware`. */
export type MiddlewareStageInput<TIn extends object> = AnyEcoMiddleware | MiddlewareStage<TIn>;

/** The locals after one more stage or middleware. */
export type MiddlewareLocalsAfter<TIn extends object, TStage> =
	TStage extends EcoMiddleware<infer TLocals>
		? MergeLocals<TIn, TLocals>
		: TStage extends (...args: never) => infer TResult
			? MergeLocals<TIn, ProvidedBy<Awaited<TResult>>>
			: TIn;
