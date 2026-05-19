# 🖥️ Linux Terminal Simulator

A full-featured Linux terminal experience running entirely in the browser — works offline as a PWA.

[![Deploy Status](https://github.com/YOUR_USERNAME/linux-terminal-simulator/actions/workflows/deploy.yml/badge.svg)](https://github.com/YOUR_USERNAME/linux-terminal-simulator/actions)

---

## ✨ Features

### 50+ Commands
| Category | Commands |
|----------|---------|
| **Filesystem** | `ls -lah`, `cd`, `pwd`, `mkdir`, `rmdir`, `touch`, `cat`, `cp`, `mv`, `rm -rf`, `find`, `tree`, `stat`, `file`, `ln`, `diff` |
| **Text** | `grep`, `wc`, `sort`, `uniq`, `cut`, `head`, `tail`, `less`, `sed`, `awk`, `tr`, `tee`, `xargs` |
| **Shell** | `echo`, `printf`, `export`, `env`, `alias`, `unalias`, `history`, `!!` |
| **System** | `ps`, `top`, `kill`, `df`, `du`, `free`, `uname`, `uptime`, `date`, `cal`, `id`, `whoami` |
| **Network** | `ping`, `ifconfig`, `ip`, `netstat`, `curl`, `wget` |
| **Permissions** | `chmod`, `chown`, `umask` |
| **Archive** | `tar`, `gzip`, `gunzip`, `base64`, `md5sum`, `sha256sum`, `xxd`, `strings` |
| **Packages** | `apt install/update/remove/list` |
| **Editor** | `nano` / `vim` (real in-browser editor, `Ctrl+X` to save) |
| **Fun** | `fortune`, `cowsay`, `sl`, `cmatrix`, `banner`, `figlet` |

### Shell Features
- **Pipes** — `ls | grep txt | wc -l`
- **Redirection** — `echo hello > file.txt`, `cat a >> b`
- **Glob expansion** — `cat *.txt`, `rm *.log`
- **`!!`** — repeat last command
- **Tab completion** — commands and paths
- **Arrow key history** — ↑↓ to navigate
- **Ghost suggestions** — press → to accept
- **Ctrl+C/L/D** — cancel / clear / logout

### Virtual Filesystem
Pre-populated with a realistic Linux directory tree:
```
/
├── home/user/          ← start here
│   ├── readme.txt
│   ├── notes.txt
│   ├── .bashrc
│   └── projects/
│       ├── hello.py
│       ├── script.sh
│       └── data.csv
├── etc/                ← hosts, passwd, fstab, os-release…
├── var/log/            ← syslog, auth.log…
├── proc/               ← cpuinfo, meminfo…
├── usr/bin/            ← bash, ls, grep, python3…
└── …
```

### UX
- 4 colour themes: **Green** / **Amber** / **White** / **Blue**
- In-browser `nano`/`vim` editor with `Ctrl+X` save
- Collapsible command reference sidebar
- Mobile-friendly with on-screen keys (Tab, ↑, ↓, Ctrl+C…)
- Persistent history + state across page reloads (localStorage)
- PWA — installable on desktop and mobile, **100% offline**

---

## 🚀 Quick Start

### Run locally
```bash
git clone https://github.com/YOUR_USERNAME/linux-terminal-simulator.git
cd linux-terminal-simulator
npm install
npm run dev
```
Open http://localhost:5173

### Build for production
```bash
npm run build
# Output is in ./dist/
```

### Preview production build
```bash
npm run preview
```

---

## 📦 Deploy to GitHub Pages

### One-time setup
1. Fork / clone this repo to your GitHub account
2. Go to **Settings → Pages → Source** → select **GitHub Actions**
3. Push to `main` — the workflow auto-builds and deploys

### Manual deploy
```bash
npm run build
# Upload ./dist/ to any static host (Netlify, Vercel, Cloudflare Pages…)
```

> **GitHub Pages base path:** The `vite.config.ts` uses `base: './'` so it works under any subpath automatically.

---

## 🏗️ Project Structure

```
linux-terminal-simulator/
├── src/
│   ├── main.tsx                  # React entry point
│   ├── App.tsx                   # Root: topbar + theme switcher
│   ├── index.css                 # Global styles
│   ├── components/
│   │   └── Terminal.tsx          # Terminal UI, NanoEditor, keyboard handling
│   └── lib/
│       ├── FileSystem.ts         # VirtualFileSystem — in-memory FS with persistence
│       ├── CommandExecutor.ts    # 50+ command implementations
│       └── Predictor.ts          # Trie-based autocomplete + history suggestions
├── public/
│   ├── terminal.svg              # PWA icon
│   └── 404.html                  # GitHub Pages SPA fallback
├── .github/workflows/
│   └── deploy.yml                # CI/CD — build + deploy to GitHub Pages
├── linux-terminal.html           # ✅ Standalone single-file version (no build needed)
├── index.html                    # Vite entry
├── vite.config.ts                # Vite + PWA plugin config
├── tsconfig.json
└── package.json
```

---

## 🛠️ Tech Stack

| Tool | Purpose |
|------|---------|
| **React 18** | UI framework (functional components + hooks) |
| **TypeScript** | Type safety across all modules |
| **Vite** | Lightning-fast dev server + production bundler |
| **vite-plugin-pwa** | Service worker + web app manifest |
| **localStorage** | Persist history, VFS changes, theme preference |

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Tab` | Autocomplete command or path |
| `↑` / `↓` | Navigate command history |
| `→` | Accept ghost suggestion |
| `Ctrl+C` | Cancel current input |
| `Ctrl+L` | Clear screen |
| `Ctrl+D` | Logout (session reset) |
| `Ctrl+A` | Jump to line start |
| `Ctrl+E` | Jump to line end |
| `!!` | Repeat last command |

---

## 🐣 Easter Eggs

```bash
sl               # 🚂 Steam locomotive
cmatrix          # 🟩 Matrix rain
cowsay hello     # 🐄 ASCII cow
fortune          # 💬 Random Unix wisdom
sudo rm -rf /    # 🛡️ Protected!
sudo anything    # 📋 Sudoers incident report
```

---

## 🧩 Extending

### Add a new command
Open `src/lib/CommandExecutor.ts` and add a case to the `switch` block in `execCmd()`:

```typescript
case 'mycommand': {
  const [arg1, arg2] = a
  return text(`Hello from mycommand: ${arg1}`)
}
```

### Add a new file to the VFS
Open `src/lib/FileSystem.ts` and add an entry anywhere inside `makeInitialFS()`:

```typescript
'myfile.txt': {
  type: 'file', perm: '-rw-r--r--', owner: 'user',
  content: 'Hello, filesystem!', size: 18, mtime: 'May 19 12:00'
}
```

### Add a theme
Open `src/components/Terminal.tsx` and extend the `THEMES` object:

```typescript
purple: { fg: '#c792ea', prompt: '#c792ea', dir: '#89ddff', dim: '#3d2b5c', bg: '#0d0010', cursor: '#c792ea', helpBg: '#0a000e' }
```

---

## 📄 License

MIT — free to use, fork, and modify.

---

## 🙏 Acknowledgements

Inspired by real Linux distributions, GNU coreutils, and decades of terminal muscle memory.
