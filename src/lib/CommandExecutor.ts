// ─────────────────────────────────────────────────────────────
// CommandExecutor.ts  —  Executes shell commands against VFS
// ─────────────────────────────────────────────────────────────

import { VirtualFileSystem, FSNode } from './FileSystem'
import { ALL_COMMANDS } from './Predictor'

// ── Types ─────────────────────────────────────────────────────

export interface ShellState {
  cwd: string
  user: string
  hostname: string
  env: Record<string, string>
  aliases: Record<string, string>
  installedPkgs: string[]
  oldPwd: string
}

export type OutputLine =
  | { kind: 'text';    text: string }
  | { kind: 'html';    html: string }
  | { kind: 'prompt';  cmd: string; display: string; user: string; hostname: string; dirColor: string; promptColor: string }
  | { kind: 'clear' }
  | { kind: 'openEditor'; filename: string; path: string; content: string }
  | { kind: 'logout' }

// ── Man pages ─────────────────────────────────────────────────

const MAN_PAGES: Record<string, string> = {
  ls: 'LS(1)\n\nNAME\n  ls - list directory contents\n\nSYNOPSIS\n  ls [OPTION]... [FILE]...\n\nOPTIONS\n  -a    do not ignore entries starting with .\n  -l    use a long listing format\n  -h    with -l, human-readable sizes\n  -A    do not list . and ..\n\nEXAMPLES\n  ls -la         # long format with hidden files\n  ls -lh /etc    # list /etc human-readable sizes',
  cd: 'CD(1)\n\nNAME\n  cd - change the working directory\n\nSYNOPSIS\n  cd [DIR]\n\nDESCRIPTION\n  Changes the current directory to DIR.\n  With no argument, changes to $HOME.\n  cd -   changes to previous directory ($OLDPWD)',
  grep: 'GREP(1)\n\nNAME\n  grep - print lines that match patterns\n\nSYNOPSIS\n  grep [OPTIONS] PATTERN [FILE]...\n\nOPTIONS\n  -i    ignore case distinctions\n  -v    invert the sense of matching\n  -n    prefix output with line numbers\n  -r    read all files under each directory\n  -l    print only names of matching files\n\nEXAMPLES\n  grep root /etc/passwd\n  cat file | grep -i error\n  grep -rn "TODO" ~/projects',
  cat: 'CAT(1)\n\nNAME\n  cat - concatenate files and print to stdout\n\nSYNOPSIS\n  cat [OPTION]... [FILE]...\n\nEXAMPLES\n  cat file.txt\n  cat a.txt b.txt > combined.txt',
  find: 'FIND(1)\n\nNAME\n  find - search for files in a directory hierarchy\n\nSYNOPSIS\n  find [path] [expression]\n\nOPTIONS\n  -name PATTERN    match filename\n  -type f|d        match file or directory\n  -size +N         larger than N blocks\n\nEXAMPLES\n  find . -name "*.txt"\n  find /etc -type f\n  find ~ -name "*.sh"',
  chmod: 'CHMOD(1)\n\nNAME\n  chmod - change file mode bits\n\nSYNOPSIS\n  chmod MODE FILE\n\nEXAMPLES\n  chmod 755 script.sh    # rwxr-xr-x\n  chmod 644 file.txt     # rw-r--r--\n  chmod 600 secret.txt   # rw-------',
  apt: 'APT(8)\n\nNAME\n  apt - command-line package manager\n\nSYNOPSIS\n  apt [COMMAND] [PACKAGE]\n\nCOMMANDS\n  install PKG   install a package\n  update        refresh package lists\n  remove PKG    remove a package\n  list          list installed packages\n\nEXAMPLES\n  apt install vim\n  apt update\n  apt remove nano',
  sed: 'SED(1)\n\nNAME\n  sed - stream editor for filtering and transforming text\n\nSYNOPSIS\n  sed [OPTION] SCRIPT [FILE]\n\nEXAMPLES\n  sed "s/foo/bar/g" file.txt\n  cat file | sed "s/old/new/"\n  sed -i "s/hello/world/" file.txt',
  awk: 'AWK(1)\n\nNAME\n  awk - pattern scanning and text processing language\n\nSYNOPSIS\n  awk PROGRAM [FILE]\n\nEXAMPLES\n  awk "{print $1}" file.txt\n  ls -l | awk "{print $5, $9}"\n  awk -F: "{print $1}" /etc/passwd',
  tar: 'TAR(1)\n\nNAME\n  tar - tape archiver\n\nSYNOPSIS\n  tar [OPTION]... [FILE]...\n\nOPTIONS\n  -c    create archive\n  -x    extract archive\n  -f    specify filename\n  -z    filter through gzip\n  -v    verbose\n\nEXAMPLES\n  tar -czf archive.tar.gz dir/\n  tar -xzf archive.tar.gz',
}

// ── Utility helpers ───────────────────────────────────────────

