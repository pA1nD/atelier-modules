/* atelier-chrome/kit — Divider
 *
 * A hairline horizontal rule that matches the kit's surface borders. `soft`
 * drops it to a fainter line for inside-a-group separators; the default weight
 * matches a panel/section edge.
 *
 *   <Divider />
 *   <Divider soft className="my-4" />
 */

import React from 'react'
import { cn } from './_util'

export function Divider({ soft = false, className, ...props }) {
  return (
    <hr
      role="presentation"
      className={cn(
        'w-full border-t',
        soft ? 'border-zinc-950/5 dark:border-white/5' : 'border-zinc-950/10 dark:border-white/10',
        className
      )}
      {...props}
    />
  )
}
