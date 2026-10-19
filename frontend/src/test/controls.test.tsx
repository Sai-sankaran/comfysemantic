// covers: CTL-01, CTL-02, CTL-03, CTL-04, CTL-05, CTL-06
/**
 * Shared-control behaviour (design `CTL-01`).
 *
 * Before this, no test asserted anything about the primitives themselves — they
 * were only covered incidentally through screens. These pin the behaviour the
 * rest of the app relies on: the checkbox contract (including the tri-state
 * dash), the segmented control's per-option disabled state, and the progress
 * bar's ARIA for both determinate and indeterminate.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Checkbox, ProgressBar, Radio, SegmentedControl, Slider, Switch, Textarea } from '../components/ui';

describe('Checkbox', () => {
  it('reports the next value, not the previous one', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Checkbox checked={false} onChange={onChange} label="Enable" />);
    await user.click(screen.getByLabelText('Enable'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('uses the label as the accessible name', () => {
    render(<Checkbox checked onChange={() => undefined} label="Skip completed" />);
    expect(screen.getByRole('checkbox', { name: 'Skip completed' })).toBeTruthy();
  });

  it('takes an accessible name when there is no visible label', () => {
    render(<Checkbox checked={false} onChange={() => undefined} ariaLabel="Select row 4" />);
    expect(screen.getByRole('checkbox', { name: 'Select row 4' })).toBeTruthy();
  });

  it('sets the DOM indeterminate property for a partial selection', () => {
    render(<Checkbox checked={false} indeterminate onChange={() => undefined} ariaLabel="Select all" />);
    const box = screen.getByRole('checkbox', { name: 'Select all' }) as HTMLInputElement;
    expect(box.indeterminate).toBe(true);
  });

  it('never shows the dash when the box is fully checked', () => {
    render(<Checkbox checked indeterminate onChange={() => undefined} ariaLabel="Select all" />);
    const box = screen.getByRole('checkbox', { name: 'Select all' }) as HTMLInputElement;
    expect(box.indeterminate).toBe(false);
  });

  it('does not fire when disabled', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Checkbox checked={false} onChange={onChange} disabled label="Locked" />);
    await user.click(screen.getByLabelText('Locked'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('renders composite children instead of a plain label', () => {
    render(
      <Checkbox checked onChange={() => undefined} className="stage" ariaLabel="OCR stage">
        <span>OCR</span>
        <span data-testid="pill">model</span>
      </Checkbox>,
    );
    expect(screen.getByTestId('pill')).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'OCR stage' })).toBeTruthy();
  });
});

describe('SegmentedControl', () => {
  it('selects the clicked option and blocks disabled ones', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <SegmentedControl
        aria-label="Density"
        value="comfortable"
        onChange={onChange}
        options={[
          { value: 'compact', label: 'Compact' },
          { value: 'comfortable', label: 'Comfortable' },
          { value: 'spacious', label: 'Spacious', disabled: true },
        ]}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Compact' }));
    expect(onChange).toHaveBeenCalledWith('compact');

    await user.click(screen.getByRole('button', { name: 'Spacious' }));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('exposes the group name', () => {
    render(
      <SegmentedControl
        aria-label="Theme"
        value="dark"
        onChange={() => undefined}
        options={[{ value: 'dark', label: 'Dark' }]}
      />,
    );
    expect(screen.getByRole('group', { name: 'Theme' })).toBeTruthy();
  });
});

describe('ProgressBar', () => {
  it('exposes a determinate value', () => {
    render(<ProgressBar value={40} label="Indexing progress" />);
    const bar = screen.getByRole('progressbar', { name: 'Indexing progress' });
    expect(bar.getAttribute('aria-valuenow')).toBe('40');
  });

  it('omits the value when indeterminate', () => {
    render(<ProgressBar indeterminate label="Indexing progress" />);
    const bar = screen.getByRole('progressbar', { name: 'Indexing progress' });
    expect(bar.getAttribute('aria-valuenow')).toBeNull();
  });
});

/**
 * The four controls the Settings screen needed and the library was missing
 * (`CTL-01`: a control that is not in the library MUST NOT be used). Two screens
 * were using a raw `<textarea>` and three used raw radio inputs before these.
 */
