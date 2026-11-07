/**
 * Records that a probe script ran on the server.
 *
 * @remarks
 * The list lives on `globalThis` because every module graph that evaluates a script has its own copy of this module.
 */
export function recordSsrScriptEvaluation(script: string): void {
	const store = globalThis as typeof globalThis & { __ecoSsrScriptEvaluations?: string[] };
	store.__ecoSsrScriptEvaluations ??= [];
	store.__ecoSsrScriptEvaluations.push(script);
}
