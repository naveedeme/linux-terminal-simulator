// ─────────────────────────────────────────────────────────────
// App.tsx  —  Root component: topbar + theme + Terminal
// ─────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'
import { Terminal, THEMES, ThemeName } from './components/Terminal'

const THEME_NAMES: ThemeName[] = ['green', 'amber', 'white', 'blue']

const THEME_LABELS: Record<ThemeName, string> = {
  green: '● Green',
  amber: '● Amber',
  white: '● White',
  blue:  '● Blue',
}

export default function App() {
  const [theme, setTheme] = useState<ThemeName>(() => {
    try { return (localStorage.getItem('term_theme') as ThemeName) || 'green' } catch { return 'green' }
  })
  const [showHelp, setShowHelp] = useState(false)

  useEffect(() => {
    try { localStorage.setItem('term_theme', theme) } catch (_) {}
    document.body.style.background = THEMES[theme].bg
  }, [theme])

  const th = THEMES[theme]

  return (
    <div style={{
      height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column',
      background: th.bg, color: th.fg, fontFamily: 'monospace', overflow: 'hidden',
    }}>
      {/* ── Top bar ── */}
      <div style={{
        background: '#111', borderBottom: '1px solid #1a1a1a',
        padding: '6px 12px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', flexShrink: 0, userSelect: 'none',
      }}>
        {/* Traffic lights + title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f57' }} />
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#febc2e' }} />
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#28c840' }} />
          </div>
          <span style={{ color: '#666', fontSize: 11, letterSpacing: 1 }}>TERMINAL — bash 5.2.15</span>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {THEME_NAMES.map(t => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              style={{
                background: theme === t ? THEMES[t].bg : 'none',
                border: `1px solid ${theme === t ? THEMES[t].fg : '#333'}`,
                color: theme === t ? THEMES[t].fg : '#666',
                padding: '2px 8px', borderRadius: 3, fontSize: 10,
                cursor: 'pointer', fontFamily: 'monospace', transition: 'all 0.15s',
              }}
            >
              {THEME_LABELS[t]}
            </button>
          ))}
          <button
            onClick={() => setShowHelp(h => !h)}
            style={{
              background: showHelp ? '#111' : 'none',
              border: `1px solid ${showHelp ? th.fg : '#333'}`,
              color: showHelp ? th.fg : '#666',
              padding: '2px 8px', borderRadius: 3, fontSize: 10,
              cursor: 'pointer', fontFamily: 'monospace',
            }}
          >
            ? Help
          </button>
        </div>
      </div>

      {/* ── Main area: terminal + optional help panel ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <Terminal theme={theme} />

        {showHelp && (
          <div style={{
            width: 280, background: '#0d0d0d', borderLeft: '1px solid #1a1a1a',
            padding: 14, overflowY: 'auto', flexShrink: 0, fontSize: 11,
            color: '#666', fontFamily: 'monospace',
          }}>
            <div style={{ color: th.prompt, marginBottom: 10, fontSize: 12 }}>📖 Command Reference</div>

            {[
              ['Navigation', 'ls [-lah], cd, pwd, tree, find'],
              ['Files', 'cat, touch, mkdir, rm [-rf], cp, mv, ln'],
              ['View', 'head, tail, less, cat, stat, file'],
              ['Edit', 'nano / vim  (^X to save+exit)'],
              ['Search', 'grep [-ivn], find -name, locate'],
              ['Text', 'wc, sort, uniq, cut, sed, awk, tr'],
              ['Pipe / IO', 'cmd | cmd2, cmd > file, cmd >> file'],
              ['System', 'ps, top, df, du, free, uname -a'],
              ['Network', 'ping, ifconfig, ip, curl, wget'],
              ['Perms', 'chmod 755, chown, umask'],
              ['Shell', 'export, env, alias, history, !!'],
              ['Packages', 'apt install/update/remove/list'],
              ['Archive', 'tar, gzip, gunzip, base64, xxd'],
              ['Fun', 'fortune, cowsay, sl, cmatrix'],
            ].map(([section, cmds]) => (
              <div key={section} style={{ marginBottom: 10 }}>
                <div style={{ color: th.dir, marginBottom: 3 }}>{section}</div>
                <div style={{ color: '#888', lineHeight: 1.6 }}>{cmds}</div>
              </div>
            ))}

            <div style={{ marginTop: 16, color: '#555', lineHeight: 1.8 }}>
              <div style={{ color: th.prompt, marginBottom: 6 }}>⌨️ Shortcuts</div>
              <div>Tab — autocomplete</div>
              <div>↑↓ — history</div>
              <div>→ — accept suggestion</div>
              <div>Ctrl+C — cancel</div>
              <div>Ctrl+L — clear screen</div>
              <div>Ctrl+D — logout</div>
              <div>Ctrl+A/E — line start/end</div>
            </div>

            <div style={{ marginTop: 16, color: '#555', lineHeight: 1.8 }}>
              <div style={{ color: th.prompt, marginBottom: 6 }}>💡 Examples</div>
              <div style={{ color: '#888' }}>ls -la | grep txt</div>
              <div style={{ color: '#888' }}>cat file | wc -l</div>
              <div style={{ color: '#888' }}>echo hi &gt; out.txt</div>
              <div style={{ color: '#888' }}>find . -name "*.sh"</div>
              <div style={{ color: '#888' }}>grep -n root /etc/passwd</div>
              <div style={{ color: '#888' }}>sed "s/foo/bar/" f.txt</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
