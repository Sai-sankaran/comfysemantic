import { createRoot } from 'react-dom/client';
import '../src/styles/tokens.css';
import '../src/index.css';
import '../src/App.css';
import { ToastProvider } from '../src/components/ui';
import { ComponentGallery } from '../src/features/gallery/ComponentGallery';

/**
 * Standalone component gallery (design `CTL-06`).
 *
 * Built by `vite.harness.config.ts` to `dist-harness/gallery.html` and served
 * with no backend, so the gallery — and the theme / density / text-scale
 * matrices it renders — can be captured as the baseline for the visual
 * regression tests (TST-19). `?theme=light&density=compact&scale=150` sets the
 * *page* appearance on top of the built-in matrix panes.
 */

const params = new URLSearchParams(location.search);
const root = document.documentElement;
const theme = params.get('theme');
const density = params.get('density');
const scale = params.get('scale');
if (theme) root.dataset.theme = theme;
if (density) root.dataset.density = density;
if (scale) root.style.setProperty('--text-scale', String(Number(scale) / 100));

createRoot(document.getElementById('root')!).render(
  <ToastProvider>
    <ComponentGallery />
  </ToastProvider>,
);
