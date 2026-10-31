import type { CSSProperties } from 'react'
import { FINISHES, finishInfo, isHexColor, variantOf, type Finish } from '../../lib/finishes'
import type { Material } from '../../lib/materials'
import { usePersistentState } from '../../hooks/usePersistentState'
import { MenuChoices, MenuLabel } from '../ui/Menu'
import { cx } from '../ui/cx'
import { swatchStyle } from '../ui/swatchStyle'
import { usePhotos } from '../viewport/photos'

/** Custom colours picked lately, offered again; a UI preference, not part of
 *  any design. */
const RECENT_KEY = 'panelizer.ui.recentColors'
const RECENT_MAX = 8
const reviveRecent = (stored: unknown): string[] | null =>
  Array.isArray(stored) ? stored.filter(isHexColor).slice(0, RECENT_MAX) : null

/**
 * How a material looks, chosen the way you'd choose it in a shop: a finish,
 * the wood or stone within it, then a colour — a stain over wood, a paint
 * colour, a tone of stone or metal. The colours offered are ones furniture is
 * commonly finished in; any other can be picked too, and recent ones are
 * kept handy.
 */
export function MaterialPicker({
  material,
  onChange,
}: {
  material: Material
  onChange: (patch: Partial<Material>) => void
}) {
  const info = finishInfo(material.finish)
  const variant = variantOf(material.finish, material.variant)
  const [recent, setRecent] = usePersistentState<string[]>(RECENT_KEY, [], reviveRecent)
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

  const pickCustom = (color: string) => {
    onChange({ color })
    setRecent((list) => [color, ...list.filter((c) => c !== color)].slice(0, RECENT_MAX))
  }

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
      <div className="mx-3 flex flex-wrap items-center gap-1">
        <label
          className="relative flex h-7 cursor-pointer items-center gap-1.5 rounded border border-edge px-2 text-xs text-ink-dim hover:border-edge-strong hover:text-ink"
          title="Pick any colour"
        >
          <span className="size-3.5 rounded-xs border border-black/30" style={{ background: material.color }} />
          {material.color.toUpperCase()}
          <input
            type="color"
            className="absolute inset-0 cursor-pointer opacity-0"
            value={material.color}
            // The native picker fires as the colour is dragged; keep the last.
            onChange={(e) => onChange({ color: e.target.value })}
            onBlur={(e) => pickCustom(e.target.value)}
          />
        </label>
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
