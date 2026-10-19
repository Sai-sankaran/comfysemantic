import { useState, type CSSProperties } from 'react';
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  Drawer,
  EmptyState,
  IconButton,
  Input,
  Popover,
  PopoverHeading,
  PopoverItem,
  PopoverSeparator,
  ProgressBar,
  Radio,
  SegmentedControl,
  Select,
  Skeleton,
  Slider,
  Switch,
  Tabs,
  Textarea,
  Tooltip,
  Tree,
  type TreeNode,
  useToast,
  type BadgeTone,
} from '../../components/ui';

/**
 * The component gallery (design `CTL-06`).
 *
 * It renders every shared control in every state, and — through panes that
 * carry `data-theme` / `data-density` / `--text-scale` — the theme, density and
 * text-scale matrices on one page. It is the fixture the visual-regression tests
 * (TST-19) will compare against, and the place to look when a control is
 * suspected of drifting.
 *
 * It is deliberately defect-honest: it shows what the library actually
 * contains, rather than hiding a gap.
 */

const BADGE_TONES: BadgeTone[] = ['info', 'ok', 'warn', 'bad', 'muted'];

function CoreSet() {
  // A representative slice used by the theme/density matrices: one control of
  // each kind, so a whole matrix fits on screen.
  return (
    <>
      <div className="gallery-row">
        <Button variant="primary">Primary</Button>
        <Button>Secondary</Button>
      </div>
      <div className="gallery-row">
        <Checkbox checked onChange={() => undefined} label="Checked" />
        <Badge tone="ok">ok</Badge>
      </div>
      <div className="gallery-row">
        <Select defaultValue="a" aria-label="Example select">
          <option value="a">Option A</option>
          <option value="b">Option B</option>
        </Select>
      </div>
      <ProgressBar value={60} label="Example progress" />
    </>
  );
}

/** The tabs control in each of its states: selected, unselected, disabled. */
function GalleryTabs() {
  const [value, setValue] = useState<'one' | 'two' | 'three'>('one');
  return (
    <Tabs
      aria-label="Example tabs"
      value={value}
      onChange={setValue}
      items={[
        { id: 'one', label: 'First' },
        { id: 'two', label: 'Second' },
        { id: 'three', label: 'Disabled', disabled: true },
      ]}
    />
  );
}

/**
 * The tree in both modes.
 *
 * Both are shown side by side on purpose: `LIB-08` requires that selecting in one
 * never changes the other, and a gallery where they are separate components could
 * hide a mistake.
 */
function GalleryTree() {
  const [browse, setBrowse] = useState<string | null>('renders');
  const [select, setSelect] = useState<string[]>(['2026']);
  return (
    <div className="gallery-trees">
      <Tree
        nodes={GALLERY_NODES}
        mode="browse"
        value={browse}
        onChange={setBrowse}
        aria-label="Tree, browse mode"
        defaultExpanded={['renders']}
        pinnedIds={['renders']}
        onTogglePin={() => undefined}
      />
      <Tree
        nodes={GALLERY_NODES}
        mode="select"
        value={select}
        onChange={setSelect}
        aria-label="Tree, select mode"
        defaultExpanded={['renders']}
      />
    </div>
  );
}

const GALLERY_NODES: TreeNode[] = [
  { id: 'all', label: 'All items', count: 12_043, status: { label: 'partial', tone: 'partial' } },
  {
    id: 'renders',
    label: 'Renders',
    count: 9_980,
    status: { label: 'done', tone: 'done' },
    children: [
      { id: '2026', label: '2026', count: 4_100, status: { label: 'done', tone: 'done' } },
      { id: '2025', label: '2025', count: 5_880, status: { label: 'stale', tone: 'stale' } },
    ],
  },
  { id: 'comics', label: 'Comics', count: 150, status: { label: 'failed', tone: 'failed' } },
  { id: 'inputs', label: 'Inputs', count: 1_913, status: { label: 'idle', tone: 'idle' } },
];

