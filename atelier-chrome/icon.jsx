/* atelier-chrome/kit — Icon
 *
 * Renders a named lucide glyph through the chrome's global lucide (injected by
 * frontend.jsx). Modules name an icon (`<Icon name="rocket" />`) rather than
 * importing an icon library — module frontends are transformed per file, so a
 * bare lucide import wouldn't resolve. Carries data-slot="icon" so InputGroup /
 * Button / Dropdown position it correctly.
 */

import React from 'react'
import { cn } from './_util'

export function Icon({ name, size = 16, strokeWidth = 1.85, className = '', style }) {
  const ref = React.useRef(null)
  React.useEffect(() => {
    let cancelled = false
    const paint = () => {
      const el = ref.current
      if (!el || cancelled) return
      el.innerHTML = '' // clear any prior glyph first, so a name change never leaves a stale one
      if (!name) return
      if (!window.lucide) {
        // lucide loads with the chrome; if a module mounts first, retry shortly.
        setTimeout(paint, 50)
        return
      }
      const i = document.createElement('i')
      i.setAttribute('data-lucide', name)
      el.appendChild(i)
      try {
        window.lucide.createIcons({ attrs: { 'stroke-width': strokeWidth } })
      } catch {}
      // Size THIS icon's own svg, so a batch of differently-sized icons mounting
      // in one tick (where one createIcons call renders several) can't share a size.
      const svg = el.querySelector('svg')
      if (svg) {
        svg.setAttribute('width', size)
        svg.setAttribute('height', size)
      }
    }
    paint()
    return () => {
      cancelled = true
    }
  }, [name, size, strokeWidth])
  return (
    <span
      ref={ref}
      data-slot="icon"
      aria-hidden="true"
      className={cn('inline-flex shrink-0 items-center justify-center', className)}
      style={{ width: size, height: size, ...style }}
    />
  )
}
