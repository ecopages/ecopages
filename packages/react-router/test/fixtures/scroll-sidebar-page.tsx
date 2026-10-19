import { createElement } from 'react';

type ScrollSidebarPageProps = {
	label?: string;
};

export default function ScrollSidebarPage({ label = 'unknown' }: ScrollSidebarPageProps) {
	return createElement(
		'div',
		null,
		createElement(
			'aside',
			{
				id: 'scroll-sidebar',
				'data-eco-persist': 'scroll',
				style: { height: '100px', overflow: 'auto' },
			},
			createElement('div', { style: { height: '2000px' } }),
		),
		createElement('a', { href: '/a', 'data-testid': 'link-a' }, 'A'),
		createElement('a', { href: '/b', 'data-testid': 'link-b' }, 'B'),
		createElement('div', { 'data-testid': 'page-label' }, label),
	);
}
