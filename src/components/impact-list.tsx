import { AlertTriangle } from "lucide-react"

import { cn } from "@/lib/utils"
import { CATEGORIES, STATUS, placeSummary, statusOf, timingSummary } from "@/lib/impacts"
import type { Impact } from "@/types"

interface Props {
  impacts: Impact[]
  now: number
  selectedId: string | null
  onSelect: (id: string) => void
  emptyText: string
}

export function ImpactList({ impacts, now, selectedId, onSelect, emptyText }: Props) {
  if (!impacts.length) {
    return <p className="px-4 py-10 text-center text-sm text-muted-foreground">{emptyText}</p>
  }
  return (
    <ul className="flex flex-col gap-px p-2">
      {impacts.map((impact) => {
        const status = statusOf(impact, now)
        const { icon: Icon, label } = CATEGORIES[impact.category]
        const urgent = impact.notice !== "planned" && status === "active"
        return (
          <li key={impact.id}>
            <button
              type="button"
              onClick={() => onSelect(impact.id)}
              className={cn(
                "group flex w-full gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors hover:bg-muted/70 focus-visible:bg-muted focus-visible:outline-none",
                selectedId === impact.id && "bg-muted",
                (status === "ended" || status === "resolved") && "opacity-60",
              )}
            >
              <span
                className="relative mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground"
                title={label}
              >
                <Icon className="size-4" />
                <span
                  className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-background"
                  style={{ background: STATUS[status].color }}
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-start gap-1.5">
                  <span className="line-clamp-2 text-sm leading-snug font-medium">{impact.title}</span>
                  {urgent && (
                    <AlertTriangle
                      className="mt-0.5 size-3.5 shrink-0 text-destructive"
                      aria-label={impact.notice === "emergency" ? "Emergency" : "Unplanned"}
                    />
                  )}
                </span>
                <span className="mt-0.5 block truncate text-[13px] text-foreground/75">{placeSummary(impact)}</span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground tabular-nums">
                  {timingSummary(impact, now)}
                </span>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
