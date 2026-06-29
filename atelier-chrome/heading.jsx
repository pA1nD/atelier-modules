/* atelier-chrome/kit — Heading, Subheading */

import React from 'react'
import { cn } from './_util'

export function Heading({ level = 1, className, ...props }) {
  const Tag = `h${level}`
  return (
    <Tag
      className={cn('text-2xl/8 font-semibold tracking-tight text-zinc-950 sm:text-xl/8 dark:text-white', className)}
      {...props}
    />
  )
}

export function Subheading({ level = 2, className, ...props }) {
  const Tag = `h${level}`
  return (
    <Tag
      className={cn('text-base/7 font-semibold text-zinc-950 sm:text-sm/6 dark:text-white', className)}
      {...props}
    />
  )
}
