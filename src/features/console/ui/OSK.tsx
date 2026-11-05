import React, { useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  Compass,
  CornerDownLeft,
  Delete,
  Gamepad2,
  Globe,
  Search,
  Sparkles,
  Space,
  Trash2,
  X,
} from "lucide-react"
import type { Game, HubGame } from "@/types/models"
import { useConsoleStore } from "../store/console-store"
import { CONSOLE_THEMES } from "../theme/tokens"
import { FocusScope, useFocusable } from "../nav/FocusScope"
import { Glyph } from "./Glyph"
import { resolveConsoleHighResUrl } from "./Tile"

const QUICK_CHIPS = [
  "Action",
  "RPG",
  "Adventure",
  "Shooter",
  "Indie",
  "Strategy",
  "Horror",
  "Racing",
]

const EN_KEYPAD_ROWS: string[][] = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l", "-"],
  ["z", "x", "c", "v", "b", "n", "m", ":", ".", "/"],
]

const FA_KEYPAD_ROWS: string[][] = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["ض", "ص", "ث", "ق", "ف", "غ", "ع", "ه", "خ", "ح"],
  ["ش", "س", "ی", "ب", "ل", "ا", "ت", "ن", "م", "ک"],
  ["ظ", "ط", "ز", "ر", "ذ", "د", "پ", "و", "گ", "چ"],
]

const KeyCapButton: React.FC<{
  id: string
  label: React.ReactNode
  className?: string
  accent?: boolean
  danger?: boolean
  isLight: boolean
  onPress: () => void
}> = ({ id, label, className = "", accent, danger, isLight, onPress }) => {
  const { focusProps, isFocused } = useFocusable<HTMLButtonElement>({
    id,
    scopeId: "console-osk",
    onConfirm: onPress,
  })
  return (
    <button
      type="button"
      {...focusProps}
      className={`flex h-11 w-full items-center justify-center rounded-xl border text-sm font-extrabold transition-all cursor-pointer select-none outline-none ${className} ${
        isFocused
          ? "z-10 scale-105 border-cyan-300 bg-cyan-400 text-slate-950 ring-2 ring-white shadow-[0_0_20px_rgba(0,229,255,0.55)]"
          : accent
            ? isLight
              ? "border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-500 shadow-xs"
              : "border-cyan-400/50 bg-cyan-500/25 text-cyan-200 hover:bg-cyan-500/35"
            : danger
              ? isLight
                ? "border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100"
                : "border-rose-400/35 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25"
              : isLight
                ? "border-slate-300 bg-white text-slate-800 hover:bg-slate-100 shadow-2xs"
                : "border-white/12 bg-white/[0.07] text-slate-100 hover:bg-white/14"
      }`}
    >
      {label}
    </button>
  )
}

