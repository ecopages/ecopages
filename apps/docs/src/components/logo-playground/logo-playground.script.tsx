import { RadiantComponent, customElement, state } from '@ecopages/radiant';
import { Logo } from '../logo/logo';
import type { LogoVariant } from '../logo.constants';
import type { LogoMode } from '../logo/logo';

const PREVIEW_MODES = [
	{ id: 'light', label: 'Light surface', description: 'Dark leaves and badge treatment on a bright stage.' },
	{ id: 'dark', label: 'Dark surface', description: 'Inverted tones on a dark stage.' },
] as const satisfies Array<{
	id: LogoMode;
	label: string;
	description: string;
}>;

const PREVIEW_VARIANTS = [
	{ id: 'gradient', label: 'Gradient' },
	{ id: 'flat', label: 'Flat' },
] as const satisfies Array<{
	id: LogoVariant;
	label: string;
}>;

const PREVIEW_SQUIRCLE_OPTIONS = [
	{ id: 'true', label: 'Squircle', squircle: true },
	{ id: 'false', label: 'Plain', squircle: false },
] as const;

const PREVIEW_SHADOW_OPTIONS = [
	{ id: 'true', label: 'Shadow on', shadow: true },
	{ id: 'false', label: 'Shadow off', shadow: false },
] as const;

const PLAYGROUND_TEXT_OPTIONS = [
	{ id: 'ecopages', label: 'ecopages', text: 'ecopages' },
	{ id: 'radiant', label: 'radiant', text: 'radiant' },
	{ id: 'scripts-injector', label: 'scripts-injector', text: 'scripts-injector' },
	{ id: 'logger', label: 'logger', text: 'logger' },
	{ id: 'none', label: 'No text', text: undefined },
] as const;

type PlaygroundTextId = (typeof PLAYGROUND_TEXT_OPTIONS)[number]['id'];
const MIN_FONT_SIZE_REM = 1.5;
const MAX_FONT_SIZE_REM = 10;
const DEFAULT_FONT_SIZE_REM = 5.5;
const FONT_SIZE_STEP_REM = 0.25;
const EXPORT_PADDING_PX = 32;

const escapeXml = (value: string): string =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;');

const round = (value: number): string => value.toFixed(2);

@customElement('radiant-logo-playground')
export class RadiantLogoPlayground extends RadiantComponent {
	@state mode: LogoMode = 'light';
	@state shadow = true;
	@state squircle = true;
	@state textId: PlaygroundTextId = 'ecopages';
	@state variant: LogoVariant = 'gradient';
	@state fontSizeRem = DEFAULT_FONT_SIZE_REM;

	private readonly handleVariantChange = (event: Event & { readonly currentTarget: HTMLInputElement }) => {
		this.variant = event.currentTarget.value as LogoVariant;
	};

	private readonly handleModeChange = (event: Event & { readonly currentTarget: HTMLInputElement }) => {
		this.mode = event.currentTarget.value as LogoMode;
	};

	private readonly handleSquircleChange = (event: Event & { readonly currentTarget: HTMLInputElement }) => {
		this.squircle = event.currentTarget.value === 'true';
	};

	private readonly handleTextChange = (event: Event & { readonly currentTarget: HTMLSelectElement }) => {
		this.textId = event.currentTarget.value as PlaygroundTextId;
	};

	private readonly handleShadowChange = (event: Event & { readonly currentTarget: HTMLInputElement }) => {
		this.shadow = event.currentTarget.value === 'true';
	};

	private readonly handleFontSizeInput = (event: Event & { readonly currentTarget: HTMLInputElement }) => {
		this.fontSizeRem = Number(event.currentTarget.value);
	};

