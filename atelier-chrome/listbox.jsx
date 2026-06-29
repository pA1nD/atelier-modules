/* atelier-chrome/kit — Listbox, ListboxOption, ListboxLabel, ListboxDescription
 *
 * A rich, custom-rendered single-select built on headlessui's Listbox. The
 * trigger matches <Select>'s styling (a bordered control with a chevron); the
 * menu is an anchored, transitioning popover whose rows carry their own
 * selected check. For a plain native dropdown, use <Select> instead.
 */

import React from 'react'
import * as Headless from '@headlessui/react'
import { cn, CheckGlyph, ChevronUpDownGlyph } from './_util'

const POPOVER =
  'isolate w-[var(--button-width)] min-w-52 max-h-72 overflow-y-auto rounded-xl border border-zinc-950/10 bg-white/95 p-1 shadow-lg ring-1 ring-zinc-950/5 backdrop-blur-md [--anchor-gap:0.5rem] focus:outline-none transition duration-100 ease-out data-[closed]:opacity-0 data-[closed]:scale-95 dark:border-white/10 dark:bg-zinc-800/95 dark:ring-white/10'

// In the open list this is a [check | content] grid. When the SAME option is
// re-rendered inside the trigger (ListboxSelectedOption, a [data-slot=control]
// descendant) it collapses to plain content — no check, no reserved check
// column — so the closed control shows just the label.
const OPTION_ROW =
  'group/option grid cursor-default select-none grid-cols-[1.25rem_1fr] items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm/6 text-zinc-950 data-[focus]:bg-blue-600 data-[focus]:text-white data-[disabled]:opacity-50 dark:text-white ' +
  '[[data-slot=control]_&]:flex [[data-slot=control]_&]:p-0 [[data-slot=control]_&]:bg-transparent'

export function Listbox({ className, placeholder, autoFocus, 'aria-label': ariaLabel, children, ...props }) {
  return (
    <Headless.Listbox {...props}>
      <Headless.ListboxButton
        data-slot="control"
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        className={cn(
          'group relative block w-full appearance-none rounded-lg border border-zinc-950/15 bg-white py-1.5 pl-3 pr-9 text-left text-sm/6 text-zinc-950 shadow-sm transition',
          'focus:outline-none data-[focus]:border-blue-500 data-[focus]:ring-1 data-[focus]:ring-blue-500',
          'data-[disabled]:opacity-50 data-[disabled]:border-zinc-950/10',
          'dark:border-white/15 dark:bg-white/5 dark:text-white',
          className
        )}
      >
        <Headless.ListboxSelectedOption
          options={children}
          placeholder={<span className="block truncate text-zinc-400 dark:text-zinc-500">{placeholder}</span>}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 dark:text-zinc-400"
        >
          <ChevronUpDownGlyph className="size-4" />
        </span>
      </Headless.ListboxButton>
      <Headless.ListboxOptions anchor="bottom start" transition className={POPOVER}>
        {children}
      </Headless.ListboxOptions>
    </Headless.Listbox>
  )
}

export function ListboxOption({ children, className, ...props }) {
  return (
    <Headless.ListboxOption className={cn(OPTION_ROW, className)} {...props}>
      <span className="invisible col-start-1 flex justify-center group-data-[selected]/option:visible [[data-slot=control]_&]:hidden">
        <CheckGlyph className="size-4 text-blue-600 group-data-[focus]/option:text-white" />
      </span>
      <span className="col-start-2 flex min-w-0 items-center gap-2">{children}</span>
    </Headless.ListboxOption>
  )
}

export function ListboxLabel({ className, ...props }) {
  return <span className={cn('min-w-0 truncate', className)} {...props} />
}

export function ListboxDescription({ className, ...props }) {
  return (
    <span
      className={cn('text-zinc-500 group-data-[focus]/option:text-white/70 dark:text-zinc-400', className)}
      {...props}
    />
  )
}
