import {
  Select as AriaSelect,
  Button,
  FieldError,
  Label,
  ListBox,
  ListBoxItem,
  type ListBoxItemProps,
  Popover,
  type SelectProps,
  SelectValue,
  Text,
  type ValidationResult,
} from 'react-aria-components';

import type { EcoComponent } from '@ecopages/core';
import type { ReactNode } from 'react';

interface MySelectProps<T extends object> extends Omit<SelectProps<T>, 'children'> {
  label?: string;
  description?: string;
  errorMessage?: string | ((validation: ValidationResult) => string);
  items?: Iterable<T>;
  children: ReactNode | ((item: T) => ReactNode);
}

export const Select: EcoComponent<MySelectProps<object>> = ({
  label,
  description,
  errorMessage,
  children,
  items,
  ...props
}) => {
  return (
    <AriaSelect className="grid gap-2 items-start justify-start w-fit cursor-pointer" {...props}>
      <Label>{label}</Label>
      <Button className="flex gap-2 w-full justify-between border border-gray-300 rounded px-3 py-2 min-w-40 focus-visible:outline-4 focus-visible:outline-blue-500">
        <SelectValue />
        <span aria-hidden="true">▼</span>
      </Button>
      {description && <Text slot="description">{description}</Text>}
      <FieldError>{errorMessage}</FieldError>
      <Popover>
        <ListBox
          className="bg-white grid gap-y-2 rounded border border-gray-300 shadow-sm p-2 focus-visible:outline-4 focus-visible:outline-blue-500"
          items={items}
        >
          {children}
        </ListBox>
      </Popover>
    </AriaSelect>
  );
};

export function Item(props: ListBoxItemProps) {
  return (
    <ListBoxItem
      {...props}
      className={({ isFocused, isSelected }) =>
        `cursor-pointer p-1 ${isFocused ? 'focus-visible:outline-4 focus-visible:outline-blue-500' : ''} ${isSelected ? 'selected' : ''}`
      }
    />
  );
}

Select.config = {
  importMeta: import.meta,
};
