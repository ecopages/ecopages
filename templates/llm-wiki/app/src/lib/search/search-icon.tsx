import { cx } from '@/lib/cx';

export type SearchIconProps = {
	class?: string;
};

export function SearchIcon({ class: className }: SearchIconProps) {
	return (
		<svg class={cx('search-icon', className)} aria-hidden="true" viewBox="0 0 24 24" width="1em" height="1em">
			<path
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				d="m21 21-4.34-4.34M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z"
			/>
		</svg>
	);
}
