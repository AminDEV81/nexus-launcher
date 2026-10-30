import { beforeEach, describe, expect, it, vi } from 'vitest'

class FakeParam {
  value = 0
  setValueAtTime = vi.fn()
  exponentialRampToValueAtTime = vi.fn()
  setTargetAtTime = vi.fn()
}

class FakeNode {
  gain = new FakeParam()
  frequency = new FakeParam()
  Q = new FakeParam()
  threshold = new FakeParam()
  ratio = new FakeParam()
  attack = new FakeParam()
  release = new FakeParam()
  type = 'sine'
  buffer: unknown = null
  loop = false
  connect = vi.fn()
  start = vi.fn()
  stop = vi.fn()
}

const oscillatorsCreated: FakeNode[] = []
let resumeCalls = 0

class FakeAudioContext {
  state: 'suspended' | 'running' = 'suspended'
  currentTime = 0
  sampleRate = 8000
  destination = new FakeNode()
  createGain() {
    return new FakeNode()
  }
  createOscillator() {
    const osc = new FakeNode()
    oscillatorsCreated.push(osc)
    return osc
  }
  createDynamicsCompressor() {
    return new FakeNode()
  }
  createBiquadFilter() {
    return new FakeNode()
  }
  createBufferSource() {
    return new FakeNode()
  }
  createBuffer(_channels: number, length: number) {
    return { getChannelData: () => new Float32Array(length) }
  }
  resume() {
    resumeCalls += 1
    this.state = 'running'
    return Promise.resolve()
  }
}

async function freshEngine() {
  vi.resetModules()
  const mod = await import('./ui-sounds')
  const { useConsoleStore } = await import('../store/console-store')
  useConsoleStore.setState({ soundsEnabled: true, soundVolume: 80 })
  return { engine: mod.consoleSoundEngine, store: useConsoleStore }
}

describe('console UI sounds', () => {
  beforeEach(() => {
    oscillatorsCreated.length = 0
    resumeCalls = 0
    // The suite runs in a Node environment: provide the minimal `window` the engine reads.
    vi.stubGlobal('window', { AudioContext: FakeAudioContext })
  })

  it('resumes a suspended context first and then actually schedules the tone', async () => {
    const { engine } = await freshEngine()
    engine.play('confirm')
    await Promise.resolve()
    await Promise.resolve()
    expect(resumeCalls).toBeGreaterThan(0)
    expect(oscillatorsCreated.length).toBeGreaterThan(0)
  })

  it('unlock() resumes the context without needing a play call', async () => {
    const { engine } = await freshEngine()
    engine.unlock()
    expect(resumeCalls).toBe(1)
  })

  it('stays silent when sounds are disabled or volume is zero', async () => {
    const { engine, store } = await freshEngine()
    store.setState({ soundsEnabled: false })
    engine.play('move')
    store.setState({ soundsEnabled: true, soundVolume: 0 })
    engine.play('move')
    await Promise.resolve()
    expect(oscillatorsCreated.length).toBe(0)
  })

  it('rate-limits held-direction repeats of the same sound', async () => {
    const { engine } = await freshEngine()
    engine.unlock()
    await Promise.resolve()
    engine.play('move')
    const afterFirst = oscillatorsCreated.length
    engine.play('move') // immediately again: inside the minimum gap
    expect(oscillatorsCreated.length).toBe(afterFirst)
    engine.play('confirm') // a different kind is never blocked
    expect(oscillatorsCreated.length).toBeGreaterThan(afterFirst)
  })

  it('plays every sound kind without throwing', async () => {
    const { engine } = await freshEngine()
    engine.unlock()
    await Promise.resolve()
    for (const kind of [
      'move',
      'confirm',
      'back',
      'tab',
      'error',
      'toast',
      'boot',
      'launch',
      'open',
      'close',
    ] as const) {
      expect(() => engine.play(kind)).not.toThrow()
    }
    expect(oscillatorsCreated.length).toBeGreaterThan(8)
  })
})
