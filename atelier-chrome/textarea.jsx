/* atelier-chrome/kit — Textarea */

import React from 'react'
import * as Headless from '@headlessui/react'
import { cn } from './_util'

const FIELD =
  'block w-full rounded-lg border border-zinc-950/15 bg-white px-3 py-1.5 text-sm/6 text-zinc-950 ' +
  'placeholder:text-zinc-400 shadow-sm transition resize-y ' +
  'focus:outline-none data-[focus]:border-blue-500 data-[focus]:ring-1 data-[focus]:ring-blue-500 ' +
  'data-[invalid]:border-red-500 data-[invalid]:ring-1 data-[invalid]:ring-red-500 ' +
  'data-[disabled]:opacity-50 data-[disabled]:border-zinc-950/10 dark:data-[disabled]:border-white/10 ' +
  'dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder:text-zinc-500'

export const Textarea = React.forwardRef(function Textarea({ className, ...props }, ref) {
  return <Headless.Textarea ref={ref} data-slot="control" className={cn(FIELD, className)} {...props} />
})
