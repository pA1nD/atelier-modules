/* atelier-chrome/kit — shared internals
 *
 * Helpers every kit component file imports. `cn`, `useDark`, `shade`, `tint`
 * are also re-exported publicly from the barrel (modules use them). The glyph
 * components are internal-only: tiny original inline SVGs for control chrome
 * (a checkmark, a chevron, a radio dot), so the form controls don't depend on
 * an async icon font for their own marks. Public, named icons go through the
 * <Icon> component (chrome's lucide) instead.
 */

import React from 'react'
import { twMerge } from 'tailwind-merge'

/* Class-name join with Tailwind conflict resolution — later utilities win, so a
 * consumer's `className` reliably overrides a component's base (bg, size, text…).
 * The kit's clsx + tailwind-merge in one. */
export const cn = (...parts) => twMerge(parts.filter(Boolean).join(' '))

/* Track the chrome's dark mode (html.dark) so inline (non-class) colours can
 * pick a legible shade. Class-based styling should use the `dark:` variant. */
export function useDark() {
  const [dark, setDark] = React.useState(
    () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  )
  React.useEffect(() => {
    const el = document.documentElement
    const sync = () => setDark(el.classList.contains('dark'))
    sync()
    const obs = new MutationObserver(sync)
    obs.observe(el, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])
  return dark
}

/* Expand a hex colour to a 6-digit body (no leading #). Shared by shade/tint so
 * both accept #rgb and #rrggbb consistently. */
function hexBody(hex) {
  let h = (hex || '#71717a').replace('#', '')
  if (h.length === 3) h = h.split('').map((x) => x + x).join('')
  return h
}

/* Lighten (amt>0) or darken (amt<0) a hex colour by a 0..1 ratio. */
export function shade(hex, amt) {
  const h = hexBody(hex)
  const ch = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
  const mix = (c) => (amt >= 0 ? Math.round(c + (255 - c) * amt) : Math.round(c * (1 + amt)))
  return '#' + ch.map((c) => ('0' + mix(c).toString(16)).slice(-2)).join('')
}

/* Append an 8-bit alpha suffix to a hex colour (e.g. tint('#2563eb','1f')).
 * Expands #rgb first so the result is always a valid 8-digit hex. */
export const tint = (hex, a) => '#' + hexBody(hex) + a

/* ── internal control glyphs (not exported from the barrel) ───────────────── */

export function CheckGlyph({ className }) {
  return (
    <svg viewBox="0 0 14 14" fill="none" aria-hidden="true" className={className}>
      <path d="M3 8L6 11L11 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function IndeterminateGlyph({ className }) {
  return (
    <svg viewBox="0 0 14 14" fill="none" aria-hidden="true" className={className}>
      <path d="M3 7H11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function RadioDotGlyph({ className }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={className}>
      <circle cx="8" cy="8" r="3" fill="currentColor" />
    </svg>
  )
}

/* up/down chevron — selects & comboboxes (signals "opens a menu") */
export function ChevronUpDownGlyph({ className }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path d="M5 6.5L8 3.5L11 6.5M5 9.5L8 12.5L11 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
