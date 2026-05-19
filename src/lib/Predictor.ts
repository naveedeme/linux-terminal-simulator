// ─────────────────────────────────────────────────────────────
// Predictor.ts  —  Trie-based autocomplete + history suggestions
// ─────────────────────────────────────────────────────────────

// ── Trie Node ────────────────────────────────────────────────

interface TrieNode {
  children: Map<string, TrieNode>
  isEnd: boolean
  frequency: number
}

function makeNode(): TrieNode {
  return { children: new Map(), isEnd: false, frequency: 0 }
}

// ── Trie ─────────────────────────────────────────────────────

class Trie {
  private root: TrieNode = makeNode()

  insert(word: string, freq = 1): void {
    let node = this.root
    for (const ch of word) {
      if (!node.children.has(ch)) node.children.set(ch, makeNode())
      node = node.children.get(ch)!
    }
    node.isEnd = true
    node.frequency += freq
  }

  /** Returns all words with the given prefix, sorted by frequency desc */
  completions(prefix: string, max = 20): string[] {
    let node = this.root
    for (const ch of prefix) {
      if (!node.children.has(ch)) return []
      node = node.children.get(ch)!
    }
    const results: Array<[string, number]> = []
    this.dfs(node, prefix, results)
    return results
      .sort((a, b) => b[1] - a[1])
      .slice(0, max)
      .map(([w]) => w)
  }

  private dfs(node: TrieNode, current: string, out: Array<[string, number]>): void {
    if (node.isEnd) out.push([current, node.frequency])
    for (const [ch, child] of node.children) {
      this.dfs(child, current + ch, out)
    }
  }

  has(word: string): boolean {
    let node = this.root
    for (const ch of word) {
      if (!node.children.has(ch)) return false
      node = node.children.get(ch)!
    }
    return node.isEnd
  }
}

// ── All known commands ───────────────────────────────────────

export const ALL_COMMANDS: readonly string[] = [
  'ls','cd','pwd','cat','echo','mkdir','rmdir','touch','rm','cp','mv',
  'find','tree','head','tail','less','grep','wc','sort','uniq','cut',
  'sed','awk','chmod','chown','umask','ps','top','kill','df','du',
  'free','uname','whoami','hostname','uptime','date','cal','ping',
  'ifconfig','ip','netstat','curl','wget','man','help','clear',
  'history','export','unset','env','alias','unalias','apt','which',
  'whereis','file','stat','ln','tar','gzip','gunzip','diff','nano',
  'vim','vi','exit','logout','sudo','su','passwd','id','groups',
  'w','who','last','jobs','fg','bg','tee','xargs','tr','yes','seq',
  'printf','test','true','false','sleep','expr','bc','base64',
  'md5sum','sha256sum','xxd','strings','lsof','fortune','sl',
  'cmatrix','cowsay','banner','figlet',
]

// ── Predictor class ──────────────────────────────────────────

export class Predictor {
  private cmdTrie = new Trie()
  private historyTrie = new Trie()
  private history: string[] = []

  constructor() {
    // Seed command trie
    for (const cmd of ALL_COMMANDS) this.cmdTrie.insert(cmd, 1)
    // Load history from localStorage
    this.loadHistory()
  }

  // ── History management ──────────────────────────────────────

  addToHistory(command: string): void {
    if (!command.trim()) return
    // Deduplicate consecutive
    if (this.history[this.history.length - 1] === command) return
    this.history.push(command)
    this.historyTrie.insert(command, 10)  // history weighted heavier
    this.saveHistory()
  }

  getHistory(): string[] { return [...this.history] }

  clearHistory(): void {
    this.history = []
    this.historyTrie = new Trie()
    localStorage.removeItem('term_history')
  }

  // ── Suggestion (single best, for ghost text) ─────────────────

  suggest(input: string): string {
    if (!input) return ''
    const parts = input.trim().split(/\s+/)
    const isFirstWord = parts.length === 1 && !input.endsWith(' ')

    if (isFirstWord) {
      // Prefer history, then commands
      const histMatches = this.historyTrie.completions(input, 1)
      if (histMatches.length) return histMatches[0]
      const cmdMatches = this.cmdTrie.completions(input, 1)
      return cmdMatches[0] ?? ''
    }

    // For multi-word, match full history entries
    const histMatches = this.historyTrie.completions(input, 1)
    return histMatches[0] ?? ''
  }

  // ── Tab completions ──────────────────────────────────────────

  commandCompletions(prefix: string): string[] {
    const fromHistory = this.historyTrie.completions(prefix, 5)
      .filter(s => !s.includes(' '))  // single words only for cmd tab
    const fromCmds = this.cmdTrie.completions(prefix, 15)
    // Merge, deduplicate, history first
    return [...new Set([...fromHistory, ...fromCmds])]
  }

  // ── Persistence ──────────────────────────────────────────────

  private saveHistory(): void {
    try {
      localStorage.setItem('term_history', JSON.stringify(this.history.slice(-500)))
    } catch (_) {}
  }

  private loadHistory(): void {
    try {
      const saved = localStorage.getItem('term_history')
      if (saved) {
        this.history = JSON.parse(saved)
        for (const cmd of this.history) this.historyTrie.insert(cmd, 10)
      }
    } catch (_) {}
  }
}
