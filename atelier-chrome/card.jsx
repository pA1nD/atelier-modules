/* atelier-chrome/kit — Card
 *
 * The signature floating surface: a white (zinc-900 in dark) rounded panel with
 * a hairline border and soft shadow. The everyday container for module content.
 */

import React from 'react'
import { cn } from './_util'

export function Card({ className, ...props }) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-zinc-950/10 bg-white shadow-sm dark:border-white/10 dark:bg-zinc-900',
        className
      )}
      {...props}
    />
  )
}
