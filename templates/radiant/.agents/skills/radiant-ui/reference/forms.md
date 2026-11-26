# Forms and values

## Contents

- Field and form
- Native FormData
- Nested values and native validity
- Multi-value `value`
- Custom controls
- Errors that do not belong to a control
- Injecting a form state store
- Warnings

## Field and form

`RuiField` (`<rui-field>`) connects one composed control to an ancestor `RuiForm` (`<rui-form>`). It discovers the outermost `[data-rui-control]` or known `rui-*` control host; a nested host such as the `rui-listbox` inside `rui-select` is not a field control. Set `name` on the field and it copies the name to the control. `RuiForm` validates through its store and hands every field value to `onSubmit`.

Form controls dispatch the platform's `input` (the user changed the value) and `change` (the user committed it) on the element whose value changed, after its `value` is updated. There is no `detail`: read `host.value` or `host.checked`. `rui-checkbox`, `rui-switch`, `rui-radio-group` and `rui-checkbox-group` dispatch nothing themselves; their native inner `<input>` events bubble through the host, which has already synced its state. Programmatic writes (property, attribute, store, reset) dispatch nothing. Act only when `event.target` is the control host, or a member input of a wrapper or group, since nested parts' events also reach ancestors. Non-form components (tabs, tree, menu, table, calendar, cycle-toggle) keep `rui-change` with the value in `detail`.

Without a `submitHandler`, with the built-in store or an injected one, the form runs one submission at a time per store: a submit while one is pending, through validation and an awaited `onSubmit`, is ignored, and the next is accepted once it settles, even after it threw. A submission ends in `rui-submit` or `rui-invalid` unless it was abandoned, and an abandoned one emits nothing and does not call `onSubmit`: the injected store's `validate()` resolved `overtaken`, the store was replaced by `connect` or its disposer before validation settled, or the form is not connected when validation settles (a form removed and inserted again in the same task keeps its submission). With a `submitHandler` the handler owns submission and is called for every submit.

## Native FormData

`new FormData(form)` and native `action` / `method` submission see only listed controls:

- `RuiInput`, `RuiTextarea`, checkbox, switch, radio, checkbox group and radio group submit through their inner native input.
- `rui-date-input`, `rui-number-field`, `rui-slider` and `rui-knob` are form-associated and submit through `name` on the host; a range slider also submits `{name}-max`. `RuiDateField` copies `name` to its nested `rui-date-input`; `RuiDateRangePicker` puts `start-name` / `end-name` on its two inputs.
- `RuiSelect`, `RuiCombobox`, `RuiListbox` and `RuiTagGroup` are store-only: read them from `RuiForm` `onSubmit`, not from `FormData`.

## Nested values and native validity

A dotted field `name` addresses a nested value tree: `profile.name` is `values.profile.name` and `rows.0.title` is `values.rows[0].title`. `rui-submit` carries that tree, `defaultValues` are given as one, and the HTML `name` attribute stays dotted.

Native `input`, `textarea` and `select` controls count: `required`, `type="email"`, `minlength`, `pattern`, `min`, `max` and `step` block submit in the built-in store and show their error. The browser computes the verdict; `RuiForm` forwards the failing flag as the error `type` and the constraint as `params`. There is no switch, and a control with no constraint attributes contributes nothing. A native `select` is read as its value, or as a list of values when `multiple`.

## Multi-value `value`

`rui-select`, `rui-combobox`, `rui-listbox`, `rui-checkbox-group`, `rui-tag-group` and `rui-table` share one protocol:

- HTML attribute: comma-separated tokens (`value="ca,tx"`); an empty selection omits it.
- JS property: always `string[]` (`[]` when empty).
- `Rui*` views: `string | readonly string[] | undefined`; a string is parsed as CSV.
- `input` and `change` carry no detail; read `host.value`.

`rui-slider` is the numeric variant: attribute `50` or `25,75`, property `number[]`, view `number | readonly number[]`. Two numbers put it in range mode.

## Custom controls

