/* atelier-chrome/kit — Checkbox, CheckboxField, CheckboxGroup
 *
 * Same headlessui field-control pattern as Switch: <Headless.Checkbox> reports
 * data-checked / data-indeterminate / data-focus / data-disabled, all styled
 * with data-[*] variants. The box is the `group`, so its inner marks toggle via
 * group-data-[checked] / group-data-[indeterminate]. CheckboxField lays the
 * control on the LEFT of a data-slot grid with label/description to its right.
 */

import React from 'react'
import * as Headless from '@headlessui/react'
import { cn, CheckGlyph, IndeterminateGlyph } from './_util'

/* Fill + border applied when the box is checked OR indeterminate. Keyed exactly
 * like Switch/Radio; literal strings so Tailwind/oxide can see every class. */
const COLORS = {
  blue: 'data-[checked]:border-blue-600 data-[checked]:bg-blue-600 data-[indeterminate]:border-blue-600 data-[indeterminate]:bg-blue-600',
  dark: 'data-[checked]:border-zinc-900 data-[checked]:bg-zinc-900 data-[indeterminate]:border-zinc-900 data-[indeterminate]:bg-zinc-900 dark:data-[checked]:border-zinc-600 dark:data-[checked]:bg-zinc-600 dark:data-[indeterminate]:border-zinc-600 dark:data-[indeterminate]:bg-zinc-600',
  zinc: 'data-[checked]:border-zinc-600 data-[checked]:bg-zinc-600 data-[indeterminate]:border-zinc-600 data-[indeterminate]:bg-zinc-600',
  indigo: 'data-[checked]:border-indigo-600 data-[checked]:bg-indigo-600 data-[indeterminate]:border-indigo-600 data-[indeterminate]:bg-indigo-600',
  violet: 'data-[checked]:border-violet-600 data-[checked]:bg-violet-600 data-[indeterminate]:border-violet-600 data-[indeterminate]:bg-violet-600',
  purple: 'data-[checked]:border-purple-600 data-[checked]:bg-purple-600 data-[indeterminate]:border-purple-600 data-[indeterminate]:bg-purple-600',
  emerald: 'data-[checked]:border-emerald-600 data-[checked]:bg-emerald-600 data-[indeterminate]:border-emerald-600 data-[indeterminate]:bg-emerald-600',
  green: 'data-[checked]:border-green-600 data-[checked]:bg-green-600 data-[indeterminate]:border-green-600 data-[indeterminate]:bg-green-600',
  teal: 'data-[checked]:border-teal-600 data-[checked]:bg-teal-600 data-[indeterminate]:border-teal-600 data-[indeterminate]:bg-teal-600',
  amber: 'data-[checked]:border-amber-500 data-[checked]:bg-amber-500 data-[indeterminate]:border-amber-500 data-[indeterminate]:bg-amber-500',
  orange: 'data-[checked]:border-orange-600 data-[checked]:bg-orange-600 data-[indeterminate]:border-orange-600 data-[indeterminate]:bg-orange-600',
  red: 'data-[checked]:border-red-600 data-[checked]:bg-red-600 data-[indeterminate]:border-red-600 data-[indeterminate]:bg-red-600',
  rose: 'data-[checked]:border-rose-600 data-[checked]:bg-rose-600 data-[indeterminate]:border-rose-600 data-[indeterminate]:bg-rose-600',
  pink: 'data-[checked]:border-pink-600 data-[checked]:bg-pink-600 data-[indeterminate]:border-pink-600 data-[indeterminate]:bg-pink-600',
  sky: 'data-[checked]:border-sky-600 data-[checked]:bg-sky-600 data-[indeterminate]:border-sky-600 data-[indeterminate]:bg-sky-600',
  cyan: 'data-[checked]:border-cyan-600 data-[checked]:bg-cyan-600 data-[indeterminate]:border-cyan-600 data-[indeterminate]:bg-cyan-600',
}

// amber's fill is light, so a white mark on it fails WCAG contrast — it gets a
// dark mark instead. Every other fill is dark enough for a white mark.
const DARK_MARK = new Set(['amber'])

export const Checkbox = React.forwardRef(function Checkbox({ color = 'blue', className, ...props }, ref) {
  const ink = DARK_MARK.has(color) ? 'text-zinc-900' : 'text-white'
  return (
    <Headless.Checkbox
      ref={ref}
      data-slot="control"
      className={cn(
        'group relative inline-flex size-[1.125rem] shrink-0 items-center justify-center rounded-[0.3rem] border border-zinc-950/15 bg-white transition-colors',
        'dark:border-white/15 dark:bg-white/5',
        'focus:outline-none data-[focus]:outline-2 data-[focus]:outline-offset-2 data-[focus]:outline-blue-500',
        'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
        COLORS[color] || COLORS.blue,
        className
      )}
      {...props}
    >
      <CheckGlyph className={cn('hidden size-3 group-data-[checked]:block', ink)} />
      <IndeterminateGlyph className={cn('hidden size-3 group-data-[indeterminate]:block', ink)} />
    </Headless.Checkbox>
  )
})

export function CheckboxField({ className, ...props }) {
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

export function CheckboxGroup({ className, ...props }) {
  return (
    <div
      data-slot="control"
      className={cn('space-y-3 [&_[data-slot=label]]:font-normal', className)}
      {...props}
    />
  )
}
