import { describe, expect, it } from 'vitest'
import { isBlockedAddress } from './address.ts'

describe('isBlockedAddress', () => {
  it.each([
    '0.0.0.0',
    '10.1.2.3',
    '100.64.0.1', // carrier-grade NAT, Tailscale
    '127.0.0.1',
    '127.255.255.254',
    '169.254.169.254', // cloud metadata
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.10',
    '198.18.0.1',
    '224.0.0.1',
    '255.255.255.255',
    '::',
    '::1',
    'fe80::1',
    'fd00:ec2::254', // AWS metadata over IPv6
    'fc00::1',
    'ff02::1',
    '::ffff:127.0.0.1', // IPv4-mapped loopback
    '::ffff:10.0.0.1',
    '::ffff:7f00:1', // the same loopback written in hex
    '::127.0.0.1',
    '64:ff9b::a00:1', // NAT64 of 10.0.0.1
    '2002:7f00:1::', // 6to4
    '2001:db8::1',
    'not-an-address',
    '',
  ])('blocks %s', (address) => {
    expect(isBlockedAddress(address)).toBe(true)
  })

  it.each([
    '1.1.1.1',
    '8.8.8.8',
    '93.184.216.34',
    '172.15.255.255', // just outside 172.16/12
    '172.32.0.1',
    '100.63.255.255', // just outside 100.64/10
    '100.128.0.1',
    '2606:4700:4700::1111',
    '2a00:1450:4001:81b::200e',
    '::ffff:8.8.8.8',
  ])('allows %s', (address) => {
    expect(isBlockedAddress(address)).toBe(false)
  })
})
