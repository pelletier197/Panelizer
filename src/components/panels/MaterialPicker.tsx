import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { cssHsl, hexToHsl, hslToHex, type Hsl } from '../../lib/color'
import { FINISHES, finishInfo, isHexColor, variantOf, type Finish } from '../../lib/finishes'
import type { Material } from '../../lib/materials'
import { MenuChoices, MenuLabel } from '../ui/Menu'
import { cx } from '../ui/cx'
import { swatchStyle } from '../ui/swatchStyle'
import { usePhotos } from '../viewport/photos'

/**
 * How a material looks, chosen the way you'd choose it in a shop: a finish,
 * the wood or stone within it, then a colour — a stain over wood, a paint
 * colour, a tone of stone or metal. The colours offered are ones furniture is
 * commonly finished in; any other can be dialled in by hue, saturation and
 * lightness — the way finishes are told apart (a warmer white, a greyer
 * green, a deeper navy) — and recent ones are kept handy.
 */
export function MaterialPicker({
  material,
  onChange,
  recent,
  remember,
}: {
  material: Material
  onChange: (patch: Partial<Material>) => void
  /** Custom colours picked lately, newest first. */
  recent: string[]
  /** Add a custom colour to them. Kept by the caller, which outlives the
   *  picker: the picker hands its colour over as it closes. */
  remember: (color: string) => void
}) {
  const info = finishInfo(material.finish)
  const variant = variantOf(material.finish, material.variant)
  usePhotos() // swatches show the finish photo once it arrives

  const look = (color: string) => ({ color, finish: material.finish, variant: variant?.id })

  const chooseFinish = (finish: Finish) => {
    if (finish === (material.finish ?? 'paint')) return
    // A finish starts out in its own natural colour, as it would come.
    const first = finishInfo(finish).variants[0]
    onChange(
      finish === 'paint'
        ? { finish: undefined, variant: undefined }
        : { finish, variant: first.id, color: first.natural },
    )
  }

  // A custom colour settled on joins the recent ones when the picker closes —
  // not every step of a slider along the way.
  const offered = new Set([...info.palette.map((p) => p.color), ...(variant ? [variant.natural] : [])])
  const settled = useRef({ start: material.color, color: material.color, offered, remember })
  settled.current.color = material.color
  settled.current.offered = offered
  settled.current.remember = remember
  useEffect(
    () => () => {
      const { start, color, offered, remember } = settled.current
      if (color !== start && !offered.has(color.toLowerCase())) remember(color)
    },
    [],
  )

  return (
    <div className="flex w-72 flex-col pb-2">
      <MenuLabel>Finish</MenuLabel>
      <MenuChoices
        options={FINISHES.map((f) => ({ value: f.id, label: f.label }))}
        value={material.finish ?? 'paint'}
        onChange={chooseFinish}
      />

      {info.variants.length > 0 && (
        <>
          <MenuLabel>{info.label}</MenuLabel>
          <div className="mx-3 mb-2 grid grid-cols-3 gap-1">
            {info.variants.map((v) => (
              <button
                key={v.id}
                type="button"
                className={cx(
                  'flex cursor-pointer items-center gap-1.5 rounded border px-1.5 py-1 text-left text-xs',
                  v.id === variant?.id
                    ? 'border-accent bg-accent/15 text-ink'
                    : 'border-edge bg-transparent text-ink-dim hover:border-edge-strong hover:text-ink',
                )}
                onClick={() => onChange({ variant: v.id, color: v.natural })}
              >
                <span
                  className="size-3.5 shrink-0 rounded-xs border border-black/30"
                  style={swatchStyle({ color: v.natural, finish: material.finish, variant: v.id })}
                />
                {v.label}
              </button>
            ))}
          </div>
        </>
      )}

      <MenuLabel>{material.finish && material.finish !== 'paint' ? 'Colour · stain' : 'Colour'}</MenuLabel>
      <div className="mx-3 grid grid-cols-6 gap-1">
        {(variant ? [{ name: `Natural ${variant.label.toLowerCase()}`, color: variant.natural }, ...info.palette] : info.palette).map((s) => (
          <ColorChip
            key={s.color}
            title={s.name}
            selected={material.color.toLowerCase() === s.color}
            style={swatchStyle(look(s.color))}
            onClick={() => onChange({ color: s.color })}
          />
        ))}
      </div>

      <MenuLabel>Custom</MenuLabel>
      <HslPicker color={material.color} preview={swatchStyle(look(material.color))} onChange={(color) => onChange({ color })} />
      <div className="mx-3 mt-2 flex flex-wrap items-center gap-1">
        {recent.map((c) => (
          <ColorChip
            key={c}
            title={c.toUpperCase()}
            selected={material.color.toLowerCase() === c}
            style={swatchStyle(look(c))}
            onClick={() => onChange({ color: c })}
          />
        ))}
      </div>
    </div>
  )
}

