/* atelier-chrome/kit — Eyebrow, SystemIcon, Reveal, useReveal
 *
 * Atelier-identity extras the dock/onboarding modules lean on: a small accent
 * eyebrow pill, an outline "system" icon tile (distinct from a module's filled
 * app-tile), and a scroll-reveal wrapper. Original atelier work.
 */

import React from 'react'
import { cn, useDark, shade, tint } from './_util'
import { Icon } from './icon'

// Reveal-on-scroll: returns [ref, inView] once the element enters the viewport.
export function useReveal(opts = {}) {
  const ref = React.useRef(null)
  const [inView, setInView] = React.useState(false)
  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => { if (e.isIntersecting) { setInView(true); io.unobserve(el) } }),
      { rootMargin: opts.rootMargin || '-10% 0px -10% 0px', threshold: opts.threshold ?? 0.12 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return [ref, inView]
}

export function Reveal({ as = 'div', delay = 0, className = '', children, ...rest }) {
  const [ref, inView] = useReveal()
  const Tag = as
  return (
    <Tag
      ref={ref}
      className={cn('transition duration-700 ease-out motion-reduce:transition-none', inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3.5 will-change-transform', className)}
      style={{ transitionDelay: `${delay}ms` }}
      {...rest}
    >
      {children}
    </Tag>
  )
}

// A small accent pill — the dock "eyebrow".
export function Eyebrow({ icon, color = '#3b82f6', className, children }) {
  const dark = useDark()
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide', className)}
      style={{ background: tint(color, dark ? '2b' : '1f'), color: shade(color, dark ? 0.4 : -0.25) }}
    >
      {icon && <Icon name={icon} size={12} />}
      {children}
    </span>
  )
}

// A SYSTEM's mark — an outline, accent-tinted tile with a line icon. Distinct
// from the filled squircle app-tile (which is reserved for modules).
export function SystemIcon({ icon, color = '#71717a', size = 40, className }) {
  return (
    <span
      className={cn('grid shrink-0 place-items-center rounded-xl', className)}
      style={{ width: size, height: size, border: `1px solid ${color}40`, background: `${color}12`, color }}
    >
      <Icon name={icon} size={Math.round(size * 0.5)} strokeWidth={1.9} />
    </span>
  )
}
