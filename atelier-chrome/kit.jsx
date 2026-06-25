/* atelier-chrome — @atelier/kit
 *
 * The primitives this chrome publishes to its companion modules. The shell
 * maps the bare specifier `@atelier/kit` → this file at request time (see
 * atelier/server.js `buildImportMap`), so a module paired with this chrome can:
 *
 *   import { Button, Input, Field, Label, Heading, Text, Badge } from '@atelier/kit'
 *
 * ORIGINAL WORK — these are plain Tailwind compositions, nothing copied from
 * Catalyst. Kept deliberately small: a chrome's kit is a chrome-by-chrome
 * choice, not a drop-in contract, so grow this only as real modules need it.
 * No external deps (no headlessui/clsx) — just React + Tailwind utilities,
 * which keeps the whole chrome dependency-free and MIT-licensed.
 */

import React from 'react'

const cn = (...parts) => parts.filter(Boolean).join(' ')

/* --- Button ------------------------------------------------------------- */
const BTN_BASE =
  'inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm/6 font-medium ' +
  'transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ' +
  'focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900 ' +
  'disabled:opacity-50 disabled:pointer-events-none cursor-pointer'

const BTN_VARIANTS = {
  solid: 'bg-blue-600 text-white shadow-sm hover:bg-blue-500',
  outline:
    'border border-zinc-950/15 text-zinc-950 hover:bg-zinc-950/5 ' +
    'dark:border-white/15 dark:text-white dark:hover:bg-white/10',
  plain:
    'text-zinc-700 hover:bg-zinc-950/5 hover:text-zinc-950 ' +
    'dark:text-zinc-300 dark:hover:bg-white/10 dark:hover:text-white',
}

export function Button({ variant = 'solid', className, href, children, ...props }) {
  const classes = cn(BTN_BASE, BTN_VARIANTS[variant] || BTN_VARIANTS.solid, className)
  if (typeof href === 'string') {
    return <a href={href} className={classes} {...props}>{children}</a>
  }
  return <button className={classes} {...props}>{children}</button>
}

/* --- Form: Field / Label / Description / ErrorMessage / Input / Textarea -- */
export function Field({ className, ...props }) {
  return <div className={cn('space-y-1.5', className)} {...props} />
}

export function Label({ className, ...props }) {
  return (
    <label
      className={cn('block text-sm/6 font-medium text-zinc-950 dark:text-white', className)}
      {...props}
    />
  )
}

export function Description({ className, ...props }) {
  return <p className={cn('text-sm/6 text-zinc-500 dark:text-zinc-400', className)} {...props} />
}

export function ErrorMessage({ className, ...props }) {
  return <p className={cn('text-sm/6 text-red-600 dark:text-red-400', className)} {...props} />
}

const FIELD_BASE =
  'block w-full rounded-lg border border-zinc-950/15 bg-white px-3 py-1.5 text-sm/6 text-zinc-950 ' +
  'placeholder:text-zinc-400 shadow-sm transition-colors ' +
  'focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 ' +
  'disabled:opacity-50 ' +
  'dark:border-white/15 dark:bg-white/5 dark:text-white'

export function Input({ className, ...props }) {
  return <input className={cn(FIELD_BASE, className)} {...props} />
}

export function Textarea({ className, ...props }) {
  return <textarea className={cn(FIELD_BASE, 'resize-y', className)} {...props} />
}

/* --- Typography --------------------------------------------------------- */
export function Heading({ level = 1, className, ...props }) {
  const Tag = `h${level}`
  return (
    <Tag
      className={cn('text-2xl/8 font-semibold tracking-tight text-zinc-950 dark:text-white', className)}
      {...props}
    />
  )
}

export function Subheading({ level = 2, className, ...props }) {
  const Tag = `h${level}`
  return (
    <Tag
      className={cn('text-base/7 font-semibold text-zinc-950 dark:text-white', className)}
      {...props}
    />
  )
}

export function Text({ className, ...props }) {
  return <p className={cn('text-sm/6 text-zinc-500 dark:text-zinc-400', className)} {...props} />
}

export function Strong({ className, ...props }) {
  return <strong className={cn('font-medium text-zinc-950 dark:text-white', className)} {...props} />
}

export function Code({ className, ...props }) {
  return (
    <code
      className={cn(
        'rounded border border-zinc-950/10 bg-zinc-950/5 px-1 py-0.5 font-mono text-[0.8125em] text-zinc-900',
        'dark:border-white/10 dark:bg-white/10 dark:text-zinc-100',
        className
      )}
      {...props}
    />
  )
}

/* --- Badge -------------------------------------------------------------- */
const BADGE_COLORS = {
  zinc: 'bg-zinc-500/15 text-zinc-700 dark:text-zinc-300',
  blue: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  green: 'bg-green-500/15 text-green-700 dark:text-green-300',
  amber: 'bg-amber-500/20 text-amber-700 dark:text-amber-300',
  red: 'bg-red-500/15 text-red-700 dark:text-red-300',
}

export function Badge({ color = 'zinc', className, ...props }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs/5 font-medium',
        BADGE_COLORS[color] || BADGE_COLORS.zinc,
        className
      )}
      {...props}
    />
  )
}

