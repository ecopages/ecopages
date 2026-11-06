import './navigation.css';

export type NavigationProps = {
	items: {
		label: string;
		url: string;
	}[];
};

export function Navigation({ items }: NavigationProps) {
	return (
		<nav class="navigation">
			<ul>
				{items.map(({ label, url }) => (
					<li>
						<a href={url}>{label}</a>
					</li>
				))}
			</ul>
		</nav>
	);
}
