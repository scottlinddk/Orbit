import { isIP } from 'node:net'

/** IPv4 ranges (base address and prefix length) that are never a public server. */
const BLOCKED_V4: ReadonlyArray<readonly [string, number]> = [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT, also used by Tailscale
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, includes the cloud metadata address 169.254.169.254
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // documentation
  ['192.88.99.0', 24], // 6to4 relay
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, includes broadcast
]

function v4ToNumber(address: string): number {
  return address.split('.').reduce((total, part) => total * 256 + Number(part), 0)
}

function inV4Range(value: number, base: string, bits: number): boolean {
  const size = 2 ** (32 - bits)
  const start = v4ToNumber(base)
  return value >= start && value < start + size
}

/** Expands an IPv6 literal into eight 16-bit groups. Returns undefined when it is malformed. */
function v6Groups(address: string): number[] | undefined {
  let text = address.toLowerCase()
  const zone = text.indexOf('%')
  if (zone !== -1) text = text.slice(0, zone)
  // An embedded IPv4 tail (::ffff:1.2.3.4) is two groups.
  const tail = /^(.*:)(\d+\.\d+\.\d+\.\d+)$/.exec(text)
  if (tail?.[1] && tail[2]) {
    if (isIP(tail[2]) !== 4) return undefined
    const n = v4ToNumber(tail[2])
    text = `${tail[1]}${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`
  }
  const halves = text.split('::')
  if (halves.length > 2) return undefined
  const head = halves[0] ? halves[0].split(':') : []
  const rest = halves[1] ? halves[1].split(':') : []
  const missing = 8 - head.length - rest.length
  if (halves.length === 1 ? missing !== 0 : missing < 1) return undefined
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...rest]
  if (groups.length !== 8) return undefined
  const numbers = groups.map((group) => (/^[0-9a-f]{1,4}$/.test(group) ? parseInt(group, 16) : NaN))
  return numbers.some(Number.isNaN) ? undefined : numbers
}

/**
 * True for an address that must not be reached through a user-supplied URL. Anything that cannot
 * be parsed counts as blocked: failing closed is the safe default.
 */
export function isBlockedAddress(address: string): boolean {
  const family = isIP(address)
  if (family === 4) {
    const value = v4ToNumber(address)
    return BLOCKED_V4.some(([base, bits]) => inV4Range(value, base, bits))
  }
  if (family === 6) {
    const g = v6Groups(address)
    if (!g) return true
    const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0, g6 = 0, h = 0] = g
    const first96Zero = a === 0 && b === 0 && c === 0 && d === 0 && e === 0
    // ::, ::1
    if (first96Zero && f === 0 && g6 === 0 && h <= 1) return true
    // IPv4-mapped (::ffff:a.b.c.d) and the deprecated IPv4-compatible form (::a.b.c.d): judge
    // the embedded IPv4 address.
    if (first96Zero && (f === 0xffff || f === 0)) {
      return isBlockedAddress(`${g6 >> 8}.${g6 & 255}.${h >> 8}.${h & 255}`)
    }
    // NAT64 (64:ff9b::/96) embeds an IPv4 address too.
    if (a === 0x64 && b === 0xff9b && c === 0 && d === 0 && e === 0 && f === 0) {
      return isBlockedAddress(`${g6 >> 8}.${g6 & 255}.${h >> 8}.${h & 255}`)
    }
    if ((a & 0xfe00) === 0xfc00) return true // unique local, fc00::/7 (AWS metadata fd00:ec2::254)
    if ((a & 0xffc0) === 0xfe80) return true // link-local, fe80::/10
    if ((a & 0xffc0) === 0xfec0) return true // deprecated site-local, fec0::/10
    if ((a & 0xff00) === 0xff00) return true // multicast
    if (a === 0x2001 && b === 0x0db8) return true // documentation
    if (a === 0x2002) return true // 6to4: the address embeds an IPv4 one, so refuse the range
    return false
  }
  return true
}