/* --- Agent affordances --------------------------------------------------- *
 * The standard "this can be handed to an agent" controls. Use AgentBadge
 * wherever a module exposes something an agent can pick up (a skill, a prompt,
 * an endpoint) so it always reads the same across the system. The twinkle +
 * copy-burst @keyframes live in the chrome's styles.css; the violet comes from
 * the --color-agent token (text-agent / fill-agent). */

// Burst geometry for the CopyButton.
const CB_PARTICLES = [[26, -22], [-26, -22], [24, 24], [-24, 24], [34, 2], [-34, 2], [2, 34], [-2, -34], [18, -30], [-18, 30], [30, 18], [-30, -18]]
const CB_RING_DELAYS = ['0s', '.08s', '.16s']
const CB_SPARKS = [0, 90, 180, 270]

// A twinkling two-point AI sparkle — the universal "this is an agent thing"
// mark. Inherits color via currentColor (wrap in `text-agent` for the violet).
export function AgentSpark({ size = 14, className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={cn('shrink-0', className)}>
      <path className="atelier-spark" style={{ animationDelay: '0s' }} fill="currentColor" d="M11 3C11.4 9 13.6 11.1 19.5 12.5C13.6 13.9 11.4 16 11 22C10.6 16 8.4 13.9 2.5 12.5C8.4 11.1 10.6 9 11 3Z" />
      <path className="atelier-spark" style={{ animationDelay: '.9s' }} fill="currentColor" d="M18.6 2.2C18.75 4.1 19.5 4.85 21.4 5C19.5 5.15 18.75 5.9 18.6 7.8C18.45 5.9 17.7 5.15 15.8 5C17.7 4.85 18.45 4.1 18.6 2.2Z" />
    </svg>
  )
}

// A copy button that bursts particles / rings / sparks and draws a checkmark on
// success — the celebratory "handed off" confirmation. `value` is the text (or
// a () => text getter) written to the clipboard.
export function CopyButton({ value, title = 'Copy', className }) {
  const [boom, setBoom] = React.useState(false)
  const onCopy = async (e) => {
    e.preventDefault(); e.stopPropagation()
    const text = typeof value === 'function' ? value() : value
    try { await navigator.clipboard.writeText(text) } catch { return }
    setBoom(false)
    requestAnimationFrame(() => requestAnimationFrame(() => setBoom(true)))
    setTimeout(() => setBoom(false), 1500)
  }
  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={title}
      title={boom ? 'Copied!' : title}
      className={cn(
        'atelier-cb relative inline-flex size-[15px] shrink-0 items-center justify-center align-[-3px] cursor-pointer',
        'text-zinc-400 transition-colors hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300',
        boom && 'is-boom',
        className
      )}
    >
      <svg className="atelier-cb__copy" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="9" y="9" width="11" height="11" rx="2" />
        <path d="M5 15V5a2 2 0 0 1 2-2h10" />
      </svg>
      <svg className="atelier-cb__check" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 12.5l4.5 4.5L19 7" />
      </svg>
      <span className="atelier-cb__fx" aria-hidden="true">
        <span className="atelier-cb__particles">{CB_PARTICLES.map(([x, y], i) => <span key={i} style={{ '--x': `${x}px`, '--y': `${y}px` }} />)}</span>
        <span className="atelier-cb__rings">{CB_RING_DELAYS.map((d, i) => <span key={i} style={{ '--d': d }} />)}</span>
        <span className="atelier-cb__sparks">{CB_SPARKS.map((r, i) => <span key={i} style={{ '--r': `${r}deg` }} />)}</span>
      </span>
    </button>
  )
}

// The standard "this can be handed to an agent" badge — a frosted chip: the
// AgentSpark, a label (a link via `href`, an action via `onActivate`, or plain
// text), then the CopyButton that copies `prompt`. Pass `prompt` as the agent
// instruction/URL; omit it for a label-only marker.
export function AgentBadge({ prompt, label = 'hand to an agent', href, onActivate, copyTitle = 'Copy the agent prompt', className }) {
  const labelCls = 'inline-flex items-center gap-1.5 font-medium transition hover:text-zinc-950 dark:hover:text-white'
  const inner = (
    <>
      <span className="inline-flex shrink-0 text-agent"><AgentSpark /></span>
      <span className="underline decoration-zinc-300 underline-offset-2 dark:decoration-zinc-600">{label}</span>
    </>
  )
  return (
    <span className={cn('inline-flex items-center gap-2 rounded-full border border-zinc-950/10 bg-white/60 px-2.5 py-1 text-[12.5px] text-zinc-600 backdrop-blur dark:border-white/10 dark:bg-zinc-900/50 dark:text-zinc-300', className)}>
      {href
        ? <a href={href} className={labelCls}>{inner}</a>
        : onActivate
          ? <button type="button" onClick={onActivate} className={cn(labelCls, 'cursor-pointer')}>{inner}</button>
          : <span className={labelCls}>{inner}</span>}
      {prompt != null && (
        <>
          <span className="text-zinc-300 dark:text-zinc-600">·</span>
          <CopyButton value={prompt} title={copyTitle} />
        </>
      )}
    </span>
  )
}
