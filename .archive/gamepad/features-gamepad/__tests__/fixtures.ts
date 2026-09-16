/**
 * Mock Gamepad factory for unit testing without physical hardware.
 */
export function createMockGamepad(overrides: Partial<Gamepad> = {}): Gamepad {
  const defaultButtons = Array.from({ length: 17 }, () => ({
    pressed: false,
    touched: false,
    value: 0,
  }))

  const defaultAxes = [0, 0, 0, 0]

  return {
    id: 'Generic Gamepad',
    index: 0,
    connected: true,
    mapping: 'standard',
    timestamp: Date.now(),
    axes: defaultAxes,
    buttons: defaultButtons,
    ...overrides,
  } as unknown as Gamepad
}

export function mockDualSense(overrides: Partial<Gamepad> = {}): Gamepad {
  return createMockGamepad({
    id: 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)',
    mapping: 'standard',
    ...overrides,
  })
}

export function mockDualShock4(overrides: Partial<Gamepad> = {}): Gamepad {
  return createMockGamepad({
    id: 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)',
    mapping: 'standard',
    ...overrides,
  })
}

export function mockXbox(overrides: Partial<Gamepad> = {}): Gamepad {
  return createMockGamepad({
    id: 'Xbox 360 Controller (XInput STANDARD GAMEPAD Vendor: 045e Product: 028e)',
    mapping: 'standard',
    ...overrides,
  })
}

export function mockXboxSeries(overrides: Partial<Gamepad> = {}): Gamepad {
  return createMockGamepad({
    id: 'Xbox Wireless Controller (Vendor: 045e Product: 0b12)',
    mapping: 'standard',
    ...overrides,
  })
}

export function mockGeneric(overrides: Partial<Gamepad> = {}): Gamepad {
  return createMockGamepad({
    id: 'USB Gamepad 2-Axis 8-Button',
    mapping: '',
    axes: [0, 0],
    buttons: Array.from({ length: 10 }, () => ({ pressed: false, touched: false, value: 0 })),
    ...overrides,
  })
}
