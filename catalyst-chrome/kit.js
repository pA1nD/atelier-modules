/* catalyst-chrome — kit.js
 *
 * Public primitives this chrome publishes to its companion modules. The
 * shell injects an import map mapping `@atelier/kit` → this file at
 * request time (see atelier/server.js `buildImportMap`), so a module
 * paired with this chrome can write:
 *
 *   import { Button, Dialog, Input, Field, Label } from '@atelier/kit'
 *
 * and the browser resolves it cleanly. No node_modules in the module's
 * folder, no per-module duplicate bundling of headlessui / motion / etc.
 * — those live inside this kit.js bundle (chrome bundles via esbuild
 * with React aliased to the shell's shim, so React identity is shared
 * across the chrome, the kit, and the module that imports from the kit).
 *
 * What this chrome publishes is a chrome-by-chrome choice — themes are
 * not a drop-in contract. A companion module that imports `Foo` from
 * `@atelier/kit` is implicitly paired with whichever chrome exports a
 * compatible `Foo`. If you swap to a different chrome, those modules
 * either get re-themed (if the new chrome exports the same names with
 * compatible props) or stop working — that's on the chrome author and
 * the module author to coordinate.
 */

export { Alert, AlertActions, AlertBody, AlertDescription, AlertTitle } from './alert'
export { AuthLayout } from './auth-layout'
export { Avatar, AvatarButton } from './avatar'
export { Badge, BadgeButton } from './badge'
export { Button, TouchTarget } from './button'
export { Checkbox, CheckboxField, CheckboxGroup } from './checkbox'
export { Combobox, ComboboxDescription, ComboboxLabel, ComboboxOption } from './combobox'
export {
  DescriptionDetails,
  DescriptionList,
  DescriptionTerm,
} from './description-list'
export {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from './dialog'
export { Divider } from './divider'
export {
  Dropdown,
  DropdownButton,
  DropdownDescription,
  DropdownDivider,
  DropdownHeader,
  DropdownHeading,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
  DropdownSection,
  DropdownShortcut,
} from './dropdown'
export {
  Description,
  ErrorMessage,
  Field,
  FieldGroup,
  Fieldset,
  Label,
  Legend,
} from './fieldset'
export { Heading, Subheading } from './heading'
export { Input, InputGroup } from './input'
export { Link } from './link'
export { Listbox, ListboxDescription, ListboxLabel, ListboxOption } from './listbox'
export {
  Navbar,
  NavbarDivider,
  NavbarItem,
  NavbarLabel,
  NavbarSection,
  NavbarSpacer,
} from './navbar'
export { Pagination, PaginationGap, PaginationList, PaginationNext, PaginationPage, PaginationPrevious } from './pagination'
export { Radio, RadioField, RadioGroup } from './radio'
export { Select } from './select'
export {
  Sidebar,
  SidebarBody,
  SidebarDivider,
  SidebarFooter,
  SidebarHeader,
  SidebarHeading,
  SidebarItem,
  SidebarLabel,
  SidebarSection,
  SidebarSpacer,
} from './sidebar'
export { SidebarLayout } from './sidebar-layout'
export { StackedLayout } from './stacked-layout'
export { Switch, SwitchField, SwitchGroup } from './switch'
export {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './table'
export { Text, TextLink, Strong, Code } from './text'
export { Textarea } from './textarea'
