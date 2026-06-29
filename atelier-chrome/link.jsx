/* atelier-chrome/kit — Link
 *
 * A plain anchor wrapped in headlessui's DataInteractive so it reports the same
 * data-hover / data-focus / data-active states a Button does — letting links be
 * styled identically to buttons. Atelier modules navigate with ordinary <a href>
 * (the shell intercepts in-app clicks for SPA routing), so no router coupling.
 */

import React from 'react'
import * as Headless from '@headlessui/react'

export const Link = React.forwardRef(function Link({ href = '#', ...props }, ref) {
  return (
    <Headless.DataInteractive>
      <a href={href} ref={ref} {...props} />
    </Headless.DataInteractive>
  )
})
