/**
 * A minimal ZIP writer: files stored as they are (no compression), which every
 * unzip tool and OS reads. Enough to hand over several small text files as one
 * download, without pulling in a library.
 *
 * Layout: each file as a local header followed by its bytes, then a central
 * directory listing them all, then the end-of-directory record. Little-endian
 * throughout. File names are UTF-8 (flag bit 11).
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

/** CRC-32 (the ZIP / PNG one) of some bytes. */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const b of bytes) crc = CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

/** A date as the DOS time and date fields ZIP stores (2-second steps, local time). */
function dosDateTime(d: Date): [number, number] {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)
  const date = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  return [time, date]
}

/** The bytes of a .zip holding `files` (name → text). */
export function zip(files: { name: string; text: string }[], modified = new Date()): Uint8Array {
  const encoder = new TextEncoder()
  const [time, date] = dosDateTime(modified)
  const chunks: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0

  for (const file of files) {
    const name = encoder.encode(file.name)
    const data = encoder.encode(file.text)
    const crc = crc32(data)

    // Fields shared by the local header and the central directory entry, from
    // "version needed" through the name length.
    const common = (view: DataView, at: number) => {
      view.setUint16(at, 20, true) // version needed: 2.0
      view.setUint16(at + 2, 0x0800, true) // flags: UTF-8 names
      view.setUint16(at + 4, 0, true) // method: stored
      view.setUint16(at + 6, time, true)
      view.setUint16(at + 8, date, true)
      view.setUint32(at + 10, crc, true)
      view.setUint32(at + 14, data.length, true) // compressed size
      view.setUint32(at + 18, data.length, true) // uncompressed size
      view.setUint16(at + 22, name.length, true)
    }

    const local = new Uint8Array(30 + name.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    common(lv, 4)
    local.set(name, 30)
    chunks.push(local, data)

    const entry = new Uint8Array(46 + name.length)
    const cv = new DataView(entry.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true) // made by: 2.0
    common(cv, 6)
    cv.setUint32(42, offset, true) // where its local header starts
    entry.set(name, 46)
    central.push(entry)

    offset += local.length + data.length
  }

  const directorySize = central.reduce((n, c) => n + c.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, files.length, true) // entries on this disk
  ev.setUint16(10, files.length, true) // entries in all
  ev.setUint32(12, directorySize, true)
  ev.setUint32(16, offset, true) // where the directory starts

  const all = [...chunks, ...central, end]
  const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0))
  all.reduce((at, c) => (out.set(c, at), at + c.length), 0)
  return out
}