const LiveResultItem: React.FC<{
  id: string
  title: string
  subtitle: string
  coverUrl: string | null
  badge: string
  isLight: boolean
  onSelect: () => void
}> = ({ id, title, subtitle, coverUrl, badge, isLight, onSelect }) => {
  const { focusProps, isFocused } = useFocusable<HTMLButtonElement>({
    id,
    scopeId: "console-osk",
    onConfirm: onSelect,
  })
  const img = resolveConsoleHighResUrl(coverUrl)

  return (
    <button
      type="button"
      {...focusProps}
      className={`flex w-full items-center gap-3.5 rounded-2xl border p-2.5 text-left transition-all cursor-pointer outline-none ${
        isFocused
          ? isLight
            ? "scale-[1.01] border-indigo-500 bg-indigo-50 text-slate-900 shadow-md ring-2 ring-indigo-400/40"
            : "scale-[1.01] border-cyan-300 bg-cyan-400/20 text-white shadow-lg ring-2 ring-cyan-400/40"
          : isLight
            ? "border-slate-200 bg-white text-slate-800 hover:bg-slate-50 shadow-2xs"
            : "border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]"
      }`}
    >
      <div
        className={`h-14 w-11 shrink-0 overflow-hidden rounded-xl ${
          isLight ? "bg-slate-200" : "bg-slate-800"
        }`}
      >
        {img ? (
          <img src={img} alt={title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs font-bold text-slate-400">
            <Gamepad2 className="size-4" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-sm font-extrabold ${
            isLight ? "text-slate-900" : "text-white"
          }`}
        >
          {title}
        </p>
        <p
          className={`truncate text-xs ${
            isLight ? "text-slate-500" : "text-slate-400"
          }`}
        >
          {subtitle}
        </p>
      </div>
      <span
        className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold uppercase ${
          isLight
            ? "border-indigo-200 bg-indigo-50 text-indigo-700"
            : "border-cyan-400/30 bg-cyan-400/15 text-cyan-300"
        }`}
      >
        {badge}
      </span>
    </button>
  )
}

export interface ConsoleOSKProps {
  games?: Game[]
  storeGames?: HubGame[]
}

export const ConsoleOSK: React.FC<ConsoleOSKProps> = ({ games = [], storeGames = [] }) => {
  const osk = useConsoleStore((s) => s.osk)
  const themeId = useConsoleStore((s) => s.theme)
  const isLight = Boolean(CONSOLE_THEMES[themeId]?.isLight)
  const closeOsk = useConsoleStore((s) => s.closeOsk)
  const setSelectedGameId = useConsoleStore((s) => s.setSelectedGameId)
  const setSelectedStoreHubGame = useConsoleStore((s) => s.setSelectedStoreHubGame)
  const [value, setValue] = useState(osk.initialValue)
  const [kbLang, setKbLang] = useState<"en" | "fa">("en")

  React.useEffect(() => {
    setValue(osk.initialValue)
  }, [osk.initialValue, osk.open])

  const liveMatches = useMemo(() => {
    const q = value.trim().toLowerCase()
    if (!q) {
      return {
        lib: games.filter((g) => !g.is_hidden && !g.is_memory).slice(0, 4),
        store: storeGames.slice(0, 4),
      }
    }
    const lib = games
      .filter(
        (g) =>
          !g.is_hidden &&
          !g.is_memory &&
          (g.name.toLowerCase().includes(q) ||
            g.genres.some((gn) => gn.toLowerCase().includes(q))),
      )
      .slice(0, 5)

    const store = storeGames
      .filter(
        (hg) =>
          hg.name.toLowerCase().includes(q) ||
          hg.genres.some((gn) => gn.toLowerCase().includes(q)),
      )
      .slice(0, 5)

    return { lib, store }
  }, [value, games, storeGames])

  if (!osk.open) return null

  const handleSubmit = (finalValue = value) => {
    osk.onSubmit?.(finalValue)
    closeOsk()
  }

  const activeRows = kbLang === "en" ? EN_KEYPAD_ROWS : FA_KEYPAD_ROWS

  return (
    <AnimatePresence>
      <motion.div
        key="console-spotlight-search"
        dir="ltr"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={closeOsk}
        className="fixed inset-0 z-[260] flex items-center justify-center bg-black/70 backdrop-blur-xl p-4 sm:p-6 select-none"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-6xl"
        >
          <FocusScope
            id="console-osk"
            trapFocus
            className={`w-full rounded-3xl border p-5 sm:p-7 shadow-[0_32px_90px_rgba(0,0,0,0.65)] ${
              isLight
                ? "border-slate-300 bg-gradient-to-b from-white via-slate-50 to-slate-100 text-slate-900"
                : "border-cyan-400/35 bg-gradient-to-b from-[#111930] via-[#0c1224] to-[#080c18] text-white"
            }`}
          >
            {/* Header Label */}
            <div className="mb-2.5 flex items-center justify-between text-xs font-extrabold uppercase tracking-wider">
              <span className={isLight ? "text-indigo-600" : "text-cyan-400"}>
                {osk.title || "Console On-Screen Keyboard & Instant Search"}
              </span>
              <span className={isLight ? "text-slate-500" : "text-slate-400"}>
                Press ESC or Back to Close
              </span>
            </div>

            {/* Spotlight Input Bar */}
            <div
              className={`flex items-center gap-3 rounded-2xl border-2 px-4 py-3 ${
                isLight
                  ? "border-indigo-400/60 bg-white shadow-sm"
                  : "border-cyan-400/50 bg-slate-950/90 shadow-[0_0_35px_rgba(0,229,255,0.2)]"
              }`}
            >
              <Search
                className={`size-5 shrink-0 ${isLight ? "text-indigo-600" : "text-cyan-400"}`}
              />
              <input
                type="text"
                value={value}
                autoFocus
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSubmit()
                  if (e.key === "Escape") closeOsk()
                }}
                placeholder="Search games, genres, or type with keyboard / controller..."
                className={`w-full bg-transparent text-lg sm:text-xl font-extrabold outline-none ${
                  isLight
                    ? "text-slate-900 placeholder:text-slate-400"
                    : "text-white placeholder:text-slate-500"
                }`}
              />
              {value && (
                <button
                  type="button"
                  onClick={() => setValue("")}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold cursor-pointer shrink-0 ${
                    isLight
                      ? "bg-slate-200 text-slate-700 hover:bg-slate-300"
                      : "bg-white/10 text-slate-300 hover:bg-white/20"
                  }`}
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={() => handleSubmit()}
                className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-extrabold cursor-pointer shrink-0 ${
                  isLight
                    ? "bg-indigo-600 text-white hover:bg-indigo-500"
                    : "bg-cyan-400 text-slate-950 hover:bg-cyan-300"
                }`}
              >
                <CornerDownLeft className="size-4" />
                <span>Apply</span>
              </button>
              <button
                type="button"
                onClick={closeOsk}
                className={`rounded-xl border p-2 cursor-pointer shrink-0 ${
                  isLight
                    ? "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200"
                    : "border-white/15 bg-white/5 text-slate-300 hover:bg-white/10"
                }`}
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Quick Genre / Filter Pills */}
            <div className="mt-3.5 flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
              <span
                className={`mr-1 flex shrink-0 items-center gap-1 text-xs font-extrabold uppercase tracking-wider ${
                  isLight ? "text-indigo-700" : "text-cyan-400"
                }`}
              >
                <Sparkles className="size-3.5" />
                Quick Tags:
              </span>
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5 flex-1">
                {QUICK_CHIPS.map((chip) => (
                  <KeyCapButton
                    key={chip}
                    id={`osk_chip_${chip}`}
                    label={chip}
                    className="h-9 text-xs"
                    isLight={isLight}
                    onPress={() => {
                      setValue(chip)
                      handleSubmit(chip)
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Two-Column Body: Non-Wrapping 10-Column Keypad + Instant Live Results */}
            <div className="mt-5 grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
              {/* Left 7 Columns: Structured 10-Column Controller Keypad */}
              <div
                dir="ltr"
                className={`lg:col-span-7 flex flex-col justify-between rounded-2xl border p-4 space-y-2.5 ${
                  isLight
                    ? "border-slate-200 bg-slate-100/90"
                    : "border-white/10 bg-white/[0.03]"
                }`}
              >
                <div
                  className={`flex items-center justify-between text-xs font-bold pb-1 ${
                    isLight ? "text-slate-600" : "text-slate-400"
                  }`}
                >
                  <span className="flex items-center gap-1.5 font-extrabold">
                    <Gamepad2 className="size-4 text-cyan-400" />
                    Controller Keypad ({kbLang === "en" ? "EN · QWERTY" : "FA · فارسی"})
                  </span>
                  <button
                    type="button"
                    onClick={() => setKbLang((prev) => (prev === "en" ? "fa" : "en"))}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-black cursor-pointer transition-colors ${
                      isLight
                        ? "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                        : "border-cyan-400/35 bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25"
                    }`}
                  >
                    <Globe className="size-3" />
                    <span>Switch to {kbLang === "en" ? "فارسی (FA)" : "English (EN)"}</span>
                  </button>
                </div>

                {/* 4 Fixed 10-Column Rows: Never wraps or scrambles! */}
                <div className="space-y-2" dir="ltr">
                  {activeRows.map((row, rIdx) => (
                    <div key={rIdx} className="grid grid-cols-10 gap-1.5" dir="ltr">
                      {row.map((ch) => (
                        <KeyCapButton
                          key={`${kbLang}_${rIdx}_${ch}`}
                          id={`osk_key_${rIdx}_${ch}`}
                          label={ch.toUpperCase()}
                          isLight={isLight}
                          onPress={() => setValue((v) => v + ch)}
                        />
                      ))}
                    </div>
                  ))}
                </div>

                {/* Bottom 4-Button Utility Bar */}
                <div className="grid grid-cols-4 gap-2 pt-2" dir="ltr">
                  <KeyCapButton
                    id="osk_space"
                    label={
                      <span className="flex items-center gap-1.5">
                        <Space className="size-4" />
                        <span>Space</span>
                      </span>
                    }
                    isLight={isLight}
                    onPress={() => setValue((v) => `${v} `)}
                  />
                  <KeyCapButton
                    id="osk_backspace"
                    label={
                      <span className="flex items-center gap-1.5">
                        <Delete className="size-4" />
                        <span>Backspace</span>
                      </span>
                    }
                    isLight={isLight}
                    onPress={() => setValue((v) => v.slice(0, -1))}
                  />
                  <KeyCapButton
                    id="osk_clear_all"
                    label={
                      <span className="flex items-center gap-1.5">
                        <Trash2 className="size-3.5" />
                        <span>Clear</span>
                      </span>
                    }
                    danger
                    isLight={isLight}
                    onPress={() => setValue("")}
                  />
                  <KeyCapButton
                    id="osk_submit_btn"
                    label={
                      <span className="flex items-center gap-1.5">
                        <CornerDownLeft className="size-4" />
                        <span>Search</span>
                      </span>
                    }
                    accent
                    isLight={isLight}
                    onPress={() => handleSubmit()}
                  />
                </div>
              </div>

              {/* Right 5 Columns: Instant Live Results (Library & Store) */}
              <div
                className={`lg:col-span-5 rounded-2xl border p-4 space-y-3 max-h-[22.5rem] overflow-y-auto no-scrollbar ${
                  isLight
                    ? "border-slate-200 bg-slate-100/90"
                    : "border-white/10 bg-white/[0.03]"
                }`}
              >
                <div
                  className={`flex items-center justify-between text-xs font-bold ${
                    isLight ? "text-slate-500" : "text-slate-400"
                  }`}
                >
                  <span
                    className={`flex items-center gap-1.5 font-extrabold ${
                      isLight ? "text-indigo-700" : "text-cyan-300"
                    }`}
                  >
                    <Compass className="size-3.5" />
                    Instant Matches
                  </span>
                  <span>Select to open directly</span>
                </div>

                {liveMatches.lib.length === 0 && liveMatches.store.length === 0 ? (
                  <div
                    className={`py-12 text-center text-sm ${
                      isLight ? "text-slate-500" : "text-slate-400"
                    }`}
                  >
                    No direct title matches for &ldquo;{value}&rdquo; — press Search to filter.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {liveMatches.lib.map((g) => (
                      <LiveResultItem
                        key={`lib_${g.id}`}
                        id={`osk_res_lib_${g.id}`}
                        title={g.name}
                        subtitle={g.genres.slice(0, 2).join(" · ") || "In Your Library"}
                        coverUrl={g.cover_path}
                        badge="Library"
                        isLight={isLight}
                        onSelect={() => {
                          closeOsk()
                          setSelectedGameId(g.id)
                        }}
                      />
                    ))}
                    {liveMatches.store.map((hg) => (
                      <LiveResultItem
                        key={`store_${hg.igdb_id}`}
                        id={`osk_res_store_${hg.igdb_id}`}
                        title={hg.name}
                        subtitle={
                          hg.sale_price_formatted ||
                          hg.genres.slice(0, 2).join(" · ") ||
                          "Store Catalog"
                        }
                        coverUrl={hg.cover_url}
                        badge="Store"
                        isLight={isLight}
                        onSelect={() => {
                          closeOsk()
                          setSelectedStoreHubGame(hg)
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div
              className={`mt-4 flex flex-wrap items-center justify-between border-t pt-3.5 text-xs ${
                isLight
                  ? "border-slate-200 text-slate-500"
                  : "border-white/10 text-slate-400"
              }`}
            >
              <span>Type directly on your physical keyboard or use the controller keypad</span>
              <div className="flex items-center gap-5">
                <Glyph button="confirm" label="Select" size="sm" />
                <Glyph button="back" label="Close" size="sm" />
              </div>
            </div>
          </FocusScope>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
