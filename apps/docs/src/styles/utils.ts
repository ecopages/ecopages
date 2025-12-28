export function cn(...classNames: (string | undefined | boolean)[]) {
	return classNames.filter(Boolean).join(' ');
}
