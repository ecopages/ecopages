import { createStylesheets } from "macros/stylesheets.macro"  with { type: 'macro' };

export function Navigation() {
  return (
    <nav class="navigation">
      <ul>
        <li>
          <a href="/">Home</a>
        </li>
        <li>
          <a href="/about">About</a>
        </li>
        <li>
          <a href="/stream-test">Stream Test</a>
        </li>
      </ul>
    </nav>
  );
}

Navigation.stylesheets = await createStylesheets({ paths: ['@/src/components/navigation/navigation.styles.css'] }) as string[];