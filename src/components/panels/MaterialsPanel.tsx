import { useDesignStore } from '../../store/designStore'
import { Menu } from '../ui/Menu'
import { Button } from '../ui/Button'
import { CONTROL } from '../ui/Field'
import { Section } from '../ui/Panel'
import { finishInfo, variantOf } from '../../lib/finishes'
import { MaterialPicker } from './MaterialPicker'
import { swatchStyle } from '../ui/swatchStyle'
import { usePhotos } from '../viewport/photos'

/** Editor for the design's material list. A material is a name and a look —
 *  a finish and a colour; thickness is set per panel. Each material is one
 *  compact row: its swatch (opening the picker), the name, and a remove
 *  button. */
export function MaterialsPanel() {
  const materials = useDesignStore((s) => s.materials)
  const addMaterial = useDesignStore((s) => s.addMaterial)
  const updateMaterial = useDesignStore((s) => s.updateMaterial)
  const removeMaterial = useDesignStore((s) => s.removeMaterial)
  usePhotos() // swatches show the finish photo once it arrives

  return (
    <Section
      title="Materials"
      action={
        <Button size="sm" onClick={addMaterial}>
          + Add
        </Button>
      }
    >
      <div className="flex flex-col gap-1.5">
        {materials.map((m) => (
          <div className="flex items-center gap-1.5" key={m.id}>
            <Menu
              ariaLabel={`${m.name} look: ${describe(m)}`}
              label={<span className="block size-4 rounded-xs border border-black/30" style={swatchStyle(m)} />}
            >
              {() => <MaterialPicker material={m} onChange={(patch) => updateMaterial(m.id, patch)} />}
            </Menu>

            <input
              type="text"
              className={CONTROL}
              value={m.name}
              onChange={(e) => updateMaterial(m.id, { name: e.target.value })}
            />

            <Button
              variant="dangerGhost"
              icon
              aria-label="Remove material"
              disabled={materials.length === 1}
              onClick={() => removeMaterial(m.id)}
            >
              ✕
            </Button>
          </div>
        ))}
      </div>
    </Section>
  )
}

/** A material's look in words: "Oak", "Marble", or "Paint". */
function describe(m: { finish?: Parameters<typeof finishInfo>[0]; variant?: string }): string {
  return variantOf(m.finish, m.variant)?.label ?? finishInfo(m.finish).label
}
