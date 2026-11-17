import type { MiddlewareHandler } from '../adapters/shared/http/run-middleware-chain.ts';
import { localsBrand } from '../types/locals-brand.ts';
import type {
	AnyEcoMiddleware,
	EcoMiddleware,
	MiddlewareLocalsAfter,
	MiddlewareStage,
	MiddlewareStageInput,
	ProvidedBy,
	RuntimeMiddlewareStage,
	StageResult,
} from '../types/middleware-types.ts';

/**
 * Creates one middleware from a stage.
 *
 * @remarks
 * The stage continues with `next(locals)` and the locals it passes become typed `locals` for everything after
 * it, with no declaration: the type is read from the `next` calls in the body. Returning a bare `Response` or
 * throwing one stops the request. `next` resolves to the response of the later stages, so a stage can still
 * edit it after `await next()`.
 */
export function createMiddleware<TResult extends StageResult | Promise<StageResult>>(
	stage: MiddlewareStage<{}, TResult>,
): EcoMiddleware<ProvidedBy<Awaited<TResult>>> {
	return brand([stage]);
}

/**
 * Composes middleware and inline stages into one middleware, in order.
 *
 * @remarks
 * Each stage is either a middleware or an inline function whose `ctx.locals` is typed from everything provided
 * by the stages before it, so a dependent stage needs no annotation. The result is itself a middleware: list
 * it in `middleware`, or use it as a stage of another composition. A later stage that provides the same key
 * wins, as it does at runtime. Overloads cover four stages; nest a composition to go further.
 */
export function composeMiddleware<A extends MiddlewareStageInput<{}>>(
	a: A,
): EcoMiddleware<MiddlewareLocalsAfter<{}, A>>;
export function composeMiddleware<
	A extends MiddlewareStageInput<{}>,
	B extends MiddlewareStageInput<MiddlewareLocalsAfter<{}, A>>,
>(a: A, b: B): EcoMiddleware<MiddlewareLocalsAfter<MiddlewareLocalsAfter<{}, A>, B>>;
export function composeMiddleware<
	A extends MiddlewareStageInput<{}>,
	B extends MiddlewareStageInput<MiddlewareLocalsAfter<{}, A>>,
	C extends MiddlewareStageInput<MiddlewareLocalsAfter<MiddlewareLocalsAfter<{}, A>, B>>,
>(a: A, b: B, c: C): EcoMiddleware<MiddlewareLocalsAfter<MiddlewareLocalsAfter<MiddlewareLocalsAfter<{}, A>, B>, C>>;
export function composeMiddleware<
	A extends MiddlewareStageInput<{}>,
	B extends MiddlewareStageInput<MiddlewareLocalsAfter<{}, A>>,
	C extends MiddlewareStageInput<MiddlewareLocalsAfter<MiddlewareLocalsAfter<{}, A>, B>>,
	D extends MiddlewareStageInput<MiddlewareLocalsAfter<MiddlewareLocalsAfter<MiddlewareLocalsAfter<{}, A>, B>, C>>,
>(
	a: A,
	b: B,
	c: C,
	d: D,
): EcoMiddleware<
	MiddlewareLocalsAfter<MiddlewareLocalsAfter<MiddlewareLocalsAfter<MiddlewareLocalsAfter<{}, A>, B>, C>, D>
>;
export function composeMiddleware(...stages: readonly (AnyEcoMiddleware | RuntimeMiddlewareStage)[]): AnyEcoMiddleware {
	return brand(assertNoDuplicateStages(collectStages(stages), 'composition'));
}

/**
 * The key of the stages each made middleware holds.
 *
 * @remarks
 * The stages are a non-enumerable property, so a copy such as `{ ...auth }` carries the brand but no stages and is
 * rejected when listed, instead of proving locals it never provides. The key is registered with `Symbol.for`, so a
 * Page module that loads its own copy of the package still lists middleware the server's copy can run.
 */
const stagesKey = Symbol.for('ecopages.middlewareStages');

function brand<TLocals extends object>(stages: readonly RuntimeMiddlewareStage[]): EcoMiddleware<TLocals> {
	const made: EcoMiddleware<TLocals> = { [localsBrand]: (locals: TLocals) => locals };
	Object.defineProperty(made, stagesKey, { value: stages });
	return made;
}

function stagesOf(entry: AnyEcoMiddleware): readonly RuntimeMiddlewareStage[] | undefined {
	return Object.getOwnPropertyDescriptor(entry, stagesKey)?.value;
}

/**
 * Flattens a middleware list into the ordered functions a request pipeline runs.
 *
 * @remarks
 * A plain `(ctx, next)` function is one stage. A middleware made by `createMiddleware` or `composeMiddleware`
 * contributes its stages, in order. Every declared stage runs, so the same stage reached twice is rejected: it
 * would run twice, and the locals the types promise after it would no longer match what a stage in between left
 * behind. Declare a shared guard once, in the composition that owns it. A stage is typed for the context it reads,
 * so the pipeline that runs it names that context as `TContext`; this is the one place the two are joined.
 *
 * @throws When one stage appears twice, naming both positions and `label`, or when an entry is an object neither
 * factory made.
 */
export function flattenMiddleware<TContext extends { readonly locals: object }>(
	entries: readonly (AnyEcoMiddleware | RuntimeMiddlewareStage)[] | undefined,
	label = 'middleware list',
): MiddlewareHandler<TContext>[] {
	return assertNoDuplicateStages(collectStages(entries ?? []), label) as MiddlewareHandler<TContext>[];
}

function collectStages(entries: readonly (AnyEcoMiddleware | RuntimeMiddlewareStage)[]): RuntimeMiddlewareStage[] {
	return entries.flatMap((entry) => {
		if (typeof entry === 'function') {
			return [entry];
		}
		const stages = stagesOf(entry);
		if (!stages) {
			throw new Error(
				'[ecopages] A middleware list holds an object that createMiddleware or composeMiddleware did not make. List the middleware itself, not a copy of it.',
			);
		}
		return [...stages];
	});
}

function assertNoDuplicateStages(stages: RuntimeMiddlewareStage[], label: string): RuntimeMiddlewareStage[] {
	const firstSeen = new Map<RuntimeMiddlewareStage, number>();
	stages.forEach((stage, index) => {
		const first = firstSeen.get(stage);
		if (first !== undefined) {
			throw new Error(
				`[ecopages] The ${label} runs the same middleware stage twice, at positions ${first} and ${index}. Declare a shared guard once, in the composition that owns it.`,
			);
		}
		firstSeen.set(stage, index);
	});
	return stages;
}