function escH(s: string): string {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

function permStr(bits: number, isDir: boolean): string {
  const t = isDir ? 'd' : '-'
  return t + [(bits>>6)&7,(bits>>3)&7,bits&7]
    .map(b => (b&4?'r':'-')+(b&2?'w':'-')+(b&1?'x':'-'))
    .join('')
}

function tokenize(cmd: string): string[] {
  const parts: string[] = []
  let cur = ''; let inQ = false; let qc = ''
  for (const c of cmd) {
    if (inQ) { if (c === qc) inQ = false; else cur += c }
    else if (c === '"' || c === "'") { inQ = true; qc = c }
    else if (c === ' ') { if (cur) { parts.push(cur); cur = '' } }
    else cur += c
  }
  if (cur) parts.push(cur)
  return parts
}

function expandVars(s: string, env: Record<string, string>): string {
  return s.replace(/\$(\w+)|\${(\w+)}/g, (m, k1, k2) => env[k1 ?? k2] ?? m)
}

function parseRedirect(cmd: string): { cmd: string; out?: string; append: boolean } {
  const am = cmd.match(/^(.*?)\s*>>\s*(\S+)\s*$/)
  if (am) return { cmd: am[1].trim(), out: am[2], append: true }
  const om = cmd.match(/^(.*?)\s*>\s*(\S+)\s*$/)
  if (om) return { cmd: om[1].trim(), out: om[2], append: false }
  return { cmd, append: false }
}

// ── CommandExecutor ───────────────────────────────────────────

export class CommandExecutor {
  public state: ShellState
  private vfs: VirtualFileSystem

  constructor(vfs: VirtualFileSystem) {
    this.vfs = vfs
    this.state = {
      cwd: vfs.cwd,
      user: 'user',
      hostname: 'linux-sim',
      env: {
        HOME: '/home/user', USER: 'user', SHELL: '/bin/bash',
        PATH: '/usr/local/bin:/usr/bin:/bin:/sbin',
        TERM: 'xterm-256color', LANG: 'en_US.UTF-8',
        OLDPWD: '/home/user'
      },
      aliases: {
        ll: 'ls -la', la: 'ls -A', '..': 'cd ..', grep: 'grep --color=auto'
      },
      installedPkgs: ['bash','coreutils','grep','sed','awk','python3','curl','nano'],
      oldPwd: '/home/user',
    }
    this.loadState()
  }

  // ── Public entrypoint ─────────────────────────────────────

  execute(raw: string, theme: { dir: string; prompt: string }): OutputLine[] {
    const out: OutputLine[] = []
    const display = this.vfs.promptDisplay(this.state.cwd)

    // Echo prompt line
    out.push({ kind: 'prompt', cmd: raw, display, user: this.state.user, hostname: this.state.hostname, dirColor: theme.dir, promptColor: theme.prompt })

    const trimmed = raw.trim()
    if (!trimmed) return out

    // Alias expansion
    let expanded = trimmed
    for (const [a, v] of Object.entries(this.state.aliases)) {
      if (expanded === a || expanded.startsWith(a + ' ')) {
        expanded = v + expanded.slice(a.length); break
      }
    }

    // !! — repeat last command (handled at Terminal level, pass-through here)

    // Pipes
    if (expanded.includes('|')) {
      const pipeOut = this.runPipe(expanded)
      out.push(...pipeOut)
      return out
    }

    // Redirect
    const redirect = parseRedirect(expanded)
    const parts = tokenize(redirect.cmd)
    if (!parts.length) return out

    const result = this.execCmd(parts[0], parts.slice(1))

    // Handle redirect
    if (redirect.out) {
      const rpath = this.vfs.resolve(redirect.out)
      const textResult = result.filter(o => o.kind === 'text').map(o => (o as {kind:'text';text:string}).text).join('\n')
      if (redirect.append) this.vfs.appendFile(rpath, textResult + '\n')
      else this.vfs.writeFile(rpath, textResult + '\n')
      return out
    }

    out.push(...result)
    return out
  }

  // ── Pipe execution ────────────────────────────────────────

  private runPipe(cmdStr: string): OutputLine[] {
    const segments = cmdStr.split('|').map(s => s.trim())
    let buf: string | null = null

    for (const seg of segments) {
      const parts = tokenize(seg)
      if (!parts.length) continue
      if (buf !== null) parts.push('__PIPE__:' + buf)
      const result = this.execCmd(parts[0], parts.slice(1))
      buf = result.filter(o => o.kind === 'text').map(o => (o as {kind:'text';text:string}).text).join('\n')
    }

    if (buf === null || buf === '') return []
    return buf.split('\n').map(l => ({ kind: 'text' as const, text: l }))
  }

  // ── Main dispatcher ───────────────────────────────────────

  execCmd(cmd: string, args: string[]): OutputLine[] {
    const out = (text: string, isHtml = false): OutputLine =>
      isHtml ? { kind: 'html', html: text } : { kind: 'text', text }

    // Extract pipe input
    const pipeIdx = args.findIndex(a => a.startsWith('__PIPE__:'))
    const pipeIn: string | null = pipeIdx >= 0 ? args[pipeIdx].slice(9) : null
    const a = args.filter(a => !a.startsWith('__PIPE__:'))

    const text = (...lines: string[]): OutputLine[] => lines.map(l => out(l))
    const err = (msg: string): OutputLine[] => [{ kind: 'html', html: `<span class="err">${escH(msg)}</span>` }]
    const single = (s: string | null): OutputLine[] => s !== null ? s.split('\n').map(l => out(l)) : []

    const vfs = this.vfs
    const st = this.state
    const ev = (s: string) => expandVars(s, st.env)

    switch (cmd) {

      // ── Identity ─────────────────────────────────────────
      case 'pwd':     return text(st.cwd)
      case 'whoami':  return text(st.user)
      case 'hostname':return text(st.hostname)
      case 'id':      return text(`uid=1000(${st.user}) gid=1000(${st.user}) groups=1000(${st.user}),4(adm),27(sudo),46(plugdev)`)
      case 'groups':  return text(`${st.user} adm cdrom sudo dip plugdev`)

      // ── Session ──────────────────────────────────────────
      case 'exit':
      case 'logout':  return [{ kind: 'logout' }]
      case 'clear':   return [{ kind: 'clear' }]

      // ── Navigation ───────────────────────────────────────
      case 'cd': {
        const target = a[0] || st.env.HOME
        const dest = target === '-' ? st.oldPwd : vfs.resolve(target)
        const node = vfs.getNode(dest)
        if (!node) return err(`bash: cd: ${target}: No such file or directory`)
        if (node.type !== 'dir') return err(`bash: cd: ${target}: Not a directory`)
        st.oldPwd = st.cwd
        st.cwd = dest
        vfs.cwd = dest
        this.saveState()
        return []
      }

      // ── ls ───────────────────────────────────────────────
      case 'ls': {
        let flags = ''
        const paths: string[] = []
        for (const arg of a) { if (arg.startsWith('-')) flags += arg.slice(1); else paths.push(arg) }
        if (!paths.length) paths.push(st.cwd)

        const results: OutputLine[] = []
        for (const p of paths) {
          const rp = vfs.resolve(p)
          const node = vfs.getNode(rp)
          if (!node) { results.push(...err(`ls: cannot access '${p}': No such file or directory`)); continue }

          if (node.type === 'file') {
            results.push(...single(this.lsLong(p.split('/').pop()??p, node, flags)))
            continue
          }

          const entries = vfs.listDir(rp, flags.includes('a'))
          if (flags.includes('l')) {
            const totalBlocks = entries.reduce((s,[,v]) => s + Math.ceil((v.size??0)/512), 0)
            results.push(out(`total ${totalBlocks}`))
            if (flags.includes('a')) {
              results.push(out(`drwxr-xr-x 2 ${st.user} ${st.user}     4096 ${vfs.nowStr()} .`))
              results.push(out(`drwxr-xr-x 2 ${st.user} ${st.user}     4096 ${vfs.nowStr()} ..`))
            }
            for (const [name, child] of entries) results.push(out(this.lsLong(name, child, flags)))
          } else {
            // Colorized grid
            const items = entries.map(([name, child]) => {
              if (child.type === 'dir') return `<span class="dir-color"><b>${escH(name)}</b></span>`
              if (child.perm?.includes('x') && !name.includes('.')) return `<span class="exec-color">${escH(name)}</span>`
              if (name.startsWith('.')) return `<span class="dim">${escH(name)}</span>`
              return escH(name)
            })
            results.push(out(`<div style="display:flex;flex-wrap:wrap;gap:0 24px">${items.map(i=>`<span>${i}</span>`).join('')}</div>`, true))
          }
        }
        return results
      }

      // ── cat ──────────────────────────────────────────────
      case 'cat': {
        if (pipeIn !== null) return single(pipeIn)
        if (!a.length) return err('cat: missing operand')
        const lines: OutputLine[] = []
        for (const arg of a) {
          for (const g of vfs.glob(vfs.resolve(arg))) {
            const node = vfs.getNode(g)
            if (!node) { lines.push(...err(`cat: ${arg}: No such file or directory`)); continue }
            if (node.type === 'dir') { lines.push(...err(`cat: ${arg}: Is a directory`)); continue }
            lines.push(...single(node.content ?? ''))
          }
        }
        return lines
      }

      // ── mkdir ─────────────────────────────────────────────
      case 'mkdir': {
        const pFlag = a.includes('-p')
        for (const d of a.filter(x => !x.startsWith('-'))) {
          const rp = vfs.resolve(d)
          const existing = vfs.getNode(rp)
          if (existing && !pFlag) { return err(`mkdir: cannot create directory '${d}': File exists`) }
          if (!existing) {
            const { parent } = vfs.getParentAndName(rp)
            if (!parent && !pFlag) return err(`mkdir: cannot create directory '${d}': No such file or directory`)
            vfs.createDir(rp, st.user)
          }
        }
        return []
      }

      // ── rmdir ────────────────────────────────────────────
      case 'rmdir': {
        for (const d of a) {
          const rp = vfs.resolve(d)
          const node = vfs.getNode(rp)
          if (!node) return err(`rmdir: failed to remove '${d}': No such file or directory`)
          if (node.type !== 'dir') return err(`rmdir: failed to remove '${d}': Not a directory`)
          if (Object.keys(node.children??{}).length) return err(`rmdir: failed to remove '${d}': Directory not empty`)
          vfs.delete(rp)
        }
        return []
      }

      // ── touch ─────────────────────────────────────────────
      case 'touch': {
        for (const f of a) {
          const rp = vfs.resolve(f)
          const node = vfs.getNode(rp)
          if (node?.type === 'file') { node.mtime = vfs.nowStr() }
          else if (!node) vfs.createFile(rp, '', st.user)
        }
        return []
      }

      // ── rm ───────────────────────────────────────────────
      case 'rm': {
        const rf = a.some(x => x.startsWith('-') && (x.includes('r') || x.includes('f')))
        const ff = a.some(x => x.startsWith('-') && x.includes('f'))
        const files = a.filter(x => !x.startsWith('-'))
        const result: OutputLine[] = []
        for (const f of files.flatMap(f => vfs.glob(vfs.resolve(f)))) {
          const node = vfs.getNode(f)
          if (!node) { if (!ff) result.push(...err(`rm: cannot remove '${f}': No such file or directory`)); continue }
          if (node.type === 'dir' && !rf) { result.push(...err(`rm: cannot remove '${f}': Is a directory (use -rf)`)); continue }
          vfs.delete(f)
        }
        return result
      }

      // ── cp ───────────────────────────────────────────────
      case 'cp': {
        const files = a.filter(x => !x.startsWith('-'))
        if (files.length < 2) return err('cp: missing destination file operand')
        const dst = vfs.resolve(files[files.length - 1])
        const dstNode = vfs.getNode(dst)
        for (const src of files.slice(0, -1)) {
          const srcPath = vfs.resolve(src)
          const srcNode = vfs.getNode(srcPath)
          if (!srcNode) { return err(`cp: ${src}: No such file or directory`) }
          const destName = dstNode?.type === 'dir' ? srcPath.split('/').pop()! : dst.split('/').pop()!
          const destParent = dstNode?.type === 'dir' ? dstNode : vfs.getParentAndName(dst).parent
          if (!destParent) return err(`cp: ${files[files.length-1]}: No such directory`)
          destParent.children![destName] = JSON.parse(JSON.stringify(srcNode))
        }
        return []
      }

      // ── mv ───────────────────────────────────────────────
      case 'mv': {
        if (a.length < 2) return err('mv: missing destination')
        const src = vfs.resolve(a[0]), dst = vfs.resolve(a[1])
        const srcNode = vfs.getNode(src)
        if (!srcNode) return err(`mv: ${a[0]}: No such file or directory`)
        const { parent: sp, name: sn } = vfs.getParentAndName(src)
        const dstNode = vfs.getNode(dst)
        const { parent: dp, name: dn } = vfs.getParentAndName(dst)
        const destParent = dstNode?.type === 'dir' ? dstNode : dp
        const destName = dstNode?.type === 'dir' ? sn : dn
        if (!destParent) return err(`mv: ${a[1]}: No such file or directory`)
        destParent.children![destName] = srcNode
        if (sp?.children) delete sp.children[sn]
        return []
      }

      // ── ln ───────────────────────────────────────────────
      case 'ln': {
        const files = a.filter(x => !x.startsWith('-'))
        if (files.length < 2) return err('ln: missing file operand')
        const src = vfs.resolve(files[0]), dst = vfs.resolve(files[1])
        const srcNode = vfs.getNode(src)
        if (!srcNode) return err(`ln: failed to access '${files[0]}': No such file or directory`)
        const { parent, name } = vfs.getParentAndName(dst)
        if (!parent) return err(`ln: failed to create link: No such file or directory`)
        parent.children![name] = a.includes('-s')
          ? { type:'link', perm:'lrwxrwxrwx', owner:st.user, target:src, content:'', size:src.length, mtime:vfs.nowStr() }
          : srcNode
        return []
      }

      // ── find ─────────────────────────────────────────────
      case 'find': {
        const startP = a.find(x => !x.startsWith('-')) ?? st.cwd
        const ni = a.indexOf('-name'), pattern = ni >= 0 ? a[ni+1] : null
        const ti = a.indexOf('-type'), typeF = ti >= 0 ? a[ti+1] : null
        const results: string[] = []
        vfs.walk(vfs.resolve(startP), (p, node) => {
          const name = p.split('/').pop() ?? ''
          const mn = !pattern || new RegExp('^' + pattern.replace(/\*/g,'.*').replace(/\?/g,'.') + '$').test(name)
          const mt = !typeF || (typeF==='d'&&node.type==='dir') || (typeF==='f'&&node.type==='file')
          if (mn && mt) results.push(p)
        })
        return results.map(r => out(r))
      }

      // ── tree ─────────────────────────────────────────────
      case 'tree': {
        const p = vfs.resolve(a[0] ?? st.cwd)
        const node = vfs.getNode(p)
        if (!node || node.type !== 'dir') return err(`tree: ${a[0]??st.cwd}: Not a directory`)
        const lines = [p]; let dc = 0, fc = 0
        const walk = (n: FSNode, prefix: string) => {
          const ents = Object.entries(n.children??{}).sort(([a],[b])=>a.localeCompare(b))
          ents.forEach(([name, child], i) => {
            const last = i === ents.length - 1
            if (child.type === 'dir') {
              lines.push(prefix+(last?'└── ':'├── ')+name+'/')
              dc++; walk(child, prefix+(last?'    ':'│   '))
            } else { lines.push(prefix+(last?'└── ':'├── ')+name); fc++ }
          })
        }
        walk(node, '')
        lines.push(`\n${dc} directories, ${fc} files`)
        return lines.map(l => out(l))
      }

      // ── Text tools ────────────────────────────────────────
      case 'echo':   return single(ev(a.join(' ')).replace(/\\n/g,'\n').replace(/\\t/g,'\t'))
      case 'printf': return single(ev(a.join(' ')).replace(/\\n/g,'\n').replace(/\\t/g,'\t'))

      case 'cat': return [] // handled above

      case 'grep': {
        if (!a.length) return err('Usage: grep PATTERN [FILE]')
        const iF = a.includes('-i'), vF = a.includes('-v'), nF = a.includes('-n')
        const cleanA = a.filter(x => !x.startsWith('-'))
        const pat = cleanA[0]
        let src = pipeIn
        if (src === null && cleanA.length > 1) {
          src = cleanA.slice(1).map(f => vfs.getNode(vfs.resolve(f))?.content??'').join('\n')
        }
        if (src === null) return err('grep: no input')
        const re = new RegExp(pat, iF?'gi':'g')
        return src.split('\n').flatMap((l, i) => {
          const m = vF ? !re.test(l) : re.test(l); re.lastIndex = 0
          return m ? [out(nF ? `${i+1}:${l}` : l)] : []
        })
      }

      case 'wc': {
        const src = pipeIn ?? (a.find(x=>!x.startsWith('-')) ? vfs.getNode(vfs.resolve(a.find(x=>!x.startsWith('-'))!))?.content??'' : '')
        const ls = src.split('\n').length, ws = src.split(/\s+/).filter(Boolean).length, cs = src.length
        if (a.includes('-l')) return text(String(ls))
        if (a.includes('-w')) return text(String(ws))
        if (a.includes('-c')) return text(String(cs))
        return text(`${ls} ${ws} ${cs}`)
      }

      case 'sort': {
        const src = pipeIn ?? (a.find(x=>!x.startsWith('-')) ? vfs.getNode(vfs.resolve(a.find(x=>!x.startsWith('-'))!))?.content??'' : '')
        const ls = src.split('\n')
        if (a.includes('-n')) ls.sort((x,y) => parseFloat(x)-parseFloat(y))
        else ls.sort((x,y) => x.localeCompare(y))
        if (a.includes('-r')) ls.reverse()
        return ls.map(l => out(l))
      }

      case 'uniq': return (pipeIn??'').split('\n').filter((l,i,arr)=>l!==arr[i-1]).map(l=>out(l))

      case 'cut': {
        const di = a.indexOf('-d'), sep = di>=0 ? a[di+1] : '\t'
        const fi = a.indexOf('-f'), field = fi>=0 ? parseInt(a[fi+1])-1 : 0
        return (pipeIn??'').split('\n').map(l => out(l.split(sep)[field]??''))
      }

      case 'head': {
        const n = parseInt(a[a.indexOf('-n')+1]) || 10
        const src = pipeIn ?? vfs.getNode(vfs.resolve(a.find(x=>!x.startsWith('-'))??''))?.content??''
        return src.split('\n').slice(0,n).map(l=>out(l))
      }

      case 'tail': {
        const n = parseInt(a[a.indexOf('-n')+1]) || 10
        const src = pipeIn ?? vfs.getNode(vfs.resolve(a.find(x=>!x.startsWith('-'))??''))?.content??''
        return src.split('\n').slice(-n).map(l=>out(l))
      }

      case 'less': {
        const src = pipeIn ?? (a[0] ? vfs.getNode(vfs.resolve(a[0]))?.content : null)
        if (!src) return a[0] ? err(`${a[0]}: No such file or directory`) : err('less: no input')
        return src.split('\n').slice(0,40).map(l=>out(l))
      }

      case 'sed': {
        const src = pipeIn ?? (a.find(x=>!x.startsWith('-') && !x.startsWith('s/'))
          ? vfs.getNode(vfs.resolve(a.find(x=>!x.startsWith('-') && !x.startsWith('s/'))!))?.content??''
          : '')
        const expr = a.find(x=>x.startsWith('s/')) ?? a[0] ?? ''
        const m = expr.match(/^s\/(.+?)\/(.*)\/([gi]*)$/)
        if (m) return single(src.replace(new RegExp(m[1],m[3]||'g'),m[2]))
        return single(src)
      }

      case 'awk': {
        const src = pipeIn ?? ''
        const prog = a.find(x=>!x.startsWith('-')) ?? ''
        const pm = prog.match(/^\{print \$(\d+)\}$/)
        if (pm) return src.split('\n').map(l=>out(l.trim().split(/\s+/)[parseInt(pm[1])-1]??''))
        return single(src)
      }

      case 'tr': {
        const src = pipeIn ?? ''
        if (a.includes('-d')) {
          const set = a.find(x=>!x.startsWith('-'))??''
          return single(src.split('').filter(c=>!set.includes(c)).join(''))
        }
        const s1=a[a.length-2]??'', s2=a[a.length-1]??''
        return single(src.split('').map(c=>{const i=s1.indexOf(c);return i>=0&&s2[i]?s2[i]:c}).join(''))
      }

      case 'diff': {
        if (a.length < 2) return err('diff: missing operand')
        const an = vfs.getNode(vfs.resolve(a[0])), bn = vfs.getNode(vfs.resolve(a[1]))
        if (!an) return err(`diff: ${a[0]}: No such file or directory`)
        if (!bn) return err(`diff: ${a[1]}: No such file or directory`)
        const al = (an.content??'').split('\n'), bl = (bn.content??'').split('\n')
        const res: string[] = []
        for (let i=0;i<Math.max(al.length,bl.length);i++) {
          if (al[i]!==bl[i]) { if(al[i]) res.push(`< ${al[i]}`); if(bl[i]) res.push(`> ${bl[i]}`) }
        }
        return res.length ? res.map(l=>out(l)) : text('Files are identical')
      }

      case 'tee': {
        if (pipeIn !== null && a[0]) {
          const p = vfs.resolve(a[0])
          vfs.writeFile(p, pipeIn)
        }
        return single(pipeIn)
      }

      case 'xargs': {
        if (!a.length) return err('xargs: missing command')
        const xCmd = a[0]
        const xArgs = [...a.slice(1), ...(pipeIn??'').split('\n').filter(Boolean)]
        return this.execCmd(xCmd, xArgs)
      }

      // ── File info ─────────────────────────────────────────
      case 'stat': {
        if (!a.length) return err('stat: missing operand')
        const p = vfs.resolve(a[0]); const node = vfs.getNode(p)
        if (!node) return err(`stat: cannot stat '${a[0]}': No such file or directory`)
        return text(
          `  File: ${p}`,
          `  Size: ${node.size??0}\t\tBlocks: ${Math.ceil((node.size??0)/512)}\tIO Block: 4096  ${node.type}`,
          `Access: ${node.perm??'-rw-r--r--'}  Uid: (1000/${node.owner})`,
          `Modify: ${node.mtime??'(unknown)'}`
        )
      }

      case 'file': {
        if (!a.length) return err('file: missing operand')
        const p = vfs.resolve(a[0]); const node = vfs.getNode(p)
        if (!node) return err(`file: ${a[0]}: No such file or directory`)
        if (node.type==='dir') return text(`${a[0]}: directory`)
        if (node.content==='ELF binary') return text(`${a[0]}: ELF 64-bit LSB pie executable, x86-64`)
        if (a[0].endsWith('.sh')) return text(`${a[0]}: Bourne-Again shell script, ASCII text executable`)
        if (a[0].endsWith('.py')) return text(`${a[0]}: Python script, ASCII text executable`)
        return text(`${a[0]}: ASCII text`)
      }

      case 'which':   return a.map(c => ALL_COMMANDS.includes(c) ? out(`/usr/bin/${c}`) : out(`which: ${c}: not found`))
      case 'whereis': return text(`${a[0]}: /usr/bin/${a[0]} /usr/share/man/man1/${a[0]}.1.gz`)

      // ── Permissions ──────────────────────────────────────
      case 'chmod': {
        if (a.length < 2) return err('chmod: missing operand')
        const p = vfs.resolve(a[a.length-1]); const node = vfs.getNode(p)
        if (!node) return err(`chmod: cannot access '${a[a.length-1]}': No such file or directory`)
        const mode = a[a.length-2]
        if (/^\d{3,4}$/.test(mode)) {
          const bits = parseInt(mode, 8)
          node.perm = permStr(bits, node.type==='dir')
        }
        return []
      }
      case 'chown':  return []
      case 'umask':  return text('0022')

      // ── Env & shell ──────────────────────────────────────
      case 'env':    return pipeIn !== null ? single(pipeIn) : Object.entries(st.env).map(([k,v])=>out(`${k}=${v}`))
      case 'export': { a.forEach(x=>{const [k,...vp]=x.split('=');if(vp.length)st.env[k]=ev(vp.join('='));}); this.saveState(); return [] }
      case 'unset':  { a.forEach(k=>delete st.env[k]); return [] }
      case 'alias':  {
        if (!a.length) return Object.entries(st.aliases).map(([k,v])=>out(`alias ${k}='${v}'`))
        a.forEach(x=>{const[k,...vp]=x.split('=');if(vp.length)st.aliases[k]=vp.join('=').replace(/^['"]|['"]$/g,'');})
        this.saveState(); return []
      }
      case 'unalias': { a.forEach(k=>delete st.aliases[k]); this.saveState(); return [] }

      // ── System info ──────────────────────────────────────
      case 'date':   return text(new Date().toString())
      case 'cal': {
        const d=new Date(),m=d.getMonth(),y=d.getFullYear()
        const mn=['January','February','March','April','May','June','July','August','September','October','November','December']
        const first=new Date(y,m,1).getDay(),last=new Date(y,m+1,0).getDate()
        let s=`   ${mn[m]} ${y}\nSu Mo Tu We Th Fr Sa\n`
        let row=Array<string>(first).fill('  ')
        for(let i=1;i<=last;i++){row.push(String(i).padStart(2));if(row.length===7){s+=row.join(' ')+'\n';row=[];}}
        if(row.length) s+=row.join(' ')+'\n'
        return single(s)
      }
      case 'uptime': {
        const u=Math.floor(performance.now()/1000)
        return text(` ${new Date().toTimeString().slice(0,5)} up ${Math.floor(u/3600)}h ${Math.floor((u%3600)/60)}m, 1 user, load average: 0.15, 0.12, 0.10`)
      }
      case 'uname': {
        if (a.includes('-a')) return text('Linux linux-sim 5.15.0-91-generic #101-Ubuntu SMP Tue Nov 14 13:30:08 UTC 2023 x86_64 GNU/Linux')
        if (a.includes('-r')) return text('5.15.0-91-generic')
        if (a.includes('-s')) return text('Linux')
        if (a.includes('-n')) return text(st.hostname)
        return text('Linux')
      }
      case 'ps': {
        if (a.some(x=>x.includes('aux')||x.includes('ef'))) {
          return text(
            `USER       PID %CPU %MEM    VSZ   RSS TTY      STAT COMMAND`,
            `root         1  0.0  0.1 168356 13200 ?        Ss   /sbin/init`,
            `root       420  0.0  0.0  72296  6400 ?        Ss   /usr/sbin/sshd`,
            `${st.user}     999  0.1  0.1  20720  5200 pts/0    Ss   /bin/bash`,
            `${st.user}    ${Math.floor(Math.random()*9000+1000)}  0.0  0.0   8836  1000 pts/0    R+   ps`
          )
        }
        return text('  PID TTY          TIME CMD','    1 ?        00:00:01 systemd','  420 ?        00:00:00 sshd','  999 pts/0    00:00:00 bash')
      }
      case 'top': return text(
        `top - ${new Date().toTimeString().slice(0,8)} up 2:34, 1 user, load average: 0.15, 0.12, 0.10`,
        `Tasks: 142 total,   1 running, 141 sleeping`,`%Cpu(s):  2.3 us,  0.5 sy, 96.8 id`,
        `MiB Mem:   8000.0 total, 2048.0 free, 4096.0 used`,``,
        `  PID USER  PR NI  VIRT  RES %CPU COMMAND`,
        `  999 ${st.user}  20  0 20720 5200  0.3 bash`,
        `    1 root  20  0 168356 13200  0.0 systemd`
      )
      case 'kill': {
        const pid = a.find(x=>!x.startsWith('-'))
        if (!pid) return err('kill: usage: kill [-s sigspec] pid')
        if (pid==='1') return err('bash: kill: (1) - Operation not permitted')
        return err(`kill: (${pid}) - No such process`)
      }
      case 'df': return text(
        `Filesystem     1K-blocks    Used Available Use% Mounted on`,
        `/dev/sda1       41943040 8388608  33554432  20% /`,
        `tmpfs            4194304       0   4194304   0% /dev/shm`
      )
      case 'du': {
        const p=vfs.resolve(a.find(x=>!x.startsWith('-'))??st.cwd)
        const node=vfs.getNode(p)
        if(!node) return err(`du: cannot access: No such file or directory`)
        const calc=(n:FSNode):number => n.type!=='dir'?(n.size??0):Object.values(n.children??{}).reduce((s,c)=>s+calc(c),4096)
        const sz=calc(node)
        return text(`${a.includes('-h')?vfs.fmtSize(sz):Math.ceil(sz/1024)}\t${p}`)
      }
      case 'free': {
        if (a.includes('-h')) return text(
          `              total  used  free  shared  buff/cache  available`,
          `Mem:           7.8G  4.0G  2.0G    128M       1.8G       3.8G`,
          `Swap:          2.0G    0B  2.0G`
        )
        return text(
          `              total    used    free  shared  buff/cache  available`,
          `Mem:        8192000 4096000 2048000  131072     2048000    3965928`,
          `Swap:       2097152       0 2097152`
        )
      }
      case 'w':    return text(` ${new Date().toTimeString().slice(0,5)} up 2:34, 1 user`,`USER TTY FROM LOGIN@ IDLE WHAT`,`${st.user} pts/0 - 09:00 0.00s w`)
      case 'who':  return text(`${st.user}   pts/0  ${new Date().toLocaleDateString()} 09:00`)
      case 'last': return text(`${st.user} pts/0 :0 ${new Date().toLocaleDateString()} 09:00  still logged in`)

      // ── Network (simulated) ──────────────────────────────
      case 'ping': {
        const host=a.find(x=>!x.startsWith('-'))??'localhost'
        const count=parseInt(a[a.indexOf('-c')+1])||4
        const lines=[`PING ${host} (127.0.0.1): 56 data bytes`]
        for(let i=0;i<count;i++) lines.push(`64 bytes from 127.0.0.1: icmp_seq=${i} ttl=64 time=${(Math.random()*2+0.5).toFixed(3)} ms`)
        lines.push(`\n--- ${host} ping statistics ---`,`${count} packets transmitted, ${count} received, 0% packet loss`)
        return lines.map(l=>out(l))
      }
      case 'ifconfig': case 'ip': return text(
        `eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500`,
        `        inet 192.168.1.100  netmask 255.255.255.0  broadcast 192.168.1.255`,
        `        inet6 fe80::1  prefixlen 64  scopeid 0x20<link>`,
        `        ether 02:42:ac:11:00:02`,``,
        `lo: flags=73<UP,LOOPBACK,RUNNING>  mtu 65536`,
        `        inet 127.0.0.1  netmask 255.0.0.0`
      )
      case 'netstat': return text(
        `Active Internet connections`,
        `Proto Local Address      Foreign Address    State`,
        `tcp   0.0.0.0:22         0.0.0.0:*          LISTEN`,
        `tcp   0.0.0.0:80         0.0.0.0:*          LISTEN`
      )
      case 'curl': {
        const url=a.find(x=>!x.startsWith('-'))
        if(!url) return err("curl: try 'curl --help'")
        if(url.includes('localhost')||url.includes('127.0.0.1')) return text('{"status":"ok","message":"Hello from localhost!"}')
        return text(`curl: (6) Could not resolve host: ${url}`,[`[Note: Network access is simulated]`].join(''))
      }
      case 'wget': {
        const url=a.find(x=>!x.startsWith('-'))
        if(!url) return err('wget: missing URL')
        const fname=url.split('/').pop()??'index.html'
        vfs.createFile(vfs.resolve(fname),`[Downloaded from ${url}]`,st.user)
        return text(`--${new Date().toISOString()}--  ${url}`,`Saving to: '${fname}'`,`'${fname}' saved [simulated]`)
      }

      // ── Archive ───────────────────────────────────────────
      case 'tar':    return text(`tar: ${a.join(' ')} (simulated)`)
      case 'gzip':   return text(`gzip: ${a[0]} compressed (simulated)`)
      case 'gunzip': return text(`gunzip: ${a[0]} decompressed (simulated)`)

      // ── Crypto / encode ───────────────────────────────────
      case 'base64': {
        const src=pipeIn??vfs.getNode(vfs.resolve(a.find(x=>!x.startsWith('-'))??''))?.content??''
        if(a.includes('-d')){ try{return single(atob(src.trim()))}catch{return err('base64: invalid input')} }
        return single(btoa(src))
      }
      case 'md5sum': { const s=pipeIn??''; let h=0; for(const c of s)h=Math.imul(31,h)+c.charCodeAt(0)|0; return text((Math.abs(h)>>>0).toString(16).padStart(32,'0')+'  -') }
      case 'sha256sum': { const s=pipeIn??''; let h=0; for(const c of s)h=Math.imul(17,h)+c.charCodeAt(0)|0; return text((Math.abs(h)>>>0).toString(16).padStart(64,'0')+'  -') }
      case 'xxd': {
        const src=pipeIn??vfs.getNode(vfs.resolve(a[0]))?.content??''
        const lines:string[]=[]
        for(let i=0;i<Math.min(src.length,64);i+=16){
          const chunk=src.slice(i,i+16)
          lines.push(`${i.toString(16).padStart(8,'0')}: ${chunk.split('').map(c=>c.charCodeAt(0).toString(16).padStart(2,'0')).join(' ').padEnd(47)}  ${chunk.replace(/[^\x20-\x7e]/g,'.')}`)
        }
        if(src.length>64) lines.push('...')
        return lines.map(l=>out(l))
      }
      case 'strings': {
        const src=vfs.getNode(vfs.resolve(a[0]))?.content??''
        return single(src.replace(/[^\x20-\x7e\n]/g,'').split('\n').filter(l=>l.length>=4).join('\n'))
      }

      // ── Misc ──────────────────────────────────────────────
      case 'seq': {
        const ns=a.map(Number)
        if(ns.length===1) return Array.from({length:ns[0]},(_,i)=>out(String(i+1)))
        if(ns.length===2){ const r:OutputLine[]=[]; for(let i=ns[0];i<=ns[1];i++)r.push(out(String(i))); return r }
        const r:OutputLine[]=[]
        for(let i=ns[0];i<=ns[2];i+=ns[1]) r.push(out(String(+i.toFixed(10))))
        return r
      }
      case 'bc': { try{return text(String(Function('"use strict";return ('+( pipeIn??a.join(' '))+')')())) }catch(e){return err(`bc: ${(e as Error).message}`)}}
      case 'expr': { try{return text(String(Function('"use strict";return ('+a.join(' ')+')')())) }catch(e){return err(`expr: ${(e as Error).message}`)}}
      case 'lsof': return text(`COMMAND  PID  USER FD TYPE DEVICE NODE NAME`,`bash     999  ${st.user} cwd  DIR  8,1   1234 ${st.cwd}`,`bash     999  ${st.user} txt  REG  8,1   5678 /usr/bin/bash`)
      case 'true': case 'false': case 'test': case 'sleep': case 'jobs': return []
      case 'yes': return text('y','y','y','[...Ctrl+C to stop]')

      // ── Package manager ───────────────────────────────────
      case 'apt': {
        const sub=a[0],pkg=a[1]
        if(sub==='install'){
          if(!pkg) return err('apt: no package specified')
          if(st.installedPkgs.includes(pkg)) return text(`${pkg} is already the newest version.`)
          st.installedPkgs.push(pkg); this.saveState()
          return text('Reading package lists... Done','Building dependency tree... Done',`The following NEW packages will be installed:`,`  ${pkg}`,`Setting up ${pkg} ... Done`)
        }
        if(sub==='update') return text('Hit:1 http://archive.ubuntu.com/ubuntu jammy InRelease','All packages are up to date.')
        if(sub==='list') return st.installedPkgs.map(p=>out(`${p}/jammy,now installed`))
        if(sub==='remove'){ st.installedPkgs=st.installedPkgs.filter(p=>p!==pkg); this.saveState(); return text(`Removing ${pkg}... Done`) }
        return err('Usage: apt [install|update|remove|list] [package]')
      }

      // ── Editor ────────────────────────────────────────────
      case 'nano': case 'vim': case 'vi': {
        const f=a.find(x=>!x.startsWith('-'))
        if(!f) return err(`${cmd}: No file name`)
        const rp=vfs.resolve(f)
        const node=vfs.getNode(rp)
        return [{ kind:'openEditor', filename:f, path:rp, content:node?.content??'' }]
      }

      // ── Man ───────────────────────────────────────────────
      case 'man': {
        const topic=a[0]
        return topic ? single(MAN_PAGES[topic]??`No manual entry for ${topic}`) : err('What manual page do you want?')
      }

      // ── Meta / help ───────────────────────────────────────
      case 'help': return [out([
        `Linux Terminal Simulator v2.0 — Available Commands`,``,
        `[FILESYSTEM]  ls cd pwd mkdir rmdir touch cat cp mv rm find tree stat file ln diff chmod chown umask`,
        `[TEXT]        grep wc sort uniq cut head tail less sed awk tr tee xargs diff`,
        `[SHELL]       echo printf export unset env alias unalias history`,
        `[SYSTEM]      ps top kill df du free uname uptime date cal whoami hostname id groups w who last`,
        `[NETWORK]     ping ifconfig ip netstat curl wget`,
        `[ARCHIVE]     tar gzip gunzip base64 md5sum sha256sum xxd strings`,
        `[PACKAGES]    apt install|update|remove|list`,
        `[EDITOR]      nano vim  (Ctrl+X to save+exit)`,
        `[FUN]         fortune cowsay sl cmatrix banner figlet`,
        `[META]        man <cmd>  help  clear  exit`,``,
        `Shell features: pipes (|)  redirect (> >>)  glob (*)  !! (repeat last)  Tab (complete)`,
      ].join('\n'))]

      case 'sudo': {
        if(a[0]==='rm'&&a.includes('-rf')&&(a.includes('/')||a.includes('/*'))) return text('🛡️  Protected! rm -rf / is blocked in this simulator.')
        return text(`[sudo] password for ${st.user}:`,`Sorry, user ${st.user} is not in the sudoers file. This incident will be reported.`)
      }
      case 'su':     return text('Password:','Authentication failure')
      case 'passwd': return text(`Changing password for ${st.user}.`,`passwd: Authentication token manipulation error`)

      // ── Easter eggs ───────────────────────────────────────
      case 'fortune': {
        const q=['In Unix, no one can hear you scream.','To iterate is human, to recurse divine.','There is no place like 127.0.0.1','sudo make me a sandwich.','The shell is your friend. Most of the time.','UNIX is user-friendly. It just chooses its friends carefully.','rm -rf /: an interesting error recovery experience.','grep is the Swiss Army knife of text processing.']
        return text(q[Math.floor(Math.random()*q.length)])
      }
      case 'cowsay': {
        const msg=a.join(' ')||'Moo!'
        return text(` ${'_'.repeat(msg.length+2)}`,`< ${msg} >`,` ${'-'.repeat(msg.length+2)}`,`        \\   ^__^`,`         \\  (oo)\\_______`,`            (__)\\       )\\/\\`,`                ||----w |`,`                ||     ||`)
      }
      case 'banner': case 'figlet': {
        const t=a.join(' ').toUpperCase()
        return text(t.split('').join('  '),'#'.repeat(t.length*3))
      }
      case 'sl': return text(
        `      ====        ________                ___________`,
        `  _D _|  |_______/        \\__I_I_____===__|_______| `,
        `   |(_)---  |   H\\________/ |   |         ||_| |_||`,
        `   /     |  |   H  |  |     |   |         |[___] | `,
        `  |      |  |   H  |__--------------------| [___] |`,
        `  |______|__|___H__/__|_____/[][]~\\_______|       |`
      )
      case 'cmatrix': {
        const ch='ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉ01'.split('')
        const lines=Array.from({length:10},()=>Array.from({length:60},()=>ch[Math.floor(Math.random()*ch.length)]).join(''))
        lines.push('[Press Ctrl+C to exit cmatrix]')
        return lines.map(l=>out(l))
      }

      default:
        if (cmd.startsWith('./') || (cmd.startsWith('/') && !cmd.startsWith('//'))) {
          const p=vfs.resolve(cmd); const node=vfs.getNode(p)
          if(!node) return err(`bash: ${cmd}: No such file or directory`)
          if(node.type==='dir') return err(`bash: ${cmd}: Is a directory`)
          if(!node.perm?.includes('x')) return err(`bash: ${cmd}: Permission denied`)
          return text(`[Executing ${cmd}... simulated]`)
        }
        return err(`bash: ${cmd}: command not found`)
    }
  }

  // ── Helpers ───────────────────────────────────────────────

  private lsLong(name: string, node: FSNode, flags: string): string {
    const sz = node.size ?? 0
    const disp = flags.includes('h') ? this.vfs.fmtSize(sz) : String(sz)
    return `${node.perm??'-rw-r--r--'} 1 ${node.owner??'user'} ${node.owner??'user'} ${disp.padStart(8)} ${node.mtime??this.vfs.nowStr()} ${name}${node.type==='dir'?'/':''}`
  }

  // ── Persistence ───────────────────────────────────────────

  private saveState(): void {
    try {
      localStorage.setItem('shell_state', JSON.stringify({
        cwd: this.state.cwd,
        env: this.state.env,
        aliases: this.state.aliases,
        installedPkgs: this.state.installedPkgs,
      }))
    } catch (_) {}
  }

  private loadState(): void {
    try {
      const s = localStorage.getItem('shell_state')
      if (s) {
        const parsed = JSON.parse(s)
        Object.assign(this.state, parsed)
        this.vfs.cwd = this.state.cwd
      }
    } catch (_) {}
  }
}
