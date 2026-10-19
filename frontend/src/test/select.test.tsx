// covers: CTL-02, CTL-01, CTL-03, CTL-04, CTL-05, CTL-06
/**
 * The select-only listbox (design `CTL-02`: native `<select>` is not used).
 *
 * These pin the ARIA contract and the keyboard model — the parts that would
 * silently regress when the native element is replaced. The change-handler
 * shape (`{ target: { value } }`) is also pinned, because the existing screens
 * depend on it.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Select } from '../components/ui';

const PROFILE_OPTIONS = [
  { value: 'low', label: 'Low impact' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'high', label: 'High throughput', disabled: true },
];

describe('Select (listbox)', () => {
  it('shows the selected option and is a collapsed combobox', () => {
    render(<Select aria-label="Profile" value="balanced" onChange={() => undefined} options={PROFILE_OPTIONS} />);
    const trigger = screen.getByRole('combobox', { name: 'Profile' });
    expect(trigger.textContent).toContain('Balanced');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('opens on click and lists the options', async () => {
    const user = userEvent.setup();
    render(<Select aria-label="Profile" value="balanced" onChange={() => undefined} options={PROFILE_OPTIONS} />);
    await user.click(screen.getByRole('combobox', { name: 'Profile' }));
    expect(screen.getByRole('combobox', { name: 'Profile' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getAllByRole('option')).toHaveLength(3);
    // The current value is marked selected.
    expect(screen.getByRole('option', { name: /Balanced/ }).getAttribute('aria-selected')).toBe('true');
  });

  it('reports the chosen value in the change-event shape the screens use', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Select aria-label="Profile" value="balanced" onChange={onChange} options={PROFILE_OPTIONS} />);
    await user.click(screen.getByRole('combobox', { name: 'Profile' }));
    await user.click(screen.getByRole('option', { name: 'Low impact' }));
    expect(onChange).toHaveBeenCalledWith({ target: { value: 'low' } });
  });

  it('reads <option> children when no options prop is given', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Select aria-label="Queue" value="unreviewed" onChange={onChange}>
        <option value="unreviewed">Needs review</option>
        <option value="all">Everything</option>
      </Select>,
    );
    await user.click(screen.getByRole('combobox', { name: 'Queue' }));
    await user.click(screen.getByRole('option', { name: 'Everything' }));
    expect(onChange).toHaveBeenCalledWith({ target: { value: 'all' } });
  });

  it('supports the keyboard: ArrowDown then Enter selects', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Select aria-label="Profile" value="balanced" onChange={onChange} options={PROFILE_OPTIONS} />);
    const trigger = screen.getByRole('combobox', { name: 'Profile' });
    trigger.focus();
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(onChange).toHaveBeenCalledWith({ target: { value: 'low' } });
  });

  it('skips disabled options when arrowing', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    // Start on Balanced: the first ArrowDown opens the list at the selection, the
    // second moves past the disabled "High throughput" (which must never become
    // active) and wraps to "Low impact".
    render(<Select aria-label="Profile" value="balanced" onChange={onChange} options={PROFILE_OPTIONS} />);
    screen.getByRole('combobox', { name: 'Profile' }).focus();
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(onChange).toHaveBeenCalledWith({ target: { value: 'low' } });
  });

  it('closes on Escape without changing the value', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Select aria-label="Profile" value="balanced" onChange={onChange} options={PROFILE_OPTIONS} />);
    await user.click(screen.getByRole('combobox', { name: 'Profile' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('closes when the pointer goes down outside', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <Select aria-label="Profile" value="balanced" onChange={() => undefined} options={PROFILE_OPTIONS} />
        <button type="button">elsewhere</button>
      </div>,
    );
    await user.click(screen.getByRole('combobox', { name: 'Profile' }));
    expect(screen.getByRole('listbox')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'elsewhere' }));
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('does not open when disabled', async () => {
    const user = userEvent.setup();
    render(<Select aria-label="Profile" value="balanced" onChange={() => undefined} options={PROFILE_OPTIONS} disabled />);
    await user.click(screen.getByRole('combobox', { name: 'Profile' }));
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('is uncontrolled when only defaultValue is given', async () => {
    const user = userEvent.setup();
    render(<Select aria-label="Profile" defaultValue="balanced" options={PROFILE_OPTIONS} />);
    const trigger = screen.getByRole('combobox', { name: 'Profile' });
    expect(trigger.textContent).toContain('Balanced');
    await user.click(trigger);
    await user.click(screen.getByRole('option', { name: 'Low impact' }));
    expect(screen.getByRole('combobox', { name: 'Profile' }).textContent).toContain('Low impact');
  });
});
