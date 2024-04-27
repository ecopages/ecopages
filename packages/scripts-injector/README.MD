# Scripts Injector

The Scripts Injector is a custom element designed to dynamically load scripts into your web page. It provides a way to load scripts based on certain conditions and events.

## Usage

To use the Scripts Injector, you need to include it in your HTML:

```tsx
<scripts-injector></scripts-injector>
```

## Props

The ScriptInjectorProps type defines the properties that can be used to control the behavior of the script-injector custom element. Here are the available properties:

`"on:idle"`: This optional boolean property determines whether the script should be loaded once the DOM is ready. For example, `<script-injector on:idle></script-injector>` will load the script as soon as the DOM is ready.

`"on:interaction"`: This optional property allows you to specify a series of events that will trigger the loading of the script. It can be either "touchstart,click" or "mouseenter,focusin". For example, `<script-injector on:interaction="mouseenter, focusin"></script-injector>` will load the script when the user either mouses over the element or focuses on it.

`"on:visible"`: This optional property can be either a string or a boolean. If it's a string, it should specify the root margin for an Intersection Observer that will load the script when the element comes into view. If it's a boolean and it's true, the script will be loaded when the element comes into view with a default root margin. For example, `<script-injector on:visible="50px 1px"></script-injector>` will load the script when the element comes into view, with a root margin of 50px 1px.

`scripts`: This property should be a comma-separated string of scripts to be loaded. For example, `<script-injector scripts="script1.js,script2.js"></script-injector>` will load script1.js and script2.js.

## Typical usage

This passage provides a standard use case for the custom element. The script is designed to load when the user interacts with it, either through mouse entry or a focus event. If multiple script injectors are present with the same script, only the first one will execute the load. This is because once a script is loaded, all script injectors are notified and subsequently remove the script from their loading responsibilities.

```tsx
<script-injector on:interaction="mouseenter,focusin" scripts={["path/to/my/element"]}>
  <lit-counter class="lit-counter" count={8}></lit-counter>
</script-injector>
```

## Inspiration

This is undeniably heavily influenced by [11ty/is-land](https://github.com/11ty/is-land), [Astro island](https://docs.astro.build/en/concepts/islands/) nd the "component island" concept, originally introduced by Etsy's frontend architect, Katie Sylor-Miller.
