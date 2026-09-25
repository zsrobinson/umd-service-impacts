import { useCallback, useEffect, useState } from "react"

import { useMediaQuery } from "@/hooks/use-media-query"

type Theme = "light" | "dark"
const KEY = "theme"

function stored(): Theme | null {
  try {
    const v = localStorage.getItem(KEY)
    return v === "light" || v === "dark" ? v : null
  } catch {
    return null
  }
}

/** Follows the system until the reader picks one; the pick is remembered. */
export function useTheme() {
  const systemDark = useMediaQuery("(prefers-color-scheme: dark)")
  const [choice, setChoice] = useState<Theme | null>(stored)
  const theme: Theme = choice ?? (systemDark ? "dark" : "light")

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark")
    document.documentElement.style.colorScheme = theme
  }, [theme])

  const toggle = useCallback(() => {
    const next: Theme = theme === "dark" ? "light" : "dark"
    setChoice(next)
    try {
      localStorage.setItem(KEY, next)
    } catch {
      /* private mode: the choice lasts for this visit */
    }
  }, [theme])

  return { theme, toggle }
}
