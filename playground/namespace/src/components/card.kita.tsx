import type { PropsWithChildren } from '@kitajs/html';

type CardProps = PropsWithChildren<{
	class?: string;
}>;

export function Card({ children, class: className }: CardProps) {
	const baseClasses = 'p-6 rounded-2xl border border-white/10 bg-zinc-900/30';
	const classes = className ? `${baseClasses} ${className}` : baseClasses;

	return <div class={classes}>{children}</div>;
}

type CardTitleProps = PropsWithChildren<{
	class?: string;
}>;

export function CardTitle({ children, class: className }: CardTitleProps) {
	const baseClasses = 'text-lg font-semibold text-white mb-4';
	const classes = className ? `${baseClasses} ${className}` : baseClasses;

	return <h2 class={classes}>{children}</h2>;
}
