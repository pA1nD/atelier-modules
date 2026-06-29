/* atelier-chrome/kit — Input, InputGroup
 *
 * Input is headlessui's <Input> (so it wires to <Field>/<Label> for free and
 * reports data-focus/disabled). InputGroup positions a leading and/or trailing
 * <Icon data-slot="icon"> inside the field and pads the text accordingly; put
 * the icon as a direct sibling of the Input inside the group.
 */

import React from 'react'
import * as Headless from '@headlessui/react'
import { cn } from './_util'

const FIELD =
  'block w-full rounded-lg border border-zinc-950/15 bg-white px-3 py-1.5 text-sm/6 text-zinc-950 ' +
  'placeholder:text-zinc-400 shadow-sm transition ' +
  'focus:outline-none data-[focus]:border-blue-500 data-[focus]:ring-1 data-[focus]:ring-blue-500 ' +
  'data-[invalid]:border-red-500 data-[invalid]:ring-1 data-[invalid]:ring-red-500 ' +
  'data-[disabled]:opacity-50 data-[disabled]:border-zinc-950/10 dark:data-[disabled]:border-white/10 ' +
  'dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder:text-zinc-500'

export const Input = React.forwardRef(function Input({ className, ...props }, ref) {
  return <Headless.Input ref={ref} data-slot="control" className={cn(FIELD, className)} {...props} />
})

export function InputGroup({ className, children, ...props }) {
  return (
    <span
      data-slot="control"
      className={cn(
        'relative isolate block',
        '[&>[data-slot=icon]]:pointer-events-none [&>[data-slot=icon]]:absolute [&>[data-slot=icon]]:top-1/2 [&>[data-slot=icon]]:z-10 [&>[data-slot=icon]]:size-4 [&>[data-slot=icon]]:-translate-y-1/2 [&>[data-slot=icon]]:text-zinc-500 dark:[&>[data-slot=icon]]:text-zinc-400',
        '[&>[data-slot=icon]:first-child]:left-3 [&>[data-slot=icon]:last-child]:right-3',
        '[&>input:not(:first-child)]:pl-10 [&>input:not(:last-child)]:pr-10',
        className
      )}
      {...props}
    >
      {children}
    </span>
  )
}
