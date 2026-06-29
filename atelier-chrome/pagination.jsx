/* atelier-chrome/kit — Pagination
 *
 * Original work. A page-navigation control built entirely out of the kit's own
 * <Button>: prev/next, page numbers, and an ellipsis gap. The current page is a
 * solid blue Button (atelier's accent); every other control is a plain Button.
 * Accessible by construction — the <nav> is labelled, the current page carries
 * aria-current="page", and prev/next are disabled (a real <button disabled>)
 * whenever no href is supplied.
 *
 * API: <Pagination> wrapping <PaginationPrevious href> · <PaginationList> of
 * <PaginationPage href current> and <PaginationGap> · <PaginationNext href>.
 */

import React from 'react'
import { cn } from './_util'
import { Button } from './button'

/* ── local chevrons — small inline marks so prev/next don't pull an icon font ── */

function LeftChevron() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="size-4">
      <path d="M10 4L6 8L10 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function RightChevron() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="size-4">
      <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function Pagination({ 'aria-label': ariaLabel = 'Page navigation', className, ...props }) {
  return <nav aria-label={ariaLabel} className={cn('flex gap-x-2', className)} {...props} />
}

export function PaginationPrevious({ href = null, className, children = 'Previous' }) {
  return (
    <span className="grow basis-0">
      <Button plain href={href ?? undefined} disabled={href == null} aria-label="Previous page" className={className}>
        <LeftChevron />
        {children}
      </Button>
    </span>
  )
}

export function PaginationNext({ href = null, className, children = 'Next' }) {
  return (
    <span className="flex grow basis-0 justify-end">
      <Button plain href={href ?? undefined} disabled={href == null} aria-label="Next page" className={className}>
        {children}
        <RightChevron />
      </Button>
    </span>
  )
}

export function PaginationList({ className, ...props }) {
  return <span className={cn('hidden items-baseline gap-x-2 sm:flex', className)} {...props} />
}

export function PaginationPage({ href, className, current = false, children }) {
  return (
    <Button
      plain={!current}
      color={current ? 'blue' : undefined}
      href={href}
      aria-label={`Page ${children}`}
      aria-current={current ? 'page' : undefined}
      className={cn('min-w-9', current && 'pointer-events-none', className)}
    >
      {children}
    </Button>
  )
}

export function PaginationGap({ className, children = '…' }) {
  return (
    <span
      aria-hidden="true"
      className={cn('w-9 select-none text-center text-sm/6 font-medium text-zinc-400 dark:text-zinc-500', className)}
    >
      {children}
    </span>
  )
}
