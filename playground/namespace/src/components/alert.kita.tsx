import type { PropsWithChildren } from '@kitajs/html';

type AlertVariant = 'warning' | 'info' | 'success' | 'error';

type AlertProps = PropsWithChildren<{
	variant?: AlertVariant;
	title?: string;
	class?: string;
}>;

const variantStyles: Record<AlertVariant, { container: string; title: string }> = {
	warning: {
		container: 'border-yellow-500/30 bg-yellow-500/10',
		title: 'text-yellow-400',
	},
	info: {
		container: 'border-blue-500/30 bg-blue-500/10',
		title: 'text-blue-400',
	},
	success: {
		container: 'border-green-500/30 bg-green-500/10',
		title: 'text-green-400',
	},
	error: {
		container: 'border-red-500/30 bg-red-500/10',
		title: 'text-red-400',
	},
};

function AlertIcon({ variant }: { variant: AlertVariant }) {
	switch (variant) {
		case 'warning':
			return (
				<svg
					width="20"
					height="20"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path d="M12 9v4" />
					<path d="M12 17h.01" />
					<path d="M2.39 18.249L10.59 3.661a1.63 1.63 0 012.82 0l8.2 14.588A1.63 1.63 0 0120.2 21H3.8a1.63 1.63 0 01-1.41-2.751z" />
				</svg>
			);
		case 'info':
			return (
				<svg
					width="20"
					height="20"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<circle cx="12" cy="12" r="10" />
					<path d="M12 16v-4" />
					<path d="M12 8h.01" />
				</svg>
			);
		case 'success':
			return (
				<svg
					width="20"
					height="20"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<circle cx="12" cy="12" r="10" />
					<path d="M9 12l2 2 4-4" />
				</svg>
			);
		case 'error':
			return (
				<svg
					width="20"
					height="20"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<circle cx="12" cy="12" r="10" />
					<path d="M15 9l-6 6" />
					<path d="M9 9l6 6" />
				</svg>
			);
	}
}

export function Alert({ variant = 'info', title, children, class: className }: AlertProps) {
	const styles = variantStyles[variant];
	const baseClasses = `p-6 rounded-2xl border ${styles.container}`;
	const classes = className ? `${baseClasses} ${className}` : baseClasses;

	return (
		<section class={classes}>
			{title && (
				<h2 class={`text-lg font-semibold ${styles.title} mb-2 flex items-center gap-2`}>
					<AlertIcon variant={variant} />
					{title}
				</h2>
			)}
			<div class="text-sm text-gray-300">{children}</div>
		</section>
	);
}
