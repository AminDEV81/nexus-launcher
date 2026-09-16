import type { GamepadProfile } from '../types/profiles'
import {
  GenericFallbackProfile,
  PlayStationProfile,
  StandardProfile,
  XboxProfile,
} from '../constants/default-profiles'

export class ProfileRegistry {
  private customProfiles: GamepadProfile[] = []
  private readonly defaultProfiles: GamepadProfile[] = [
    XboxProfile,
    PlayStationProfile,
    StandardProfile,
    GenericFallbackProfile,
  ]

  /**
   * Registers a new custom gamepad profile.
   * Custom profiles take precedence over default profiles.
   */
  public register(profile: GamepadProfile): void {
    // Remove existing profile with same ID if re-registered
    this.customProfiles = this.customProfiles.filter((p) => p.id !== profile.id)
    this.customProfiles.unshift(profile)
  }

  /**
   * Unregisters a custom gamepad profile by its ID.
   */
  public unregister(profileId: string): void {
    this.customProfiles = this.customProfiles.filter((p) => p.id !== profileId)
  }

  /**
   * Resolves the best matching profile for a given browser Gamepad.
   */
  public resolve(gamepad: Gamepad): GamepadProfile {
    // 1. Check custom profiles first
    for (const profile of this.customProfiles) {
      if (profile.matches(gamepad)) {
        return profile
      }
    }

    // 2. Check built-in profiles
    for (const profile of this.defaultProfiles) {
      if (profile.matches(gamepad)) {
        return profile
      }
    }

    // 3. Fallback to generic
    return GenericFallbackProfile
  }

  /**
   * Returns all currently active profiles.
   */
  public getAllProfiles(): GamepadProfile[] {
    return [...this.customProfiles, ...this.defaultProfiles]
  }

  /**
   * Clears custom registered profiles (useful for testing).
   */
  public clearCustom(): void {
    this.customProfiles = []
  }
}

export const profileRegistry = new ProfileRegistry()
