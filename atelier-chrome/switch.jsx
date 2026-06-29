/* atelier-chrome/kit — Switch, SwitchField, SwitchGroup
 *
 * Pattern exemplar for headlessui field-controls: the <Headless.Switch> reports
 * data-checked / data-focus / data-disabled, styled with data-[*] variants; the
 * thumb slides via group-data-[checked]. SwitchField lays a label/description
 * beside the control on the data-slot grid.
 */

import React from 'react'
import * as Headless from '@headlessui/react'
import { cn } from './_util'

const COLORS = {
  blue: 'data-[checked]:bg-blue-600',
  dark: 'data-[checked]:bg-zinc-900 dark:data-[checked]:bg-zinc-600',
  zinc: 'data-[checked]:bg-zinc-600',
  indigo: 'data-[checked]:bg-indigo-600',
  violet: 'data-[checked]:bg-violet-600',
  purple: 'data-[checked]:bg-purple-600',
  emerald: 'data-[checked]:bg-emerald-600',
  green: 'data-[checked]:bg-green-600',
  teal: 'data-[checked]:bg-teal-600',
  amber: 'data-[checked]:bg-amber-500',
  orange: 'data-[checked]:bg-orange-600',
  red: 'data-[checked]:bg-red-600',
  rose: 'data-[checked]:bg-rose-600',
  pink: 'data-[checked]:bg-pink-600',
  sky: 'data-[checked]:bg-sky-600',
  cyan: 'data-[checked]:bg-cyan-600',
}

export const Switch = React.forwardRef(function Switch({ color = 'blue', className, ...props }, ref) {
  return (
    <Headless.Switch
      ref={ref}
      data-slot="control"
      className={cn(
        'group relative inline-flex h-6 w-10 shrink-0 cursor-pointer rounded-full bg-zinc-200 p-0.5 ring-1 ring-inset ring-zinc-950/15 transition-colors duration-200 ease-in-out',
        'focus:outline-none data-[focus]:outline-2 data-[focus]:outline-offset-2 data-[focus]:outline-blue-500',
        'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
        'dark:bg-white/10 dark:ring-white/15',
        COLORS[color] || COLORS.blue,
        className
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none inline-block size-5 translate-x-0 rounded-full bg-white shadow ring-1 ring-zinc-950/5 transition duration-200 ease-in-out group-data-[checked]:translate-x-4"
      />
    </Headless.Switch>
  )
})

export function SwitchField({ className, ...props }) {
  return (
    <Headless.Field
      data-slot="field"
      className={cn(
        'grid grid-cols-[1fr_auto] items-center gap-x-8 gap-y-1',
        '[&>[data-slot=control]]:col-start-2 [&>[data-slot=control]]:self-center [&>[data-slot=control]]:justify-self-end',
        '[&>[data-slot=label]]:col-start-1 [&>[data-slot=label]]:row-start-1',
        '[&>[data-slot=description]]:col-start-1 [&>[data-slot=description]]:row-start-2',
        '*:data-[slot=label]:font-medium',
        className
      )}
      {...props}
    />
  )
}

export function SwitchGroup({ className, ...props }) {
  return (
    <div
      data-slot="control"
      className={cn('space-y-3 [&_[data-slot=label]]:font-normal', className)}
      {...props}
    />
  )
}
