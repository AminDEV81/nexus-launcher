import { beforeEach, describe, expect, it } from 'vitest'
import { profileRegistry } from '../core/profile-registry'
import { mockDualSense, mockGeneric, mockXbox } from './fixtures'
import type { GamepadProfile } from '../types/profiles'
import { DEFAULT_GAMEPAD_SETTINGS } from '../constants/standard-mappings'

describe('Controller Profiles & ProfileRegistry', () => {
  beforeEach(() => {
    profileRegistry.clearCustom()
  })

  it('resolves Xbox profile for Xbox controllers', () => {
    const pad = mockXbox()
    const profile = profileRegistry.resolve(pad)
    expect(profile.id).toBe('xbox-controller')
  })

  it('resolves PlayStation profile for DualSense', () => {
    const pad = mockDualSense()
    const profile = profileRegistry.resolve(pad)
    expect(profile.id).toBe('playstation-controller')
  })

  it('falls back to Generic profile for non-standard unknown controllers', () => {
    const pad = mockGeneric()
    const profile = profileRegistry.resolve(pad)
    expect(profile.id).toBe('generic-fallback')
  })

  it('allows registering and resolving custom profiles', () => {
    const customProfile: GamepadProfile = {
      id: 'flight-sim-stick',
      name: 'Custom Flight Stick',
      type: 'generic',
      matches: (g) => g.id.includes('FlightStickPro'),
      normalize: (_g, _s) => ({
        buttons: {
          south: true,
          east: false,
          west: false,
          north: false,
          start: false,
          select: false,
          l1: false,
          r1: false,
          l3: false,
          r3: false,
          dpadUp: false,
          dpadDown: false,
          dpadLeft: false,
          dpadRight: false,
        },
        analog: {
          l2: 0,
          r2: 0,
          leftX: 0,
          leftY: 0,
          rightX: 0,
          rightY: 0,
        },
      }),
    }

    profileRegistry.register(customProfile)

    const pad = mockGeneric({ id: 'Vendor FlightStickPro USB' })
    const resolved = profileRegistry.resolve(pad)
    expect(resolved.id).toBe('flight-sim-stick')

    const input = resolved.normalize(pad, DEFAULT_GAMEPAD_SETTINGS)
    expect(input.buttons.south).toBe(true)

    // Unregister custom
    profileRegistry.unregister('flight-sim-stick')
    const fallback = profileRegistry.resolve(pad)
    expect(fallback.id).toBe('generic-fallback')
  })
})
