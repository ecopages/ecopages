import { BaseLayout } from '@/layouts/base-layout';
import type { EcoComponent, GetMetadata } from '@ecopages/core';

export const getMetadata: GetMetadata = () => ({
  title: 'Radiant UI | Button',
  description:
    'Radiant UI is a collection of components for building websites and web applications. This is the documentation for the Button component.',
  image: 'public/assets/images/default-og.png',
  keywords: ['typescript', 'radiant-ui', 'button'],
});

const Icon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    role="presentation"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2" />
    <path d="M12 20v2" />
    <path d="m4.93 4.93 1.41 1.41" />
    <path d="m17.66 17.66 1.41 1.41" />
    <path d="M2 12h2" />
    <path d="M20 12h2" />
    <path d="m6.34 17.66-1.41 1.41" />
    <path d="m19.07 4.93-1.41 1.41" />
  </svg>
);

const ButtonPage: EcoComponent = () => {
  return (
    <BaseLayout class="prose">
      <h1 class="main-title">Button</h1>
      <div class="flex gap-4 my-8">
        <button type="button" class="rui-button rui-button--primary rui-button--md">
          Primary
        </button>
        <button type="button" class="rui-button rui-button--primary rui-button--icon">
          <Icon />
        </button>
      </div>
      <div class="flex gap-4 my-8">
        <button type="button" class="rui-button rui-button--secondary rui-button--md">
          Secondary
        </button>
        <button type="button" class="rui-button rui-button--secondary rui-button--icon">
          <Icon />
        </button>
      </div>
      <div class="flex gap-4 my-8">
        <button type="button" class="rui-button rui-button--ghost rui-button--md">
          Ghost
        </button>
        <button type="button" class="rui-button rui-button--ghost rui-button--icon">
          <Icon />
        </button>
      </div>
      <div class="flex gap-4 my-8">
        <button type="button" class="rui-button rui-button--error rui-button--md">
          Error
        </button>
        <button type="button" class="rui-button rui-button--error rui-button--icon">
          <Icon />
        </button>
      </div>
    </BaseLayout>
  );
};

ButtonPage.config = {
  importMeta: import.meta,
  dependencies: { components: [BaseLayout] },
};

export default ButtonPage;
