// markdown.js — a tiny, safe Markdown → HTML renderer.
//
// Escape-first by construction: all HTML is escaped before any markup is
// emitted, and only a fixed allowlist of tags is produced — so rendering a
// third-party repo's README can't inject scripts or arbitrary HTML.

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
   .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const safeUrl = (u) => (/^(https?:|mailto:|\/|#)/i.test(u) ? u : '#')

// inline: code, bold, italic, links, images — operate on already-escaped text
function inline(s) {
  return s
    .replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`)
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, a, u) => `<img alt="${a}" src="${safeUrl(u)}" />`)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => `<a href="${safeUrl(u)}" target="_blank" rel="noopener noreferrer">${t}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/_([^_]+)_/g, '<em>$1</em>')
}

// opts: { shift, min, max } control heading levels. Defaults suit the compact
// "About" box (# → h3). Docs pass { shift: 0, min: 1, max: 6 } for natural h1/h2.
export function mdToHtml(src, opts = {}) {
  if (!src) return ''
  const { shift = 2, min = 3, max = 5 } = opts
  const lines = esc(src).replace(/\r\n/g, '\n').split('\n')
  const out = []
  let i = 0, listType = null, para = []

  const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = [] } }
  const closeList = () => { if (listType) { out.push(`</${listType}>`); listType = null } }

  while (i < lines.length) {
    const line = lines[i]
    const t = line.trim()

    if (t.startsWith('```')) {                       // fenced code
      flushPara(); closeList()
      const buf = []; i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) { buf.push(lines[i]); i++ }
      out.push(`<pre><code>${buf.join('\n')}</code></pre>`); i++; continue
    }
    if (!t) { flushPara(); closeList(); i++; continue }      // blank
    let m
    if ((m = t.match(/^(#{1,6})\s+(.*)$/))) {                // heading (cap at h5 visual)
      flushPara(); closeList()
      const lvl = Math.min(max, Math.max(min, m[1].length + shift))
      const id = m[2].toLowerCase().replace(/&[a-z]+;/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
      out.push(`<h${lvl} id="${id}">${inline(m[2])}</h${lvl}>`); i++; continue
    }
    if (/^(---|\*\*\*|___)$/.test(t)) { flushPara(); closeList(); out.push('<hr />'); i++; continue }
    if (t.startsWith('> ')) {                                // blockquote
      flushPara(); closeList(); out.push(`<blockquote>${inline(t.slice(2))}</blockquote>`); i++; continue
    }
    if ((m = t.match(/^[-*]\s+(.*)$/))) {                    // ul
      flushPara(); if (listType !== 'ul') { closeList(); out.push('<ul>'); listType = 'ul' }
      out.push(`<li>${inline(m[1])}</li>`); i++; continue
    }
    if ((m = t.match(/^\d+\.\s+(.*)$/))) {                   // ol
      flushPara(); if (listType !== 'ol') { closeList(); out.push('<ol>'); listType = 'ol' }
      out.push(`<li>${inline(m[1])}</li>`); i++; continue
    }
    if (t.startsWith('|') && i + 1 < lines.length && lines[i + 1].includes('-') && /^\|?[\s:|-]+\|?$/.test(lines[i + 1].trim())) {  // table
      flushPara(); closeList()
      const cells = (row) => row.trim().replace(/^\||\|$/g, '').split('|').map((x) => x.trim())
      const head = cells(t); i += 2
      const rows = []
      while (i < lines.length && lines[i].trim().startsWith('|')) { rows.push(cells(lines[i].trim())); i++ }
      out.push('<table><thead><tr>' + head.map((h) => `<th>${inline(h)}</th>`).join('') + '</tr></thead><tbody>'
        + rows.map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table>')
      continue
    }
    if (listType && out.length && out[out.length - 1].startsWith('<li>')) {   // lazy continuation: wrapped list-item line
      out[out.length - 1] = out[out.length - 1].replace(/<\/li>$/, ' ' + inline(t) + '</li>')
      i++; continue
    }
    para.push(t); i++                                        // paragraph text
  }
  flushPara(); closeList()
  return out.join('\n')
}
