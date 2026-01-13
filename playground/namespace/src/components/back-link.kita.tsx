type BackLinkProps = {
	href?: string;
	children?: string;
};

export function BackLink({ href = '/', children = 'Back to Home' }: BackLinkProps) {
	return (
		<a href={href} class="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors">
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M19 12H5M12 19l-7-7 7-7" />
			</svg>
			{children}
		</a>
	);
}
