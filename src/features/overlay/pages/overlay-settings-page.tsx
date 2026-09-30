import React, { useEffect, useMemo } from 'react'
import {
  Activity,
  Play,
  Square,
  Search,
  Monitor,
  Maximize2,
  Sliders,
  Check,
  RotateCcw,
  Sparkles,
  Gauge,
  Cpu,
  Tv,
  HardDrive,
  Wifi,
  Clock,
  Layers,
} from 'lucide-react'
import { useOverlayStore, DEFAULT_CONFIG } from '../store/overlay-store'
import { THEME_LIST, THEME_REGISTRY } from '../themes/theme-registry'
import { ThemeRenderer } from '../themes/theme-renderer'
import { HotkeyField } from '../components/hotkey-field'
import { NotificationSettingsPanel } from '../components/notification-settings'
import { SensorStatusPanel } from '../components/sensor-status'
import type {
  MetricToggles,
  OverlayPosition,
  OverlayThemeId,
  ThemeCategory,
} from '../types/overlay'

const CATEGORIES: { id: ThemeCategory; label: string; count: number }[] = [
  { id: 'all', label: 'All Themes', count: 30 },
  { id: 'iconic', label: 'Iconic Gaming', count: 6 },
  { id: 'modern', label: 'Clean & Modern', count: 5 },
  { id: 'scifi', label: 'Sci-Fi & Cyber', count: 5 },
  { id: 'retro', label: 'Retro & Synth', count: 5 },
  { id: 'esports', label: 'Esports & Speed', count: 5 },
  { id: 'thematic', label: 'Thematic Art', count: 4 },
]

const POSITIONS: { id: OverlayPosition; label: string }[] = [
  { id: 'top-left', label: 'Top Left' },
  { id: 'top-center', label: 'Top Center' },
  { id: 'top-right', label: 'Top Right' },
  { id: 'bottom-left', label: 'Bottom Left' },
  { id: 'bottom-center', label: 'Bottom Center' },
  { id: 'bottom-right', label: 'Bottom Right' },
]

