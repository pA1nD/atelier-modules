/* atelier-chrome/kit — Radio, RadioField, RadioGroup
 *
 * The headlessui field-control pattern (see Switch / Checkbox): a single choice
 * within a <Headless.RadioGroup>. Each <Headless.Radio> reports data-checked /
 * data-focus / data-disabled; the round box is the `group`, and its inner dot
 * shows via group-data-[checked]. RadioField lays the control on the LEFT of a
 * data-slot grid with label/description to its right.
 */

import React from 'react'
import * as Headless from '@headlessui/react'
import { cn, RadioDotGlyph } from './_util'

/* Fill + border applied when selected. Keyed exactly like Checkbox/Switch;
 * literal strings so Tailwind/oxide can see every class. */
const COLORS = {
  blue: 'data-[checked]:border-blue-600 data-[checked]:bg-blue-600',
  dark: 'data-[checked]:border-zinc-900 data-[checked]:bg-zinc-900 dark:data-[checked]:border-zinc-600 dark:data-[checked]:bg-zinc-600',
  zinc: 'data-[checked]:border-zinc-600 data-[checked]:bg-zinc-600',
  indigo: 'data-[checked]:border-indigo-600 data-[checked]:bg-indigo-600',
  violet: 'data-[checked]:border-violet-600 data-[checked]:bg-violet-600',
  purple: 'data-[checked]:border-purple-600 data-[checked]:bg-purple-600',
  emerald: 'data-[checked]:border-emerald-600 data-[checked]:bg-emerald-600',
  green: 'data-[checked]:border-green-600 data-[checked]:bg-green-600',
  teal: 'data-[checked]:border-teal-600 data-[checked]:bg-teal-600',
  amber: 'data-[checked]:border-amber-500 data-[checked]:bg-amber-500',
  orange: 'data-[checked]:border-orange-600 data-[checked]:bg-orange-600',
  red: 'data-[checked]:border-red-600 data-[checked]:bg-red-600',
  rose: 'data-[checked]:border-rose-600 data-[checked]:bg-rose-600',
  pink: 'data-[checked]:border-pink-600 data-[checked]:bg-pink-600',
  sky: 'data-[checked]:border-sky-600 data-[checked]:bg-sky-600',
  cyan: 'data-[checked]:border-cyan-600 data-[checked]:bg-cyan-600',
}

// amber's fill is light, so its dot is dark (white-on-amber fails contrast).
const DARK_MARK = new Set(['amber'])

export function RadioGroup({ className, ...props }) {
  return (
    <Headless.RadioGroup
      data-slot="control"
      className={cn('space-y-3 [&_[data-slot=label]]:font-normal', className)}
      {...props}
    />
  )
}

export const Radio = React.forwardRef(function Radio({ color = 'blue', className, ...props }, ref) {
  const ink = DARK_MARK.has(color) ? 'text-zinc-900' : 'text-white'
  return (
    <Headless.Radio
      ref={ref}
      data-slot="control"
      className={cn(
        'group relative inline-flex size-[1.125rem] shrink-0 items-center justify-center rounded-full border border-zinc-950/15 bg-white transition-colors',
        'dark:border-white/15 dark:bg-white/5',
        'focus:outline-none data-[focus]:outline-2 data-[focus]:outline-offset-2 data-[focus]:outline-blue-500',
        'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
        COLORS[color] || COLORS.blue,
        className
      )}
      {...props}
    >
      <RadioDotGlyph className={cn('hidden size-3 group-data-[checked]:block', ink)} />
    </Headless.Radio>
  )
})

export function RadioField({ className, ...props }) {
  return (
    <Headless.Field
      data-slot="field"
      className={cn(
        'grid grid-cols-[1.125rem_1fr] gap-x-3 gap-y-1',
        '[&>[data-slot=control]]:col-start-1 [&>[data-slot=control]]:row-start-1 [&>[data-slot=control]]:self-start [&>[data-slot=control]]:mt-[3px]',
        '[&>[data-slot=label]]:col-start-2 [&>[data-slot=label]]:row-start-1',
        '[&>[data-slot=description]]:col-start-2 [&>[data-slot=description]]:row-start-2',
        '*:data-[slot=label]:font-medium',
        className
      )}
      {...props}
    />
  )
}
