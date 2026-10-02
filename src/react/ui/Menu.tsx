import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactElement } from "react";
import { CheckIcon, ChevronDownIcon } from "./icons.js";
import type { MenuProps } from "./contracts.js";

const TYPEAHEAD_MS = 500;

/** Accessible dropdown menu: ARIA menu button pattern, written without a UI library. */
export function Menu(props: MenuProps): ReactElement {
  const { label, ariaLabel, items, disabled, testId, title, className } = props;
  const id = useId();
  const popupId = `${id}-menu`;
  const triggerId = `${id}-trigger`;
  const [open, setOpen] = useState(false);
  const [focusIndex, setFocusIndex] = useState(-1);
  const [shift, setShift] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const typeahead = useRef<{ text: string; at: number }>({ text: "", at: 0 });

  const enabled = useCallback((): number[] => items.flatMap((it, i) => (it.disabled ? [] : [i])), [items]);

  const close = useCallback((refocus: boolean): void => {
    setOpen(false);
    setFocusIndex(-1);
    if (refocus) triggerRef.current?.focus();
  }, []);

  const openAt = useCallback(
    (where: "first" | "last"): void => {
      const list = enabled();
      const target = where === "first" ? list[0] : list[list.length - 1];
      setOpen(true);
      setFocusIndex(target ?? -1);
    },
    [enabled],
  );

  // Focus follows the active index.
  useEffect(() => {
    if (open && focusIndex >= 0) itemRefs.current[focusIndex]?.focus();
  }, [open, focusIndex]);

  // Keep the popup inside the viewport horizontally.
  useLayoutEffect(() => {
    if (!open) {
      setShift(0);
      return;
    }
    const popup = popupRef.current;
    if (!popup) return;
    const vw = popup.ownerDocument.documentElement.clientWidth;
    const rect = popup.getBoundingClientRect();
    let s = 0;
    if (rect.right > vw - 8) s = vw - 8 - rect.right;
    if (rect.left + s < 8) s = 8 - rect.left;
    setShift(Math.round(s));
  }, [open]);

  // Outside pointer: listen on the root node of the trigger, so a Shadow DOM host works.
  useEffect(() => {
    if (!open) return undefined;
    const root = triggerRef.current?.getRootNode();
    const doc = triggerRef.current?.ownerDocument;
    if (!root) return undefined;
    const onDown = (e: Event): void => {
      if (!e.composedPath().includes(wrapperRef.current as EventTarget)) close(false);
    };
    // A click in the light DOM does not cross a shadow root, so the document listens too.
    const targets = new Set<EventTarget>([root, ...(doc ? [doc] : [])]);
    for (const t of targets) t.addEventListener("pointerdown", onDown, true);
    return () => {
      for (const t of targets) t.removeEventListener("pointerdown", onDown, true);
    };
  }, [open, close]);

  const move = (delta: number): void => {
    const list = enabled();
    if (!list.length) return;
    const at = list.indexOf(focusIndex);
    const next = at < 0 ? (delta > 0 ? 0 : list.length - 1) : (at + delta + list.length) % list.length;
    setFocusIndex(list[next] ?? -1);
  };

  const jump = (ch: string): void => {
    const now = Date.now();
    const t = typeahead.current;
    t.text = now - t.at > TYPEAHEAD_MS ? ch : t.text + ch;
    t.at = now;
    const list = enabled();
    const from = Math.max(0, list.indexOf(focusIndex));
    const order = [...list.slice(from + 1), ...list.slice(0, from + 1)];
    const hit = order.find((i) => items[i]?.label.toLowerCase().startsWith(t.text.toLowerCase())) ?? order.find((i) => items[i]?.label.toLowerCase().startsWith(ch.toLowerCase()));
    if (hit !== undefined) setFocusIndex(hit);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    const fromTrigger = e.target === triggerRef.current;
    if (!open) {
      if (fromTrigger && e.key === "ArrowDown") {
        e.preventDefault();
        openAt("first");
      } else if (fromTrigger && e.key === "ArrowUp") {
        e.preventDefault();
        openAt("last");
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        move(1);
        return;
      case "ArrowUp":
        e.preventDefault();
        move(-1);
        return;
      case "Home":
        e.preventDefault();
        setFocusIndex(enabled()[0] ?? -1);
        return;
      case "End":
        e.preventDefault();
        setFocusIndex(enabled().at(-1) ?? -1);
        return;
      case "Escape":
        e.preventDefault();
        close(true);
        return;
      case "Tab":
        close(true); // focus returns to the trigger, then the browser moves on from there
        return;
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && e.key !== " ") jump(e.key);
    }
  };

  const onBlur = (e: React.FocusEvent<HTMLDivElement>): void => {
    const next = e.relatedTarget as Node | null;
    if (open && (!next || !wrapperRef.current?.contains(next))) close(false);
  };

  return (
    <div className={className ? `bpmn-workshop-menu ${className}` : "bpmn-workshop-menu"} ref={wrapperRef} onKeyDown={onKeyDown} onBlur={onBlur} {...(testId ? { "data-testid": testId } : {})}>
      <button
        id={triggerId}
        ref={triggerRef}
        type="button"
        className="bpmn-workshop-menu__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={popupId}
        aria-label={ariaLabel}
        {...(title ? { title } : {})}
        disabled={disabled === true}
        onClick={() => (open ? close(false) : openAt("first"))}
      >
        <span className="bpmn-workshop-menu__label">{label}</span>
        <ChevronDownIcon className="bpmn-workshop-menu__chevron" />
      </button>
      <div id={popupId} ref={popupRef} role="menu" aria-label={ariaLabel} hidden={!open} className="bpmn-workshop-menu__popup" style={shift ? { transform: `translateX(${shift}px)` } : undefined}>
        {items.map((it, i) => {
          const radio = it.checked !== undefined;
          return (
            <button
              key={it.id}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              type="button"
              role={radio ? "menuitemradio" : "menuitem"}
              {...(radio ? { "aria-checked": it.checked === true } : {})}
              aria-disabled={it.disabled ? true : undefined}
              tabIndex={-1}
              className="bpmn-workshop-menu__item"
              onClick={() => {
                if (it.disabled) return;
                close(true);
                it.onSelect();
              }}
            >
              <span className="bpmn-workshop-menu__mark">{radio && it.checked ? <CheckIcon /> : null}</span>
              <span className="bpmn-workshop-menu__text">
                <span className="bpmn-workshop-menu__item-label">{it.label}</span>
                {it.description ? <span className="bpmn-workshop-menu__desc">{it.description}</span> : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
