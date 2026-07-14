/* Catalyst chrome backend — read-only reader for the atelier shell's docs,
 * so the chrome's Documentation viewer can render them.
 *
 * This lives in the theme, not the shell: it never writes, and it only reads
 * the shell's markdown. atelier always ships its docs under the instance root at
 * `<root>/atelier/docs`, so we resolve that root at runtime (ATELIER_ROOT, else the
 * shell's working dir) rather than assuming the chrome sits beside the shell —
 * installed via the marketplace, the chrome can live far from `atelier/`. The old
 * sibling `../atelier/docs` stays as a dev-layout fallback; if nothing resolves the
 * route just returns an empty list — it doesn't throw.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))

// atelier always ships its docs at <instance-root>/atelier/docs. Anchor on that
// root at runtime — ATELIER_ROOT if a managed launcher set it, else the shell's
// working dir (node server.js runs from the instance root) — and keep the old
// HERE/../atelier path as a dev-layout fallback. First one that exists wins.
const DOC_ROOTS = [
  process.env.ATELIER_ROOT && path.join(process.env.ATELIER_ROOT, 'atelier', 'docs'),
  path.join(process.cwd(), 'atelier', 'docs'),
  path.resolve(HERE, '..', 'atelier', 'docs'),
].filter(Boolean)
const DOCS_DIR = DOC_ROOTS.find((d) => fs.existsSync(d)) || DOC_ROOTS[DOC_ROOTS.length - 1]

// Explicit reading order for the canonical shell docs (by filename stem);
// anything else sorts alphabetically after them.
const DOC_ORDER = ['readme', 'modules', 'workspaces', 'auth']

function readDoc(absPath, id) {
  let markdown
  try {
    markdown = fs.readFileSync(absPath, 'utf8')
  } catch {
    return null
  }
  const m = markdown.match(/^#\s+(.+?)\s*$/m)
  const title = m ? m[1].trim() : id
  return { id, file: path.basename(absPath), title, markdown }
}

function readDocsDir() {
  let files
  try {
    files = fs.readdirSync(DOCS_DIR).filter((f) => f.toLowerCase().endsWith('.md'))
  } catch {
    return []
  }
  const rank = (f) => {
    const i = DOC_ORDER.indexOf(f.replace(/\.md$/i, '').toLowerCase())
    return i === -1 ? DOC_ORDER.length : i
  }
  files.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
  return files
    .map((file) => readDoc(path.join(DOCS_DIR, file), file.replace(/\.md$/i, '')))
    .filter(Boolean)
}

// In-app docs = the shell's docs/*.md in nav order. (The repo's landing
// README.md is a GitHub readme, not an in-app doc page.)
function readAll() {
  return readDocsDir()
}

export default {
  mountRoutes(router) {
    router.get('/docs', (req, res) => {
      res.json({ dir: DOCS_DIR, docs: readAll() })
    })
  },
}