To put a third-party host in a `RuiField`, call `registerFieldControl` from `@ecopages/radiant-ui/form` before the field connects. Registration supplies value access, name wiring and a `submission` policy: `native` (default: the field names the control's native input), `host` (a form-associated host) or `none` (store only). It does not make the host form-associated. A form-associated host that calls `this.internals?.setValidity(flags, message)` makes its field invalid on submit and shows `message` (a rule or resolver message wins; call `setValidity` before dispatching `input`). A non-`FormAssociatedElement` host supplies `validity: (host) => ({ valid, message })` to `registerFieldControl`. For native `FormData`, extend `FormAssociatedElement` from `@ecopages/radiant/form-associated-element`. Dispatch `input` (and `change` on commit) on the host itself after updating `value`; the field ignores events from nested parts. When the host declares `data-rui-aria-target(s)`, read `fieldContext` into a `@contextSelector` + `@state` field and bind it to the target: spread `fieldAria(field)` in `render()`, or decorate the field with `@bindTo(fieldAriaBindings('input'))` for authored DOM (from `@ecopages/radiant-ui/field`). The field writes no ARIA, `id` or `data-rui-field-managed` for such a host; the helpers paint all three on the target. `data-rui-field-managed` marks a target whose ARIA comes from the field, so a Radiant UI control nested in the host never relabels it; never set it yourself. Painted hosts support one ARIA target (both helpers yield one `id`); a host with several `data-rui-aria-targets` assigns its own ids. The field no longer sets native `disabled` on a painted target: bind it yourself (`disabled={field?.disabled}`). Register the tag with `registerFieldControl` before the field connects and put `data-rui-aria-target` on the host in the field's markup.

## Errors that do not belong to a control

`<RuiFieldError error="Add at least one item" />` (from `@ecopages/radiant-ui/field`) is a controlled region: it shows `error` (`children` as fallback), is visible while it has content, works outside `RuiField` and in server output, and an enclosing field never overwrites or hides it. `error=""` keeps it controlled and hidden; omit `error` for the default, where the field fills the region from its message. For a group, point `aria-describedby` or `aria-errormessage` at the region's `id`. Inside a field a controlled region without an `id` gets one and is listed in the control's `aria-describedby`.

With the built-in `FormStore`, write errors that come from elsewhere, such as a server response, with `store.setErrors(source, errors)` and remove them with `setErrors(source, {})` or `clearErrors(path?)`. `store.errors` is read-only: it returns the merged errors and cannot be assigned.

## Injecting a form state store

When something else owns form state, hand it to the form with `form.connect(store, { formatError, submitHandler, resetHandler })`. It is the only way to inject a store and it returns a disposer that returns the form to its own store. The store implements `FormStateStore` (`getValue`, `setValue`, `blur`, `getSnapshot`, `subscribe`, `reset`, `validate`, `reportNative`), owns validation timing, defaults and which errors and warnings show, and receives each control's native validity as a pushed fact, `reportNative(facts)`, whenever a control's value or presence changes. Call `form.sync()` before validating the store yourself outside submit; submit calls it first. `validate()` resolves `{ outcome: 'passed' | 'invalid' | 'overtaken' }`: `passed` emits `rui-submit`, `invalid` emits `rui-invalid` with the snapshot's errors, and `overtaken` (a newer write superseded the check) ends the submission with neither event, as in the rule above. The form ignores `mode`, `revalidate-mode`, `defaultValues`, `resolver` and field `rules` while a store is connected. A custom control host registered with `registerFieldControl` must dispatch a bubbling `input` (and `change` on commit) on itself after it updates `value`; the field writes on those events only when `event.target` is the host, or a member native input of a wrapper or group (`FieldControlAdapter.events: 'members'`). It must also call `announceControlConnect(this)` when it connects, so a field that registered earlier seeds it; a native `data-rui-control` input, select or textarea must already be inside its field when the field connects.

## Warnings

`<RuiFieldWarning />` (from `@ecopages/radiant-ui/field`, `role="status"`) shows a warning that a connected store reports for the field. A warning never marks the control invalid and never blocks submit.