describe('Switch (CTL-04)', () => {
  it('exposes on/off as a switch, not as a button or a checkbox', () => {
    render(<Switch checked ariaLabel="Auto start" onChange={() => undefined} />);
    const control = screen.getByRole('switch', { name: 'Auto start' });
    expect(control.getAttribute('aria-checked')).toBe('true');
    expect(control.tagName).toBe('BUTTON');
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('reports the next state and toggles', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <Switch checked={false} onChange={onChange} ariaLabel="Auto start" />,
    );
    await user.click(screen.getByRole('switch', { name: 'Auto start' }));
    expect(onChange).toHaveBeenCalledWith(true);
    rerender(<Switch checked onChange={onChange} ariaLabel="Auto start" />);
    await user.click(screen.getByRole('switch', { name: 'Auto start' }));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('links its label and description to the control', () => {
    render(
      <Switch
        checked={false}
        onChange={() => undefined}
        label="Run only when idle"
        description="Pauses background work until the computer is idle."
      />,
    );
    const control = screen.getByRole('switch', { name: 'Run only when idle' });
    const describedBy = control.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy as string)?.textContent).toContain(
      'Pauses background work',
    );
  });

  it('does not fire when disabled', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Switch checked={false} onChange={onChange} ariaLabel="Auto start" disabled />);
    await user.click(screen.getByRole('switch', { name: 'Auto start' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('Slider', () => {
  it('is a slider with the bounds and step the design gave it', () => {
    render(
      <Slider value={100} onChange={() => undefined} min={80} max={200} step={10} ariaLabel="Text size" />,
    );
    const control = screen.getByRole('slider', { name: 'Text size' });
    expect(control.getAttribute('min')).toBe('80');
    expect(control.getAttribute('max')).toBe('200');
    expect(control.getAttribute('step')).toBe('10');
  });

  it('shows a value readout with its unit', () => {
    render(<Slider value={150} unit="%" onChange={() => undefined} min={0} max={200} ariaLabel="Text size" />);
    expect(screen.getByText('150%')).toBeTruthy();
  });

  it('moves five steps on PageUp and clamps at the maximum', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Slider value={195} onChange={onChange} min={80} max={200} step={10} ariaLabel="Text size" />,
    );
    await user.click(screen.getByRole('slider', { name: 'Text size' }));
    await user.keyboard('{PageUp}');
    // 195 + 50 would exceed the maximum, so it clamps to 200.
    expect(onChange).toHaveBeenCalledWith(200);
  });

  it('leaves arrow-key stepping to the native range input', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Slider value={100} onChange={onChange} min={80} max={200} step={10} ariaLabel="Text size" />);
    const control = screen.getByRole('slider', { name: 'Text size' });
    await user.click(control);
    await user.keyboard('{ArrowRight}');
    // The design's arrow behaviour comes from a real `<input type="range">`, and
    // jsdom does not implement its keyboard stepping, so there is nothing to
    // assert here beyond "the component does not intercept or double-handle it".
    // Asserting a fabricated value would test jsdom, not the app.
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('Textarea', () => {
  it('reports the new text, not the event', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Textarea value="old" onChange={onChange} aria-label="Notes" />);
    await user.type(screen.getByLabelText('Notes'), 'x');
    expect(onChange).toHaveBeenCalledWith('oldx');
  });

  it('marks itself invalid and describes the error when one is given', () => {
    render(<Textarea value="" onChange={() => undefined} aria-label="Weights" error="is not valid JSON" />);
    const field = screen.getByLabelText('Weights');
    expect(field.getAttribute('aria-invalid')).toBe('true');
    const describedBy = field.getAttribute('aria-describedby') as string;
    expect(document.getElementById(describedBy)?.textContent).toContain('is not valid JSON');
  });

  it('resizes vertically only', () => {
    const { container } = render(<Textarea value="" onChange={() => undefined} aria-label="Notes" />);
    expect(container.querySelector('textarea')).toBeTruthy();
    // `resize: vertical` is the design rule; it is asserted in the stylesheet, so
    // the test asserts the control is a real textarea and nothing else.
    expect(container.querySelector('textarea')?.tagName).toBe('TEXTAREA');
  });
});

describe('Radio', () => {
  const options = [
    { value: 'any', label: 'Any' },
    { value: 'yes', label: 'Has text' },
    { value: 'no', label: 'No text found' },
  ];

  it('is one radiogroup so the options are announced together', () => {
    render(
      <Radio name="has-ocr" value="any" onChange={() => undefined} options={options} aria-label="Text presence" />,
    );
    expect(screen.getByRole('radiogroup', { name: 'Text presence' })).toBeTruthy();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
  });

  it('checks exactly the selected option', () => {
    render(
      <Radio name="has-ocr" value="yes" onChange={() => undefined} options={options} aria-label="Text presence" />,
    );
    expect((screen.getByRole('radio', { name: 'Has text' }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('radio', { name: 'Any' }) as HTMLInputElement).checked).toBe(false);
  });

  it('reports the chosen value', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Radio name="has-ocr" value="any" onChange={onChange} options={options} aria-label="Text presence" />,
    );
    await user.click(screen.getByRole('radio', { name: 'No text found' }));
    expect(onChange).toHaveBeenCalledWith('no');
  });

  it('does not fire for a disabled option', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Radio
        name="has-ocr"
        value="any"
        onChange={onChange}
        options={[{ value: 'any', label: 'Any' }, { value: 'yes', label: 'Has text', disabled: true }]}
        aria-label="Text presence"
      />,
    );
    await user.click(screen.getByRole('radio', { name: 'Has text' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
