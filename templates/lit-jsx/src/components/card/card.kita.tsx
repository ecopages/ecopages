import { LitCounter } from '@/components/lit-counter';
import './card.css';

export type CardProps = {
	title: string;
	copy: string;
};

export function Card({ copy, title }: CardProps) {
	return (
		<article class="card prose">
			<h1 safe>{title}</h1>
			<p>{copy as 'safe'}</p>
			<LitCounter count={8} />
		</article>
	);
}
