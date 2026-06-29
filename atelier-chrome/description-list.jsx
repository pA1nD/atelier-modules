/* atelier-chrome/kit — DescriptionList
 *
 * Original work — a responsive <dl> for key/value detail rows. On small screens
 * terms and details stack; from `sm` up they sit side-by-side in a two-column
 * grid, each row separated by a hairline border that matches the kit's ring
 * tone (zinc-950/5, white/5 in dark mode).
 *
 * API:
 *   <DescriptionList>
 *     <DescriptionTerm>Name</DescriptionTerm>
 *     <DescriptionDetails>Ada Lovelace</DescriptionDetails>
 *   </DescriptionList>
 */

import React from 'react'
import { cn } from './_util'

export function DescriptionList({ className, ...props }) {
  return (
    <dl
      className={cn(
        'grid grid-cols-1 gap-x-8 text-sm/6 sm:grid-cols-[min(50%,_18rem)_auto]',
        className
      )}
      {...props}
    />
  )
}

export function DescriptionTerm({ className, ...props }) {
  return (
    <dt
      className={cn(
        'col-start-1 border-t border-zinc-950/5 pt-3 text-zinc-500 first:border-none sm:py-3 dark:border-white/5 dark:text-zinc-400',
        className
      )}
      {...props}
    />
  )
}

export function DescriptionDetails({ className, ...props }) {
  return (
    <dd
      className={cn(
        'pb-3 pt-1 text-zinc-950 sm:border-t sm:border-zinc-950/5 sm:py-3 sm:[&:nth-child(2)]:border-none dark:text-white dark:sm:border-white/5',
        className
      )}
      {...props}
    />
  )
}
