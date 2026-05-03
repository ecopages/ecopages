import { RadiantElement, customElement, state } from '@ecopages/radiant';
import { Logo, type LogoMode } from '../logo/logo';
import { LOGO_PLAYGROUND_FONT_SIZE_RANGE, type LogoVariant } from '../logo/logo.constants';
import '../radiant-controls/radiant-select.script';
import '../radiant-controls/radiant-slider.script';
import '../radiant-controls/radiant-toggle-selector.script';
import '../switch/switch.script';

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

const PLAYGROUND_TEXT_OPTIONS = [
	{ id: 'ecopages', label: 'ecopages', text: 'ecopages' },
	{ id: 'radiant', label: 'radiant', text: 'radiant' },
	{ id: 'scripts-injector', label: 'scripts-injector', text: 'scripts-injector' },
	{ id: 'logger', label: 'logger', text: 'logger' },
	{ id: 'none', label: 'No text', text: undefined },
] as const;

type PlaygroundTextId = (typeof PLAYGROUND_TEXT_OPTIONS)[number]['id'];
const EXPORT_PADDING_PX = 32;
const PNG_EXPORT_SCALE = 2;

const escapeXml = (value: string): string =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;');

const round = (value: number): string => value.toFixed(2);

type LogoExportAsset = {
	fileName: string;
	height: number;
	markup: string;
	width: number;
};

@customElement('radiant-logo-playground')
export class RadiantLogoPlayground extends RadiantElement {
	@state mode: LogoMode = 'light';
	@state shadow = true;
	@state squircle = true;
	@state textId: PlaygroundTextId = 'ecopages';
	@state variant: LogoVariant = 'gradient';
	@state fontSizeRem: number = LOGO_PLAYGROUND_FONT_SIZE_RANGE.defaultRem;

	private readonly getStringEventValue = (event: Event): string => {
		return (event as CustomEvent<{ value: string }>).detail.value;
	};

	private readonly getNumberEventValue = (event: Event): number => {
		return (event as CustomEvent<{ value: number }>).detail.value;
	};

	private readonly getBooleanEventValue = (event: Event): boolean => {
		return (event as CustomEvent<{ checked: boolean }>).detail.checked;
	};

	private readonly handleVariantChange = (event: Event) => {
		this.variant = this.getStringEventValue(event) as LogoVariant;
	};

	private readonly handleModeChange = (event: Event) => {
		this.mode = this.getStringEventValue(event) as LogoMode;
	};

	private readonly handleSquircleChange = (event: Event) => {
		this.squircle = this.getStringEventValue(event) === 'true';
	};

	private readonly handleTextChange = (event: Event) => {
		this.textId = this.getStringEventValue(event) as PlaygroundTextId;
	};

	private readonly handleShadowChange = (event: Event) => {
		this.shadow = this.getBooleanEventValue(event);
	};

	private readonly handleFontSizeInput = (event: Event) => {
		this.fontSizeRem = this.getNumberEventValue(event);
	};

	private readonly getExportFileName = (): string => {
		return ['ecopages-logo', this.squircle ? 'squircle' : 'plain', this.variant, this.mode, this.textId]
			.filter((part) => part && part !== 'none')
			.join('-');
	};

	private readonly triggerBlobDownload = (blob: Blob, fileName: string) => {
		const objectUrl = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = objectUrl;
		link.download = fileName;
		link.style.display = 'none';
		document.body.append(link);
		link.click();
		link.remove();
		window.setTimeout(() => {
			URL.revokeObjectURL(objectUrl);
		}, 0);
	};

