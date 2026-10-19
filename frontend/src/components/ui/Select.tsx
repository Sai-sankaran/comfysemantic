import {
  Children,
  Fragment,
  isValidElement,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { Check, ChevronDown } from 'lucide-react';

export type SelectOption = {
  value: string;
  label: ReactNode;
  disabled?: boolean;
};

type Props = {
  value?: string | number;
  defaultValue?: string | number;
  /**
   * Receives a `{ target: { value } }` object, matching the change-event shape
   * the previous native `<select>` produced. It is kept so the existing call
   * sites (`onChange={(e) => f(e.target.value)}`) did not have to change; the
   * select is now a listbox, not a native element.
   */
  onChange?: (e: { target: { value: string } }) => void;
  disabled?: boolean;
  className?: string;
  /** Preferred. When omitted, `<option>` children are read as the options. */
  options?: SelectOption[];
  children?: ReactNode;
} & Omit<HTMLAttributes<HTMLDivElement>, 'onChange' | 'defaultValue' | 'children'>;

/** Flatten children and pull the `<option>` (and `<optgroup>` → `<option>`) out. */
function collectOptions(node: ReactNode, out: SelectOption[]): void {
  Children.forEach(node, (child) => {
    if (child === null || child === undefined || typeof child === 'boolean') return;
    if (Array.isArray(child)) {
      collectOptions(child, out);
      return;
    }
    if (!isValidElement(child)) return;
    const props = child.props as { children?: ReactNode; value?: string | number; disabled?: boolean };
    if (child.type === Fragment) {
      collectOptions(props.children, out);
      return;
    }
    if (child.type === 'optgroup') {
      collectOptions(props.children, out);
      return;
    }
    if (child.type === 'option') {
      out.push({
        value: props.value === undefined ? '' : String(props.value),
        label: props.children,
        disabled: props.disabled,
      });
    }
  });
}

/**
 * A select-only listbox (design `CTL-02`: no native `<select>`).
 *
 * It follows the ARIA 1.2 "select-only combobox" pattern: the trigger is a
 * `<button role="combobox">` with `aria-expanded`/`aria-controls`, the popup is
 * a `role="listbox"` of `role="option"` items, and Arrow keys, Home/End, Enter,
 * Space, Escape and type-ahead all work. The visible text is never the only
 * carrier of the selection — the chosen option also carries a check mark.
 */
export function Select({
  value,
  defaultValue,
  onChange,
  disabled,
  className,
  options,
  children,
  ...rest
}: Props) {
  const items = useMemo(() => {
    if (options) return options;
    const out: SelectOption[] = [];
    collectOptions(children, out);
    return out;
  }, [options, children]);

  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [inner, setInner] = useState<string>(() =>
    defaultValue === undefined ? '' : String(defaultValue),
  );
  const current = value === undefined ? inner : String(value);
  const selectedIndex = items.findIndex((o) => o.value === current && !o.disabled);

  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const typeahead = useRef({ text: '', at: 0 });

  const { 'aria-label': ariaLabel, ...wrapperAttrs } = rest;

  const openMenu = (at: number) => {
    if (disabled || items.length === 0) return;
    setActive(at >= 0 ? at : 0);
    setOpen(true);
  };

  const commit = (index: number) => {
    const opt = items[index];
    if (!opt || opt.disabled) return;
    if (value === undefined) setInner(opt.value);
    onChange?.({ target: { value: opt.value } });
    setOpen(false);
    buttonRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  const move = (delta: number) => {
    if (items.length === 0) return;
    let i = active;
    for (let n = 0; n < items.length; n += 1) {
      i = (i + delta + items.length) % items.length;
      if (!items[i].disabled) break;
    }
    setActive(i);
  };

  const typeaheadTo = (key: string, now: number) => {
    const t = typeahead.current;
    t.text = now - t.at > 500 ? key : t.text + key;
    t.at = now;
    const needle = t.text.toLowerCase();
    const idx = items.findIndex(
      (o) => !o.disabled && typeof o.label === 'string' && o.label.toLowerCase().startsWith(needle),
    );
    if (idx < 0) return;
    if (open) setActive(idx);
    else commit(idx);
  };

  const start = selectedIndex >= 0 ? selectedIndex : 0;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (open) move(1);
        else openMenu(start);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (open) move(-1);
        else openMenu(start);
        break;
      case 'Home':
        if (open) {
          e.preventDefault();
          setActive(0);
        }
        break;
      case 'End':
        if (open) {
          e.preventDefault();
          setActive(items.length - 1);
        }
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (open) commit(active);
        else openMenu(start);
        break;
      case 'Escape':
        if (open) {
          e.preventDefault();
          setOpen(false);
        }
        break;
      case 'Tab':
        setOpen(false);
        break;
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          if (!open) e.preventDefault();
          typeaheadTo(e.key, e.timeStamp);
        }
    }
  };

  const selected = selectedIndex >= 0 ? items[selectedIndex] : undefined;

  return (
    <div
      ref={wrapRef}
      className={`select${className ? ` ${className}` : ''}`}
      onKeyDown={onKeyDown}
      {...wrapperAttrs}
    >
      <button
        ref={buttonRef}
        type="button"
        role="combobox"
        className="select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        disabled={disabled}
        onClick={() => {
          if (open) setOpen(false);
          else openMenu(start);
        }}
      >
        <span className="select-value">{selected ? selected.label : ''}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <ul className="select-menu" role="listbox" id={listId} aria-label={ariaLabel}>
          {items.map((o, i) => (
            <li
              key={`${o.value}::${i}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={o.value === current}
              aria-disabled={o.disabled || undefined}
              className={[
                'select-option',
                i === active ? 'active' : '',
                o.value === current ? 'selected' : '',
                o.disabled ? 'disabled' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onMouseEnter={() => {
                if (!o.disabled) setActive(i);
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                commit(i);
              }}
            >
              <span className="select-option-label">{o.label}</span>
              {o.value === current ? <Check size={14} aria-hidden="true" /> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
