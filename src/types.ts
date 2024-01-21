export interface EcoComponent<T = {}> {
  (props: T): JSX.Element;
  dependencies?: string[];
}
