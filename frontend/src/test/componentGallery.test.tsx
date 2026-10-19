// covers: CTL-06, CTL-01, CTL-02, CTL-03, CTL-04, CTL-05, VIS-01, VIS-02, VIS-03, VIS-04, VIS-05, VIS-06, VIS-07, VIS-08, VIS-09, VIS-10, VIS-11, VIS-12, VIS-13, VIS-14, VIS-15, TST-02, TST-03, TST-04, TST-18, TST-19
/**
 * The component gallery (design `CTL-06`) must render every shared control in
 * every state, and the theme / density / text-scale matrices on one page.
 *
 * These assertions are deliberately structural: they pin that each control
 * family is present and that the matrix panes carry the attributes the token
 * layer keys off. Pixel comparison (TST-19) is a separate, later concern.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '../components/ui';
import { ComponentGallery } from '../features/gallery/ComponentGallery';

function renderGallery(props: { onBack?: () => void } = {}) {
  return render(
    <ToastProvider>
      <ComponentGallery {...props} />
    </ToastProvider>,
  );
}

describe('component gallery', () => {
  it('renders every control family', () => {
    renderGallery();
    for (const heading of [
      'Buttons',
      'Icon buttons',
      'Inputs',
      'Select',
      'Checkboxes',
      'Segmented control',
      'Badges',
      'Progress',
      'Skeleton and empty state',
      'Overlays and toasts',
      'Themes',
      'Densities',
      'Text scales',
    ]) {
      expect(screen.getByRole('heading', { name: heading })).toBeTruthy();
    }
  });

  it('shows all five badge tones', () => {
    renderGallery();
    for (const tone of ['info', 'ok', 'warn', 'bad', 'muted']) {
      expect(screen.getAllByText(tone).length).toBeGreaterThan(0);
    }
  });

  it('renders a theme pane per theme, carrying data-theme', () => {
    const { container } = renderGallery();
    for (const theme of ['dark', 'light', 'high-contrast']) {
      const pane = container.querySelector(`[data-theme='${theme}']`);
      expect(pane, theme).toBeTruthy();
      // Each pane holds the core control set, not just the label.
      expect(within(pane as HTMLElement).getByRole('button', { name: 'Primary' })).toBeTruthy();
    }
  });

  it('renders a density pane per density, carrying data-density', () => {
    const { container } = renderGallery();
    for (const density of ['compact', 'comfortable', 'spacious']) {
      expect(container.querySelector(`[data-density='${density}']`), density).toBeTruthy();
    }
  });

  it('renders a text-scale pane per scale, setting --text-scale', () => {
    const { container } = renderGallery();
    const panes = Array.from(container.querySelectorAll<HTMLElement>('.gallery-scale'));
    expect(panes).toHaveLength(4);
    const scales = panes.map((p) => p.style.getPropertyValue('--text-scale'));
    expect(scales).toEqual(['0.8', '1', '1.5', '2']);
  });

  it('opens a dialog from the gallery', async () => {
    const user = userEvent.setup();
    renderGallery();
    await user.click(screen.getByRole('button', { name: 'Open dialog' }));
    expect(screen.getByRole('dialog', { name: 'Example dialog' })).toBeTruthy();
  });

  it('offers a way back when given one', async () => {
    const onBack = vi.fn();
    const user = userEvent.setup();
    renderGallery({ onBack });
    await user.click(screen.getByRole('button', { name: 'Back to Settings' }));
    expect(onBack).toHaveBeenCalled();
  });
});
