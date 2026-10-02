/** Contracts of the workshop's accessible primitives. Implemented in this folder, consumed by the workshop. */
import type { ReactNode } from "react";

export interface MenuItem {
  readonly id: string;
  readonly label: string;
  /** Second, smaller line (for instance a fidelity note). */
  readonly description?: string;
  readonly disabled?: boolean;
  /** Radio-style item that is currently selected. Renders role `menuitemradio` with aria-checked. */
  readonly checked?: boolean;
  readonly onSelect: () => void;
}

export interface MenuProps {
  /** Visible label of the trigger button. */
  readonly label: ReactNode;
  /** Accessible name of the trigger and of the menu. */
  readonly ariaLabel: string;
  readonly items: readonly MenuItem[];
  readonly disabled?: boolean;
  readonly testId?: string;
  readonly title?: string;
  /** Items with `checked` are radio items; the group takes this name. */
  readonly className?: string;
}

export interface TabItem {
  readonly id: string;
  readonly label: string;
}

export interface DiagramTabsProps {
  readonly tabs: readonly TabItem[];
  readonly activeId: string | undefined;
  readonly onSelect: (id: string) => void;
  /** Accessible name of the tablist. */
  readonly ariaLabel: string;
  /** Id of the tabpanel the tabs control. */
  readonly panelId: string;
  /** Prefix that makes tab ids unique per workshop instance; the tab id is `${idPrefix}-tab-${id}`. */
  readonly idPrefix: string;
}

export const tabDomId = (idPrefix: string, id: string): string => `${idPrefix}-tab-${id}`;
