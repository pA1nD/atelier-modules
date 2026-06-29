/* atelier-chrome/kit — Agent affordances: AgentSpark, CopyButton, AgentBadge
 *
 * The standard "this can be handed to an agent" controls. The twinkle + copy-
 * burst @keyframes live in the chrome's styles.css; the violet comes from the
 * --color-agent token (text-agent / fill-agent). Original atelier work.
 */

import React from 'react'
import { cn } from './_util'

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
// success. `value` is the text (or a () => text getter) written to the clipboard.
// Copy with a graceful fallback for insecure contexts (navigator.clipboard is
// undefined on plain-HTTP, non-localhost origins).
async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {}
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

export function CopyButton({ value, title = 'Copy', className }) {
  const [boom, setBoom] = React.useState(false)
  const timer = React.useRef(null)
  React.useEffect(() => () => clearTimeout(timer.current), [])
  const onCopy = async (e) => {
    e.preventDefault(); e.stopPropagation()
    const text = typeof value === 'function' ? value() : value
    if (!(await copyText(text))) return
    setBoom(false)
    requestAnimationFrame(() => requestAnimationFrame(() => setBoom(true)))
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setBoom(false), 1500)
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
// text), then the CopyButton that copies `prompt`.
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
