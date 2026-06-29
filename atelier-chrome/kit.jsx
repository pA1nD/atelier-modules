/* atelier-chrome — @atelier/kit
 *
 * The primitives this chrome publishes to its companion modules. The shell maps
 * the bare specifier `@atelier/kit` → this barrel at request time, so a module
 * paired with this chrome can:
 *
 *   import { Button, Dialog, Table, Field, Switch, Dropdown } from '@atelier/kit'
 *
 * ORIGINAL WORK, MIT. The interactive primitives are built on @headlessui/react
 * (MIT) — the same accessibility foundation Catalyst uses — wrapped in atelier's
 * own styling. No Tailwind Plus / Catalyst source is included, so this chrome
 * still ships freely under MIT. The chrome is esbuild-bundled, so headlessui and
 * these sibling component files are baked into the served kit; modules import
 * names, never packages.
 *
 * One file per component (Catalyst-shaped), barrelled here. App-shell layout
 * components (Navbar / Sidebar / *Layout) are intentionally NOT published — a
 * module renders inside the chrome and can't host its own shell; that's the
 * chrome's frontend.jsx, not a module primitive.
 */

// ── utilities ───────────────────────────────────────────────────────────────
export { cn, useDark, shade, tint } from './_util'

// ── typography & content ─────────────────────────────────────────────────────
export { Heading, Subheading } from './heading'
export { Text, TextLink, Strong, Code } from './text'
export { Link } from './link'

// ── actions & status ─────────────────────────────────────────────────────────
export { Button } from './button'
export { TouchTarget } from './_touch'
export { Badge, BadgeButton } from './badge'

// ── forms ────────────────────────────────────────────────────────────────────
export { Fieldset, Legend, FieldGroup, Field, Label, Description, ErrorMessage } from './fieldset'
export { Input, InputGroup } from './input'
export { Textarea } from './textarea'
export { Select } from './select'
export { Switch, SwitchField, SwitchGroup } from './switch'
export { Checkbox, CheckboxField, CheckboxGroup } from './checkbox'
export { Radio, RadioField, RadioGroup } from './radio'
export { Listbox, ListboxOption, ListboxLabel, ListboxDescription } from './listbox'
export { Combobox, ComboboxOption, ComboboxLabel, ComboboxDescription } from './combobox'

// ── overlays & menus ─────────────────────────────────────────────────────────
export { Dialog, DialogTitle, DialogDescription, DialogBody, DialogActions } from './dialog'
export { Alert, AlertTitle, AlertDescription, AlertBody, AlertActions } from './alert'
export {
  Dropdown, DropdownButton, DropdownMenu, DropdownItem, DropdownHeader,
  DropdownSection, DropdownHeading, DropdownDivider, DropdownLabel,
  DropdownDescription, DropdownShortcut,
} from './dropdown'

// ── data display ─────────────────────────────────────────────────────────────
export { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from './table'
export { DescriptionList, DescriptionTerm, DescriptionDetails } from './description-list'
export { Divider } from './divider'
export {
  Pagination, PaginationPrevious, PaginationNext, PaginationList, PaginationPage, PaginationGap,
} from './pagination'
export { Avatar, AvatarButton } from './avatar'

// ── surfaces & identity ──────────────────────────────────────────────────────
export { Card } from './card'
export { Icon } from './icon'
export { Eyebrow, SystemIcon, Reveal, useReveal } from './misc'

// ── agent affordances ────────────────────────────────────────────────────────
export { AgentSpark, CopyButton, AgentBadge } from './agent'
