// ─────────────────────────────────────────────────────────────
// FileSystem.ts  —  Virtual in-memory Linux filesystem
// ─────────────────────────────────────────────────────────────

export type NodeType = 'file' | 'dir' | 'link'

export interface FSNode {
  type: NodeType
  perm: string
  owner: string
  size?: number
  mtime?: string
  content?: string   // files & symlinks
  target?: string    // symlinks
  children?: Record<string, FSNode>  // dirs
}

export type FSTree = Record<string, FSNode>

// ── Helpers ───────────────────────────────────────────────────

function fmt(n: number): string {
  if (n < 1024) return `${n}B`
  if (n < 1048576) return `${(n / 1024).toFixed(1)}K`
  return `${(n / 1048576).toFixed(1)}M`
}

function nowStr(): string {
  const d = new Date()
  const mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]
  return `${mo} ${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

// ── Initial tree ──────────────────────────────────────────────

function makeInitialFS(): FSNode {
  return {
    type: 'dir', perm: 'drwxr-xr-x', owner: 'root',
    children: {
      home: {
        type: 'dir', perm: 'drwxr-xr-x', owner: 'root',
        children: {
          user: {
            type: 'dir', perm: 'drwxr-xr-x', owner: 'user',
            children: {
              'readme.txt': { type:'file', perm:'-rw-r--r--', owner:'user', content:'Welcome to Linux Terminal Simulator!\nType "help" to see available commands.\n\nTips:\n  - Use Tab for autocomplete\n  - Use ↑↓ arrows for command history\n  - Pipes work: ls | grep txt\n  - Redirect: echo hello > file.txt\n  - Try: nano notes.txt', size:200, mtime:'May 10 09:00' },
              'notes.txt': { type:'file', perm:'-rw-r--r--', owner:'user', content:'TODO:\n- Learn bash scripting\n- Practice grep and awk\n- Explore /proc filesystem\n- Try the tree command', size:80, mtime:'May 12 14:22' },
              '.bashrc': { type:'file', perm:'-rw-r--r--', owner:'user', content:'# ~/.bashrc — executed for interactive shells\nexport PS1="\\u@\\h:\\w$ "\nexport PATH=$PATH:/usr/local/bin\nexport EDITOR=nano\nalias ll="ls -la"\nalias la="ls -A"\nalias ..="cd .."\nalias grep="grep --color=auto"', size:190, mtime:'May 1 08:00' },
              '.bash_history': { type:'file', perm:'-rw-------', owner:'user', content:'ls\npwd\ncd /etc\ncat /etc/os-release\nuname -a\nls -la\ngrep root /etc/passwd', size:65, mtime:'May 15 23:10' },
              '.profile': { type:'file', perm:'-rw-r--r--', owner:'user', content:'# ~/.profile: executed by login shells\nif [ -n "$BASH_VERSION" ]; then\n  if [ -f "$HOME/.bashrc" ]; then\n    . "$HOME/.bashrc"\n  fi\nfi', size:130, mtime:'Jan 1 00:00' },
              projects: {
                type:'dir', perm:'drwxr-xr-x', owner:'user',
                children: {
                  'hello.py': { type:'file', perm:'-rw-r--r--', owner:'user', content:'#!/usr/bin/env python3\n"""A simple Hello World script."""\n\ndef main():\n    print("Hello, World!")\n    print("Running from Linux Terminal Simulator")\n\nif __name__ == "__main__":\n    main()', size:150, mtime:'May 8 11:00' },
                  'script.sh': { type:'file', perm:'-rwxr-xr-x', owner:'user', content:'#!/bin/bash\n# A simple demo script\nset -e\n\necho "Running script..."\nfor i in {1..5}; do\n  echo "Step $i of 5"\ndone\necho "Done!"', size:110, mtime:'May 9 15:30' },
                  'data.csv': { type:'file', perm:'-rw-r--r--', owner:'user', content:'name,age,city\nAlice,30,New York\nBob,25,London\nCarol,35,Tokyo\nDave,28,Berlin', size:70, mtime:'May 11 10:00' },
                  'README.md': { type:'file', perm:'-rw-r--r--', owner:'user', content:'# My Projects\n\nA collection of demo scripts.\n\n## Files\n- `hello.py` — Python hello world\n- `script.sh` — Bash demo script\n- `data.csv` — Sample CSV data', size:130, mtime:'May 11 10:05' }
                }
              },
              downloads: { type:'dir', perm:'drwxr-xr-x', owner:'user', children: {} },
              Desktop: { type:'dir', perm:'drwxr-xr-x', owner:'user', children: {} }
            }
          }
        }
      },
      etc: {
        type:'dir', perm:'drwxr-xr-x', owner:'root',
        children: {
          hosts: { type:'file', perm:'-rw-r--r--', owner:'root', content:'127.0.0.1\tlocalhost\n127.0.1.1\tlinux-sim\n::1\t\tlocalhost ip6-localhost ip6-loopback\n\n# Custom entries\n192.168.1.1\trouter.local', size:110, mtime:'Jan 1 00:00' },
          passwd: { type:'file', perm:'-rw-r--r--', owner:'root', content:'root:x:0:0:root:/root:/bin/bash\nuser:x:1000:1000:User,,,:/home/user:/bin/bash\ndaemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin\nwww-data:x:33:33:www-data:/var/www:/usr/sbin/nologin\nnobody:x:65534:65534:nobody:/nonexistent:/usr/sbin/nologin', size:240, mtime:'Jan 1 00:00' },
          shadow: { type:'file', perm:'-rw-r-----', owner:'root', content:'root:!:19000:0:99999:7:::\nuser:$6$rounds=4096$salt$hash:19000:0:99999:7:::', size:80, mtime:'Jan 1 00:00' },
          group: { type:'file', perm:'-rw-r--r--', owner:'root', content:'root:x:0:\nsudo:x:27:user\nadm:x:4:user\nwww-data:x:33:', size:60, mtime:'Jan 1 00:00' },
          fstab: { type:'file', perm:'-rw-r--r--', owner:'root', content:'# /etc/fstab: static file system information.\n# <file system>  <mount point>  <type>  <options>  <dump>  <pass>\n/dev/sda1\t/\text4\terrors=remount-ro\t0 1\n/dev/sda2\tnone\tswap\tsw\t0 0\ntmpfs\t/tmp\ttmpfs\tdefaults,size=512m\t0 0', size:240, mtime:'Jan 1 00:00' },
          'os-release': { type:'file', perm:'-rw-r--r--', owner:'root', content:'NAME="Ubuntu"\nVERSION="22.04.3 LTS (Jammy Jellyfish)"\nID=ubuntu\nID_LIKE=debian\nPRETTY_NAME="Ubuntu 22.04.3 LTS"\nVERSION_ID="22.04"\nHOME_URL="https://www.ubuntu.com/"\nSUPPORT_URL="https://help.ubuntu.com/"\nBUG_REPORT_URL="https://bugs.launchpad.net/ubuntu/"', size:280, mtime:'Jan 1 00:00' },
          hostname: { type:'file', perm:'-rw-r--r--', owner:'root', content:'linux-sim', size:9, mtime:'Jan 1 00:00' },
          'resolv.conf': { type:'file', perm:'-rw-r--r--', owner:'root', content:'# Generated by NetworkManager\nnameserver 8.8.8.8\nnameserver 8.8.4.4\nsearch local', size:75, mtime:'Jan 1 00:00' },
          'ssh': { type:'dir', perm:'drwxr-xr-x', owner:'root', children: {
            'sshd_config': { type:'file', perm:'-rw-r--r--', owner:'root', content:'Port 22\nPermitRootLogin no\nPasswordAuthentication yes\nX11Forwarding yes', size:70, mtime:'Jan 1 00:00' }
          }},
          'cron.d': { type:'dir', perm:'drwxr-xr-x', owner:'root', children: {} },
          'crontab': { type:'file', perm:'-rw-r--r--', owner:'root', content:'# /etc/crontab\nSHELL=/bin/sh\nPATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin\n\n17 * * * * root cd / && run-parts --report /etc/cron.hourly', size:180, mtime:'Jan 1 00:00' }
        }
      },
      var: {
        type:'dir', perm:'drwxr-xr-x', owner:'root',
        children: {
          log: {
            type:'dir', perm:'drwxr-xr-x', owner:'root',
            children: {
              syslog: { type:'file', perm:'-rw-r-----', owner:'syslog', content:'May 16 00:00:01 linux-sim kernel: Linux version 5.15.0-91-generic\nMay 16 00:00:02 linux-sim systemd[1]: Starting Linux Terminal Simulator\nMay 16 00:00:03 linux-sim sshd[420]: Server listening on 0.0.0.0 port 22\nMay 16 00:01:00 linux-sim cron[512]: (CRON) INFO (pidfile fd = 3)\nMay 16 09:00:01 linux-sim CRON[1234]: (root) CMD (  cd / && run-parts /etc/cron.hourly)', size:380, mtime:'May 16 09:00' },
              'auth.log': { type:'file', perm:'-rw-r-----', owner:'syslog', content:'May 16 09:00:01 linux-sim login[1234]: pam_unix(login:session): session opened for user user by (uid=0)\nMay 16 09:00:05 linux-sim sudo[1235]: user : TTY=tty1 ; PWD=/home/user ; USER=root ; COMMAND=/bin/bash', size:220, mtime:'May 16 09:00' },
              'dpkg.log': { type:'file', perm:'-rw-r--r--', owner:'root', content:'2024-01-01 00:00:01 startup packages configure\n2024-01-01 00:00:02 install bash:amd64 <none> 5.2.15-2ubuntu1\n2024-01-01 00:00:03 status installed bash:amd64 5.2.15-2ubuntu1', size:170, mtime:'Jan 1 00:03' }
            }
          },
          tmp: { type:'dir', perm:'drwxrwxrwt', owner:'root', children: {} },
          www: { type:'dir', perm:'drwxr-xr-x', owner:'www-data', children: {
            html: { type:'dir', perm:'drwxr-xr-x', owner:'www-data', children: {
              'index.html': { type:'file', perm:'-rw-r--r--', owner:'www-data', content:'<!DOCTYPE html>\n<html>\n<body>\n<h1>Welcome to nginx!</h1>\n</body>\n</html>', size:80, mtime:'Jan 1 00:00' }
            }}
          }}
        }
      },
      tmp: { type:'dir', perm:'drwxrwxrwt', owner:'root', children: {} },
      usr: {
        type:'dir', perm:'drwxr-xr-x', owner:'root',
        children: {
          bin: {
            type:'dir', perm:'drwxr-xr-x', owner:'root',
            children: {
              bash:    { type:'file', perm:'-rwxr-xr-x', owner:'root', content:'ELF binary', size:1183448, mtime:'Jan 1 00:00' },
              sh:      { type:'file', perm:'-rwxr-xr-x', owner:'root', content:'ELF binary', size:129536,  mtime:'Jan 1 00:00' },
              ls:      { type:'file', perm:'-rwxr-xr-x', owner:'root', content:'ELF binary', size:142088,  mtime:'Jan 1 00:00' },
              grep:    { type:'file', perm:'-rwxr-xr-x', owner:'root', content:'ELF binary', size:219456,  mtime:'Jan 1 00:00' },
              sed:     { type:'file', perm:'-rwxr-xr-x', owner:'root', content:'ELF binary', size:109568,  mtime:'Jan 1 00:00' },
              awk:     { type:'file', perm:'-rwxr-xr-x', owner:'root', content:'ELF binary', size:691200,  mtime:'Jan 1 00:00' },
              python3: { type:'file', perm:'-rwxr-xr-x', owner:'root', content:'ELF binary', size:5632000, mtime:'Jan 1 00:00' },
              nano:    { type:'file', perm:'-rwxr-xr-x', owner:'root', content:'ELF binary', size:266240,  mtime:'Jan 1 00:00' },
              vim:     { type:'file', perm:'-rwxr-xr-x', owner:'root', content:'ELF binary', size:3547136, mtime:'Jan 1 00:00' },
              curl:    { type:'file', perm:'-rwxr-xr-x', owner:'root', content:'ELF binary', size:236864,  mtime:'Jan 1 00:00' },
              wget:    { type:'file', perm:'-rwxr-xr-x', owner:'root', content:'ELF binary', size:516096,  mtime:'Jan 1 00:00' },
              find:    { type:'file', perm:'-rwxr-xr-x', owner:'root', content:'ELF binary', size:338400,  mtime:'Jan 1 00:00' },
              tar:     { type:'file', perm:'-rwxr-xr-x', owner:'root', content:'ELF binary', size:557056,  mtime:'Jan 1 00:00' }
            }
          },
          sbin: { type:'dir', perm:'drwxr-xr-x', owner:'root', children: {
            nginx: { type:'file', perm:'-rwxr-xr-x', owner:'root', content:'ELF binary', size:1248000, mtime:'Jan 1 00:00' }
          }},
          local: {
            type:'dir', perm:'drwxr-xr-x', owner:'root',
            children: {
              bin:  { type:'dir', perm:'drwxr-xr-x', owner:'root', children: {} },
              lib:  { type:'dir', perm:'drwxr-xr-x', owner:'root', children: {} },
              share:{ type:'dir', perm:'drwxr-xr-x', owner:'root', children: {} }
            }
          },
          share: { type:'dir', perm:'drwxr-xr-x', owner:'root', children: {
            man: { type:'dir', perm:'drwxr-xr-x', owner:'root', children: {} },
            doc: { type:'dir', perm:'drwxr-xr-x', owner:'root', children: {} }
          }}
        }
      },
      proc: {
        type:'dir', perm:'dr-xr-xr-x', owner:'root',
        children: {
          version: { type:'file', perm:'-r--r--r--', owner:'root', content:'Linux version 5.15.0-91-generic (buildd@lcy02-amd64-032) (gcc 11.4.0, GNU ld 2.38) #101-Ubuntu SMP Tue Nov 14 13:30:08 UTC 2023', size:125, mtime:'' },
          cpuinfo: { type:'file', perm:'-r--r--r--', owner:'root', content:'processor\t: 0\nvendor_id\t: GenuineIntel\nmodel name\t: Intel(R) Core(TM) i7-9750H CPU @ 2.60GHz\ncpu MHz\t\t: 2600.000\ncache size\t: 12288 KB\nbogomips\t: 5200.00\nflags\t\t: fpu vme de pse tsc msr pae mce cx8 apic', size:200, mtime:'' },
          meminfo: { type:'file', perm:'-r--r--r--', owner:'root', content:'MemTotal:\t    8192000 kB\nMemFree:\t    2048000 kB\nMemAvailable:\t4096000 kB\nBuffers:\t     512000 kB\nCached:\t\t    1024000 kB\nSwapTotal:\t    2097152 kB\nSwapFree:\t    2097152 kB', size:180, mtime:'' },
          uptime: { type:'file', perm:'-r--r--r--', owner:'root', content:'9734.53 38521.23', size:17, mtime:'' },
          loadavg: { type:'file', perm:'-r--r--r--', owner:'root', content:'0.15 0.12 0.10 1/142 1337', size:25, mtime:'' }
        }
      },
      dev: {
        type:'dir', perm:'drwxr-xr-x', owner:'root',
        children: {
          null:     { type:'file', perm:'crw-rw-rw-', owner:'root', content:'', size:0, mtime:'Jan 1' },
          zero:     { type:'file', perm:'crw-rw-rw-', owner:'root', content:'', size:0, mtime:'Jan 1' },
          random:   { type:'file', perm:'crw-rw-rw-', owner:'root', content:'', size:0, mtime:'Jan 1' },
          urandom:  { type:'file', perm:'crw-rw-rw-', owner:'root', content:'', size:0, mtime:'Jan 1' },
          'sda':    { type:'file', perm:'brw-rw----', owner:'root', content:'', size:0, mtime:'Jan 1' },
          'sda1':   { type:'file', perm:'brw-rw----', owner:'root', content:'', size:0, mtime:'Jan 1' },
          'tty':    { type:'file', perm:'crw-rw-rw-', owner:'root', content:'', size:0, mtime:'Jan 1' },
          'pts':    { type:'dir', perm:'drwxr-xr-x', owner:'root', children: {
            '0': { type:'file', perm:'crw--w----', owner:'user', content:'', size:0, mtime:'Jan 1' }
          }}
        }
      },
      bin:   { type:'dir', perm:'drwxr-xr-x', owner:'root', children: {} },
      sbin:  { type:'dir', perm:'drwxr-xr-x', owner:'root', children: {} },
      lib:   { type:'dir', perm:'drwxr-xr-x', owner:'root', children: {} },
      lib64: { type:'dir', perm:'drwxr-xr-x', owner:'root', children: {} },
      root:  { type:'dir', perm:'drwx------', owner:'root', children: {
        '.bashrc': { type:'file', perm:'-rw-r--r--', owner:'root', content:'# root bashrc\nexport PS1="\\u@\\h:\\w# "\nalias ls="ls --color=auto"', size:60, mtime:'Jan 1 00:00' }
      }},
      boot: { type:'dir', perm:'drwxr-xr-x', owner:'root', children: {
        'vmlinuz-5.15.0-91-generic': { type:'file', perm:'-rw-r--r--', owner:'root', content:'kernel image', size:9462272, mtime:'Nov 14 2023' },
        'initrd.img-5.15.0-91-generic': { type:'file', perm:'-rw-r--r--', owner:'root', content:'initial ramdisk', size:52428800, mtime:'Nov 14 2023' },
        grub: { type:'dir', perm:'drwxr-xr-x', owner:'root', children: {
          'grub.cfg': { type:'file', perm:'-r--r--r--', owner:'root', content:'# GRUB configuration\nset default=0\nset timeout=5\n\nmenuentry "Ubuntu 22.04.3 LTS" {\n  linux /boot/vmlinuz root=/dev/sda1\n  initrd /boot/initrd.img\n}', size:150, mtime:'Nov 14 2023' }
        }}
      }},
      opt:   { type:'dir', perm:'drwxr-xr-x', owner:'root', children: {} },
      mnt:   { type:'dir', perm:'drwxr-xr-x', owner:'root', children: {} },
      media: { type:'dir', perm:'drwxr-xr-x', owner:'root', children: {} },
      srv:   { type:'dir', perm:'drwxr-xr-x', owner:'root', children: {} },
      run:   { type:'dir', perm:'drwxr-xr-x', owner:'root', children: {
        'sshd.pid': { type:'file', perm:'-rw-r--r--', owner:'root', content:'420', size:3, mtime:'May 16 00:00' }
      }}
    }
  }
}

// ── VirtualFileSystem class ───────────────────────────────────

export class VirtualFileSystem {
  private root: FSNode
  private homeDir: string
  public cwd: string

  constructor(homeDir = '/home/user') {
    this.root = makeInitialFS()
    this.homeDir = homeDir
    this.cwd = homeDir
    this.loadFromStorage()
  }

  // ── Path resolution ─────────────────────────────────────────

  resolve(p: string): string {
    if (!p || p === '~') return this.homeDir
    if (p.startsWith('~/')) p = this.homeDir + p.slice(1)
    if (p === '-') return this.cwd  // handled externally
    if (!p.startsWith('/')) p = this.cwd + '/' + p
    const parts = p.split('/').filter(Boolean)
    const stack: string[] = []
    for (const part of parts) {
      if (part === '..') stack.pop()
      else if (part !== '.') stack.push(part)
    }
    return '/' + stack.join('/')
  }

  // ── Node access ─────────────────────────────────────────────

  getNode(path: string): FSNode | null {
    if (path === '/') return this.root
    const parts = path.split('/').filter(Boolean)
    let node: FSNode = this.root
    for (const part of parts) {
      if (node.type !== 'dir' || !node.children?.[part]) return null
      node = node.children[part]
    }
    return node
  }

  getParentAndName(path: string): { parent: FSNode | null; name: string } {
    const parts = path.split('/').filter(Boolean)
    const name = parts.pop() ?? ''
    const parentPath = '/' + parts.join('/')
    return { parent: this.getNode(parentPath || '/'), name }
  }

  // ── Mutations ───────────────────────────────────────────────

  createFile(path: string, content = '', owner = 'user'): boolean {
    const { parent, name } = this.getParentAndName(path)
    if (!parent || parent.type !== 'dir') return false
    parent.children![name] = { type:'file', perm:'-rw-r--r--', owner, content, size: content.length, mtime: nowStr() }
    this.saveToStorage()
    return true
  }

  createDir(path: string, owner = 'user'): boolean {
    const { parent, name } = this.getParentAndName(path)
    if (!parent || parent.type !== 'dir') return false
    parent.children![name] = { type:'dir', perm:'drwxr-xr-x', owner, children: {} }
    this.saveToStorage()
    return true
  }

  delete(path: string): boolean {
    const { parent, name } = this.getParentAndName(path)
    if (!parent?.children?.[name]) return false
    delete parent.children![name]
    this.saveToStorage()
    return true
  }

  writeFile(path: string, content: string): boolean {
    const node = this.getNode(path)
    if (node?.type === 'file') {
      node.content = content
      node.size = content.length
      node.mtime = nowStr()
      this.saveToStorage()
      return true
    }
    return this.createFile(path, content)
  }

  appendFile(path: string, content: string): boolean {
    const node = this.getNode(path)
    if (node?.type === 'file') {
      node.content = (node.content ?? '') + content
      node.size = (node.content ?? '').length
      node.mtime = nowStr()
      this.saveToStorage()
      return true
    }
    return this.createFile(path, content)
  }

  // ── Directory listing ───────────────────────────────────────

  listDir(path: string, showHidden = false): Array<[string, FSNode]> {
    const node = this.getNode(path)
    if (!node || node.type !== 'dir') return []
    return Object.entries(node.children ?? {})
      .filter(([name]) => showHidden || !name.startsWith('.'))
      .sort(([a], [b]) => a.localeCompare(b))
  }

  // ── Glob expansion ──────────────────────────────────────────

  glob(pattern: string): string[] {
    if (!pattern.includes('*') && !pattern.includes('?')) return [pattern]
    const resolved = this.resolve(pattern)
    const lastSlash = resolved.lastIndexOf('/')
    const dir = lastSlash === 0 ? '/' : resolved.slice(0, lastSlash)
    const pat = resolved.slice(lastSlash + 1)
    const node = this.getNode(dir)
    if (!node || node.type !== 'dir') return [pattern]
    const re = new RegExp('^' + pat.replace(/\*/g, '.*').replace(/\?/g, '.') + '$')
    const matches = Object.keys(node.children ?? {})
      .filter(n => re.test(n))
      .map(n => (dir === '/' ? '/' : dir + '/') + n)
    return matches.length ? matches : [pattern]
  }

  // ── Tree walk ───────────────────────────────────────────────

  walk(path: string, cb: (p: string, node: FSNode) => void): void {
    const node = this.getNode(path)
    if (!node) return
    cb(path, node)
    if (node.type === 'dir') {
      for (const [name, child] of Object.entries(node.children ?? {})) {
        this.walk((path === '/' ? '' : path) + '/' + name, cb)
      }
    }
  }

  // ── Formatting helpers ──────────────────────────────────────

  fmtSize(n: number): string { return fmt(n) }
  nowStr(): string { return nowStr() }

  promptDisplay(currentCwd: string): string {
    return currentCwd.startsWith(this.homeDir)
      ? '~' + currentCwd.slice(this.homeDir.length)
      : currentCwd
  }

  // ── Persistence ─────────────────────────────────────────────

  private saveToStorage(): void {
    try {
      localStorage.setItem('vfs_tree', JSON.stringify(this.root))
    } catch (_) { /* quota exceeded — ignore */ }
  }

  private loadFromStorage(): void {
    try {
      const saved = localStorage.getItem('vfs_tree')
      if (saved) this.root = JSON.parse(saved)
    } catch (_) { /* corrupt data — use defaults */ }
  }

  resetToDefault(): void {
    this.root = makeInitialFS()
    localStorage.removeItem('vfs_tree')
  }
}
