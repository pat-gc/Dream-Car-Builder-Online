import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { snapToIncrement, snapToAxis } from './snap'

describe('snapToIncrement', () => {
  it('passes value through unchanged when increment is 0', () => {
    expect(snapToIncrement(3.14159, 0)).toBe(3.14159)
    expect(snapToIncrement(-2.71828, 0)).toBe(-2.71828)
    expect(snapToIncrement(0, 0)).toBe(0)
  })

  it('rounds to nearest multiple of increment (positive values)', () => {
    expect(snapToIncrement(0.3, 0.5)).toBe(0.5)
    expect(snapToIncrement(0.24, 0.5)).toBe(0)
    expect(snapToIncrement(1.2, 0.5)).toBe(1)
    expect(snapToIncrement(0.75, 0.25)).toBe(0.75)
    expect(snapToIncrement(0.12, 0.25)).toBe(0)
    expect(snapToIncrement(2.6, 1)).toBe(3)
    expect(snapToIncrement(2.4, 1)).toBe(2)
  })

  it('handles negative values correctly', () => {
    expect(snapToIncrement(-0.3, 0.5)).toBe(-0.5)
    expect(snapToIncrement(-0.24, 0.5)).toBe(0)
    expect(snapToIncrement(-2.6, 1)).toBe(-3)
    expect(snapToIncrement(-2.4, 1)).toBe(-2)
  })

  it('returns 0 for value 0 regardless of increment', () => {
    expect(snapToIncrement(0, 0.5)).toBe(0)
    expect(snapToIncrement(0, 1)).toBe(0)
    expect(snapToIncrement(0, 2)).toBe(0)
  })
})

describe('snapToAxis', () => {
  const ORIGIN = new THREE.Vector3(0, 0, 0)

  it('returns the end unchanged when delta is near-zero', () => {
    const end = new THREE.Vector3(1e-7, 1e-7, 1e-7)
    const result = snapToAxis(ORIGIN, end)
    expect(result.x).toBeCloseTo(end.x)
    expect(result.y).toBeCloseTo(end.y)
    expect(result.z).toBeCloseTo(end.z)
  })

  it('snaps a near-vertical (Y-up) delta to exactly vertical', () => {
    const end = new THREE.Vector3(0.01, 5, 0)
    const result = snapToAxis(ORIGIN, end)
    expect(result.x).toBeCloseTo(0, 10)
    expect(result.z).toBeCloseTo(0, 10)
    expect(Math.sign(result.y)).toBe(1)
    expect(result.distanceTo(ORIGIN)).toBeCloseTo(end.distanceTo(ORIGIN), 5)
  })

  it('snaps a near-horizontal (X) delta to exactly horizontal', () => {
    const end = new THREE.Vector3(4.96, 0.1, 0)
    const result = snapToAxis(ORIGIN, end)
    expect(result.y).toBeCloseTo(0, 10)
    expect(result.z).toBeCloseTo(0, 10)
    expect(Math.sign(result.x)).toBe(1)
    expect(result.distanceTo(ORIGIN)).toBeCloseTo(end.distanceTo(ORIGIN), 5)
  })

  it('snaps a 45deg-ish delta to exactly 45deg on the XY plane', () => {
    const end = new THREE.Vector3(3.0, 2.95, 0)
    const result = snapToAxis(ORIGIN, end)
    const angleRad = Math.atan2(result.y, result.x)
    expect(angleRad).toBeCloseTo(Math.PI / 4, 6)
  })

  it('preserves the reach distance from start', () => {
    const end = new THREE.Vector3(3.0, 2.95, 0)
    const expectedLen = ORIGIN.distanceTo(end)
    const result = snapToAxis(ORIGIN, end)
    expect(result.distanceTo(ORIGIN)).toBeCloseTo(expectedLen, 5)
  })

  it('snaps relative to a non-origin start point', () => {
    const start = new THREE.Vector3(2, 3, 1)
    const end = new THREE.Vector3(2.05, 9, 1)
    const result = snapToAxis(start, end)
    expect(result.x).toBeCloseTo(start.x, 10)
    expect(result.z).toBeCloseTo(start.z, 10)
    expect(result.distanceTo(start)).toBeCloseTo(end.distanceTo(start), 5)
  })

  it('zeros the dropped (smallest-magnitude) axis component', () => {
    const end = new THREE.Vector3(4, 4, 0.001)
    const result = snapToAxis(ORIGIN, end)
    expect(result.z).toBeCloseTo(0, 10)
  })

  it('does not mutate the input vectors', () => {
    const start = new THREE.Vector3(1, 2, 3)
    const end = new THREE.Vector3(2.5, 4, 3)
    const startCopy = start.clone()
    const endCopy = end.clone()
    snapToAxis(start, end)
    expect(start.equals(startCopy)).toBe(true)
    expect(end.equals(endCopy)).toBe(true)
  })
})
