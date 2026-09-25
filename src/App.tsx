import { useCallback, useEffect, useMemo, useState } from "react"
import { Crosshair, Moon, Search, Sun, X } from "lucide-react"

import { ImpactDetail } from "@/components/impact-detail"
import { ImpactList } from "@/components/impact-list"
import { ImpactMap } from "@/components/impact-map"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useMediaQuery } from "@/hooks/use-media-query"
import { useTheme } from "@/hooks/use-theme"
import { CATEGORIES, STATUS, compareImpacts, formatDateTime, statusOf } from "@/lib/impacts"
import { cn } from "@/lib/utils"
import type { Category, ImpactData, ImpactFile } from "@/types"

type View = "now" | "upcoming" | "all"
const STALE_AFTER = 36 * 36e5

export default function App() {
  const [data, setData] = useState<ImpactData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [view, setView] = useState<View>("now")
  const [categories, setCategories] = useState<string[]>([])
  const [query, setQuery] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(() => decodeURIComponent(location.hash.slice(1)) || null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [resetSignal, setResetSignal] = useState(0)
  const { theme, toggle } = useTheme()
  const desktop = useMediaQuery("(min-width: 768px)")

  useEffect(() => {
    fetch("/data/impacts.json", { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((file: ImpactFile) =>
        setData({
          ...file,
          impacts: file.impacts.map((i) => ({
            ...i,
            places: i.places.map((p) => ({ ...p, geometry: p.geometry ?? file.geometries[p.id!] })),
          })),
        }),
      )
      .catch((e) => setError(String(e)))
  }, [])

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])

  const select = useCallback((id: string | null) => {
    setSelectedId(id)
    history.replaceState(null, "", id ? `#${encodeURIComponent(id)}` : location.pathname + location.search)
    if (id) setSheetOpen(false)
  }, [])

  useEffect(() => {
    const onHash = () => setSelectedId(decodeURIComponent(location.hash.slice(1)) || null)
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && select(null)
    window.addEventListener("hashchange", onHash)
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("hashchange", onHash)
      window.removeEventListener("keydown", onKey)
    }
  }, [select])

  const all = useMemo(() => data?.impacts ?? [], [data])
  const counts = useMemo(() => {
    const c = { now: 0, upcoming: 0, all: all.length }
    for (const i of all) {
      const s = statusOf(i, now)
      if (s === "active") c.now++
      if (s === "upcoming") c.upcoming++
    }
    return c
  }, [all, now])

  const inView = useMemo(
    () =>
      all.filter((i) => {
        const s = statusOf(i, now)
        return view === "all" || (view === "now" ? s === "active" : s === "upcoming")
      }),
    [all, now, view],
  )
  const presentCategories = useMemo(
    () => (Object.keys(CATEGORIES) as Category[]).filter((c) => inView.some((i) => i.category === c)),
    [inView],
  )

  const visible = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    return inView
      .filter((i) => !categories.length || categories.includes(i.category))
      .filter((i) => {
        if (!words.length) return true
        const hay = [i.title, i.sourceTitle, i.area, i.description, i.repairType, ...i.services, ...i.places.map((p) => p.label)]
          .join(" ")
          .toLowerCase()
        return words.every((w) => hay.includes(w))
      })
      .sort((a, b) => compareImpacts(a, b, now))
  }, [inView, categories, query, now])

  const selected = all.find((i) => i.id === selectedId) ?? null
  // A linked notice stays on the map even when the filters would hide it.
  const onMap = useMemo(
    () => (selected && !visible.includes(selected) ? [...visible, selected] : visible),
    [selected, visible],
  )

  const stale = data && now - Date.parse(data.fetchedAt) > STALE_AFTER

  const emptyText =
    query || categories.length
      ? "Nothing matches these filters."
      : view === "now"
        ? "No service impacts are in effect right now."
        : view === "upcoming"
          ? "Nothing scheduled yet."
          : "No notices posted."

  const panel = selected ? (
    <ImpactDetail impact={selected} now={now} sourceUrl={data!.source} onBack={() => select(null)} />
  ) : (
    <ImpactList impacts={visible} now={now} selectedId={selectedId} onSelect={select} emptyText={emptyText} />
  )

  const controls = (
    <div className="flex flex-col gap-3 px-4 pb-3">
      <Tabs value={view} onValueChange={(v) => setView(v as View)}>
        <TabsList variant="line" className="h-10 w-full justify-start gap-4 border-b p-0">
          {(
            [
              ["now", "In effect", counts.now],
              ["upcoming", "Upcoming", counts.upcoming],
              ["all", "All", counts.all],
            ] as const
          ).map(([value, label, n]) => (
            <TabsTrigger
              key={value}
              value={value}
              className="flex-none px-0 font-condensed text-[15px] font-semibold tracking-[0.04em] uppercase after:bg-primary group-data-horizontal/tabs:after:bottom-[-1px] group-data-horizontal/tabs:after:h-[3px]"
            >
              {label} <Count n={n} />
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search buildings, services…"
          className="pr-8 pl-8"
          aria-label="Search notices"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
      {presentCategories.length > 1 && (
        <ToggleGroup
          type="multiple"
          value={categories}
          onValueChange={setCategories}
          variant="outline"
          size="sm"
          spacing={1}
          className={cn(
            "justify-start",
            desktop ? "flex-wrap" : "-mx-4 w-auto max-w-none flex-nowrap overflow-x-auto px-4 [scrollbar-width:none]",
          )}
          aria-label="Filter by type"
        >
          {presentCategories.map((c) => {
            const { icon: Icon, label } = CATEGORIES[c]
            return (
              <ToggleGroupItem
                key={c}
                value={c}
                className="h-7 gap-1 px-2 text-[13px] data-[state=on]:border-foreground data-[state=on]:bg-foreground data-[state=on]:text-background"
                aria-label={label}
              >
                <Icon className="size-3.5" />
                {label}
              </ToggleGroupItem>
            )
          })}
        </ToggleGroup>
      )}
    </div>
  )

  const header = (
    <header className="bg-black text-white">
      <div className="flex items-center justify-between gap-3 bg-umd-red px-4 py-1.5 font-condensed text-[13px] font-semibold tracking-[0.05em] uppercase">
        <span className="whitespace-nowrap">
          Unofficial<span className="max-[380px]:hidden"> community map</span>
        </span>
        {desktop ? (
          <span className="text-white/85">College Park campus</span>
        ) : (
          data && (
            <span className={cn("whitespace-nowrap", stale ? "text-umd-gold" : "text-white/85")}>
              Checked {formatDateTime(data.fetchedAt, now)}
            </span>
          )
        )}
      </div>
      <div className={cn("flex items-start justify-between gap-3 px-4", desktop ? "pt-4 pb-4" : "py-2.5")}>
        <div className="min-w-0">
          <h1
            className={cn(
              // the Design System's campaign headline: Barlow Condensed bold italic, 0.02em
              "font-condensed leading-[0.91] font-bold tracking-[0.02em] uppercase italic",
              desktop ? "text-[34px]" : "pt-1 text-[26px]",
            )}
          >
            UMD Service Impacts
          </h1>
          {desktop && <div className="mt-2.5 h-[3px] w-12 bg-umd-gold" aria-hidden />}
          <p className={cn("mt-2.5 text-[13px] leading-snug text-white/70", !desktop && "hidden")}>
            Outages, closures and elevator work posted by Facilities Management
            {data && (
              <>
                {" · "}
                <span className={cn(stale ? "font-semibold text-umd-gold" : "text-white/90")}>
                  {stale ? "Last checked" : "Checked"} {formatDateTime(data.fetchedAt, now)}
                </span>
              </>
            )}
          </p>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={toggle}
              aria-label="Toggle dark mode"
              className="text-white/80 hover:bg-white/10 hover:text-white dark:hover:bg-white/10"
            >
              {theme === "dark" ? <Sun /> : <Moon />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{theme === "dark" ? "Light mode" : "Dark mode"}</TooltipContent>
        </Tooltip>
      </div>
    </header>
  )

  const footer = (
    <footer className="bg-black px-4 py-3 text-xs leading-relaxed text-white/65">
      Not affiliated with the University of Maryland. Parsed daily from{" "}
      <a
        href={data?.source}
        target="_blank"
        rel="noreferrer"
        className="text-white underline decoration-umd-gold underline-offset-2 hover:decoration-2"
      >
        Facilities Management's notices
      </a>
      ; locations are best-effort. Map © OpenStreetMap, CARTO.{" "}
      <a
        href="https://github.com/zsrobinson/umd-service-impacts"
        target="_blank"
        rel="noreferrer"
        className="text-white underline decoration-white/40 underline-offset-2 hover:decoration-white"
      >
        Source
      </a>
    </footer>
  )

  const loadingOrError = error ? (
    <p className="p-4 text-sm text-destructive">Couldn't load the notices ({error}).</p>
  ) : (
    <p className="p-4 text-sm text-muted-foreground">Loading notices…</p>
  )

  // Phone bottom sheet: a peek height and a tall one; a selected notice opens at mid height.
  const sheetVh = sheetOpen ? 88 : selected ? 52 : 46
  const insets = useMemo(
    () => (desktop ? undefined : { top: 0, bottom: (window.innerHeight * sheetVh) / 100, left: 0, right: 0 }),
    [desktop, sheetVh],
  )

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-dvh w-full overflow-hidden bg-background text-foreground">
        {desktop && (
          <aside className="z-10 flex w-[400px] shrink-0 flex-col border-r bg-background">
            {header}
            {!selected && <div className="pt-1">{controls}</div>}
            <div className="min-h-0 flex-1 border-t">
              <ScrollArea className="h-full">{data ? panel : loadingOrError}</ScrollArea>
            </div>
            {footer}
          </aside>
        )}

        <main className="relative min-w-0 flex-1">
          <ImpactMap
            impacts={onMap}
            now={now}
            selectedId={selectedId}
            onSelect={select}
            theme={theme}
            resetSignal={resetSignal}
            insets={insets}
          />
          <Legend className={desktop ? "bottom-8 left-3" : "top-3 left-3"} />
          <Button
            variant="outline"
            size="icon-sm"
            className="absolute top-[118px] right-2.5 z-10 bg-background shadow-sm"
            onClick={() => setResetSignal((n) => n + 1)}
            aria-label="Back to campus"
            title="Back to campus"
          >
            <Crosshair />
          </Button>
        </main>

        {!desktop && (
          <section
            className="fixed inset-x-0 bottom-0 z-20 flex flex-col overflow-hidden border-t bg-background shadow-[0_-8px_30px_rgba(0,0,0,0.18)] transition-[height] duration-300 ease-out"
            style={{ height: `${sheetVh}dvh` }}
          >
            <button
              type="button"
              onClick={() => setSheetOpen((o) => !o)}
              className={cn("flex w-full shrink-0 justify-center pt-2 pb-1", !selected && "bg-umd-red")}
              aria-label={sheetOpen ? "Collapse panel" : "Expand panel"}
            >
              <span className={cn("h-1.5 w-10 rounded-full", selected ? "bg-muted-foreground/30" : "bg-white/60")} />
            </button>
            {!selected && header}
            {!selected && <div className="pt-1">{controls}</div>}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t">
              {data ? panel : loadingOrError}
              {footer}
            </div>
          </section>
        )}
      </div>
    </TooltipProvider>
  )
}

function Count({ n }: { n: number }) {
  return <span className="ml-1 font-sans text-xs font-semibold text-muted-foreground tabular-nums">{n}</span>
}

function Legend({ className }: { className?: string }) {
  const items = [
    ["In effect", STATUS.active.color],
    ["Upcoming", STATUS.upcoming.color],
    ["Ended", STATUS.ended.color],
  ] as const
  return (
    <div
      className={cn(
        "pointer-events-none absolute z-10 flex flex-col gap-1 rounded-sm border bg-background/95 px-2.5 py-2 font-condensed text-[13px] font-semibold tracking-[0.04em] text-foreground/85 uppercase shadow-sm",
        className,
      )}
    >
      {items.map(([label, color]) => (
        <span key={label} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full ring-1 ring-black/40" style={{ background: color }} />
          {label}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <svg width="10" height="4" aria-hidden>
          <line x1="0" y1="2" x2="10" y2="2" stroke="currentColor" strokeWidth="2" strokeDasharray="3 2" />
        </svg>
        Approximate
      </span>
    </div>
  )
}