export function ComponentGallery({ onBack }: { onBack?: () => void } = {}) {
  const { toast } = useToast();
  const [checked, setChecked] = useState(true);
  const [unchecked, setUnchecked] = useState(false);
  const [seg, setSeg] = useState('one');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [switchOn, setSwitchOn] = useState(true);
  const [radioCol, setRadioCol] = useState<'any' | 'yes' | 'no'>('any');

  return (
    <main className="main gallery">
      {onBack ? (
        <div className="gallery-row">
          <Button onClick={onBack}>Back to Settings</Button>
        </div>
      ) : null}
      <p className="gallery-intro">
        Every shared control, in every state, theme, density and text scale
        (design <code>CTL-06</code>). This page is the fixture for the visual
        regression tests.
      </p>

      <h2>Buttons</h2>
      <div className="gallery-row">
        <Button variant="primary">Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Danger</Button>
        <Button disabled>Disabled</Button>
      </div>

      <h2>Icon buttons</h2>
      <div className="gallery-row">
        <IconButton label="Example icon button">★</IconButton>
        <IconButton label="Disabled icon button" disabled>
          ☆
        </IconButton>
      </div>

      <h2>Inputs</h2>
      <div className="gallery-row">
        <Input placeholder="Placeholder" aria-label="Empty input" />
        <Input defaultValue="A value" aria-label="Filled input" />
        <Input defaultValue="Disabled" disabled aria-label="Disabled input" />
      </div>

      <h2>Textarea</h2>
      <div className="gallery-row">
        <Textarea
          label="With a label and helper text"
          description="Resizes vertically only."
          value={'{\n  "keyword": 40\n}'}
          onChange={() => undefined}
        />
        <Textarea
          label="Invalid"
          error="is not valid JSON"
          value="{not json"
          onChange={() => undefined}
        />
        <Textarea label="Disabled" disabled value="Read only" onChange={() => undefined} />
      </div>

      <h2>Slider</h2>
      <div className="gallery-row">
        <Slider
          ariaLabel="Slider, with a value readout"
          value={100}
          unit="%"
          min={80}
          max={200}
          step={10}
          onChange={() => undefined}
        />
        <Slider
          ariaLabel="Slider, pixels"
          value={180}
          unit=" px"
          min={96}
          max={320}
          step={12}
          onChange={() => undefined}
        />
        <Slider ariaLabel="Slider, disabled" value={40} min={0} max={100} disabled onChange={() => undefined} />
      </div>

      <h2>Select</h2>
      <div className="gallery-row">
        <Select defaultValue="one" aria-label="Select, enabled">
          <option value="one">One</option>
          <option value="two">Two</option>
        </Select>
        <Select defaultValue="one" disabled aria-label="Select, disabled">
          <option value="one">One</option>
        </Select>
      </div>

      <h2>Checkboxes</h2>
      <div className="gallery-row">
        <Checkbox checked={checked} onChange={setChecked} label="Checked" />
        <Checkbox checked={unchecked} onChange={setUnchecked} label="Unchecked" />
        <Checkbox checked={false} indeterminate onChange={() => undefined} label="Indeterminate" />
        <Checkbox checked onChange={() => undefined} disabled label="Disabled" />
        <Checkbox checked onChange={() => undefined} ariaLabel="Row selection, no label" />
      </div>

      <h2>Switches (CTL-04)</h2>
      <div className="gallery-row">
        <Switch checked={switchOn} onChange={setSwitchOn} label="On" />
        <Switch checked={false} onChange={() => undefined} label="Off" />
        <Switch checked onChange={() => undefined} disabled label="Disabled" />
        <Switch
          checked={false}
          onChange={() => undefined}
          ariaLabel="Switch, no visible label"
        />
        <Switch
          checked
          onChange={() => undefined}
          label="With a description"
          description="Applies immediately, with no Save button."
        />
      </div>

      <h2>Radios</h2>
      <div className="gallery-row">
        <Radio
          name="gallery-radio-column"
          aria-label="Radios, stacked"
          value={radioCol}
          onChange={setRadioCol}
          options={[
            { value: 'any', label: 'Any' },
            { value: 'yes', label: 'Has text' },
            { value: 'no', label: 'No text found', description: 'Processed, nothing detected.' },
          ]}
        />
        <Radio
          name="gallery-radio-inline"
          aria-label="Radios, inline"
          inline
          value="image"
          onChange={() => undefined}
          options={[
            { value: 'image', label: 'This image only' },
            { value: 'folder', label: 'Whole containing folder' },
          ]}
        />
        <Radio
          name="gallery-radio-disabled"
          aria-label="Radios, one disabled"
          value="any"
          onChange={() => undefined}
          options={[
            { value: 'any', label: 'Any' },
            { value: 'yes', label: 'Disabled', disabled: true },
          ]}
        />
      </div>

      <h2>Tabs</h2>
      <div className="gallery-row">
        <GalleryTabs />
      </div>

      <h2>Tooltips</h2>
      <div className="gallery-row">
        <Tooltip label="Hover for 600 ms" shortcut="H">
          <Button>With a shortcut</Button>
        </Tooltip>
        <Tooltip label="Appears instantly on keyboard focus">
          <Button>Focus me</Button>
        </Tooltip>
        <Tooltip label="Never shown" disabled>
          <Button>Disabled</Button>
        </Tooltip>
      </div>

      <h2>Tree</h2>
      <div className="gallery-row">
        <GalleryTree />
      </div>

      <h2>Segmented control</h2>
      <div className="gallery-row">
        <SegmentedControl
          aria-label="Example segmented control"
          value={seg}
          onChange={setSeg}
          options={[
            { value: 'one', label: 'One' },
            { value: 'two', label: 'Two' },
            { value: 'three', label: 'Disabled', disabled: true },
          ]}
        />
      </div>

      <h2>Badges</h2>
      <div className="gallery-row">
        {BADGE_TONES.map((tone) => (
          <Badge key={tone} tone={tone}>
            {tone}
          </Badge>
        ))}
      </div>

      <h2>Progress</h2>
      <div className="gallery-row" style={{ display: 'grid', gap: 'var(--space-2)', maxWidth: 320 }}>
        <ProgressBar value={40} label="Determinate 40%" />
        <ProgressBar value={100} label="Determinate 100%" />
        <ProgressBar indeterminate label="Indeterminate" />
      </div>

      <h2>Skeleton and empty state</h2>
      <div className="gallery-row">
        <Skeleton width={160} height={20} />
        <Skeleton width={90} height={20} />
      </div>
      <div className="gallery-row">
        <EmptyState
          title="Nothing here yet"
          body="Empty states pair an icon with text."
          action={<Button>Add library</Button>}
        />
      </div>

      <h2>Overlays and toasts</h2>
      <div className="gallery-row">
        <Button onClick={() => setDialogOpen(true)}>Open dialog</Button>
        <Button onClick={() => setDrawerOpen(true)}>Open drawer</Button>
        <Button onClick={() => toast({ kind: 'success', title: 'Saved' })}>Success toast</Button>
        <Button onClick={() => toast({ kind: 'error', title: 'Failed', message: 'Stays until dismissed' })}>
          Error toast
        </Button>
        <Popover
          open={popoverOpen}
          onClose={() => setPopoverOpen(false)}
          label="Example menu"
          trigger={
            <Button onClick={() => setPopoverOpen(true)}>Open menu</Button>
          }
        >
          <PopoverHeading>Group</PopoverHeading>
          <PopoverItem onClick={() => setPopoverOpen(false)}>An enabled item</PopoverItem>
          <PopoverItem shortcut="Ctrl+K">An item with a shortcut</PopoverItem>
          <PopoverItem selected>Selected</PopoverItem>
          <PopoverSeparator />
          <PopoverItem disabled reason="This feature is not built yet">
            Disabled, with its reason in the tooltip
          </PopoverItem>
        </Popover>
      </div>

      <h2>Themes</h2>
      <div className="gallery-matrix">
        {['dark', 'light', 'high-contrast'].map((theme) => (
          <section key={theme} className="gallery-pane" data-theme={theme}>
            <span className="gallery-pane-title">{theme}</span>
            <CoreSet />
          </section>
        ))}
      </div>

      <h2>Densities</h2>
      <div className="gallery-matrix">
        {['compact', 'comfortable', 'spacious'].map((density) => (
          <section key={density} className="gallery-pane" data-density={density}>
            <span className="gallery-pane-title">{density}</span>
            <CoreSet />
          </section>
        ))}
      </div>

      <h2>Text scales</h2>
      <div className="gallery-matrix">
        {[80, 100, 150, 200].map((scale) => (
          <section
            key={scale}
            className="gallery-pane gallery-scale"
            style={{ '--text-scale': scale / 100 } as CSSProperties}
          >
            <span className="gallery-pane-title">{scale}%</span>
            <CoreSet />
          </section>
        ))}
      </div>

      <h2>Focus and disabled (keyboard)</h2>
      <p className="gallery-intro">
        Tab through the controls above to see the focus ring (<code>VIS-12</code>).
      </p>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title="Example dialog" footer={<Button onClick={() => setDialogOpen(false)}>Close</Button>}>
        <p className="hint">Dialogs are modal, trap focus and restore it on close.</p>
      </Dialog>
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Example drawer">
        <p className="hint">Drawers are the overlay form of a docked pane.</p>
      </Drawer>
    </main>
  );
}
