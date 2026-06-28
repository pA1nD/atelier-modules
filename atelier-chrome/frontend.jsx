/* atelier-chrome — a minimal, light-first chrome (original work, MIT).
 *
 * The look is inspired by Catalyst's calm aesthetic — zinc neutrals, Inter,
 * hairline borders, a soft white content panel floating on the page — but built
 * entirely from stock Tailwind utilities. NOTHING here is copied from Tailwind
 * Plus / Catalyst: only the look is the homage, every line is ours. If you reach
 * for a Catalyst-style component, reimplement it here from scratch instead.
 *
 * This is meant to be the default greeter: alphabetically `atelier-chrome` sorts
 * first, so the shell's chrome election lands here on a fresh instance with no
 * `chrome` configured.
 *
 * Contract — props the shell hands the `chrome` function (see client.jsx):
 *   boot           — { mode, label }
 *   user           — { id, name, workspaces }
 *   modules        — [{ qid, id, workspace, hasFrontend, meta }]
 *   workspaces     — [{ id, name?, modules: [{ id, meta }] }]
 *   workspace      — string  (currently routed workspace)
 *   activeQid      — string | null
 *   active         — { kind: 'none'|'loading'|'error'|'ready', element?, err?, qid? }
 *   loadedModules  — { [qid]: { hasDefault, TopBarCenter, meta, status, err } }
 *   navigate       — (qid: string) => void   (SPA push)
 *   pickWorkspace  — (wsId: string) => void
 *
 * Chrome owns: the responsive sidebar (desktop in-flow rail with ⌘B collapse;
 * mobile off-canvas drawer behind a hamburger), the workspace picker, the user
 * panel (avatar → dropdown with Light/Dark/System + Sign out), the connection
 * banner, the module error boundary, empty/loading/error placeholders, the
 * stylesheet + fonts + favicon, and the Lucide icon pipeline (modules name a
 * rail icon by string via meta.icon).
 * ========================================================================= */

const { useState, useEffect, useRef } = React;

const cn = (...parts) => parts.filter(Boolean).join(' ');

// Tiny chrome-owned preferences in localStorage (no backend). The Settings
// modal writes them; chrome() reads them into state so a change re-renders.
const prefBool = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v === '1'; } catch { return d; } };
const prefStr  = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const setPrefBool = (k, v) => { try { localStorage.setItem(k, v ? '1' : '0'); } catch {} };
const setPrefStr  = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

/* Dismiss-on-outside-click + Escape — shared by the dropdowns. */
function useClickAway(ref, onClose, active) {
  useEffect(() => {
    if (!active) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [active]);
}

/* =========================================================================
 * Head wiring — all idempotent, run once at module import (hot-reload safe).
 * ========================================================================= */

/* Stylesheet — append this chrome's compiled CSS exactly once. Path derived
 * from import.meta.url so it works in any workspace it's mounted under. */
(function ensureChromeStyles() {
  if (typeof document === 'undefined') return;
  const id = 'atelier-chrome-styles';
  if (document.getElementById(id)) return;
  let href;
  try { href = new URL('./styles.css', import.meta.url).href; } catch { return; }
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
})();

/* Color scheme — light by default, follow the OS unless the user has pinned a
 * choice. Sets `html.dark` before first paint to avoid a flash. */
(function ensureColorScheme() {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const stored = (() => { try { return localStorage.getItem('atelier-chrome-theme'); } catch { return null; } })();
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  const apply = (mode) => root.classList.toggle('dark', mode === 'dark' || (mode !== 'light' && mql.matches));
  apply(stored);
  // React to OS changes only while the user hasn't pinned a preference.
  mql.addEventListener?.('change', () => {
    let s = null;
    try { s = localStorage.getItem('atelier-chrome-theme'); } catch {}
    if (!s) apply(null);
  });
})();

/* Visual identity — favicon + theme-color. The shell ships none. */
(function ensureChromeIdentity() {
  if (typeof document === 'undefined') return;
  const svg =
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'>" +
    "<rect x='3' y='3' width='8' height='8' rx='2' fill='%2318181b'/>" +
    "<rect x='13' y='3' width='8' height='8' rx='2' fill='%2371717a'/>" +
    "<rect x='3' y='13' width='8' height='8' rx='2' fill='%2371717a'/>" +
    "<rect x='13' y='13' width='8' height='8' rx='2' fill='%232563eb'/></svg>";
  for (const el of document.querySelectorAll('link[rel~="icon"]')) el.remove();
  const icon = document.createElement('link');
  icon.rel = 'icon';
  icon.type = 'image/svg+xml';
  icon.href = 'data:image/svg+xml;utf8,' + svg;
  document.head.appendChild(icon);

  for (const el of document.querySelectorAll('meta[name="theme-color"]')) el.remove();
  const tc = document.createElement('meta');
  tc.name = 'theme-color';
  tc.content = '#f4f4f5';
  document.head.appendChild(tc);
})();

/* Lucide UMD — the icon set for rail icons + the chrome's own glyphs. Fetched
 * from a CDN so the chrome carries no npm dependency. */
(function ensureLucide() {
  if (typeof document === 'undefined') return;
  if (window.lucide || document.getElementById('lucide-umd')) return;
  const s = document.createElement('script');
  s.id = 'lucide-umd';
  s.src = 'https://unpkg.com/lucide@0.469.0/dist/umd/lucide.min.js';
  s.onload = () => { try { window.lucide?.createIcons(); } catch {} };
  document.head.appendChild(s);
})();

/* Lucide auto-stamper — replaces any <i data-lucide="name"> with its SVG on
 * DOM mutation. RAF-debounced and self-disconnecting during the sweep. */
(function wireLucideObserver() {
  if (typeof document === 'undefined') return;
  if (window.__atelierLucideWired) return;
  window.__atelierLucideWired = true;
  let raf = 0;
  let observer;
  const opts = { childList: true, subtree: true };
  const stamp = () => {
    raf = 0;
    if (!window.lucide) return;
    observer.disconnect();
    window.lucide.createIcons();
    observer.observe(document.body, opts);
  };
  observer = new MutationObserver(() => { if (!raf) raf = requestAnimationFrame(stamp); });
  observer.observe(document.body, opts);
  if (!raf) raf = requestAnimationFrame(stamp);
})();

/* =========================================================================
 * Atoms
 * ========================================================================= */

/* Lucide icon. Color comes from the parent's text color (lucide strokes in
 * currentColor), so callers just set a `text-*` class on the surrounding node. */
function Icon({ name, size = 16, strokeWidth = 1.75, className = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!name || !ref.current) return;
    ref.current.innerHTML = '';
    const i = document.createElement('i');
    i.setAttribute('data-lucide', name);
    ref.current.appendChild(i);
    try {
      window.lucide?.createIcons({
        attrs: { width: size, height: size, 'stroke-width': strokeWidth },
      });
    } catch {}
  }, [name, size, strokeWidth]);
  return (
    <span
      ref={ref}
      className={cn('inline-flex shrink-0 items-center justify-center', className)}
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
}

