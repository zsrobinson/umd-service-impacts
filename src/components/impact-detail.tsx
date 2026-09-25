import { useState } from "react"
import {
  ArrowLeft,
  CalendarClock,
  ExternalLink,
  FileText,
  Info,
  Link2,
  MapPin,
  Phone,
  User,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import {
  CATEGORIES,
  STATUS,
  attachmentName,
  formatDateTime,
  isImage,
  progress,
  relative,
  statusOf,
} from "@/lib/impacts"
import type { Impact } from "@/types"

interface Props {
  impact: Impact
  now: number
  sourceUrl: string
  onBack: () => void
}

export function ImpactDetail({ impact, now, sourceUrl, onBack }: Props) {
  const status = statusOf(impact, now)
  const { icon: Icon, label: categoryLabel } = CATEGORIES[impact.category]
  const pct = status === "active" ? progress(impact, now) : null
  const [zoomed, setZoomed] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard blocked: the URL bar still has the link */
    }
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-2 px-2 pt-2">
        <Button variant="ghost" size="sm" onClick={onBack} className="text-muted-foreground">
          <ArrowLeft data-icon="inline-start" />
          All notices
        </Button>
        <Button variant="ghost" size="sm" onClick={copyLink} className="text-muted-foreground">
          <Link2 data-icon="inline-start" />
          {copied ? "Copied" : "Copy link"}
        </Button>
      </div>

      <div className="px-4 pt-2 pb-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="gap-1.5">
            <span className="size-2 rounded-full" style={{ background: STATUS[status].color }} />
            {STATUS[status].label}
          </Badge>
          {impact.notice !== "planned" && (
            <Badge variant="destructive" className="capitalize">
              {impact.notice}
            </Badge>
          )}
          <Badge variant="secondary">
            <Icon />
            {categoryLabel}
          </Badge>
        </div>

        <h2 className="mt-3 text-lg leading-snug font-semibold text-balance">{impact.title}</h2>
        <p className="mt-1 flex items-start gap-1.5 text-sm text-muted-foreground">
          <MapPin className="mt-0.5 size-3.5 shrink-0" />
          <span>
            {impact.places.map((p) => p.label).join(" · ")}
            {impact.area && !sameText(impact.area, impact.places) && (
              <span className="text-foreground/80"> — {impact.area}</span>
            )}
          </span>
        </p>

        <div className="mt-4 rounded-lg border bg-muted/30 p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <CalendarClock className="size-3.5" />
            When
          </div>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm tabular-nums">
            <dt className="text-muted-foreground">Starts</dt>
            <dd>
              {formatDateTime(impact.start, now)}
              <span className="text-muted-foreground"> · {relative(impact.start, now)}</span>
            </dd>
            <dt className="text-muted-foreground">Ends</dt>
            <dd>
              {impact.end ? (
                <>
                  {formatDateTime(impact.end, now)}
                  <span className="text-muted-foreground"> · {relative(impact.end, now)}</span>
                </>
              ) : (
                <span className="text-muted-foreground">No end date posted</span>
              )}
            </dd>
          </dl>
          {pct !== null && (
            <div className="mt-3">
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.max(2, pct * 100)}%`, background: STATUS.active.color }}
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{Math.round(pct * 100)}% of the scheduled window has passed</p>
            </div>
          )}
        </div>

        <section className="mt-5">
          <h3 className="text-xs font-medium text-muted-foreground">What's happening</h3>
          <p className="mt-1.5 text-sm leading-relaxed">{impact.description}</p>
          {impact.services.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {impact.services.map((s) => (
                <Badge key={s} variant="outline" className="font-normal">
                  {s}
                </Badge>
              ))}
            </div>
          )}
        </section>

        {impact.attachments.length > 0 && (
          <section className="mt-5">
            <h3 className="text-xs font-medium text-muted-foreground">Notice map</h3>
            <div className="mt-2 flex flex-col gap-2">
              {impact.attachments.map((url) =>
                isImage(url) ? (
                  <button
                    key={url}
                    type="button"
                    onClick={() => setZoomed(url)}
                    className="group overflow-hidden rounded-lg border bg-muted/30 text-left"
                  >
                    <img
                      src={url}
                      alt={`Attached map: ${attachmentName(url)}`}
                      loading="lazy"
                      className="max-h-56 w-full object-cover object-top transition-opacity group-hover:opacity-90"
                    />
                    <span className="block px-3 py-2 text-xs text-muted-foreground">Click to enlarge</span>
                  </button>
                ) : (
                  <Button key={url} variant="outline" asChild className="h-auto justify-start py-2">
                    <a href={url} target="_blank" rel="noreferrer">
                      <FileText data-icon="inline-start" />
                      <span className="truncate">{attachmentName(url)}</span>
                      <ExternalLink className="ml-auto opacity-60" />
                    </a>
                  </Button>
                ),
              )}
            </div>
          </section>
        )}

        {impact.locationNote && (
          <p className="mt-5 flex gap-2 rounded-lg bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
            <Info className="mt-px size-3.5 shrink-0" />
            <span>{impact.locationNote}</span>
          </p>
        )}

        <Separator className="my-5" />

        <section className="grid gap-2 text-sm">
          {impact.contacts.length > 0 && (
            <div className="flex items-center gap-2">
              <User className="size-3.5 text-muted-foreground" />
              <span>{impact.contacts.join(", ")}</span>
            </div>
          )}
          {impact.phone && (
            <div className="flex items-center gap-2">
              <Phone className="size-3.5 text-muted-foreground" />
              <a href={`tel:${impact.phone}`} className="underline-offset-4 hover:underline">
                {impact.phone}
              </a>
            </div>
          )}
          {impact.repairType && (
            <p className="text-xs text-muted-foreground">Listed as: {impact.repairType}</p>
          )}
        </section>

        <div className="mt-5 rounded-lg border p-3 text-xs text-muted-foreground">
          <p className="font-medium text-foreground/80">Original notice</p>
          <p className="mt-1 leading-relaxed">“{impact.sourceTitle}”</p>
          <a
            href={sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-foreground underline-offset-4 hover:underline"
          >
            View on facilities.umd.edu
            <ExternalLink className="size-3" />
          </a>
        </div>
      </div>

      <Dialog open={zoomed !== null} onOpenChange={(o) => !o && setZoomed(null)}>
        <DialogContent className="max-w-[min(96vw,1100px)] sm:max-w-[min(96vw,1100px)] p-2">
          <DialogTitle className="sr-only">Attached map</DialogTitle>
          <DialogDescription className="sr-only">{zoomed && attachmentName(zoomed)}</DialogDescription>
          {zoomed && (
            <a href={zoomed} target="_blank" rel="noreferrer">
              <img src={zoomed} alt={attachmentName(zoomed)} className="max-h-[85vh] w-full rounded-md object-contain" />
            </a>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function sameText(area: string, places: Impact["places"]) {
  const a = area.toLowerCase()
  return places.some((p) => a === p.label.toLowerCase()) || places.length > 3
}