export const OverlaySettingsPage: React.FC = () => {
  const {
    config,
    metrics,
    isLiveWindowOpen,
    isDemoMode,
    monitors,
    hotkeyStatus,
    activeCategory,
    searchQuery,
    loadConfig,
    updateConfig,
    setTheme,
    setPosition,
    setOpacity,
    setScale,
    setMonitor,
    toggleMetric,
    toggleLiveWindow,
    setClickThrough,
    setDemoMode,
    setActiveCategory,
    setSearchQuery,
    pollMetrics,
    startTelemetry,
    stopTelemetry,
    syncLiveWindowState,
    refreshProviderStatus,
    subscribeToBackend,
  } = useOverlayStore()

  useEffect(() => {
    let active = true
    let unsubscribe: (() => void) | undefined

    void loadConfig()
    void syncLiveWindowState()
    // Keeps the Launch/Close button truthful when the hotkey or the game
    // watcher shows/hides the HUD. Config echoes are ignored here so a
    // slider drag isn't overwritten by its own (older) save.
    void subscribeToBackend({ applyConfig: false }).then((un) => {
      if (active) unsubscribe = un
      else un()
    })

    // Preview telemetry: one consumer for exactly as long as this page is open.
    void startTelemetry().then(() => refreshProviderStatus())
    const timer = setInterval(() => {
      void pollMetrics()
    }, 600)
    // Sensor availability (ETW session, CPU temp source) can change while the page is open.
    const statusTimer = setInterval(() => void refreshProviderStatus(), 4000)

    return () => {
      active = false
      clearInterval(timer)
      clearInterval(statusTimer)
      unsubscribe?.()
      void stopTelemetry()
    }
  }, [
    loadConfig,
    pollMetrics,
    startTelemetry,
    stopTelemetry,
    syncLiveWindowState,
    subscribeToBackend,
    refreshProviderStatus,
  ])

  // Filtered themes
  const filteredThemes = useMemo(() => {
    return THEME_LIST.filter((t) => {
      const matchesCategory = activeCategory === 'all' || t.category === activeCategory
      const query = searchQuery.trim().toLowerCase()
      const matchesQuery =
        !query ||
        t.name.toLowerCase().includes(query) ||
        t.description.toLowerCase().includes(query) ||
        t.tags.some((tag) => tag.toLowerCase().includes(query))
      return matchesCategory && matchesQuery
    })
  }, [activeCategory, searchQuery])

  const handleResetDefaults = () => {
    updateConfig(DEFAULT_CONFIG)
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-8 max-w-7xl mx-auto select-none bg-bg text-text">
      {/* ======================================================== */}
      {/* 1. HEADER SECTION */}
      {/* ======================================================== */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-500 dark:text-cyan-400 border border-cyan-500/20">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-text flex items-center gap-2">
                System Metrics Overlay
                <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-cyan-500/15 text-cyan-600 dark:text-cyan-300 border border-cyan-500/30">
                  HUD
                </span>
              </h1>
              <p className="text-xs text-muted mt-0.5">
                Real-time in-game telemetry & hardware performance HUD with 30 customizable presets
              </p>
            </div>
          </div>
        </div>

        {/* Global Action Controls */}
        <div className="flex items-center gap-3 w-full sm:w-auto">
          {/* Master Enable Toggle */}
          <button
            onClick={() => updateConfig({ enabled: !config.enabled })}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all border ${
              config.enabled
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.15)]'
                : 'bg-surface-raised border-border text-muted hover:text-text'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                config.enabled ? 'bg-emerald-400 animate-pulse' : 'bg-muted/50'
              }`}
            />
            {config.enabled ? 'Overlay Enabled' : 'Overlay Disabled'}
          </button>

          {/* Launch / Close Live Window */}
          <button
            onClick={() => toggleLiveWindow()}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-md ${
              isLiveWindowOpen
                ? 'bg-red-500 hover:bg-red-600 text-white'
                : 'bg-cyan-500 hover:bg-cyan-400 text-black font-extrabold'
            }`}
          >
            {isLiveWindowOpen ? (
              <>
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Close Live HUD</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Launch Live HUD</span>
              </>
            )}
          </button>

          {/* Reset Defaults */}
          <button
            onClick={handleResetDefaults}
            title="Reset settings to defaults"
            className="p-2 rounded-lg bg-surface-raised hover:bg-surface border border-border text-muted hover:text-text transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 2. INTERACTIVE PREVIEW & STAGE */}
      {/* ======================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Preview Screen Canvas (8 cols) */}
        <div className="lg:col-span-8 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-cyan-500 dark:text-cyan-400" />
              Live Theme Preview
            </h2>

            {/* Mode Switcher: Live Telemetry vs Demo Simulation */}
            <div className="flex items-center bg-surface border border-border p-0.5 rounded-lg text-xs">
              <button
                onClick={() => setDemoMode(false)}
                className={`px-3 py-1 rounded-md transition-colors ${
                  !isDemoMode
                    ? 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-300 font-bold'
                    : 'text-muted hover:text-text'
                }`}
              >
                Live Hardware
              </button>
              <button
                onClick={() => setDemoMode(true)}
                className={`px-3 py-1 rounded-md transition-colors ${
                  isDemoMode
                    ? 'bg-purple-500/15 text-purple-600 dark:text-purple-300 font-bold'
                    : 'text-muted hover:text-text'
                }`}
              >
                Demo Simulation
              </button>
            </div>
          </div>

          {/* Stage Area */}
          <div className="relative h-[360px] rounded-2xl border border-border bg-gradient-to-br from-zinc-950 via-zinc-900 to-black overflow-hidden flex items-center justify-center p-6 shadow-2xl">
            {/* Background Grid Pattern */}
            <div
              className="absolute inset-0 opacity-15 pointer-events-none"
              style={{
                backgroundImage:
                  'linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)',
                backgroundSize: '32px 32px',
              }}
            />

            {/* In-game Mock Backdrop Accent */}
            <div className="absolute inset-0 bg-radial from-cyan-500/5 via-transparent to-transparent pointer-events-none" />

            {/* Watermark Tag */}
            <div className="absolute bottom-3 right-4 text-[10px] font-mono text-zinc-500 uppercase tracking-widest pointer-events-none">
              Nexus HUD Engine • {config.theme_id}
            </div>

            {/* Themed HUD Component */}
            <div className="relative z-10 transition-all duration-200">
              <ThemeRenderer
                themeId={config.theme_id}
                metrics={metrics}
                toggles={config.metrics}
                scale={config.scale}
                opacity={config.opacity}
              />
            </div>
          </div>
        </div>

        {/* HUD Quick Adjustments (4 cols) */}
        <div className="lg:col-span-4 bg-surface border border-border rounded-2xl p-5 flex flex-col justify-between gap-5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-text flex items-center gap-1.5 border-b border-border pb-2">
            <Sliders className="w-3.5 h-3.5 text-cyan-500 dark:text-cyan-400" />
            Position & Layout Controls
          </h3>

          {/* Position Selector */}
          <div>
            <label className="text-xs text-muted mb-2 block font-medium">Screen Position</label>
            <div className="grid grid-cols-3 gap-1.5">
              {POSITIONS.map((pos) => {
                const isActive = config.position === pos.id
                return (
                  <button
                    key={pos.id}
                    onClick={() => setPosition(pos.id)}
                    className={`px-2 py-2 rounded-lg text-[11px] font-medium transition-all text-center border ${
                      isActive
                        ? 'bg-cyan-500/15 border-cyan-500/60 text-cyan-600 dark:text-cyan-300 font-bold shadow-sm'
                        : 'bg-surface-raised border-border text-muted hover:text-text hover:bg-surface'
                    }`}
                  >
                    {pos.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Scale Slider */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-muted flex items-center gap-1">
                <Maximize2 className="w-3.5 h-3.5" /> Overlay Scale
              </span>
              <span className="font-mono text-cyan-600 dark:text-cyan-400 font-bold">
                {Math.round(config.scale * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0.6"
              max="1.5"
              step="0.05"
              value={config.scale}
              onChange={(e) => setScale(parseFloat(e.target.value))}
              className="w-full accent-cyan-500 h-1.5 bg-surface-raised border border-border/60 rounded-lg cursor-pointer"
            />
          </div>

          {/* Opacity Slider */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-muted flex items-center gap-1">
                <Layers className="w-3.5 h-3.5" /> Overlay Opacity
              </span>
              <span className="font-mono text-cyan-600 dark:text-cyan-400 font-bold">
                {Math.round(config.opacity * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0.3"
              max="1.0"
              step="0.05"
              value={config.opacity}
              onChange={(e) => setOpacity(parseFloat(e.target.value))}
              className="w-full accent-cyan-500 h-1.5 bg-surface-raised border border-border/60 rounded-lg cursor-pointer"
            />
          </div>

          {/* Monitor & Click-through */}
          <div className="space-y-3 pt-2 border-t border-border">
            {monitors.length > 1 && (
              <div>
                <label className="text-xs text-muted mb-1 flex items-center gap-1">
                  <Monitor className="w-3.5 h-3.5" /> Target Display:
                </label>
                <select
                  value={config.monitor_index}
                  onChange={(e) => setMonitor(parseInt(e.target.value, 10))}
                  className="w-full bg-surface-raised border border-border text-xs text-text rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-cyan-500"
                >
                  {monitors.map((m) => (
                    <option key={m.index} value={m.index}>
                      {m.name} ({m.width}x{m.height})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-medium text-text">Click-Through Mode</div>
                <div className="text-[10px] text-muted">
                  Mouse clicks pass directly through the overlay to the game
                </div>
              </div>
              <input
                type="checkbox"
                checked={config.click_through}
                onChange={(e) => setClickThrough(e.target.checked)}
                className="w-4 h-4 rounded accent-cyan-500 cursor-pointer"
              />
            </div>

            <HotkeyField
              value={config.hotkey}
              status={hotkeyStatus}
              onChange={(hotkey) => updateConfig({ hotkey })}
            />
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 3. 30 THEMES CATALOG GALLERY */}
      {/* ======================================================== */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
          <div>
            <h2 className="text-base font-bold text-text flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-500 dark:text-cyan-400" />
              Theme Presets (30 Custom Styles)
            </h2>
            <p className="text-xs text-muted mt-0.5">
              Choose from classic gaming HUDs, modern glass, vintage CRTs, or motorsport telemetry
            </p>
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
            <input
              type="text"
              placeholder="Search themes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-surface border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-text placeholder-muted/60 focus:outline-none focus:border-cyan-500/50"
            />
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {CATEGORIES.map((cat) => {
            const isActive = activeCategory === cat.id
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-all border ${
                  isActive
                    ? 'bg-cyan-500/15 border-cyan-500/60 text-cyan-600 dark:text-cyan-300 font-bold'
                    : 'bg-surface border-border text-muted hover:text-text hover:bg-surface-raised'
                }`}
              >
                <span>{cat.label}</span>
                <span className="text-[10px] opacity-75 px-1 py-0.2 rounded bg-surface-raised border border-border/40">
                  {cat.count}
                </span>
              </button>
            )
          })}
        </div>

        {/* 30-Theme Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredThemes.map((theme) => {
            const isSelected = config.theme_id === theme.id
            const fullTheme = THEME_REGISTRY[theme.id]

            return (
              <div
                key={theme.id}
                onClick={() => setTheme(theme.id as OverlayThemeId)}
                className={`group relative rounded-xl p-3.5 transition-all cursor-pointer border flex flex-col justify-between gap-3 ${
                  isSelected
                    ? 'bg-surface border-cyan-500 shadow-[0_0_20px_rgba(6,182,212,0.25)] ring-1 ring-cyan-500'
                    : 'bg-surface/80 hover:bg-surface-raised border-border hover:border-border/80'
                }`}
              >
                <div>
                  {/* Top Bar with Preview Gradient & Layout badge */}
                  <div
                    className={`h-10 rounded-lg bg-gradient-to-r ${theme.previewGradient} flex items-center justify-between px-3 mb-2.5 relative overflow-hidden`}
                  >
                    <span className="text-[10px] font-bold text-white uppercase tracking-wider px-1.5 py-0.5 rounded bg-black/40 backdrop-blur-sm">
                      {theme.layout}
                    </span>

                    {isSelected && (
                      <span className="w-5 h-5 rounded-full bg-cyan-400 text-black flex items-center justify-center font-bold shadow-md">
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </span>
                    )}
                  </div>

                  {/* Title */}
                  <h4 className="text-xs font-bold text-text group-hover:text-cyan-500 dark:group-hover:text-cyan-300 transition-colors">
                    {theme.name}
                  </h4>

                  {/* Description */}
                  <p className="text-[11px] text-muted mt-1 line-clamp-2 leading-relaxed">
                    {theme.description}
                  </p>
                </div>

                {/* Tags & Accent Dot */}
                <div className="flex items-center justify-between pt-2 border-t border-border mt-1">
                  <div className="flex items-center gap-1 flex-wrap">
                    {theme.tags.slice(0, 2).map((tag) => (
                      <span
                        key={tag}
                        className="text-[9px] px-1.5 py-0.5 rounded bg-surface-raised text-muted font-mono border border-border/50"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-2.5 h-2.5 rounded-full ring-1 ring-border/50"
                      style={{ backgroundColor: fullTheme?.tokens.accentColor }}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <SensorStatusPanel />

      {/* ======================================================== */}
      {/* 3b. IN-GAME NOTIFICATIONS */}
      {/* ======================================================== */}
      <NotificationSettingsPanel />

      {/* ======================================================== */}
      {/* 4. GRANULAR METRIC TOGGLE MATRIX */}
      {/* ======================================================== */}
      <div className="space-y-4 pt-4 border-t border-border">
        <div>
          <h2 className="text-base font-bold text-text flex items-center gap-2">
            <Sliders className="w-4 h-4 text-cyan-500 dark:text-cyan-400" />
            Granular Metric Toggles
          </h2>
          <p className="text-xs text-muted mt-0.5">
            Disable any telemetry metrics you do not need to keep your screen clean and focused
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {/* Card: Performance & FPS */}
          <MetricGroupCard
            title="Frame Pacing & FPS"
            icon={<Gauge className="w-4 h-4 text-amber-500 dark:text-amber-400" />}
            metrics={[
              { key: 'fps', label: 'Real-time FPS', active: config.metrics.fps },
              { key: 'frametime', label: 'Frametime (ms)', active: config.metrics.frametime },
              {
                key: 'frametime_graph',
                label: 'Frametime Graph',
                active: config.metrics.frametime_graph,
              },
              {
                key: 'fps_one_percent_low',
                label: '1% Low FPS',
                active: config.metrics.fps_one_percent_low,
              },
              {
                key: 'fps_point_one_percent_low',
                label: '0.1% Low FPS',
                active: config.metrics.fps_point_one_percent_low,
              },
            ]}
            onToggle={toggleMetric}
          />

          {/* Card: GPU Telemetry */}
          <MetricGroupCard
            title="GPU Telemetry"
            icon={<Tv className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />}
            metrics={[
              { key: 'gpu_usage', label: 'GPU Usage %', active: config.metrics.gpu_usage },
              { key: 'gpu_vram', label: 'VRAM Usage (GB)', active: config.metrics.gpu_vram },
              { key: 'gpu_temp', label: 'GPU Temperature °C', active: config.metrics.gpu_temp },
              {
                key: 'gpu_hotspot',
                label: 'GPU Hotspot Temp °C',
                active: config.metrics.gpu_hotspot,
              },
              {
                key: 'gpu_memory_temp',
                label: 'VRAM Temperature °C',
                active: config.metrics.gpu_memory_temp,
              },
              { key: 'gpu_clock', label: 'GPU Core Clock MHz', active: config.metrics.gpu_clock },
              { key: 'gpu_fan', label: 'GPU Fan Speed %', active: config.metrics.gpu_fan },
              { key: 'gpu_power', label: 'GPU Power (Watts)', active: config.metrics.gpu_power },
            ]}
            onToggle={toggleMetric}
          />

          {/* Card: CPU Telemetry */}
          <MetricGroupCard
            title="CPU Telemetry"
            icon={<Cpu className="w-4 h-4 text-sky-500 dark:text-sky-400" />}
            metrics={[
              { key: 'cpu_usage', label: 'CPU Usage %', active: config.metrics.cpu_usage },
              { key: 'cpu_temp', label: 'CPU Temperature °C', active: config.metrics.cpu_temp },
              { key: 'cpu_clock', label: 'CPU Clock GHz', active: config.metrics.cpu_clock },
              { key: 'cpu_power', label: 'CPU Power (Watts)', active: config.metrics.cpu_power },
              { key: 'cpu_cores', label: 'Core Count', active: config.metrics.cpu_cores },
            ]}
            onToggle={toggleMetric}
          />

          {/* Card: RAM & Storage */}
          <MetricGroupCard
            title="Memory & Storage (RAM & Disk)"
            icon={<HardDrive className="w-4 h-4 text-purple-500 dark:text-purple-400" />}
            metrics={[
              { key: 'ram_used', label: 'RAM Used (GB)', active: config.metrics.ram_used },
              {
                key: 'ram_percentage',
                label: 'RAM Percentage %',
                active: config.metrics.ram_percentage,
              },
              {
                key: 'ram_available',
                label: 'RAM Free (GB)',
                active: config.metrics.ram_available,
              },
              { key: 'disk_read', label: 'Disk Read Rate', active: config.metrics.disk_read },
              { key: 'disk_write', label: 'Disk Write Rate', active: config.metrics.disk_write },
            ]}
            onToggle={toggleMetric}
          />

          {/* Card: Network & Ping */}
          <MetricGroupCard
            title="Network & Latency"
            icon={<Wifi className="w-4 h-4 text-cyan-500 dark:text-cyan-400" />}
            metrics={[
              { key: 'ping', label: 'Ping Latency (ms)', active: config.metrics.ping },
              {
                key: 'network_download',
                label: 'Download Rate',
                active: config.metrics.network_download,
              },
              {
                key: 'network_upload',
                label: 'Upload Rate',
                active: config.metrics.network_upload,
              },
            ]}
            onToggle={toggleMetric}
          />

          {/* Card: Session & System */}
          <MetricGroupCard
            title="Game Session & System"
            icon={<Clock className="w-4 h-4 text-rose-500 dark:text-rose-400" />}
            metrics={[
              {
                key: 'game_session',
                label: 'Game Title & Timer',
                active: config.metrics.game_session,
              },
              { key: 'clock', label: 'System Clock', active: config.metrics.clock },
              { key: 'battery', label: 'Battery Level %', active: config.metrics.battery },
            ]}
            onToggle={toggleMetric}
          />
        </div>
      </div>
    </div>
  )
}

interface MetricGroupCardProps {
  title: string
  icon: React.ReactNode
  metrics: { key: keyof MetricToggles; label: string; active: boolean }[]
  onToggle: (key: keyof MetricToggles) => void
}

const MetricGroupCard: React.FC<MetricGroupCardProps> = ({ title, icon, metrics, onToggle }) => {
  return (
    <div className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-2.5">
      <div className="flex items-center gap-2 border-b border-border pb-2">
        {icon}
        <h3 className="text-xs font-bold text-text">{title}</h3>
      </div>
      <div className="flex flex-col gap-1.5 pt-0.5">
        {metrics.map((m) => (
          <label
            key={m.key}
            className="flex items-center justify-between text-xs text-muted hover:text-text cursor-pointer py-1 px-1.5 rounded hover:bg-surface-raised transition-colors"
          >
            <span>{m.label}</span>
            <input
              type="checkbox"
              checked={m.active}
              onChange={() => onToggle(m.key)}
              className="w-4 h-4 rounded accent-cyan-500 cursor-pointer"
            />
          </label>
        ))}
      </div>
    </div>
  )
}

export default OverlaySettingsPage
