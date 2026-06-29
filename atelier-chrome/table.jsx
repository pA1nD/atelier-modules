/* atelier-chrome/kit — Table
 *
 * The structural table primitive: a styled <table> shell plus head/body/row/
 * header/cell pieces that share their options through React context, so a module
 * composes its own columns on top without re-threading `striped`/`dense`/`grid`
 * down every cell. A row can carry an `href`: the first cell's content becomes a
 * real, focusable <Link> (the row's keyboard tab stop + accessible name), and a
 * click anywhere on the row activates it — while a real interactive inside any
 * cell (a Button, a link) keeps working, since the row-click skips it.
 */

import React from 'react'
import { cn } from './_util'
import { Link } from './link'

const TableContext = React.createContext({ striped: false, dense: false, grid: false })
const TableRowContext = React.createContext({ href: null, target: undefined, title: undefined })

export function Table({ striped = false, dense = false, grid = false, className, children, ...props }) {
  return (
    <TableContext.Provider value={{ striped, dense, grid }}>
      <div className="flow-root">
        <div className="-mx-3 overflow-x-auto">
          <div className="inline-block min-w-full align-middle">
            <table className={cn('min-w-full text-left text-sm/6 text-zinc-950 dark:text-white', className)} {...props}>
              {children}
            </table>
          </div>
        </div>
      </div>
    </TableContext.Provider>
  )
}

export function TableHead({ className, ...props }) {
  return <thead className={cn('text-zinc-500 dark:text-zinc-400', className)} {...props} />
}

export function TableBody(props) {
  return <tbody {...props} />
}

export function TableRow({ href = null, target, title, className, children, onClick, ...props }) {
  const { striped } = React.useContext(TableContext)
  const clickable = href != null || !!onClick

  // Mark the first cell so its content becomes the row's single real link.
  let firstSeen = false
  const cells = React.Children.map(children, (child) => {
    if (React.isValidElement(child) && child.type === TableCell && !firstSeen) {
      firstSeen = true
      return React.cloneElement(child, { __first: true })
    }
    return child
  })

  // Mouse: a click anywhere on the row triggers the first cell's link (keyboard
  // users tab straight to it). Skip clicks that land on a nested interactive.
  const handleClick = (e) => {
    onClick?.(e)
    if (href == null || e.defaultPrevented) return
    if (e.target.closest('a,button,input,select,textarea,label,[role=button]')) return
    e.currentTarget.querySelector('a[data-row-link]')?.click()
  }

  return (
    <TableRowContext.Provider value={{ href, target, title }}>
      <tr
        onClick={clickable ? handleClick : undefined}
        className={cn(
          striped && 'even:bg-zinc-950/[0.025] dark:even:bg-white/[0.025]',
          clickable && 'cursor-pointer hover:bg-zinc-950/[0.03] dark:hover:bg-white/[0.04]',
          href != null &&
            'has-[[data-row-link][data-focus]]:outline-2 has-[[data-row-link][data-focus]]:-outline-offset-2 has-[[data-row-link][data-focus]]:outline-blue-500',
          className
        )}
        {...props}
      >
        {cells}
      </tr>
    </TableRowContext.Provider>
  )
}

export function TableHeader({ className, ...props }) {
  const { grid } = React.useContext(TableContext)
  return (
    <th
      className={cn(
        'border-b border-zinc-950/10 px-3 py-2.5 font-semibold first:pl-3 last:pr-3 dark:border-white/10',
        grid && 'border-l border-l-zinc-950/5 first:border-l-0 dark:border-l-white/5',
        className
      )}
      {...props}
    />
  )
}

export function TableCell({ className, children, __first = false, ...props }) {
  const { striped, dense, grid } = React.useContext(TableContext)
  const { href, target, title } = React.useContext(TableRowContext)
  const linked = href != null && __first
  return (
    <td
      className={cn(
        'px-3 first:pl-3 last:pr-3',
        dense ? 'py-1.5' : 'py-2.5',
        !striped && 'border-b border-zinc-950/5 dark:border-white/5',
        grid && 'border-l border-l-zinc-950/5 first:border-l-0 dark:border-l-white/5',
        className
      )}
      {...props}
    >
      {linked ? (
        <Link
          data-row-link
          href={href}
          target={target}
          aria-label={title}
          className="text-inherit no-underline focus:outline-none"
        >
          {children}
        </Link>
      ) : (
        children
      )}
    </td>
  )
}
