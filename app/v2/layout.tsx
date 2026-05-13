import Link from "next/link"
import { Sparkles } from "lucide-react"

const NAV = [
  { href: "/v2/benchmark",   label: "ベンチマーク" },
  { href: "/v2/competitors", label: "競合商品" },
  { href: "/v2/personas",    label: "ペルソナ" },
  { href: "/v2/plan",        label: "投稿プラン", accent: true },
]

const VERSIONS = [
  { label: "V1", href: "/" },
  { label: "V2", href: "/v2/plan" },
  { label: "V3", href: "/v3/plan" },
]
const CURRENT = "V2"

export default function V2Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <header style={{ background: "var(--card)", borderBottom: "1px solid var(--border)" }}>
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-6">
          <div className="flex items-center gap-2 flex-shrink-0">
            <div
              className="w-7 h-7 rounded-md flex items-center justify-center"
              style={{ background: "var(--accent)" }}
            >
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-sm" style={{ color: "var(--text)" }}>COCOCHI</span>
          </div>

          <nav className="flex items-center gap-1 flex-1">
            {NAV.map(n => (
              <Link
                key={n.href}
                href={n.href}
                className="px-3 py-1.5 rounded-lg text-sm font-medium transition-opacity hover:opacity-80"
                style={
                  n.accent
                    ? { background: "var(--accent-light)", color: "var(--accent)", fontWeight: 700 }
                    : { color: "var(--text)" }
                }
              >
                {n.label}
              </Link>
            ))}
          </nav>

          <div className="flex rounded-lg overflow-hidden flex-shrink-0" style={{ border: "1px solid var(--border)" }}>
            {VERSIONS.map((v, i) => (
              <Link
                key={v.label}
                href={v.href}
                className="px-3 py-1.5 text-xs font-bold transition-opacity hover:opacity-80"
                style={{
                  background: v.label === CURRENT ? "var(--accent)" : "var(--card)",
                  color:      v.label === CURRENT ? "white" : "var(--text)",
                  borderLeft: i > 0 ? "1px solid var(--border)" : "none",
                }}
              >
                {v.label}
              </Link>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-screen-xl mx-auto px-4 sm:px-6 py-8">
        {children}
      </main>
    </div>
  )
}