	private readonly buildExportMarkup = (): string | null => {
		const logoRoot = this.querySelector<HTMLElement>('.logo-playground__preview .ecopages-logo');
		const symbolSvg = logoRoot?.querySelector<SVGSVGElement>('svg');
		if (!logoRoot || !symbolSvg) {
			return null;
		}

		const rootRect = logoRoot.getBoundingClientRect();
		const symbolRect = symbolSvg.getBoundingClientRect();
		if (rootRect.width === 0 || rootRect.height === 0 || symbolRect.width === 0 || symbolRect.height === 0) {
			return null;
		}

		const padding = EXPORT_PADDING_PX;

		const clonedSymbol = symbolSvg.cloneNode(true) as SVGSVGElement;
		clonedSymbol.setAttribute('x', round(symbolRect.left - rootRect.left + padding));
		clonedSymbol.setAttribute('y', round(symbolRect.top - rootRect.top + padding));
		clonedSymbol.setAttribute('width', round(symbolRect.width));
		clonedSymbol.setAttribute('height', round(symbolRect.height));
		clonedSymbol.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

		const serializer = new XMLSerializer();
		const symbolMarkup = serializer.serializeToString(clonedSymbol);
		const badge = logoRoot.querySelector<HTMLElement>('.ecopages-logo__badge');
		const badgeMarkup = (() => {
			if (!badge) {
				return '';
			}

			const badgeRect = badge.getBoundingClientRect();
			const badgeStyle = getComputedStyle(badge);
			const badgeRadius = Math.min(badgeRect.width, badgeRect.height) * 0.3;
			return `<rect x="${round(badgeRect.left - rootRect.left + padding)}" y="${round(badgeRect.top - rootRect.top + padding)}" width="${round(badgeRect.width)}" height="${round(badgeRect.height)}" rx="${round(badgeRadius)}" ry="${round(badgeRadius)}" fill="${escapeXml(badgeStyle.backgroundColor)}" />`;
		})();

		const textNode = logoRoot.querySelector<HTMLElement>('.ecopages-logo__text');
		const textMarkup = (() => {
			if (!textNode || !textNode.textContent?.trim()) {
				return '';
			}

			const textRect = textNode.getBoundingClientRect();
			const textStyle = getComputedStyle(textNode);
			return `<text x="${round(textRect.left - rootRect.left + padding)}" y="${round(textRect.top - rootRect.top + textRect.height / 2 + padding)}" fill="${escapeXml(textStyle.color)}" font-family="${escapeXml(textStyle.fontFamily)}" font-size="${escapeXml(textStyle.fontSize)}" font-weight="${escapeXml(textStyle.fontWeight)}" letter-spacing="${escapeXml(textStyle.letterSpacing)}" dominant-baseline="middle">${escapeXml(textNode.textContent.trim())}</text>`;
		})();

		return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${round(rootRect.width + padding * 2)}" height="${round(rootRect.height + padding * 2)}" viewBox="0 0 ${round(rootRect.width + padding * 2)} ${round(rootRect.height + padding * 2)}" fill="none">
	${badgeMarkup}
	${symbolMarkup}
	${textMarkup}
</svg>
`;
	};

	private readonly handleExport = () => {
		const markup = this.buildExportMarkup();
		if (!markup) {
			return;
		}

		const fileName = ['ecopages-logo', this.squircle ? 'squircle' : 'plain', this.variant, this.mode, this.textId]
			.filter((part) => part && part !== 'none')
			.join('-');
		const blob = new Blob([markup], { type: 'image/svg+xml;charset=utf-8' });
		const objectUrl = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = objectUrl;
		link.download = `${fileName}.svg`;
		link.style.display = 'none';
		document.body.append(link);
		link.click();
		link.remove();
		window.setTimeout(() => {
			URL.revokeObjectURL(objectUrl);
		}, 0);
	};

	private readonly getTextOption = () => PLAYGROUND_TEXT_OPTIONS.find((option) => option.id === this.textId);

	private readonly getSummary = () => {
		const textLabel = this.getTextOption()?.label ?? 'No text';
		const textSegment = this.textId === 'none' ? 'without text' : `with ${textLabel} text`;
		const shadowSegment = this.squircle ? '' : ` with ${this.shadow ? 'shadow' : 'no shadow'}`;
		return `${this.variant === 'gradient' ? 'Gradient' : 'Flat'} ${this.squircle ? 'squircle' : 'plain'} logo ${textSegment}${shadowSegment} on a ${this.mode} surface at ${this.fontSizeRem.toFixed(2)}rem.`;
	};

	override render() {
		const text = this.getTextOption()?.text ?? '';
		const modeDescription = PREVIEW_MODES.find((mode) => mode.id === this.mode)?.description ?? '';
		const name = `logo-preview-${this.squircle ? 'squircle' : 'plain'}-${this.variant}-${this.mode}-${this.textId}`;
		const previewStyle = {
			'--ecopages-logo-size': `${this.fontSizeRem.toFixed(2)}rem`,
		};

		return (
			<div class="logo-playground">
				<form class="logo-playground__controls">
					<fieldset class="logo-playground__group">
						<legend>Variant</legend>
						<div class="logo-playground__chips">
							{PREVIEW_VARIANTS.map((variant) => (
								<label key={variant.id} class="logo-playground__chip">
									<input
										type="radio"
										name="variant"
										value={variant.id}
										checked={variant.id === this.variant}
										on:change={this.handleVariantChange}
									/>
									<span>{variant.label}</span>
								</label>
							))}
						</div>
					</fieldset>

					<fieldset class="logo-playground__group">
						<legend>Inner text</legend>
						<label class="logo-playground__field">
							<select class="logo-playground__select" name="text" on:change={this.handleTextChange}>
								{PLAYGROUND_TEXT_OPTIONS.map((option) => (
									<option key={option.id} value={option.id} selected={option.id === this.textId}>
										{option.label}
									</option>
								))}
							</select>
						</label>
					</fieldset>

					<fieldset class="logo-playground__group">
						<legend>Surface</legend>
						<div class="logo-playground__chips">
							{PREVIEW_MODES.map((mode) => (
								<label key={mode.id} class="logo-playground__chip">
									<input
										type="radio"
										name="mode"
										value={mode.id}
										checked={mode.id === this.mode}
										on:change={this.handleModeChange}
									/>
									<span>{mode.label}</span>
								</label>
							))}
						</div>
						<p class="logo-playground__hint">{modeDescription}</p>
					</fieldset>

					<fieldset class="logo-playground__group">
						<legend>Shape</legend>
						<div class="logo-playground__chips">
							{PREVIEW_SQUIRCLE_OPTIONS.map((option) => (
								<label key={option.id} class="logo-playground__chip">
									<input
										type="radio"
										name="squircle"
										value={option.id}
										checked={option.squircle === this.squircle}
										on:change={this.handleSquircleChange}
									/>
									<span>{option.label}</span>
								</label>
							))}
						</div>
					</fieldset>

					<fieldset class="logo-playground__group" disabled={this.squircle ? 'true' : undefined}>
						<legend>Shadow</legend>
						<div class="logo-playground__chips">
							{PREVIEW_SHADOW_OPTIONS.map((option) => (
								<label key={option.id} class="logo-playground__chip">
									<input
										type="radio"
										name="shadow"
										value={option.id}
										checked={option.shadow === this.shadow}
										disabled={this.squircle ? 'true' : undefined}
										on:change={this.handleShadowChange}
									/>
									<span>{option.label}</span>
								</label>
							))}
						</div>
						<p class="logo-playground__hint">Available for the plain logo only.</p>
					</fieldset>

					<fieldset class="logo-playground__group">
						<legend>Font size</legend>
						<div class="logo-playground__range-header">
							<span class="logo-playground__hint">Scale the current mark in rem units.</span>
							<output class="logo-playground__range-value">{this.fontSizeRem.toFixed(2)}rem</output>
						</div>
						<input
							class="logo-playground__range-input"
							type="range"
							min={String(MIN_FONT_SIZE_REM)}
							max={String(MAX_FONT_SIZE_REM)}
							step={String(FONT_SIZE_STEP_REM)}
							value={String(this.fontSizeRem)}
							aria-label="Logo font size"
							on:input={this.handleFontSizeInput}
						/>
					</fieldset>

					<button type="button" class="logo-playground__export" on:click={this.handleExport}>
						Export SVG
					</button>
				</form>

				<div class="logo-playground__stage-shell">
					<div class="logo-playground__stage" data-mode={this.mode}>
						<div class="logo-playground__preview">
							<div class="logo-playground__preview-canvas" style={previewStyle}>
								<Logo
									mode={this.mode}
									name={name}
									shadow={this.shadow}
									squircle={this.squircle}
									variant={this.variant}
								>
									{text || undefined}
								</Logo>
							</div>
						</div>
					</div>
					<p class="logo-playground__summary">{this.getSummary()}</p>
				</div>
			</div>
		);
	}
}
