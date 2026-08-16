export type ClassName = string | false | null | undefined;

export function cx(...classNames: ClassName[]): string {
	return classNames.filter(Boolean).join(' ');
}
