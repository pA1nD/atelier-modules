/* atelier-chrome/kit — Avatar, AvatarButton
 *
 * An <Avatar> is a square or round badge showing an image, or falling back to
 * initials drawn as inline SVG text (so a missing image never collapses the
 * layout). The initials inherit the span's text colour and the badge fill is the
 * span's bg — both overridable via `className` (cn does tailwind-merge).
 * <AvatarButton> wraps it as a focusable button or link.
 *
 * API: <Avatar src="…" /> · <Avatar initials="JS" /> · <Avatar square /> ·
 * <Avatar initials="JS" className="size-8 bg-blue-600 text-white" /> ·
 * <AvatarButton href="…" initials="JS" /> · <AvatarButton onClick={…} src="…" />
 */

import React from 'react'
import * as Headless from '@headlessui/react'
import { cn } from './_util'
import { Link } from './link'
import { TouchTarget } from './_touch'

export const Avatar = React.forwardRef(function Avatar(
  { src = null, square = false, initials, alt = '', className, ...props },
  ref
) {
  return (
    <span
      ref={ref}
      data-slot="avatar"
      {...props}
      className={cn(
        'inline-grid size-10 shrink-0 overflow-hidden align-middle',
        'bg-zinc-100 text-zinc-700 ring-1 ring-inset ring-zinc-950/10 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-white/10',
        square ? 'rounded-[20%]' : 'rounded-full',
        className
      )}
    >
      {src ? (
        <img src={src} alt={alt} className="size-full object-cover" />
      ) : initials ? (
        <svg
          viewBox="0 0 100 100"
          aria-hidden={alt ? undefined : 'true'}
          aria-label={alt || undefined}
          role={alt ? 'img' : undefined}
          className="size-full select-none fill-current text-[48px] font-medium uppercase"
        >
          {alt && <title>{alt}</title>}
          <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central">
            {initials}
          </text>
        </svg>
      ) : null}
    </span>
  )
})

export const AvatarButton = React.forwardRef(function AvatarButton(
  { src, square = false, initials, alt, href, className, ...props },
  ref
) {
  // `className` styles BOTH the wrapper (size/shape/focus target) and the inner
  // Avatar (so bg/text/size reach the visible surface). The wrapper shrink-wraps
  // the Avatar, so with no size in className it's the Avatar's size-10 default.
  const wrapper = cn(
    'relative inline-grid focus:outline-none',
    'data-[focus]:outline-2 data-[focus]:outline-offset-2 data-[focus]:outline-blue-500',
    square ? 'rounded-[20%]' : 'rounded-full',
    className
  )
  const avatar = <Avatar src={src} square={square} initials={initials} alt={alt} className={className} />
  return href != null ? (
    <Link ref={ref} href={href} className={wrapper} {...props}>
      <TouchTarget>{avatar}</TouchTarget>
    </Link>
  ) : (
    <Headless.Button ref={ref} className={wrapper} {...props}>
      <TouchTarget>{avatar}</TouchTarget>
    </Headless.Button>
  )
})
