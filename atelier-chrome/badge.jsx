/* atelier-chrome/kit — Badge, BadgeButton */

import React from 'react'
import * as Headless from '@headlessui/react'
import { cn } from './_util'
import { Link } from './link'
import { TouchTarget } from './_touch'

const COLORS = {
  zinc: 'bg-zinc-500/15 text-zinc-700 dark:bg-zinc-400/15 dark:text-zinc-300',
  blue: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  indigo: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300',
  violet: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  purple: 'bg-purple-500/15 text-purple-700 dark:text-purple-300',
  fuchsia: 'bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300',
  pink: 'bg-pink-500/15 text-pink-700 dark:text-pink-300',
  rose: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  red: 'bg-red-500/15 text-red-700 dark:text-red-300',
  orange: 'bg-orange-500/15 text-orange-700 dark:text-orange-400',
  amber: 'bg-amber-400/20 text-amber-700 dark:text-amber-300',
  yellow: 'bg-yellow-400/20 text-yellow-700 dark:text-yellow-300',
  lime: 'bg-lime-400/20 text-lime-700 dark:text-lime-300',
  green: 'bg-green-500/15 text-green-700 dark:text-green-300',
  emerald: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  teal: 'bg-teal-500/15 text-teal-700 dark:text-teal-300',
  cyan: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',
  sky: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
}

export const Badge = React.forwardRef(function Badge({ color = 'zinc', className, ...props }, ref) {
  return (
    <span
      ref={ref}
      className={cn(
        'inline-flex items-center gap-x-1.5 rounded-md px-1.5 py-0.5 text-xs/5 font-medium',
        COLORS[color] || COLORS.zinc,
        className
      )}
      {...props}
    />
  )
})

export const BadgeButton = React.forwardRef(function BadgeButton(
  { color = 'zinc', className, href, children, ...props },
  ref
) {
  const classes = cn(
    'relative inline-flex rounded-md transition-opacity',
    'focus:outline-none data-[focus]:outline-2 data-[focus]:outline-offset-2 data-[focus]:outline-blue-500',
    'data-[hover]:opacity-80 data-[disabled]:opacity-50 data-[disabled]:pointer-events-none',
    className
  )
  const inner = (
    <TouchTarget>
      <Badge color={color}>{children}</Badge>
    </TouchTarget>
  )
  return href != null ? (
    <Link ref={ref} href={href} className={classes} {...props}>{inner}</Link>
  ) : (
    <Headless.Button ref={ref} className={classes} {...props}>{inner}</Headless.Button>
  )
})
