/** Contracts of the workshop's accessible primitives. Implemented in this folder, consumed by the workshop. */
import type { ReactNode } from "react";

export interface MenuItem {
  readonly id: string;
  /** `item` (default) is selectable; `separator` is a rule; `header` is a non-selectable title (its `label`). */
  readonly kind?: "item" | "separator" | "header";
  readonly label: string;
  /** Second, smaller line (for instance a fidelity note). */
  readonly description?: string;
  readonly disabled?: boolean;
  /** Radio-style item that is currently selected. Renders role `menuitemradio` with aria-checked. */
  readonly checked?: boolean;
  /** Toggle-style item: role `menuitem` with `aria-pressed`, no check mark. */
  readonly pressed?: boolean;
  readonly onSelect: () => void;
}

export interface MenuProps {
  /** Visible label of the trigger button. */
  readonly label: ReactNode;
  /** Accessible name of the trigger and of the menu. Without it the trigger is named by its text. */
  readonly ariaLabel?: string;
  /** `svg` (default): a drawn chevron; `text`: " ▾" after the label; `none`: no chevron. */
  readonly chevron?: "svg" | "text" | "none";
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
