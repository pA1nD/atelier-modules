/* atelier-chrome/kit — Combobox, ComboboxOption, ComboboxLabel, ComboboxDescription
 *
 * A searchable single-select built on headlessui's <Combobox> (so it wires to
 * <Field>/<Label> and reports data-focus/selected/disabled for free). The text
 * field matches <Input>; a trailing chevron button toggles an anchored,
 * transitioning popover of options.
 *
 * Two usage modes, picked automatically:
 *   (a) Manual — pass <ComboboxOption> children directly and filter them
 *       yourself. Read the typed text via `onQueryChange`:
 *         const [q, setQ] = useState('')
 *         <Combobox value={v} onChange={setV} onQueryChange={setQ} displayValue={(p) => p?.name}>
 *           {people.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()))
 *                  .map((p) => <ComboboxOption key={p.id} value={p}><ComboboxLabel>{p.name}</ComboboxLabel></ComboboxOption>)}
 *         </Combobox>
 *   (b) Render-prop — pass an `options` array + a `children` render function;
 *       the component keeps `query` state and filters for you (override via
 *       `filter(option, query)`), wrapping each match in a <ComboboxOption>:
 *         <Combobox options={people} displayValue={(p) => p?.name} value={v} onChange={setV}>
 *           {(p) => <ComboboxLabel>{p.name}</ComboboxLabel>}
 *         </Combobox>
 */

import React from 'react'
import * as Headless from '@headlessui/react'
import { cn, CheckGlyph, ChevronUpDownGlyph } from './_util'

/* Text field — mirrors <Input> (input.jsx), with room for the chevron button. */
const INPUT =
  'block w-full rounded-lg border border-zinc-950/15 bg-white px-3 py-1.5 text-sm/6 text-zinc-950 ' +
  'placeholder:text-zinc-400 shadow-sm transition ' +
  'focus:outline-none data-[focus]:border-blue-500 data-[focus]:ring-1 data-[focus]:ring-blue-500 ' +
  'data-[invalid]:border-red-500 data-[invalid]:ring-1 data-[invalid]:ring-red-500 ' +
  'data-[disabled]:opacity-50 data-[disabled]:border-zinc-950/10 dark:data-[disabled]:border-white/10 ' +
  'dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder:text-zinc-500 ' +
  'pr-9'

/* Anchored popover — translucent, blurred, scale/fade transition on open/close. */
const POPOVER =
  'isolate w-[var(--input-width)] min-w-52 max-h-72 overflow-y-auto rounded-xl border border-zinc-950/10 ' +
  'bg-white/95 p-1 shadow-lg ring-1 ring-zinc-950/5 backdrop-blur-md [--anchor-gap:0.5rem] focus:outline-none ' +
  'transition duration-100 ease-out empty:invisible data-[closed]:opacity-0 data-[closed]:scale-95 ' +
  'dark:border-white/10 dark:bg-zinc-800/95 dark:ring-white/10'

/* One option row — a [check | content] grid; blue highlight while data-focus. */
const OPTION_ROW =
  'group/option grid cursor-default select-none grid-cols-[1.25rem_1fr] items-center gap-2 rounded-lg ' +
  'px-2.5 py-1.5 text-sm/6 text-zinc-950 data-[focus]:bg-blue-600 data-[focus]:text-white ' +
  'data-[disabled]:opacity-50 dark:text-white'

export function Combobox({
  options,
  displayValue,
  filter,
  placeholder,
  autoFocus,
  onQueryChange,
  'aria-label': ariaLabel,
  className,
  children,
  ...props
}) {
  const [query, setQuery] = React.useState('')

  // Mode (b) when given an options array + a render function; otherwise mode (a).
  const isRenderMode = Array.isArray(options) && typeof children === 'function'

  const filtered = !isRenderMode
    ? null
    : query === ''
      ? options
      : options.filter((option) =>
          filter
            ? filter(option, query)
            : (displayValue ? displayValue(option) ?? '' : String(option))
                .toLowerCase()
                .includes(query.toLowerCase())
        )

  const onInput = (e) => {
    setQuery(e.target.value)
    onQueryChange?.(e.target.value)
  }

  return (
    <Headless.Combobox
      onClose={() => {
        setQuery('')
        onQueryChange?.('')
      }}
      {...props}
    >
      <div className={cn('relative', className)}>
        <Headless.ComboboxInput
          data-slot="control"
          autoFocus={autoFocus}
          aria-label={ariaLabel}
          displayValue={displayValue}
          onChange={onInput}
          placeholder={placeholder}
          className={INPUT}
        />
        <Headless.ComboboxButton className="absolute inset-y-0 right-0 flex items-center pr-2.5">
          <ChevronUpDownGlyph className="size-4 text-zinc-500 dark:text-zinc-400" />
        </Headless.ComboboxButton>

        <Headless.ComboboxOptions anchor="bottom start" transition className={POPOVER}>
          {isRenderMode
            ? filtered.map((option, i) => (
                <ComboboxOption
                  key={(option && (option.id ?? option.value)) ?? (displayValue ? displayValue(option) : i)}
                  value={option}
                >
                  {children(option)}
                </ComboboxOption>
              ))
            : typeof children === 'function'
              ? null /* render fn without an options array — nothing to map */
              : children}
        </Headless.ComboboxOptions>
      </div>
    </Headless.Combobox>
  )
}

export function ComboboxOption({ children, className, ...props }) {
  return (
    <Headless.ComboboxOption className={cn(OPTION_ROW, className)} {...props}>
      <CheckGlyph className="invisible col-start-1 size-4 self-center text-blue-600 group-data-[focus]/option:text-white group-data-[selected]/option:visible" />
      <span className="col-start-2 flex min-w-0 items-center gap-2">{children}</span>
    </Headless.ComboboxOption>
  )
}

export function ComboboxLabel({ className, ...props }) {
  return <span className={cn('min-w-0 truncate', className)} {...props} />
}

export function ComboboxDescription({ className, ...props }) {
  return (
    <span
      className={cn(
        'text-zinc-500 group-data-[focus]/option:text-white/70 dark:text-zinc-400',
        className
      )}
      {...props}
    />
  )
}
