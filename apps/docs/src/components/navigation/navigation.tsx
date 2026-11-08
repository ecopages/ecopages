import type { JsxRenderable } from '@ecopages/jsx';
import { RuiButton } from '@ecopages/radiant-ui/button';
import { ThemeToggle } from '../theme-toggle/theme-toggle';
import './navigation.css';

export type NavigationProps = {
	items: {
		label: string | JsxRenderable;
		href: string;
		target?: '_blank' | '_self';
		rel?: string;
		'aria-label'?: string;
		class?: string;
	}[];
};

export function Navigation({ items }: NavigationProps): JsxRenderable {
	return (
		<nav class="navigation" aria-label="Site">
			<ul>
				{items.map(({ label, href, target = '_self', rel, 'aria-label': ariaLabel, class: className }) => (
					<li class={className}>
						<RuiButton
							href={href}
							target={target}
							rel={rel}
							variant="ghost"
							size="sm"
							aria-label={ariaLabel}
						>
							{label}
						</RuiButton>
					</li>
				))}
				<li>
					<ThemeToggle id="toggle-dark-mode" label="Theme" data-eco-persist="theme-toggle" />
				</li>
			</ul>
		</nav>
	);
}
