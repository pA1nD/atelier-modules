/* atelier-chrome/kit — Dropdown
 *
 * Original work, built on headlessui's <Menu> family (MenuButton / MenuItems /
 * MenuItem / MenuSection / MenuHeading / MenuSeparator) for keyboard nav, focus
 * roving, and the data-[focus]/[disabled]/[open] state attributes. The panel is
 * an anchored, content-sized popover; items can be plain buttons or links (the
 * kit's own <Link>), and carry optional icons, labels, descriptions, and
 * keyboard-shortcut hints. Blue is atelier's accent default.
 *
 * API:
 *   <Dropdown>
 *     <DropdownButton>Options</DropdownButton>      // defaults to our <Button>
 *     <DropdownMenu anchor="bottom start">
 *       <DropdownItem onClick={…}>…</DropdownItem>
 *       <DropdownItem href="/x">…</DropdownItem>
 *       <DropdownDivider />
 *       <DropdownSection>
 *         <DropdownHeading>Section</DropdownHeading>
 *         <DropdownItem disabled>…</DropdownItem>
 *       </DropdownSection>
 *     </DropdownMenu>
 *   </Dropdown>
 */

import React from 'react'
import * as Headless from '@headlessui/react'
import { cn } from './_util'
import { Button } from './button'
import { Link } from './link'

/* Anchored panel — sized to its content (min-w-48), not the trigger. Floats with
 * a small gap, fades + scales on open/close via the `transition` prop on
 * DropdownMenu (data-[closed] is set by headlessui during the transition). */
const PANEL =
  'isolate min-w-48 rounded-xl border border-zinc-950/10 bg-white/95 p-1 shadow-lg ring-1 ring-zinc-950/5 ' +
  'backdrop-blur-md [--anchor-gap:0.5rem] focus:outline-none ' +
  'transition duration-100 ease-out data-[closed]:opacity-0 data-[closed]:scale-95 ' +
  'dark:border-white/10 dark:bg-zinc-800/95 dark:ring-white/10'

/* One row — focus paints blue, disabled dims, contained icons shrink + recolour
 * (turning white when the row is focused). The row owns the `group` so child
 * label/description/shortcut slots can react to its focus state. */
const ITEM =
  'group flex w-full cursor-default items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm/6 ' +
  'text-zinc-950 data-[focus]:bg-blue-600 data-[focus]:text-white data-[disabled]:opacity-50 dark:text-white ' +
  '[&>[data-slot=icon]]:size-4 [&>[data-slot=icon]]:shrink-0 [&>[data-slot=icon]]:text-zinc-500 [&[data-focus]>[data-slot=icon]]:text-white'

export function Dropdown(props) {
  return <Headless.Menu {...props} />
}

export function DropdownButton({ as = Button, className, ...props }) {
  return <Headless.MenuButton as={as} className={className} {...props} />
}

export function DropdownMenu({ anchor = 'bottom start', className, ...props }) {
  return <Headless.MenuItems anchor={anchor} transition className={cn(PANEL, className)} {...props} />
}

export function DropdownItem({ href, className, disabled, children, ...props }) {
  const classes = cn(ITEM, className)
  const content =
    href != null ? (
      <Link href={href} className={classes} {...props}>
        {children}
      </Link>
    ) : (
      <button type="button" className={classes} {...props}>
        {children}
      </button>
    )
  return <Headless.MenuItem disabled={disabled}>{content}</Headless.MenuItem>
}

export function DropdownHeader({ className, ...props }) {
  return <div className={cn('px-3.5 pb-1 pt-2.5', className)} {...props} />
}

export function DropdownSection(props) {
  return <Headless.MenuSection {...props} />
}

export function DropdownHeading({ className, ...props }) {
  return (
    <Headless.MenuHeading
      className={cn(
        'px-2.5 pb-1 pt-2 text-xs/5 font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400',
        className
      )}
      {...props}
    />
  )
}

export function DropdownDivider({ className, ...props }) {
  return (
    <Headless.MenuSeparator
      className={cn('mx-2 my-1 h-px border-0 bg-zinc-950/10 dark:bg-white/10', className)}
      {...props}
    />
  )
}

export function DropdownLabel({ className, ...props }) {
  return <span data-slot="label" className={cn('truncate', className)} {...props} />
}

export function DropdownDescription({ className, ...props }) {
  return (
    <span
      data-slot="description"
      className={cn('block text-xs/5 text-zinc-500 group-data-[focus]:text-white/70 dark:text-zinc-400', className)}
      {...props}
    />
  )
}

export function DropdownShortcut({ keys, className, ...props }) {
  const list = Array.isArray(keys) ? keys : keys.split('')
  return (
    <span
      className={cn(
        'ml-auto flex items-center gap-0.5 text-xs/5 text-zinc-400 group-data-[focus]:text-white/70',
        className
      )}
      {...props}
    >
      {list.map((k, i) => (
        <kbd key={i} className="font-sans">
          {k}
        </kbd>
      ))}
    </span>
  )
}
