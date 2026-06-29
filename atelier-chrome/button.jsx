/* atelier-chrome/kit — Button
 *
 * Original work, built on headlessui's <Button> (for data-state styling +
 * disabled handling) and the kit's own <Link> for the href form. A solid colour
 * system (blue is atelier's accent default), plus outline and plain variants.
 *
 * API: <Button> solid blue · <Button color="emerald"> · <Button outline> ·
 * <Button plain> · <Button href="…">. `variant="solid|outline|plain"` is also
 * accepted for back-compat with the original kit.
 */

import React from 'react'
import * as Headless from '@headlessui/react'
import { cn } from './_util'
import { Link } from './link'
import { TouchTarget } from './_touch'

const base =
  'relative isolate inline-flex items-center justify-center gap-x-1.5 rounded-lg px-3 py-1.5 text-sm/5 font-medium ' +
  'transition-colors cursor-pointer ' +
  'focus:outline-none data-[focus]:outline-2 data-[focus]:outline-offset-2 data-[focus]:outline-blue-500 ' +
  'data-[disabled]:opacity-50 data-[disabled]:pointer-events-none ' +
  '*:data-[slot=icon]:shrink-0 [&>svg]:shrink-0'

// Solid colour formula — a saturated fill, accessible text, a lighter hover.
const SOLID = {
  blue: 'bg-blue-600 text-white shadow-sm hover:bg-blue-500',
  dark: 'bg-zinc-900 text-white shadow-sm hover:bg-zinc-800 dark:bg-zinc-700 dark:hover:bg-zinc-600',
  zinc: 'bg-zinc-600 text-white shadow-sm hover:bg-zinc-500',
  indigo: 'bg-indigo-600 text-white shadow-sm hover:bg-indigo-500',
  violet: 'bg-violet-600 text-white shadow-sm hover:bg-violet-500',
  purple: 'bg-purple-600 text-white shadow-sm hover:bg-purple-500',
  emerald: 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-500',
  green: 'bg-green-600 text-white shadow-sm hover:bg-green-500',
  teal: 'bg-teal-600 text-white shadow-sm hover:bg-teal-500',
  amber: 'bg-amber-500 text-zinc-950 shadow-sm hover:bg-amber-400',
  orange: 'bg-orange-600 text-white shadow-sm hover:bg-orange-500',
  red: 'bg-red-600 text-white shadow-sm hover:bg-red-500',
  rose: 'bg-rose-600 text-white shadow-sm hover:bg-rose-500',
  pink: 'bg-pink-600 text-white shadow-sm hover:bg-pink-500',
  fuchsia: 'bg-fuchsia-600 text-white shadow-sm hover:bg-fuchsia-500',
  sky: 'bg-sky-600 text-white shadow-sm hover:bg-sky-500',
  cyan: 'bg-cyan-600 text-white shadow-sm hover:bg-cyan-500',
  yellow: 'bg-yellow-400 text-zinc-950 shadow-sm hover:bg-yellow-300',
  lime: 'bg-lime-500 text-zinc-950 shadow-sm hover:bg-lime-400',
  white: 'bg-white text-zinc-950 shadow-sm ring-1 ring-inset ring-zinc-950/10 hover:bg-zinc-50',
}

const OUTLINE =
  'border border-zinc-950/15 text-zinc-950 shadow-sm hover:bg-zinc-950/[0.04] ' +
  'dark:border-white/15 dark:text-white dark:hover:bg-white/10'

const PLAIN =
  'text-zinc-700 hover:bg-zinc-950/5 hover:text-zinc-950 ' +
  'dark:text-zinc-300 dark:hover:bg-white/10 dark:hover:text-white'

export const Button = React.forwardRef(function Button(
  { color, variant, outline, plain, className, href, children, ...props },
  ref
) {
  const isOutline = outline || variant === 'outline'
  const isPlain = plain || variant === 'plain'
  const look = isOutline ? OUTLINE : isPlain ? PLAIN : SOLID[color || 'blue'] || SOLID.blue
  const classes = cn(base, look, className)
  const inner = <TouchTarget>{children}</TouchTarget>
  // forwardRef matters: headlessui's `as={Button}` (e.g. DropdownButton) attaches
  // a ref to measure the trigger for anchored-popover positioning.
  return href != null ? (
    <Link ref={ref} href={href} className={classes} {...props}>{inner}</Link>
  ) : (
    <Headless.Button ref={ref} className={classes} {...props}>{inner}</Headless.Button>
  )
})
