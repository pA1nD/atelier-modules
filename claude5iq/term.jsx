/* claude5iq/term.jsx — shared terminal primitives, so both terminals look identical.
 * Real-terminal rules: ONE mono size, ONE line height (every line is the same height).
 * Markers, like Claude Code:
 *   ●  white            — the assistant talking
 *   ⏺  green            — a finished tool call
 *   ◐  white, blinking  — a tool running right now
 *   (results sit plain underneath, no ⎿ · diffs are tinted lines)
 */
import { cn } from './lib.jsx'

const { useState, useEffect } = React
const LIGHTS = ['#ff5f57', '#febc2e', '#28c840']

// the working spinner: bounces through · ✶ ✢ ✻ at random speed, pausing at each end.
const SPIN = ['·', '✶', '✢', '✻']
function Spinner({ color }) {
  const [i, setI] = useState(SPIN.length - 1)
  useEffect(() => {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let alive = true, idx = SPIN.length - 1, dir = -1, t
    const tick = () => {
      if (!alive) return
      idx += dir
      if (idx >= SPIN.length - 1) { idx = SPIN.length - 1; dir = -1 }
      else if (idx <= 0) { idx = 0; dir = 1 }
      setI(idx)
      const atEnd = idx === 0 || idx === SPIN.length - 1
      t = setTimeout(tick, atEnd ? 750 + Math.random() * 700 : 80 + Math.random() * 170)
    }
    t = setTimeout(tick, 700)
    return () => { alive = false; clearTimeout(t) }
  }, [])
  return <span className="w-3.5 shrink-0 text-center" style={color ? { color } : undefined}>{SPIN[i]}</span>
}

// the window: traffic-light app frame + a fixed text size / line height for everything inside.
export function TermFrame({ className, children }) {
  return (
    <div className={cn('cl-mono overflow-hidden rounded-xl text-[12.5px] leading-[1.75] ring-1 ring-black/5', className)} style={{ background: '#0d0d0e' }}>
      <div className="flex items-center gap-2 border-b border-white/10 px-3.5 py-2" style={{ background: '#161617' }}>
        {LIGHTS.map((c) => <span key={c} className="size-3 rounded-full" style={{ background: c }} />)}
      </div>
      {children}
    </div>
  )
}

export const TermBody = ({ children }) => <div className="px-4 py-3">{children}</div>

// a fixed-width marker column so every line's text starts at the same x.
const Mark = ({ glyph, color }) => <span className="w-3.5 shrink-0 text-center" style={color ? { color } : undefined}>{glyph || ''}</span>

export const Cmd = ({ children }) => <div className="flex gap-2"><Mark glyph="❯" color="#52525b" /><span className="text-zinc-200">{children}</span></div>
export const Say = ({ children }) => <div className="flex gap-2"><Mark glyph="●" color="#d4d4d8" /><span className="text-zinc-300">{children}</span></div>
export const Tool = ({ name, arg }) => <div className="flex gap-2"><Mark glyph="⏺" color="#34d399" /><span className="text-zinc-200"><span className="font-medium">{name}</span>(<span className="text-zinc-400">{arg}</span>)</span></div>
export const Running = ({ name, arg }) => <div className="flex gap-2"><span className="cl-blink-slow w-3.5 shrink-0 text-center" style={{ color: '#34d399' }}>⏺</span><span className="text-zinc-200"><span className="font-medium">{name}</span>(<span className="text-zinc-400">{arg}</span>)</span></div>
export const Res = ({ children }) => <div className="flex gap-2"><Mark /><span className="text-zinc-500">{children}</span></div>
export const Diff = ({ sign, line, code }) => (
  <div className="flex gap-2"><Mark /><span className={cn('flex-1 rounded px-1.5', sign === '+' ? 'bg-emerald-500/10' : 'bg-rose-500/10')}><span className="text-zinc-600">{line}</span> <span className={sign === '+' ? 'text-emerald-400' : 'text-rose-400'}>{sign}</span> <span className={sign === '+' ? 'text-emerald-300/80' : 'text-rose-300/80'}>{code}</span></span></div>
)
export const Work = ({ children }) => <div className="flex gap-2"><Spinner color="#d97757" /><span className="text-zinc-300">{children}</span></div>

// the input box (where the human types) — bounded, with the effort badge on its top rule.
export const InputBox = () => (
  <div className="relative border-y border-white/10">
    <span className="absolute right-3.5 top-0 -translate-y-1/2 px-1.5 text-[#a78bfa]" style={{ background: '#0d0d0e' }}>ultracode</span>
    <div className="flex items-center px-4 py-1.5"><span className="text-zinc-500">❯</span><span className="cl-cursor ml-2 text-zinc-400">▌</span></div>
  </div>
)
// the auto-mode line — always the very bottom line of a real Claude terminal.
export const AutoMode = () => <span><span style={{ color: '#fb923c' }}>⏵⏵</span> <span className="text-zinc-400">auto mode on</span> <span className="text-zinc-600">(shift+tab to cycle) · ← for agents</span></span>
