import type { BuildResult } from './contracts/build-contracts.ts';

/**
 * Throws when a build failed, with the formatted logs after `failure`.
 *
 * @remarks
 * `failure` is the first line of the error, or a function of the formatted logs when the message needs them
 * somewhere else. Logs keep their plugin, file, code frame and stack, so callers should throw this error instead of
 * joining `log.message`.
 */
export function assertBuildSucceeded(result: BuildResult, failure: string | ((details: string) => string)): void {
	if (result.success) {
		return;
	}
	const details = result.logs.map(formatBuildLog).join('\n');
	throw new Error(typeof failure === 'function' ? failure(details) : details ? `${failure}:\n${details}` : failure);
}

/**
 * Formats one build log as text: `[plugin] file:line:column: message`, then the code frame and the
 * stack frames when the log has them.
 *
 * @remarks
 * Only the `at …` lines of the stack are kept, because its first line repeats the message. Errors that
 * Rolldown raises itself, such as parse errors, carry no stack.
 */
export function formatBuildLog(log: BuildResult['logs'][number]): string {
	const file = log.loc?.file ?? log.id;
	const position = log.loc ? `:${log.loc.line}:${log.loc.column}` : '';
	const location = file ? `${file}${position}: ` : '';
	const lines = [`${log.plugin ? `[${log.plugin}] ` : ''}${location}${log.message}`];
	if (log.frame) {
		lines.push(log.frame);
	}
	const stackFrames = log.stack?.split('\n').filter((line) => /^\s+at /.test(line)) ?? [];
	lines.push(...stackFrames);
	return lines.join('\n');
}
