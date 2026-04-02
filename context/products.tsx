"use client"

import { createContext, useContext, useState, useEffect } from "react"
import type { Product } from "@/types"

interface ProductsCtx {
  products: Product[]
  loading: boolean
  addProduct: (p: Product) => void
  updateProduct: (p: Product) => void
  removeProduct: (id: string) => Promise<void>
  reload: () => Promise<void>
}

const Ctx = createContext<ProductsCtx>({
  products: [],
  loading: true,
  addProduct: () => {},
  updateProduct: () => {},
  removeProduct: async () => {},
  reload: async () => {},
})

export function ProductsProvider({ children }: { children: React.ReactNode }) {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const data: Product[] = await fetch("/api/products").then(r => r.json())
      setProducts(data)
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function addProduct(p: Product) {
    setProducts(prev => [p, ...prev])
  }

  function updateProduct(p: Product) {
    setProducts(prev => prev.map(x => x.id === p.id ? p : x))
  }

  async function removeProduct(id: string) {
    await fetch(`/api/products/${id}`, { method: "DELETE" })
    setProducts(prev => prev.filter(p => p.id !== id))
  }

  return (
    <Ctx.Provider value={{ products, loading, addProduct, updateProduct, removeProduct, reload: load }}>
      {children}
    </Ctx.Provider>
  )
}

export const useProducts = () => useContext(Ctx)