function ColorChip({
  title,
  selected,
  style,
  onClick,
}: {
  title: string
  selected: boolean
  style: CSSProperties
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={selected}
      className={cx(
        'aspect-square min-w-7 cursor-pointer rounded-xs border-2',
        selected ? 'border-ink' : 'border-transparent hover:border-edge-strong',
      )}
      style={style}
      onClick={onClick}
    />
  )
}

/**
 * A colour by hue, saturation and lightness: a slider each, its track showing
 * where it leads from the current colour, a hex field, and a preview of the
 * finish in it. Keeps its own hue while a colour is grey, where the hex alone
 * would lose it, so sliding saturation back up returns to the same hue.
 */
function HslPicker({
  color,
  preview,
  onChange,
}: {
  color: string
  preview: CSSProperties
  onChange: (color: string) => void
}) {
  const [hsl, setHsl] = useState<Hsl>(() => hexToHsl(color))
  const [draft, setDraft] = useState(color.toUpperCase())
  // Follow a colour set elsewhere (a palette chip), unless it's the one these
  // sliders just produced.
  useEffect(() => {
    setHsl((current) => (hslToHex(current) === color.toLowerCase() ? current : hexToHsl(color)))
    setDraft(color.toUpperCase())
  }, [color])

  const set = (patch: Partial<Hsl>) => {
    const next = { ...hsl, ...patch }
    setHsl(next)
    onChange(hslToHex(next))
  }

  const sliders: { key: keyof Hsl; label: string; max: number; unit: string; track: string }[] = [
    {
      key: 'h',
      label: 'Hue',
      max: 359,
      unit: '°',
      track: `linear-gradient(to right, ${[0, 60, 120, 180, 240, 300, 360].map((h) => cssHsl({ ...hsl, h, s: Math.max(hsl.s, 35), l: 50 })).join(', ')})`,
    },
    {
      key: 's',
      label: 'Saturation',
      max: 100,
      unit: '%',
      track: `linear-gradient(to right, ${cssHsl({ ...hsl, s: 0 })}, ${cssHsl({ ...hsl, s: 100 })})`,
    },
    {
      key: 'l',
      label: 'Lightness',
      max: 100,
      unit: '%',
      track: `linear-gradient(to right, #000, ${cssHsl({ ...hsl, l: 50 })}, #fff)`,
    },
  ]

  return (
    <div className="mx-3 flex flex-col gap-1.5">
      {sliders.map(({ key, label, max, unit, track }) => (
        <label key={key} className="grid grid-cols-[4.5rem_1fr_2.5rem] items-center gap-2 text-xs text-ink-dim">
          {label}
          <input
            type="range"
            min={0}
            max={max}
            step={1}
            value={Math.round(hsl[key])}
            aria-label={label}
            onChange={(e) => set({ [key]: Number(e.target.value) })}
            className={cx(
              'h-3 w-full cursor-pointer appearance-none rounded-full border border-black/30',
              '[&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full',
              '[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-transparent',
              '[&::-webkit-slider-thumb]:shadow-[0_0_0_1px_rgb(0_0_0/0.6)]',
              '[&::-moz-range-thumb]:size-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2',
              '[&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-transparent',
            )}
            style={{ background: track }}
          />
          <span className="text-right tabular-nums">
            {Math.round(hsl[key])}
            {unit}
          </span>
        </label>
      ))}
      <div className="flex items-center gap-2">
        <span className="h-7 flex-1 rounded-xs border border-black/30" style={preview} aria-hidden />
        <input
          type="text"
          aria-label="Hex colour"
          className="h-7 w-24 rounded border border-edge bg-bg px-2 font-mono text-xs text-ink uppercase focus:border-accent focus:outline-none"
          value={draft}
          maxLength={7}
          onChange={(e) => {
            const value = e.target.value.trim()
            setDraft(value.toUpperCase())
            const hex = (value.startsWith('#') ? value : `#${value}`).toLowerCase()
            if (isHexColor(hex)) onChange(hex)
          }}
          onBlur={() => setDraft(color.toUpperCase())}
        />
      </div>
    </div>
  )
}
