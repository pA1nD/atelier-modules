/* atelier-chrome/kit — Alert, AlertTitle, AlertDescription, AlertBody,
 * AlertActions
 *
 * A small, centred confirm dialog — the compact sibling of <Dialog>. Same
 * headlessui <Dialog> machinery (focus trap, scroll lock, Escape + backdrop
 * close, and the data-[closed] enter/leave animation via `transition`), but
 * grid-centred and sized down for a quick yes/no. Controlled with
 * `open` / `onClose`.
 *
 *   const [open, setOpen] = useState(false)
 *   <Alert open={open} onClose={setOpen} size="sm">
 *     <AlertTitle>Delete file?</AlertTitle>
 *     <AlertDescription>This can't be undone.</AlertDescription>
 *     <AlertActions>
 *       <Button plain onClick={() => setOpen(false)}>Cancel</Button>
 *       <Button color="red" onClick={remove}>Delete</Button>
 *     </AlertActions>
 *   </Alert>
 */

import React from 'react'
import * as Headless from '@headlessui/react'
import { cn } from './_util'

const SIZES = {
  xs: 'max-w-xs', sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg',
}

export function Alert({ open, onClose, size = 'md', className, children, ...props }) {
  return (
    <Headless.Dialog role="alertdialog" open={open} onClose={onClose} {...props}>
      <Headless.DialogBackdrop
        transition
        className="fixed inset-0 z-[100] bg-white/40 backdrop-blur-lg backdrop-saturate-150 transition-opacity duration-200 ease-out data-[closed]:opacity-0 dark:bg-zinc-950/55"
      />
      <div className="fixed inset-0 z-[100] w-screen overflow-y-auto">
        <div className="grid min-h-full place-items-center p-4">
          <Headless.DialogPanel
            transition
            className={cn(
              'w-full rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-zinc-950/10 transition duration-200 ease-out data-[closed]:scale-95 data-[closed]:opacity-0 dark:bg-zinc-900 dark:ring-white/10',
              SIZES[size] || SIZES.md,
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

export function AlertTitle({ className, ...props }) {
  return (
    <Headless.DialogTitle
      className={cn('text-balance text-center text-base/6 font-semibold text-zinc-950 sm:text-left dark:text-white', className)}
      {...props}
    />
  )
}

export function AlertDescription({ className, ...props }) {
  return (
    <Headless.Description
      className={cn('mt-2 text-pretty text-center text-sm/6 text-zinc-500 sm:text-left dark:text-zinc-400', className)}
      {...props}
    />
  )
}

export function AlertBody({ className, ...props }) {
  return <div className={cn('mt-4', className)} {...props} />
}

export function AlertActions({ className, ...props }) {
  return (
    <div
      className={cn('mt-6 flex flex-col-reverse items-center justify-center gap-3 *:w-full sm:flex-row sm:*:w-auto', className)}
      {...props}
    />
  )
}
