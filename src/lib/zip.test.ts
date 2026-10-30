import { describe, expect, it } from 'vitest'
import { crc32, zip } from './zip'

/** Read a stored-only zip back through its central directory. */
function unzip(bytes: Uint8Array): { name: string; text: string; crcOk: boolean }[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const end = bytes.length - 22
  expect(view.getUint32(end, true)).toBe(0x06054b50)
  const count = view.getUint16(end + 10, true)
  let at = view.getUint32(end + 16, true)
  const decoder = new TextDecoder()
  const files = []
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(at, true)).toBe(0x02014b50)
    const crc = view.getUint32(at + 16, true)
    const size = view.getUint32(at + 24, true)
    const nameLength = view.getUint16(at + 28, true)
    const local = view.getUint32(at + 42, true)
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength))
    expect(view.getUint32(local, true)).toBe(0x04034b50)
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true)
    const data = bytes.subarray(start, start + size)
    files.push({ name, text: decoder.decode(data), crcOk: crc32(data) === crc })
    at += 46 + nameLength
  }
  return files
}

describe('crc32', () => {
  it('matches the standard check value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })
})

describe('zip', () => {
  it('holds every file, by name, byte for byte', () => {
    const files = [
      { name: 'sheet-1.dxf', text: '0\nSECTION\n' },
      { name: 'étagère.dxf', text: 'à pain' },
    ]
    expect(unzip(zip(files))).toEqual(files.map((f) => ({ ...f, crcOk: true })))
  })

  it('is just the end record when empty', () => {
    expect(zip([])).toHaveLength(22)
  })
})
