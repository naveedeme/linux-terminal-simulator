// ─────────────────────────────────────────────────────────────
// Terminal.tsx  —  Core terminal UI component
// ─────────────────────────────────────────────────────────────

import {
  useRef, useState, useEffect, useCallback, KeyboardEvent, ChangeEvent
} from 'react'
import { VirtualFileSystem } from '../lib/FileSystem'
import { CommandExecutor, OutputLine } from '../lib/CommandExecutor'
import { Predictor } from '../lib/Predictor'

// ── Themes ─────────────────────────────────────────────────────

export const THEMES = {
  green: { fg: '#00ff41', prompt: '#00ff41', dir: '#4fc3f7', dim: '#444', bg: '#0a0a0a', cursor: '#00ff41', helpBg: '#0d0d0d' },
  amber: { fg: '#ffb000', prompt: '#ffb000', dir: '#ff8800', dim: '#553300', bg: '#0a0600', cursor: '#ffb000', helpBg: '#0a0800' },
  white: { fg: '#d4d4d4', prompt: '#ffffff', dir: '#87ceeb', dim: '#444', bg: '#0d0d0d', cursor: '#ffffff', helpBg: '#111111' },
  blue:  { fg: '#4fc3f7', prompt: '#4fc3f7', dir: '#81d4fa', dim: '#1a3a4a', bg: '#020d14', cursor: '#4fc3f7', helpBg: '#021018' },
} as const

export type ThemeName = keyof typeof THEMES

// ── Output renderer ─────────────────────────────────────────────

function RenderedLine({ line, theme }: { line: OutputLine; theme: typeof THEMES[ThemeName] }) {
  if (line.kind === 'prompt') {
    return (
      <div>
        <span style={{ color: line.promptColor }}>{line.user}@{line.hostname}:</span>
        <span style={{ color: line.dirColor }}>{line.display}</span>
        <span style={{ color: line.promptColor }}>$</span>
        {' '}
        <span>{line.cmd}</span>
      </div>
    )
  }
  if (line.kind === 'html') {
    return <div dangerouslySetInnerHTML={{ __html: line.html }} />
  }
  if (line.kind === 'text') {
    return (
      <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {line.text}
      </div>
    )
  }
  return null
}

// ── NanoEditor overlay ──────────────────────────────────────────

function NanoEditor({
  filename, path, content, theme, vfs, onClose
}: {
  filename: string, path: string, content: string,
  theme: typeof THEMES[ThemeName], vfs: VirtualFileSystem,
  onClose: (saved: boolean) => void
}) {
  const [text, setText] = useState(content)

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.ctrlKey && (e.key === 'x' || e.key === 'X' || e.key === 's' || e.key === 'S')) {
      e.preventDefault()
      vfs.writeFile(path, text)
      onClose(true)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: theme.bg, zIndex: 100,
      display: 'flex', flexDirection: 'column', fontFamily: 'monospace', fontSize: 13
    }}>
      <div style={{ background: '#333', color: '#fff', padding: '4px 12px', display: 'flex', justifyContent: 'space-between', flexShrink: 0 }}>
        <span>GNU nano 6.2 — {filename}</span>
        <span style={{ color: '#aaa' }}>[Modified]</span>
      </div>
      <textarea
        autoFocus
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={handleKey}
        style={{
          flex: 1, background: theme.bg, color: theme.fg, border: 'none', outline: 'none',
          padding: 10, fontFamily: 'monospace', fontSize: 13, resize: 'none', lineHeight: 1.5
        }}
      />
      <div style={{ background: '#222', color: '#ccc', padding: '4px 12px', fontSize: 11, display: 'flex', gap: 16 }}>
        <span>^G Help</span><span>^X Save+Exit</span><span>^S Save</span><span>^K Cut</span><span>^U Paste</span>
      </div>
    </div>
  )
}

// ── Logout screen ───────────────────────────────────────────────

function LogoutScreen({ onReboot }: { onReboot: () => void }) {
  useEffect(() => {
    const t = setTimeout(onReboot, 4000)
    return () => clearTimeout(t)
  }, [onReboot])
  return (
    <div style={{ padding: 20, color: '#555', fontFamily: 'monospace', fontSize: 13 }}>
      <div>logout</div>
      <div style={{ marginTop: 16 }}>Connection to linux-sim closed.</div>
      <div style={{ marginTop: 16, border: '1px solid #333', padding: 16, display: 'inline-block' }}>
        Session ended. Reloading in 4s…
      </div>
    </div>
  )
}

// ── Terminal component ──────────────────────────────────────────

interface TerminalProps {
  theme: ThemeName
}

