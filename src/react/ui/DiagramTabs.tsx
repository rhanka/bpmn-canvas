import { useRef } from "react";
import type { KeyboardEvent, ReactElement } from "react";
import { tabDomId } from "./contracts.js";
import type { DiagramTabsProps } from "./contracts.js";

/** Accessible tab strip (tablist pattern, automatic activation, roving tabindex). */
export function DiagramTabs(props: DiagramTabsProps): ReactElement {
  const { tabs, activeId, onSelect, ariaLabel, panelId, idPrefix } = props;
  const refs = useRef(new Map<string, HTMLButtonElement>());

  const go = (index: number): void => {
    const tab = tabs[(index + tabs.length) % tabs.length];
    if (!tab) return;
    onSelect(tab.id);
    refs.current.get(tab.id)?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (!tabs.length) return;
    const current = tabs.findIndex((t) => tabDomId(idPrefix, t.id) === (e.target as HTMLElement).id);
    const at = current < 0 ? Math.max(0, tabs.findIndex((t) => t.id === activeId)) : current;
    if (e.key === "ArrowRight") go(at + 1);
    else if (e.key === "ArrowLeft") go(at - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(tabs.length - 1);
    else return;
    e.preventDefault();
  };

  return (
    <div className="bpmn-workshop-tabs" role="tablist" aria-label={ariaLabel} onKeyDown={onKeyDown}>
      {tabs.map((tab) => {
        const selected = tab.id === activeId;
        return (
          <button
            key={tab.id}
            id={tabDomId(idPrefix, tab.id)}
            ref={(el) => {
              if (el) refs.current.set(tab.id, el);
              else refs.current.delete(tab.id);
            }}
            type="button"
            role="tab"
            className="bpmn-workshop-tabs__tab"
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            title={tab.label}
            onClick={() => onSelect(tab.id)}
          >
            <span className="bpmn-workshop-tabs__label">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
