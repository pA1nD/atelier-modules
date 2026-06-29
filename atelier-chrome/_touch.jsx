/* atelier-chrome/kit — TouchTarget (internal-ish, re-exported as a Catalyst name)
 *
 * Expands a control's hit area to a comfortable 44px on coarse pointers without
 * changing its visual size. Wrapped around button/badge-button contents.
 */

import React from 'react'

export function TouchTarget({ children }) {
  return (
    <>
      <span
        aria-hidden="true"
        className="absolute left-1/2 top-1/2 size-[max(100%,2.75rem)] -translate-x-1/2 -translate-y-1/2 [@media(pointer:fine)]:hidden"
      />
      {children}
    </>
  )
}
