/* atelier-chrome/kit — Text, TextLink, Strong, Code */

import React from 'react'
import { cn } from './_util'
import { Link } from './link'

export function Text({ className, ...props }) {
  return (
    <p data-slot="text" className={cn('text-sm/6 text-zinc-500 dark:text-zinc-400', className)} {...props} />
  )
}

export function TextLink({ className, ...props }) {
  return (
    <Link
      className={cn(
        'font-medium text-zinc-950 underline decoration-zinc-950/30 underline-offset-2 hover:decoration-zinc-950',
        'dark:text-white dark:decoration-white/30 dark:hover:decoration-white',
        className
      )}
      {...props}
    />
  )
}

export function Strong({ className, ...props }) {
  return <strong className={cn('font-medium text-zinc-950 dark:text-white', className)} {...props} />
}

export function Code({ className, ...props }) {
  return (
    <code
      className={cn(
        'rounded border border-zinc-950/10 bg-zinc-950/[0.04] px-1 py-0.5 font-mono text-[0.8125em] font-medium text-zinc-950',
        'dark:border-white/10 dark:bg-white/10 dark:text-white',
        className
      )}
      {...props}
    />
  )
}
