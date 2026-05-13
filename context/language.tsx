"use client"

import { createContext, useContext, useState, useEffect } from "react"

export type Lang = "ja" | "zh"

interface LangCtx { lang: Lang; toggle: () => void }
const LanguageContext = createContext<LangCtx>({ lang: "ja", toggle: () => {} })

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang>("ja")

  useEffect(() => {
    const saved = localStorage.getItem("cocochi_lang") as Lang | null
    if (saved === "ja" || saved === "zh") setLang(saved)
  }, [])

  function toggle() {
    setLang(prev => {
      const next = prev === "ja" ? "zh" : "ja"
      localStorage.setItem("cocochi_lang", next)
      return next
    })
  }

  return (
    <LanguageContext.Provider value={{ lang, toggle }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() { return useContext(LanguageContext) }
