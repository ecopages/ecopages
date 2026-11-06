/**
 * Boolean flags that the `ecopages` CLI forwards to the app entry, keyed by flag name.
 *
 * @remarks
 * Single source of truth for two parsers: `parseCliArgs` in the app entry reads every key, and the
 * published `ecopages` wrapper accepts a flag only for the commands listed here. Declaring a flag
 * here is enough for both to accept it, so the wrapper cannot reject a flag the entry understands.
 */
export const ENTRY_COMMAND_FLAGS = {
	'keep-going': {
		commands: ['build'],
		help: 'Continue the build after a Page fails to render',
	},
	'serve-only': {
		commands: ['preview'],
		help: 'Serve the existing dist/client without rebuilding',
	},
} as const satisfies Record<string, { commands: readonly string[]; help: string }>;

export type EntryCommandFlagName = keyof typeof ENTRY_COMMAND_FLAGS;

/**
 * Names of the entry flags that apply to one CLI command.
 */
export function getEntryCommandFlagNames(command: string): EntryCommandFlagName[] {
	return (Object.keys(ENTRY_COMMAND_FLAGS) as EntryCommandFlagName[]).filter((name) =>
		(ENTRY_COMMAND_FLAGS[name].commands as readonly string[]).includes(command),
	);
}
