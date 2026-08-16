/** Joins class names, skipping falsy values. */
export function cx(...classNames: (string | undefined | false | null)[]) {
	return classNames.filter(Boolean).join(' ');
}
