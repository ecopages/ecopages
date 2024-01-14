import Alpine from "alpinejs";

declare module "*.css?inline" {
  const content: string;
  export default content;
}

declare global {
  interface Window {
    Alpine: typeof Alpine;
  }
}