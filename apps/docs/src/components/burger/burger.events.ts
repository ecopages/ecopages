export enum BurgerEvents {
  TOGGLE_MENU = 'toggle-menu',
  CLOSE_MENU = 'close-menu',
}

interface CustomEventMap {
  [BurgerEvents.TOGGLE_MENU]: CustomEvent<never>;
  [BurgerEvents.CLOSE_MENU]: CustomEvent<never>;
}

declare global {
  interface WindowEventMap extends CustomEventMap {}
  interface DocumentEventMap extends CustomEventMap {}
}
