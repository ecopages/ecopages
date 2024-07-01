import type { EcoComponent } from '@ecopages/core';

export type ButtonProps = {
  children: JSX.Element;
  hierarchy: 'primary' | 'secondary' | 'error';
  size: 'small' | 'medium' | 'large';
  disabled?: boolean;
};

export const Button: EcoComponent<ButtonProps> = ({
  children,
  hierarchy = 'primary',
  size = 'small',
  disabled = false,
}) => {
  return (
    <button type="button" class={`button button--${hierarchy} button--${size}`} disabled={disabled}>
      {children}
    </button>
  );
};
