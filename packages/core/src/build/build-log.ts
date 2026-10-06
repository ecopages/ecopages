import type { BuildResult } from './contracts/build-contracts.ts';

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
