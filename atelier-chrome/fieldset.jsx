/* atelier-chrome/kit — Fieldset, Legend, FieldGroup, Field, Label, Description,
 * ErrorMessage
 *
 * All built on headlessui's Fieldset/Field/Label/Description so labels, hints
 * and disabled state wire to controls automatically. The data-slot grid rules
 * give the canonical Catalyst spacing rhythm (label → control → description).
 */

import React from 'react'
import * as Headless from '@headlessui/react'
import { cn } from './_util'

export function Fieldset({ className, ...props }) {
  return (
    <Headless.Fieldset
      className={cn('[&>*+[data-slot=control]]:mt-6 *:data-[slot=text]:mt-1', className)}
      {...props}
    />
  )
}

export function Legend({ className, ...props }) {
  return (
    <Headless.Legend
      data-slot="legend"
      className={cn('text-base/6 font-semibold text-zinc-950 data-[disabled]:opacity-50 dark:text-white', className)}
      {...props}
    />
  )
}

export function FieldGroup({ className, ...props }) {
  return <div data-slot="control" className={cn('space-y-6', className)} {...props} />
}

export function Field({ className, ...props }) {
  return (
    <Headless.Field
      className={cn(
        '[&>[data-slot=label]+[data-slot=control]]:mt-2',
        '[&>[data-slot=label]+[data-slot=description]]:mt-1',
        '[&>[data-slot=description]+[data-slot=control]]:mt-2',
        '[&>[data-slot=control]+[data-slot=description]]:mt-2',
        '[&>[data-slot=control]+[data-slot=error]]:mt-2',
        '*:data-[slot=label]:font-medium',
        className
      )}
      {...props}
    />
  )
}

export function Label({ className, ...props }) {
  return (
    <Headless.Label
      data-slot="label"
      className={cn('select-none text-sm/6 font-medium text-zinc-950 data-[disabled]:opacity-50 dark:text-white', className)}
      {...props}
    />
  )
}

export function Description({ className, ...props }) {
  return (
    <Headless.Description
      data-slot="description"
      className={cn('text-sm/6 text-zinc-500 data-[disabled]:opacity-50 dark:text-zinc-400', className)}
      {...props}
    />
  )
}

export function ErrorMessage({ className, ...props }) {
  return (
    <Headless.Description
      data-slot="error"
      className={cn('text-sm/6 text-red-600 data-[disabled]:opacity-50 dark:text-red-400', className)}
      {...props}
    />
  )
}
