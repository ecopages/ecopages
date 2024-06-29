import { DepsManager, type EcoComponent } from '@ecopages/core';

export const ApiField: EcoComponent<{
  name: string;
  type: string;
  defaultValue: string;
  mandatory: boolean;
  children: string;
}> = ({ name, defaultValue, mandatory, type, children }) => {
  return (
    <div class="api-field">
      <div class="api-field__top-line">
        <span class="api-field__name" safe>
          {mandatory ? `${name}*` : name}
        </span>
        <span class="api-field__type" safe>
          {type}
        </span>
        {defaultValue ? <span class="api-field__default-value">@default: {defaultValue as 'safe'}</span> : null}
      </div>
      {children as 'safe'}
    </div>
  );
};

ApiField.dependencies = DepsManager.collect({ importMeta: import.meta, stylesheets: ['./api-field.css'] });