function Spinner({ size = 16, className = 'text-zinc-400' }) {
  return (
    <span
      className={cn('inline-block animate-spin rounded-full border-2 border-current border-r-transparent', className)}
      style={{ width: size, height: size }}
      role="status"
      aria-label="loading"
    />
  );
}

/* Four-square atelier mark — three zinc, one blue (a quiet Catalyst-blue nod). */
function AtelierMark({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3"  y="3"  width="8" height="8" rx="2" className="fill-zinc-900 dark:fill-white" />
      <rect x="13" y="3"  width="8" height="8" rx="2" className="fill-zinc-400 dark:fill-zinc-500" />
      <rect x="3"  y="13" width="8" height="8" rx="2" className="fill-zinc-400 dark:fill-zinc-500" />
      <rect x="13" y="13" width="8" height="8" rx="2" className="fill-blue-600" />
    </svg>
  );
}

/* =========================================================================
 * Appearance menu — Light / Dark / System, persisted in localStorage
 * ('system' = follow the OS, the unpinned default). Mounts fresh when the user
 * panel opens, so it always reflects the current preference.
 * ========================================================================= */
function ThemeMenu() {
  const read = () => { try { return localStorage.getItem('atelier-chrome-theme') || 'system'; } catch { return 'system'; } };
  const [pref, setPref] = useState(read);
  const choose = (p) => {
    try {
      if (p === 'system') localStorage.removeItem('atelier-chrome-theme');
      else localStorage.setItem('atelier-chrome-theme', p);
    } catch {}
    const dark = p === 'dark' || (p === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
    setPref(p);
  };
  const OPTS = [['light', 'sun', 'Light'], ['dark', 'moon', 'Dark'], ['system', 'monitor', 'System']];
  return (
    <div>
      <div className="px-2 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-400">Appearance</div>
      {OPTS.map(([val, icon, lbl]) => (
        <button
          key={val}
          type="button"
          onClick={() => choose(val)}
          className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-950/5 dark:text-zinc-200 dark:hover:bg-white/5 cursor-pointer transition-colors"
        >
          <Icon name={icon} size={16} className="text-zinc-400" />
          <span className="flex-1">{lbl}</span>
          {pref === val && <Icon name="check" size={15} className="text-blue-600" />}
        </button>
      ))}
    </div>
  );
}

/* =========================================================================
 * User panel — avatar + name pinned to the bottom of the rail; opens an upward
 * dropdown with the appearance menu (and Sign out, when the auth module set
 * `user.logout`).
 * ========================================================================= */
function UserPanel({ user, displayName, onOpenSettings, menuItems, onSelectMenu, configureItems }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useClickAway(ref, () => setOpen(false), open);
  const authName = (user?.id && user.id !== 'local') ? (user.name || user.id) : null;
  const name = authName || displayName || 'Local';
  const initials = (name.trim()[0] || '·').toUpperCase();
  const signOut = async () => {
    try { await fetch(user.logout, { method: 'POST', credentials: 'same-origin' }); } catch {}
    window.location.reload();
  };
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors cursor-pointer',
          open ? 'bg-zinc-950/5 dark:bg-white/10' : 'hover:bg-zinc-950/5 dark:hover:bg-white/5'
        )}
      >
        <span className="inline-flex size-7 items-center justify-center rounded-full bg-zinc-200 text-[11px] font-semibold text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
          {initials}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-950 dark:text-white">{name}</span>
        <Icon name="chevrons-up-down" size={14} className="text-zinc-400" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute inset-x-0 bottom-[calc(100%+6px)] z-30 rounded-xl border border-zinc-950/10 bg-white p-1 shadow-lg dark:border-white/10 dark:bg-zinc-800"
        >
          {menuItems?.length > 0 && (
            <>
              {menuItems.map((m) => (
                <button
                  key={m.qid}
                  type="button"
                  onClick={() => { setOpen(false); onSelectMenu?.(m); }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-950/5 dark:text-zinc-200 dark:hover:bg-white/5 cursor-pointer transition-colors"
                >
                  <Icon name={m.icon || 'square'} size={16} className="text-zinc-400" />
                  <span>{m.name}</span>
                </button>
              ))}
              <div className="my-1 border-t border-zinc-950/5 dark:border-white/10" />
            </>
          )}
          <button
            type="button"
            onClick={() => { setOpen(false); onOpenSettings?.(); }}
            className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-950/5 dark:text-zinc-200 dark:hover:bg-white/5 cursor-pointer transition-colors"
          >
            <Icon name="settings" size={16} className="text-zinc-400" />
            <span>User settings</span>
          </button>
          {configureItems?.map((c) => (
            <button
              key={c.qid}
              type="button"
              onClick={() => { setOpen(false); window.location.assign(`/${c.qid}/${c.sub}`); }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-950/5 dark:text-zinc-200 dark:hover:bg-white/5 cursor-pointer transition-colors"
            >
              <Icon name="sliders-horizontal" size={16} className="text-zinc-400" />
              <span>Configure {c.name}</span>
            </button>
          ))}
          {user?.logout && (
            <>
              <div className="my-1 border-t border-zinc-950/5 dark:border-white/10" />
              <button
                type="button"
                onClick={signOut}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-950/5 dark:text-zinc-200 dark:hover:bg-white/5 cursor-pointer transition-colors"
              >
                <Icon name="log-out" size={16} className="text-zinc-400" />
                <span>Sign out</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* =========================================================================
 * Workspace picker — a dropdown of every workspace that has visible modules.
 * ========================================================================= */
function WorkspacePicker({ workspaces, active, onPick }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const current = workspaces.find((w) => w.id === active) || workspaces[0];
  const label = current?.name || current?.id || '—';
  const chip = (current?.id || '·')[0].toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors cursor-pointer',
          open ? 'bg-zinc-950/5 dark:bg-white/10' : 'hover:bg-zinc-950/5 dark:hover:bg-white/5'
        )}
      >
        <span className="inline-flex size-7 items-center justify-center rounded-md bg-blue-600 text-[11px] font-semibold text-white">
          {chip}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-950 dark:text-white">
          {label}
        </span>
        <Icon name="chevrons-up-down" size={14} className="text-zinc-400" />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute inset-x-0 top-[calc(100%+4px)] z-20 rounded-xl border border-zinc-950/10 bg-white p-1 shadow-lg dark:border-white/10 dark:bg-zinc-800"
        >
          {workspaces.map((w) => {
            const selected = (active || workspaces[0]?.id) === w.id;
            return (
              <button
                key={w.id}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => { setOpen(false); onPick(w.id); }}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors cursor-pointer',
                  selected ? 'bg-zinc-950/5 dark:bg-white/10' : 'hover:bg-zinc-950/5 dark:hover:bg-white/5'
                )}
              >
                <span className="inline-flex size-6 items-center justify-center rounded-md bg-zinc-200 text-[10px] font-semibold text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
                  {(w.id || '?')[0].toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-zinc-800 dark:text-zinc-100">
                  {w.name || w.id}
                </span>
                {selected && <Icon name="check" size={14} className="text-blue-600" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* =========================================================================
 * Sidebar — brand, workspace picker, nav list (optional groups), footer.
 * ========================================================================= */
function NavItem({ item, active, onSelect }) {
  const handleClick = (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    onSelect?.();
  };
  return (
    <a
      href={`/${item.qid}`}
      onClick={handleClick}
      className={cn(
        'group relative flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm/6 no-underline transition-colors',
        active
          ? 'bg-zinc-950/5 font-medium text-zinc-950 dark:bg-white/10 dark:text-white'
          : 'text-zinc-600 hover:bg-zinc-950/5 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white'
      )}
    >
      {active && (
        <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-blue-600" aria-hidden="true" />
      )}
      <Icon name={item.icon} size={16} className={active ? 'text-zinc-950 dark:text-white' : 'text-zinc-400 group-hover:text-zinc-950 dark:group-hover:text-white'} />
      <span className="min-w-0 flex-1 truncate">{item.name}</span>
    </a>
  );
}

// Inner sidebar content, rendered in BOTH the desktop in-flow rail and the
// mobile off-canvas drawer. `variant` swaps the top-right button: desktop gets
// the hover-reveal collapse (⌘B), mobile gets a close (×).
function SidebarContent({
  variant,
  sections,
  empty,
  activeId,
  onSelect,
  onAddModule,
  onCollapse,
  onClose,
  workspaces,
  workspace,
  onPickWorkspace,
  showPicker,
  label,
  user,
  displayName,
  onOpenSettings,
  addModuleActive,
  menuItems,
  onSelectMenu,
  configureItems,
}) {
  return (
    <div className="flex h-full w-[var(--rail-w)] flex-col gap-1 px-3 py-4">
      {/* Brand */}
      <div className="group flex items-center gap-2.5 px-2 pb-2">
        <AtelierMark />
        <span className="text-[15px] font-semibold tracking-tight text-zinc-950 dark:text-white">atelier</span>
        {variant === 'mobile' ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="close sidebar"
            className="ml-auto inline-flex size-7 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-950/5 hover:text-zinc-950 dark:hover:bg-white/10 dark:hover:text-white cursor-pointer transition-colors"
          >
            <Icon name="x" size={17} />
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={onCollapse}
              title="hide sidebar  ⌘B"
              aria-label="hide sidebar"
              className="inline-flex h-6 w-0 items-center justify-center overflow-hidden rounded-md text-zinc-400 opacity-0 transition-all duration-200 group-hover:w-6 group-hover:opacity-100 hover:bg-zinc-950/5 hover:text-zinc-950 dark:hover:bg-white/10 dark:hover:text-white cursor-pointer"
            >
              <Icon name="panel-left-close" size={15} />
            </button>
            {label && (
              <span className="ml-auto rounded-md bg-zinc-950/5 px-1.5 py-0.5 text-[11px] font-medium text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
                {label}
              </span>
            )}
          </>
        )}
      </div>

      {showPicker && (
        <WorkspacePicker workspaces={workspaces} active={workspace} onPick={onPickWorkspace} />
      )}

      {/* Nav */}
      <nav className="mt-2 flex-1 overflow-y-auto">
        {sections.length === 1 && (
          <div className="px-2 pb-1">
            <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">modules</span>
          </div>
        )}

        {empty && (
          <p className="px-2 py-1 text-[13px] text-zinc-400">no modules yet.</p>
        )}
        {sections.map((section) => (
          <div key={section.key} className="mt-3 first:mt-0">
            {section.header && (
              <div className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                {section.header}
              </div>
            )}
            {section.ungrouped.map((m) => (
              <NavItem key={m.qid} item={m} active={m.qid === activeId} onSelect={() => onSelect(m)} />
            ))}
            {section.groups.map((g) => (
              <div key={g.name} className="mt-3">
                <div className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                  {g.name}
                </div>
                {g.items.map((m) => (
                  <NavItem key={m.qid} item={m} active={m.qid === activeId} onSelect={() => onSelect(m)} />
                ))}
              </div>
            ))}
          </div>
        ))}
      </nav>

      {/* Add module — pinned at the bottom (the nav above grows to fill). When
          a `global/dock` marketplace is mounted, this is its entry point. */}
      <button
        type="button"
        onClick={onAddModule}
        title="add a module"
        className={cn(
          'mt-1 flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-sm/6 cursor-pointer transition-colors',
          addModuleActive
            ? 'bg-zinc-950/5 font-medium text-zinc-950 dark:bg-white/10 dark:text-white'
            : 'text-zinc-600 hover:bg-zinc-950/5 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white'
        )}
      >
        <Icon name="plus" size={16} className={addModuleActive ? 'text-zinc-950 dark:text-white' : 'text-zinc-400'} />
        <span className="flex-1 truncate text-left">Add module</span>
      </button>

      {/* Footer — user panel (avatar → settings + sign out) */}
      <div className="mt-2 border-t border-zinc-950/5 pt-2 dark:border-white/10">
        <UserPanel user={user} displayName={displayName} onOpenSettings={onOpenSettings} menuItems={menuItems} onSelectMenu={onSelectMenu} configureItems={configureItems} />
      </div>
    </div>
  );
}

/* =========================================================================
 * ConnectionBanner — listens to the shell's `atelier:connection` event.
 * ========================================================================= */
function ConnectionBanner() {
  const [state, setState] = useState('online');
  useEffect(() => {
    const on = (e) => setState(e.detail?.state ?? 'online');
    window.addEventListener('atelier:connection', on);
    return () => window.removeEventListener('atelier:connection', on);
  }, []);
  if (state === 'online') return null;

  const unauthed = state === 'unauthed';
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex flex-none items-center justify-center gap-2 px-3 py-1.5 text-[13px]',
        unauthed
          ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
          : 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200'
      )}
      style={{ animation: 'atelier-banner-in 180ms cubic-bezier(0.2,0.8,0.2,1)' }}
    >
      <span className={cn('size-1.5 rounded-full', unauthed ? 'bg-amber-500' : 'bg-red-500')} />
      {unauthed ? (
        <>
          <span>session expired</span>
          <button
            onClick={() => window.location.reload()}
            className="ml-1 rounded-md bg-white/70 px-2 py-0.5 font-medium hover:bg-white dark:bg-white/10 dark:hover:bg-white/20 cursor-pointer"
          >
            sign in
          </button>
        </>
      ) : (
        <span>server unreachable — reconnecting…</span>
      )}
    </div>
  );
}

/* =========================================================================
 * Body placeholders + per-module error boundary.
 * ========================================================================= */
function EmptyWorkspace({ workspace, showWorkspace, onInstall }) {
  const snippet = `export default function Module() {
  return <div className="p-8">hello</div>;
}`;
  return (
    <div className="flex flex-1 items-center justify-center overflow-auto p-8">
      <div className="w-full max-w-xl">
        <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-zinc-400">
          {showWorkspace && workspace ? `atelier · ${workspace}` : 'atelier'}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-white">
          A quiet bench for your tools.
        </h1>
        <p className="mt-3 text-[15px]/7 text-zinc-500 dark:text-zinc-400">
          Nothing is mounted here yet. Drop a folder with a <code className="rounded bg-zinc-950/5 px-1 py-0.5 font-mono text-[13px] dark:bg-white/10">frontend.jsx</code> beside the shell and it appears in the rail.
        </p>
        <div className="mt-8 rounded-xl border border-zinc-950/5 bg-zinc-50 p-4 dark:border-white/10 dark:bg-zinc-950/40">
          <p className="mb-2 font-mono text-[12px] text-zinc-400">hello/frontend.jsx</p>
          <pre className="overflow-x-auto font-mono text-[13px]/6 text-zinc-700 dark:text-zinc-300">{snippet}</pre>
        </div>
        {onInstall && (
          <>
            <div className="my-7 flex items-center gap-3 text-zinc-300 dark:text-zinc-600">
              <span className="h-px flex-1 bg-current opacity-50" />
              <span className="text-[11px] font-medium uppercase tracking-wider">or</span>
              <span className="h-px flex-1 bg-current opacity-50" />
            </div>
            <button
              type="button"
              onClick={onInstall}
              className="group flex w-full items-center gap-4 rounded-2xl border border-zinc-950/10 bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-px hover:border-blue-500/40 hover:shadow-md dark:border-white/10 dark:bg-zinc-900 cursor-pointer"
            >
              <span className="flex size-11 flex-none items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-sm">
                <Icon name="blocks" size={20} strokeWidth={2} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-zinc-950 dark:text-white">Install a module</span>
                <span className="block text-[13px]/5 text-zinc-500 dark:text-zinc-400">Browse and add one from the marketplace.</span>
              </span>
              <Icon name="arrow-right" size={18} className="flex-none text-zinc-300 transition-all group-hover:translate-x-0.5 group-hover:text-blue-600 dark:text-zinc-600 dark:group-hover:text-blue-400" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function LoadingBody({ qid }) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Spinner size={20} className="text-blue-600" />
        <span className="font-mono text-[12px] text-zinc-400">loading {qid ?? ''}…</span>
      </div>
    </div>
  );
}

function ErrorBody({ qid, err }) {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-lg lg:max-w-4xl rounded-xl border border-red-300/60 bg-red-50 p-4 dark:border-red-900/60 dark:bg-red-950/30">
        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-red-600 dark:text-red-400">
          {qid} · failed to load
        </p>
        <p className="whitespace-pre-wrap break-words font-mono text-[12px]/6 text-zinc-700 dark:text-zinc-300">
          {String(err?.message || err)}
        </p>
      </div>
    </div>
  );
}

class ModuleErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) { console.error('[atelier-chrome] module render crashed:', err, info); }
  componentDidUpdate(prev) {
    if (prev.qid !== this.props.qid && this.state.err) this.setState({ err: null });
  }
  render() {
    if (this.state.err) {
      const e = this.state.err;
      return (
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="w-full max-w-lg lg:max-w-4xl rounded-xl border border-red-300/60 bg-red-50 p-4 dark:border-red-900/60 dark:bg-red-950/30">
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-red-600 dark:text-red-400">
              {this.props.qid} · render error
            </p>
            <p className="whitespace-pre-wrap break-words font-mono text-[12px]/6 text-zinc-700 dark:text-zinc-300">
              {String(e?.stack || e?.message || e)}
            </p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* Transient toast shown when the rail is collapsed from its own toggle — the
 * toggle vanishes with the sidebar, so teach ⌘B to bring it back. */
function SidebarHint() {
  return (
    <div
      role="status"
      className="fixed bottom-4 left-4 z-50 hidden items-center gap-2 rounded-lg border border-zinc-950/10 bg-white px-3 py-2 text-[13px] text-zinc-700 shadow-lg lg:flex dark:border-white/10 dark:bg-zinc-800 dark:text-zinc-200"
      style={{ animation: 'atelier-rise 200ms cubic-bezier(0.2,0.8,0.2,1)' }}
    >
      <span>Press</span>
      <kbd className="rounded border border-zinc-950/15 bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] font-medium text-zinc-600 dark:border-white/15 dark:bg-white/10 dark:text-zinc-300">⌘B</kbd>
      <span>to show the sidebar</span>
    </div>
  );
}

/* When the rail is collapsed, hovering the thin left margin (the gutter outside
 * the panel) reveals a button that brings the sidebar back. */
function RevealEdge({ onExpand }) {
  return (
    <div className="group fixed inset-y-0 left-0 z-40 hidden w-2 lg:block">
      <button
        type="button"
        onClick={onExpand}
        title="show sidebar  ⌘B"
        aria-label="show sidebar"
        className="absolute left-1 top-3 inline-flex size-8 -translate-x-2 items-center justify-center rounded-lg border border-zinc-950/10 bg-white text-zinc-500 opacity-0 shadow-md transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100 hover:text-zinc-950 dark:border-white/10 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:text-white cursor-pointer"
      >
        <Icon name="panel-left-open" size={16} />
      </button>
    </div>
  );
}

/* =========================================================================
 * Chrome — the root component the shell mounts.
 * ========================================================================= */
/* =========================================================================
 * Settings — a small modal (opened from the user panel) the chrome owns.
 * Display name + theme (like the reference chrome), plus two sidebar prefs.
 * ========================================================================= */
function Toggle({ checked, onChange, label, hint }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left hover:bg-zinc-950/5 dark:hover:bg-white/5 cursor-pointer transition-colors"
    >
      <span className="min-w-0">
        <span className="block text-sm text-zinc-800 dark:text-zinc-100">{label}</span>
        {hint && <span className="mt-0.5 block text-[12px] leading-snug text-zinc-400">{hint}</span>}
      </span>
      <span className={cn('relative inline-flex h-5 w-9 flex-none items-center rounded-full transition-colors', checked ? 'bg-blue-600' : 'bg-zinc-300 dark:bg-zinc-600')}>
        <span className={cn('inline-block size-4 transform rounded-full bg-white shadow transition-transform', checked ? 'translate-x-4' : 'translate-x-0.5')} />
      </span>
    </button>
  );
}

function SettingsModal({ open, onClose, user, displayName, setDisplayName, wsTogether, setWsTogether, showCategories, setShowCategories }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  if (!open) return null;
  const authName = (user?.id && user.id !== 'local') ? (user.name || user.id) : null;
  const labelCls = 'mb-1 block px-2 text-[11px] font-medium uppercase tracking-wider text-zinc-400';
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onMouseDown={onClose}>
      <div className="absolute inset-0 bg-zinc-950/40 backdrop-blur-sm" aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="User settings"
        onMouseDown={(e) => e.stopPropagation()}
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-zinc-950/10 bg-white shadow-2xl dark:border-white/10 dark:bg-zinc-900"
      >
        <div className="flex items-center justify-between border-b border-zinc-950/5 px-5 py-3.5 dark:border-white/10">
          <h2 className="text-sm font-semibold text-zinc-950 dark:text-white">User settings</h2>
          <button type="button" onClick={onClose} aria-label="close settings" className="inline-flex size-7 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-950/5 hover:text-zinc-950 dark:hover:bg-white/10 dark:hover:text-white cursor-pointer transition-colors">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="max-h-[70vh] space-y-5 overflow-y-auto px-3 py-4">
          <div>
            <label className={labelCls}>Display name</label>
            <input
              type="text"
              placeholder="Your name"
              value={authName ?? displayName}
              disabled={!!authName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mx-2 block w-[calc(100%-1rem)] rounded-lg border border-zinc-950/10 bg-white px-3 py-1.5 text-sm text-zinc-950 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60 dark:border-white/10 dark:bg-zinc-800 dark:text-white"
            />
            {authName && <p className="mx-2 mt-1 text-[12px] text-zinc-400">Set by your account — sign in elsewhere to change it.</p>}
          </div>
          <div>
            <ThemeMenu />
          </div>
          <div>
            <label className={labelCls}>Sidebar</label>
            <Toggle checked={wsTogether} onChange={setWsTogether} label="Show all workspaces together" hint="One list with a divider per workspace, instead of a workspace switcher." />
            <Toggle checked={showCategories} onChange={setShowCategories} label="Show category names" hint="Group modules under their meta.group headings." />
          </div>
        </div>
        <div className="flex justify-end border-t border-zinc-950/5 px-5 py-3 dark:border-white/10">
          <button type="button" onClick={onClose} className="rounded-lg bg-zinc-950 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 cursor-pointer dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200">Done</button>
        </div>
      </div>
    </div>
  );
}

export function chrome({
  boot,
  user,
  modules,
  workspaces,
  workspace,
  activeQid,
  active,
  loadedModules,
  navigate,
  pickWorkspace,
}) {
  const [collapsed, setCollapsed] = useState(false);     // desktop rail collapse
  const [mobileOpen, setMobileOpen] = useState(false);   // mobile drawer
  const [showHint, setShowHint] = useState(false);
  const hintTimer = useRef(null);

  // Settings (modal) + the prefs it writes — read into state so toggling re-renders.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [wsTogether, setWsTogetherState] = useState(() => prefBool('atelier-chrome-ws-together', true));
  const [showCategories, setShowCategoriesState] = useState(() => prefBool('atelier-chrome-show-categories', false));
  const [displayName, setDisplayNameState] = useState(() => prefStr('atelier-chrome-name', ''));
  const setWsTogether = (v) => { setPrefBool('atelier-chrome-ws-together', v); setWsTogetherState(v); };
  const setShowCategories = (v) => { setPrefBool('atelier-chrome-show-categories', v); setShowCategoriesState(v); };
  const setDisplayName = (v) => { setPrefStr('atelier-chrome-name', v); setDisplayNameState(v); };

  // Esc closes the mobile drawer.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') setMobileOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  const flashHint = () => {
    setShowHint(true);
    clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setShowHint(false), 3500);
  };
  // Collapsing from the rail's own toggle hides the toggle too — teach ⌘B so
  // the user can bring the sidebar back.
  const collapseFromRail = () => { setCollapsed(true); flashHint(); };

  // ⌘B toggles the rail.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        setCollapsed((c) => !c);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Re-opening the rail dismisses the hint; clean up the timer on unmount.
  useEffect(() => { if (!collapsed) setShowHint(false); }, [collapsed]);
  useEffect(() => () => clearTimeout(hintTimer.current), []);

  // Rail composition — all visible modules, grouped by workspace. Two prefs
  // shape it: `wsTogether` shows every workspace at once with a divider each
  // (vs the picker + one workspace); `showCategories` groups by `meta.group`
  // with headings (vs a flat list).
  // A marketplace/installer module `global/dock`, if mounted, becomes the
  // bottom "Add module" entry point — kept out of the rail list, with the
  // Add-module link pointing at it (falling back to the workspace home).
  const DOCK_QID = 'global/dock';
  const hasDock = modules.some((m) => m.qid === DOCK_QID && m.hasFrontend);

  const byWs = new Map();
  const menuItems = [];        // modules that opt into the user menu (meta.menu === 'user')
  const configureItems = [];   // modules exposing a config page via meta.configure (a sub-route)
  for (const m of modules) {
    const merged = { ...(m.meta || {}), ...(loadedModules[m.qid]?.meta || {}) };
    if (merged.isChrome) continue;
    if (merged.configure) configureItems.push({ qid: m.qid, name: merged.name || m.id, sub: typeof merged.configure === 'string' ? merged.configure : 'config' });
    if (hasDock && m.qid === DOCK_QID) continue;   // surfaced as "Add module" + (above) its configure link, not in the rail
    if (merged.hidden) continue;
    const loaded = loadedModules[m.qid];
    if (loaded?.status === 'ok' && !loaded.hasDefault) continue;  // slot-only module
    const item = { id: m.id, qid: m.qid, name: merged.name || m.id, icon: merged.icon || 'square', group: merged.group || null };
    if (merged.menu === 'user') { menuItems.push(item); continue; }   // user-menu utility, not a rail app
    if (!byWs.has(m.workspace)) byWs.set(m.workspace, []);
    byWs.get(m.workspace).push(item);
  }
  const wsName = new Map((workspaces || []).map((w) => [w.id, w.name || w.id]));
  const orderedWs = (workspaces || []).map((w) => w.id).filter((id) => (byWs.get(id) || []).length);
  const wsIds = orderedWs.length ? orderedWs : [...byWs.keys()];
  const multiWs = wsIds.length >= 2;
  const showPicker = !wsTogether && multiWs;
  const pickerWorkspaces = (workspaces || []).filter((w) => (w.modules?.length ?? 0) > 0);

  const buildSection = (wsId, header) => {
    const mods = (byWs.get(wsId) || []).slice().sort((a, b) => a.id.localeCompare(b.id));
    const ungrouped = [];
    const groups = [];
    const gi = new Map();
    for (const item of mods) {
      if (showCategories && item.group) {
        let g = gi.get(item.group);
        if (!g) { g = { name: item.group, items: [] }; groups.push(g); gi.set(item.group, g); }
        g.items.push(item);
      } else {
        ungrouped.push(item);
      }
    }
    return { key: wsId || '_', header, ungrouped, groups };
  };

  let sections;
  if (wsTogether && multiWs) {
    sections = wsIds.map((id) => buildSection(id, wsName.get(id) || id));   // all workspaces, divider each
  } else if (!wsTogether) {
    sections = [buildSection(workspace, null)];                            // picker mode — active workspace only
  } else {
    sections = [buildSection(wsIds[0] || workspace, null)];                // single workspace, no divider
  }
  const railEmpty = sections.every((s) => s.ungrouped.length === 0 && s.groups.length === 0);

  // Title + topbar subtitle reflect the active module.
  const activeMeta = activeQid ? (loadedModules[activeQid]?.meta || {}) : {};
  const activeMod = activeQid ? modules.find((m) => m.qid === activeQid) : null;
  const activeName = activeMeta.name || activeMod?.meta?.name || activeMod?.id;
  useEffect(() => {
    document.title = activeName ? `Atelier · ${activeName}` : 'Atelier';
  }, [activeName]);

  let body;
  if (active.kind === 'none') {
    body = <EmptyWorkspace workspace={workspace || ''} showWorkspace={showPicker && !!workspace} onInstall={hasDock ? () => navigate(DOCK_QID) : null} />;
  } else if (active.kind === 'loading') {
    body = <LoadingBody qid={active.qid} />;
  } else if (active.kind === 'error') {
    body = <ErrorBody qid={active.qid} err={active.err} />;
  } else {
    // Catalyst-style default padding lives on the card — modules render
    // edge-to-edge and rely on it; don't add your own outer padding.
    body = (
      <div className="atelier-overlay-scroll min-h-0 flex-1 overflow-auto">
        <ModuleErrorBoundary qid={active.qid}>
          <div className="p-6 lg:p-10">{active.element}</div>
        </ModuleErrorBoundary>
      </div>
    );
  }

  // Sidebar content props shared by the desktop rail and the mobile drawer;
  // every navigation also closes the drawer (no-op on desktop).
  const sidebarProps = {
    sections,
    empty: railEmpty,
    activeId: activeQid,
    onSelect: (m) => { navigate(m.qid); setMobileOpen(false); },
    onAddModule: () => { navigate(hasDock ? DOCK_QID : `${workspace}/`); setMobileOpen(false); },
    addModuleActive: hasDock && activeQid === DOCK_QID,
    workspaces: pickerWorkspaces,
    workspace: workspace || null,
    onPickWorkspace: (ws) => { pickWorkspace(ws); setMobileOpen(false); },
    showPicker,
    label: boot.label,
    user,
    displayName,
    onOpenSettings: () => setSettingsOpen(true),
    menuItems,
    onSelectMenu: (m) => { navigate(m.qid); setMobileOpen(false); },
    configureItems,
  };

  return (
    <div className="flex h-svh w-full bg-zinc-100 text-zinc-950 dark:bg-zinc-950 dark:text-white">
      {/* Desktop rail — in-flow, collapsible (lg+) */}
      <aside
        aria-hidden={collapsed}
        inert={collapsed ? '' : undefined}
        className={cn(
          'hidden flex-none flex-col overflow-hidden transition-[width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none lg:flex',
          collapsed ? 'w-0' : 'w-[var(--rail-w)]'
        )}
      >
        <SidebarContent variant="desktop" onCollapse={collapseFromRail} {...sidebarProps} />
      </aside>

      {/* Mobile drawer + scrim (below lg) */}
      <div
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
        className={cn(
          'fixed inset-0 z-40 bg-zinc-950/30 backdrop-blur-sm transition-opacity duration-300 lg:hidden',
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
      />
      <aside
        inert={mobileOpen ? undefined : ''}
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-[var(--rail-w)] bg-zinc-100 shadow-xl transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] lg:hidden dark:bg-zinc-950',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <SidebarContent variant="mobile" onClose={() => setMobileOpen(false)} {...sidebarProps} />
      </aside>

      {/* Content column */}
      <div className={cn('flex min-w-0 flex-1 flex-col py-2 pr-2 pl-2', !collapsed && 'lg:pl-0')}>
        {/* Mobile top bar (below lg) */}
        <header className="mb-1 flex items-center gap-2 px-1 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="open sidebar"
            className="inline-flex size-9 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-950/5 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white cursor-pointer transition-colors"
          >
            <Icon name="menu" size={18} />
          </button>
          <AtelierMark size={18} />
          <span className="text-sm font-semibold tracking-tight text-zinc-950 dark:text-white">atelier</span>
          {activeName && (
            <>
              <span className="text-zinc-300 dark:text-zinc-600">/</span>
              <span className="min-w-0 truncate text-sm text-zinc-500 dark:text-zinc-400">{activeName}</span>
            </>
          )}
        </header>
        <ConnectionBanner />
        <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
          {body}
        </main>
      </div>

      {showHint && <SidebarHint />}
      {collapsed && <RevealEdge onExpand={() => setCollapsed(false)} />}
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        user={user}
        displayName={displayName}
        setDisplayName={setDisplayName}
        wsTogether={wsTogether}
        setWsTogether={setWsTogether}
        showCategories={showCategories}
        setShowCategories={setShowCategories}
      />
    </div>
  );
}

export const meta = { isChrome: true, hidden: true, name: 'atelier-chrome' };
