/**
 * A CSS Module's default export maps each local class name to its scoped name, followed by the names it composes.
 *
 * @remarks
 * It is declared before `*.css` because TypeScript picks the first of two patterns that match a specifier with
 * the same prefix, and `x.module.css` matches both.
 */
declare module '*.module.css' {
	const classes: { readonly [key: string]: string };
	export default classes;
}

declare module '*.css' {
	const styles: string;
	export default styles;
}