export function Terminal({ theme }: TerminalProps) {
  const th = THEMES[theme]

  // Core refs (stable across renders)
  const vfsRef = useRef(new VirtualFileSystem())
  const execRef = useRef(new CommandExecutor(vfsRef.current))
  const predictorRef = useRef(new Predictor())

  // Output buffer
  const [outputLines, setOutputLines] = useState<OutputLine[]>([])
  const [inputValue, setInputValue] = useState('')
  const [suggestion, setSuggestion] = useState('')
  const [histIdx, setHistIdx] = useState(-1)
  const [editorState, setEditorState] = useState<{ filename: string; path: string; content: string } | null>(null)
  const [loggedOut, setLoggedOut] = useState(false)
  const [showHelp, setShowHelp] = useState(true)

  const outputRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // ── Scroll to bottom ────────────────────────────────────────
  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight
  }, [outputLines])

  // ── Welcome message ─────────────────────────────────────────
  useEffect(() => {
    const tips = [
      'Tip: Tab for autocomplete',
      'Tip: !! repeats last command',
      'Tip: Try cmatrix or sl for fun!',
      'Tip: Pipes work! Try: ls | grep txt',
      'Tip: Use > to redirect output to files',
      'Tip: nano notes.txt opens the editor',
    ]
    const tip = tips[Math.floor(Math.random() * tips.length)]
    setOutputLines([
      { kind: 'html', html: `<span style="color:${th.prompt}">  ██╗     ██╗███╗   ██╗██╗   ██╗██╗  ██╗\n  ██║     ██║████╗  ██║██║   ██║╚██╗██╔╝\n  ██║     ██║██╔██╗ ██║██║   ██║ ╚███╔╝\n  ██║     ██║██║╚██╗██║██║   ██║ ██╔██╗\n  ███████╗██║██║ ╚████║╚██████╔╝██╔╝ ██╗\n  ╚══════╝╚═╝╚═╝  ╚═══╝ ╚═════╝ ╚═╝  ╚═╝</span>` },
      { kind: 'html', html: `<span style="color:${th.dir}">Linux Terminal Simulator v2.0  |  Ubuntu 22.04.3 LTS</span>` },
      { kind: 'html', html: `<span style="color:${th.dim}">Kernel 5.15.0-91-generic  |  bash 5.2.15  |  Type 'help' for commands</span>` },
      { kind: 'text', text: '' },
      { kind: 'html', html: `<span style="color:#ffb000">${tip}</span>` },
      { kind: 'text', text: '' },
    ])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Run command ─────────────────────────────────────────────
  const runCommand = useCallback((raw: string) => {
    const trimmed = raw.trim()
    setInputValue('')
    setSuggestion('')

    if (!trimmed) {
      const display = vfsRef.current.promptDisplay(execRef.current.state.cwd)
      setOutputLines(prev => [...prev, { kind: 'prompt', cmd: '', display, user: execRef.current.state.user, hostname: execRef.current.state.hostname, dirColor: th.dir, promptColor: th.prompt }])
      return
    }

    // !! — repeat last command
    if (trimmed === '!!') {
      const hist = predictorRef.current.getHistory()
      const prev = hist[hist.length - 1]
      if (prev) { runCommand(prev); return }
      setOutputLines(prev => [...prev, { kind: 'html', html: '<span class="err">bash: !!: event not found</span>' }])
      return
    }

    predictorRef.current.addToHistory(trimmed)
    setHistIdx(predictorRef.current.getHistory().length)

    const results = execRef.current.execute(raw, { dir: th.dir, prompt: th.prompt })

    // Handle special kinds
    for (const r of results) {
      if (r.kind === 'logout') { setLoggedOut(true); return }
      if (r.kind === 'clear') { setOutputLines([]); return }
      if (r.kind === 'openEditor') {
        setEditorState({ filename: r.filename, path: r.path, content: r.content })
        setOutputLines(prev => [...prev, ...results.filter(x => x.kind !== 'openEditor' && x.kind !== 'logout' && x.kind !== 'clear')])
        return
      }
    }

    setOutputLines(prev => [...prev, ...results])
  }, [th])

  // ── Suggestion update ───────────────────────────────────────
  const updateSuggestion = useCallback((val: string) => {
    const s = predictorRef.current.suggest(val)
    setSuggestion(s && s.startsWith(val) ? s : '')
  }, [])

  // ── Tab completion ──────────────────────────────────────────
  const tabComplete = useCallback(() => {
    const val = inputValue
    const parts = val.trim().split(/\s+/)
    const isFirstWord = parts.length === 1 && !val.endsWith(' ')
    const lastWord = val.endsWith(' ') ? '' : (parts[parts.length - 1] ?? '')

    if (isFirstWord) {
      const matches = predictorRef.current.commandCompletions(lastWord)
      if (matches.length === 1) {
        setInputValue(matches[0] + ' ')
      } else if (matches.length > 1) {
        const display = vfsRef.current.promptDisplay(execRef.current.state.cwd)
        setOutputLines(prev => [
          ...prev,
          { kind: 'prompt', cmd: val, display, user: execRef.current.state.user, hostname: execRef.current.state.hostname, dirColor: th.dir, promptColor: th.prompt },
          { kind: 'text', text: matches.join('  ') },
        ])
      }
      return
    }

    // Path completion
    const vfs = vfsRef.current
    const dirPart = lastWord.includes('/') ? lastWord.substring(0, lastWord.lastIndexOf('/') + 1) : ''
    const filePart = lastWord.includes('/') ? lastWord.substring(lastWord.lastIndexOf('/') + 1) : lastWord
    const baseDir = dirPart ? vfs.resolve(dirPart) : execRef.current.state.cwd
    const node = vfs.getNode(baseDir)
    if (!node || node.type !== 'dir') return

    const entries = vfs.listDir(baseDir, true)
    const matches = entries.filter(([n]) => n.startsWith(filePart))

    if (matches.length === 1) {
      const [name, child] = matches[0]
      const completed = val.slice(0, -filePart.length) + dirPart + name + (child.type === 'dir' ? '/' : ' ')
      setInputValue(completed)
    } else if (matches.length > 1) {
      const display = vfsRef.current.promptDisplay(execRef.current.state.cwd)
      setOutputLines(prev => [
        ...prev,
        { kind: 'prompt', cmd: val, display, user: execRef.current.state.user, hostname: execRef.current.state.hostname, dirColor: th.dir, promptColor: th.prompt },
        { kind: 'text', text: matches.map(([n]) => n).join('  ') },
      ])
    }
  }, [inputValue, th])

  // ── Key handler ─────────────────────────────────────────────
  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    const hist = predictorRef.current.getHistory()

    if (e.key === 'Enter') {
      e.preventDefault()
      runCommand(inputValue)
      setHistIdx(hist.length)
    } else if (e.key === 'Tab') {
      e.preventDefault()
      tabComplete()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const newIdx = Math.max(0, histIdx - 1)
      setHistIdx(newIdx)
      setInputValue(hist[newIdx] ?? '')
      updateSuggestion(hist[newIdx] ?? '')
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (histIdx >= hist.length - 1) {
        setHistIdx(hist.length)
        setInputValue('')
        setSuggestion('')
      } else {
        const newIdx = histIdx + 1
        setHistIdx(newIdx)
        setInputValue(hist[newIdx] ?? '')
        updateSuggestion(hist[newIdx] ?? '')
      }
    } else if (e.key === 'ArrowRight') {
      const inp = inputRef.current
      if (inp && inp.selectionStart === inp.value.length && suggestion) {
        setInputValue(suggestion)
        setSuggestion('')
        e.preventDefault()
      }
    } else if (e.ctrlKey && e.key === 'c') {
      e.preventDefault()
      setOutputLines(prev => [...prev, { kind: 'text', text: '^C' }])
      setInputValue('')
      setSuggestion('')
    } else if (e.ctrlKey && e.key === 'l') {
      e.preventDefault()
      setOutputLines([])
    } else if (e.ctrlKey && e.key === 'd') {
      e.preventDefault()
      setLoggedOut(true)
    } else if (e.ctrlKey && e.key === 'a') {
      e.preventDefault()
      inputRef.current?.setSelectionRange(0, 0)
    } else if (e.ctrlKey && e.key === 'e') {
      e.preventDefault()
      const l = inputValue.length
      inputRef.current?.setSelectionRange(l, l)
    }
  }, [inputValue, suggestion, histIdx, runCommand, tabComplete, updateSuggestion])

  const handleChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setInputValue(val)
    updateSuggestion(val)
  }, [updateSuggestion])

  // ── Mobile key helper ───────────────────────────────────────
  const insertMobileKey = useCallback((k: string) => {
    if (k === 'Tab') { tabComplete(); return }
    if (k === '↑') {
      const hist = predictorRef.current.getHistory()
      const newIdx = Math.max(0, histIdx - 1)
      setHistIdx(newIdx); setInputValue(hist[newIdx] ?? '')
    } else if (k === '↓') {
      const hist = predictorRef.current.getHistory()
      if (histIdx >= hist.length - 1) { setHistIdx(hist.length); setInputValue('') }
      else { const ni = histIdx+1; setHistIdx(ni); setInputValue(hist[ni]??'') }
    } else if (k === '^C') { setOutputLines(p=>[...p,{kind:'text',text:'^C'}]); setInputValue('') }
    else if (k === '^L') { setOutputLines([]) }
    else { setInputValue(v => v + k) }
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [tabComplete, histIdx])

  // ── Prompt display ──────────────────────────────────────────
  const cwdDisplay = vfsRef.current.promptDisplay(execRef.current.state.cwd)
  const { user, hostname } = execRef.current.state

  // ── Render ──────────────────────────────────────────────────
  if (loggedOut) {
    return <LogoutScreen onReboot={() => { setLoggedOut(false); setOutputLines([]); /* re-welcome handled by effect */ }} />
  }

  if (editorState) {
    return (
      <NanoEditor
        {...editorState}
        theme={th}
        vfs={vfsRef.current}
        onClose={(saved) => {
          setEditorState(null)
          if (saved) setOutputLines(p => [...p, { kind: 'html', html: `<span style="color:#50fa7b">[Saved ${editorState.filename}]</span>` }])
          setTimeout(() => inputRef.current?.focus(), 50)
        }}
      />
    )
  }

  return (
    <div
      style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: th.bg, color: th.fg }}
      onClick={() => inputRef.current?.focus()}
    >
      {/* Output area */}
      <div
        ref={outputRef}
        style={{
          flex: 1, overflowY: 'auto', padding: '10px 14px 4px',
          lineHeight: 1.5, fontFamily: 'monospace', fontSize: 13,
          wordBreak: 'break-word',
        }}
      >
        {outputLines.map((line, i) => (
          <RenderedLine key={i} line={line} theme={th} />
        ))}
      </div>

      {/* Input row */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '6px 14px 10px', borderTop: `1px solid #111`, background: th.bg, flexShrink: 0 }}>
        {/* Prompt */}
        <span style={{ whiteSpace: 'nowrap', marginRight: 6, flexShrink: 0, fontFamily: 'monospace', fontSize: 13 }}>
          <span style={{ color: th.prompt }}>{user}@{hostname}:</span>
          <span style={{ color: th.dir }}>{cwdDisplay}</span>
          <span style={{ color: th.prompt }}>$</span>
        </span>

        {/* Input + ghost suggestion */}
        <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
          {suggestion && (
            <span style={{ position: 'absolute', left: 0, top: 0, color: th.dim, pointerEvents: 'none', whiteSpace: 'pre', fontFamily: 'monospace', fontSize: 13, lineHeight: 1.5 }}>
              {suggestion}
            </span>
          )}
          <input
            ref={inputRef}
            value={inputValue}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-label="Terminal input"
            style={{
              background: 'none', border: 'none', outline: 'none',
              color: th.fg, fontFamily: 'monospace', fontSize: 13,
              caretColor: th.cursor, width: '100%', position: 'relative', zIndex: 2,
            }}
          />
        </div>
      </div>

      {/* Help bar */}
      {showHelp && (
        <div style={{ background: th.helpBg, borderTop: '1px solid #1a1a1a', padding: '5px 14px', fontSize: 11, color: th.dim, flexShrink: 0 }}>
          Type{' '}<span style={{ color: th.prompt }}>help</span>{' '}for commands · Tab: autocomplete · ↑↓: history · Ctrl+C: cancel · Ctrl+L: clear · Ctrl+D: logout
        </div>
      )}

      {/* Mobile keys */}
      <div style={{ display: 'none' }} className="mobile-keys">
        {['Tab','↑','↓','^C','^L','~','/','-','|','>'].map(k => (
          <button key={k} onClick={() => insertMobileKey(k)} style={{ background: '#1a1a1a', border: '1px solid #333', color: '#888', padding: '4px 10px', borderRadius: 4, fontSize: 11, cursor: 'pointer', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
            {k}
          </button>
        ))}
      </div>

      {/* CSS for mobile keys */}
      <style>{`
        @media (max-width: 600px) {
          .mobile-keys { display: flex !important; gap: 6px; padding: 6px 10px; background: #111; border-top: 1px solid #1a1a1a; flex-shrink: 0; overflow-x: auto; }
        }
        .err { color: #ff5555; }
        .info { color: #4fc3f7; }
        .warn { color: #ffb000; }
        .success { color: #50fa7b; }
        .dim { color: #555; }
        .dir-color { color: ${th.dir}; }
        .exec-color { color: #50fa7b; }
      `}</style>
    </div>
  )
}
