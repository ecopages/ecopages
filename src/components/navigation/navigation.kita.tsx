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
          <a href="/about/me">Me</a>
        </li>
      </ul>
    </nav>
  );
}

Navigation.stylesheet = 'navigation.styles.css';