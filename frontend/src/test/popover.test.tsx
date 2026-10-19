// covers: CTL-01, CTL-03, CTL-04, CTL-05, CTL-06, NAV-08, NAV-24, NAV-25, NAV-31, NAV-40, NAV-41, NAV-42, NAV-43, NAV-50, NAV-51, NAV-52
/**
 * The shared Popover (`CTL-01`, design §10.6).
 *
 * Every menu, the library switcher, the View menu and the System popover are this
 * one component, so its close behaviour and its "a disabled row stays visible and
 * explains itself" rule are worth pinning once here.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { Popover, PopoverItem, PopoverHeading, PopoverSeparator } from '../components/ui';

function Harness({ onRun }: { onRun: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        label="Test menu"
        trigger={
          <button type="button" onClick={() => setOpen((v) => !v)}>
            Open
          </button>
        }
      >
        <PopoverHeading>Group</PopoverHeading>
        <PopoverItem onClick={onRun}>Do the thing</PopoverItem>
        <PopoverSeparator />
        <PopoverItem disabled reason="Needs the settings registry">
          Not built yet
        </PopoverItem>
      </Popover>
      <button type="button">Outside</button>
    </>
  );
}

describe('Popover', () => {
  it('renders the panel only while open', () => {
    render(<Harness onRun={() => undefined} />);
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('menu', { name: 'Test menu' })).toBeTruthy();
  });

  it('closes on an outside pointer-down', () => {
    render(<Harness onRun={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Outside' }));
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes on Escape', () => {
    render(<Harness onRun={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('stays open for a pointer-down inside the panel', () => {
    render(<Harness onRun={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.mouseDown(screen.getByRole('menu', { name: 'Test menu' }));
    expect(screen.getByRole('menu', { name: 'Test menu' })).toBeTruthy();
  });

  it('runs an enabled item', () => {
    const onRun = vi.fn();
    render(<Harness onRun={onRun} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Do the thing/ }));
    expect(onRun).toHaveBeenCalledTimes(1);
  });

  it('keeps a disabled item visible, marked, inert, and explained', () => {
    const onRun = vi.fn();
    render(<Harness onRun={onRun} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    const item = screen.getByRole('menuitem', { name: /Not built yet/ });
    expect(item.getAttribute('aria-disabled')).toBe('true');
    expect(item.getAttribute('title')).toBe('Needs the settings registry');
    fireEvent.click(item);
    expect(onRun).not.toHaveBeenCalled();
  });
});