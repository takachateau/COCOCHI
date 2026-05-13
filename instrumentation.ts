// Claude Code ローカル開発環境では ANTHROPIC_API_KEY が空文字に上書きされる。
// 専用のフォールバックキーから復元する。
export async function register() {
  const key = process.env.COCOCHI_ANTHROPIC_API_KEY
  if (key && !process.env.ANTHROPIC_API_KEY) {
    process.env.ANTHROPIC_API_KEY = key
  }
}
