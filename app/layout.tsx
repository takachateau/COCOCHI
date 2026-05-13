import type { Metadata } from "next"
import { PostsProvider } from "@/context/posts"
import { ProductsProvider } from "@/context/products"
import { LanguageProvider } from "@/context/language"
import "./globals.css"

export const metadata: Metadata = {
  title: "COCOCHI — UGC投稿管理",
  description: "化粧品ブランド向けUGC風カルーセル投稿 自動生成ツール",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <LanguageProvider>
          <ProductsProvider>
            <PostsProvider>{children}</PostsProvider>
          </ProductsProvider>
        </LanguageProvider>
      </body>
    </html>
  )
}