	private readonly buildExportAsset = (): LogoExportAsset | null => {
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

		const width = rootRect.width + padding * 2;
		const height = rootRect.height + padding * 2;
		const fileName = this.getExportFileName();
		const markup = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${round(width)}" height="${round(height)}" viewBox="0 0 ${round(width)} ${round(height)}" fill="none">
	${badgeMarkup}
	${symbolMarkup}
	${textMarkup}
</svg>
`;

		return {
			fileName,
			height,
			markup,
			width,
		};
	};

	private readonly handleSvgExport = () => {
		const asset = this.buildExportAsset();
		if (!asset) {
			return;
		}

		this.triggerBlobDownload(new Blob([asset.markup], { type: 'image/svg+xml;charset=utf-8' }), `${asset.fileName}.svg`);
	};

	private readonly handlePngExport = async () => {
		const asset = this.buildExportAsset();
		if (!asset) {
			return;
		}

		await document.fonts.ready;

		const svgBlob = new Blob([asset.markup], { type: 'image/svg+xml;charset=utf-8' });
		const svgUrl = URL.createObjectURL(svgBlob);

		try {
			const image = await new Promise<HTMLImageElement>((resolve, reject) => {
				const nextImage = new Image();
				nextImage.decoding = 'async';
				nextImage.onload = () => resolve(nextImage);
				nextImage.onerror = () => reject(new Error('Failed to load logo export image.'));
				nextImage.src = svgUrl;
			});

			const canvas = document.createElement('canvas');
			canvas.width = Math.ceil(asset.width * PNG_EXPORT_SCALE);
			canvas.height = Math.ceil(asset.height * PNG_EXPORT_SCALE);

			const context = canvas.getContext('2d');
			if (!context) {
				return;
			}

			context.scale(PNG_EXPORT_SCALE, PNG_EXPORT_SCALE);
			context.drawImage(image, 0, 0, asset.width, asset.height);

			const pngBlob = await new Promise<Blob | null>((resolve) => {
				canvas.toBlob(resolve, 'image/png');
			});
			if (!pngBlob) {
				return;
			}

			this.triggerBlobDownload(pngBlob, `${asset.fileName}.png`);
		} finally {
			URL.revokeObjectURL(svgUrl);
		}
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
		const size = `${this.fontSizeRem.toFixed(2)}rem`;

		return (
			<div class="logo-playground">
				<form class="logo-playground__controls">
					<radiant-toggle-selector
						label="Variant"
						name="variant"
						prop:options={PREVIEW_VARIANTS}
						value={this.variant}
						on:change={this.handleVariantChange}
					></radiant-toggle-selector>

					<radiant-select
						label="Inner text"
						name="text"
						prop:options={PLAYGROUND_TEXT_OPTIONS.map((option) => ({ id: option.id, label: option.label }))}
						value={this.textId}
						on:change={this.handleTextChange}
					></radiant-select>

					<radiant-toggle-selector
						description={modeDescription}
						label="Surface"
						name="mode"
						prop:options={PREVIEW_MODES}
						value={this.mode}
						on:change={this.handleModeChange}
					></radiant-toggle-selector>

					<radiant-toggle-selector
						label="Shape"
						name="squircle"
						prop:options={PREVIEW_SQUIRCLE_OPTIONS.map((option) => ({ id: option.id, label: option.label }))}
						value={String(this.squircle)}
						on:change={this.handleSquircleChange}
					></radiant-toggle-selector>

					<radiant-switch
						id="logo-playground-shadow"
						class="radiant-switch"
						label="Shadow"
						description="Available for the plain logo only."
						prop:checked={this.shadow}
						prop:disabled={this.squircle}
						on:change={this.handleShadowChange}
					></radiant-switch>

					<radiant-slider
						description="Scale the current mark in rem units."
						label="Font size"
						aria-label="Logo font size"
						min={LOGO_PLAYGROUND_FONT_SIZE_RANGE.minRem}
						max={LOGO_PLAYGROUND_FONT_SIZE_RANGE.maxRem}
						step={LOGO_PLAYGROUND_FONT_SIZE_RANGE.stepRem}
						value={this.fontSizeRem}
						unit="rem"
						on:input={this.handleFontSizeInput}
					></radiant-slider>

					<div class="logo-playground__export-actions">
						<button type="button" class="button button--primary" on:click={this.handleSvgExport}>
							Export SVG
						</button>
						<button type="button" class="button button--outline" on:click={this.handlePngExport}>
							Export PNG
						</button>
					</div>
				</form>

				<div class="logo-playground__stage-shell">
					<div class="logo-playground__stage" data-mode={this.mode}>
						<div class="logo-playground__preview">
							<div class="logo-playground__preview-canvas">
								<Logo
									mode={this.mode}
									name={name}
									shadow={this.shadow}
									size={size}
									squircle={this.squircle}
									variant={this.variant}
								>
									{text}
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
