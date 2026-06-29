/* atelier-chrome/kit — Dialog, DialogTitle, DialogDescription, DialogBody,
 * DialogActions
 *
 * Pattern exemplar for overlays: headlessui <Dialog> gives the focus trap,
 * scroll lock, Escape + backdrop close, and (with `transition`) the enter/leave
 * animation via data-[closed]. Controlled with `open` / `onClose`.
 *
 *   const [open, setOpen] = useState(false)
 *   <Dialog open={open} onClose={setOpen} size="lg"> … </Dialog>
 */

import React from 'react'
import * as Headless from '@headlessui/react'
import { cn } from './_util'

const SIZES = {
  xs: 'sm:max-w-xs', sm: 'sm:max-w-sm', md: 'sm:max-w-md', lg: 'sm:max-w-lg',
  xl: 'sm:max-w-xl', '2xl': 'sm:max-w-2xl', '3xl': 'sm:max-w-3xl',
  '4xl': 'sm:max-w-4xl', '5xl': 'sm:max-w-5xl',
}

export function Dialog({ open, onClose, size = 'lg', className, children, ...props }) {
  return (
    <Headless.Dialog open={open} onClose={onClose} {...props}>
      <Headless.DialogBackdrop
        transition
        className="fixed inset-0 z-[100] bg-white/40 backdrop-blur-lg backdrop-saturate-150 transition-opacity duration-200 ease-out data-[closed]:opacity-0 dark:bg-zinc-950/55"
      />
      <div className="fixed inset-0 z-[100] w-screen overflow-y-auto pt-6 sm:pt-0">
        <div className="grid min-h-full grid-rows-[1fr_auto] justify-items-center sm:grid-rows-[1fr_auto_3fr] sm:p-4">
          <Headless.DialogPanel
            transition
            className={cn(
              'row-start-2 w-full min-w-0 rounded-t-2xl bg-white p-6 shadow-2xl ring-1 ring-zinc-950/10 sm:mb-auto sm:rounded-2xl',
              'transition duration-200 ease-out data-[closed]:translate-y-4 data-[closed]:opacity-0 data-[closed]:sm:translate-y-0 data-[closed]:sm:scale-95',
              'dark:bg-zinc-900 dark:ring-white/10',
              SIZES[size] || SIZES.lg,
              className
            )}
          >
            {children}
          </Headless.DialogPanel>
        </div>
      </div>
    </Headless.Dialog>
  )
}

export function DialogTitle({ className, ...props }) {
  return (
    <Headless.DialogTitle
      className={cn('text-balance text-lg/6 font-semibold text-zinc-950 dark:text-white', className)}
      {...props}
    />
  )
}

export function DialogDescription({ className, ...props }) {
  return (
    <Headless.Description
      className={cn('mt-2 text-pretty text-sm/6 text-zinc-500 dark:text-zinc-400', className)}
      {...props}
    />
  )
}

export function DialogBody({ className, ...props }) {
  return <div className={cn('mt-4 text-sm/6 text-zinc-700 dark:text-zinc-300', className)} {...props} />
}

export function DialogActions({ className, ...props }) {
  return (
    <div
      className={cn('mt-6 flex flex-col-reverse items-center justify-end gap-3 *:w-full sm:flex-row sm:*:w-auto', className)}
      {...props}
    />
  )
}
