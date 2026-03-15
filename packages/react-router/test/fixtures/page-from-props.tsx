import { createElement } from 'react';

type PageFromProps = {
	label?: string;
};

export default function PageFromProps({ label = 'unknown' }: PageFromProps) {
	return createElement('div', { 'data-testid': 'page-label' }, label);
}