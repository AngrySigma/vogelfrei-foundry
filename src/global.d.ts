/// <reference types="@league-of-foundry-developers/foundry-vtt-types" />

import type { VogelfreiConfig } from "./module/config";

declare global {
  // Configure foundry-vtt-types for lenient typing
  // Assume all initialization hooks have run for full Game type coverage
  interface AssumeHookRan {
    init: never;
    i18nInit: never;
    setup: never;
    ready: never;
  }

  interface CONFIG {
    VF: VogelfreiConfig;
  }

  // Foundry extends Math with clamp() (see foundry client primitives/math),
  // but the League v13 types don't re-export it via the main entry.
  interface Math {
    clamp(value: number, min: number, max: number): number;
  }

  interface Game {
    vf: {
      rollItemMacro: (itemName: string) => Promise<void>;
      rollTableMacro: (tableUuid: string) => void;
    };
    ose: Game["vf"];
  }

  namespace Game {
    interface SystemData<T> {
      /** Defining game.system.id as a const. */
      id: "vogelfrei" | "vogelfrei-dev";
    }
  }
}

type Override<Type, NewType extends { [key in keyof Type]?: NewType[key] }> = Omit<Type, keyof NewType> & NewType;

type VogelfreiContextMenuEntry = Override<ContextMenuEntry, {
  /**
   * The function to call when the menu item is clicked. Receives the HTML element of the SidebarTab entry that this context menu is for.
   */
  callback: (target: HTMLElement) => void;

  /**
   * A function to call to determine if this item appears in the menu. Receives the HTML element of the SidebarTab entry that this context menu is for.
   */
  condition?: boolean | ((target: HTMLElement) => boolean);
}>