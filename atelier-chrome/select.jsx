/* atelier-chrome/kit — Select
 *
 * A styled native <select> (headlessui's <Select>, so it wires to <Field>) with
 * a chevron affordance. For a rich, searchable or custom-rendered menu, use
 * <Listbox> or <Combobox> instead.
 */

import React from 'react'
import * as Headless from '@headlessui/react'
import { cn, ChevronUpDownGlyph } from './_util'

export const Select = React.forwardRef(function Select({ className, multiple, ...props }, ref) {
  return (
    <span data-slot="control" className={cn('group relative isolate block', className)}>
      <Headless.Select
        ref={ref}
        multiple={multiple}
        className={cn(
          'block w-full appearance-none rounded-lg border border-zinc-950/15 bg-white py-1.5 text-sm/6 text-zinc-950 shadow-sm transition',
          multiple ? 'px-3' : 'pl-3 pr-9',
          'focus:outline-none data-[focus]:border-blue-500 data-[focus]:ring-1 data-[focus]:ring-blue-500',
          'data-[invalid]:border-red-500 data-[invalid]:ring-1 data-[invalid]:ring-red-500',
          'data-[disabled]:opacity-50 data-[disabled]:border-zinc-950/10 dark:data-[disabled]:border-white/10',
          'dark:border-white/15 dark:bg-white/5 dark:text-white *:dark:bg-zinc-800'
        )}
        {...props}
      />
      {!multiple && (
        <span aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 group-has-[select[data-disabled]]:opacity-50 dark:text-zinc-400">
          <ChevronUpDownGlyph className="size-4" />
        </span>
      )}
    </span>
  )
})
