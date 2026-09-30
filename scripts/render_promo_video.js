import { execSync } from 'child_process'
import path from 'path'
import fs from 'fs'

const FONT_PATH = 'C\\:/Windows/Fonts/segoeuib.ttf'
const ICON_PATH = path.resolve('website', 'assets', 'icon.png')
const HERO_PATH = path.resolve('website', 'assets', 'nexus_3d_hero.jpg')
const BOOSTER_PATH = path.resolve('website', 'assets', 'nexus_booster_hud.jpg')
const VAULT_PATH = path.resolve('website', 'assets', 'nexus_vault.jpg')
const AUDIO_PATH = path.resolve('scripts', 'promo_soundtrack.wav')
const OUTPUT_DESKTOP = 'C:/Users/Amin/Desktop/nexus_launcher_promo.mp4'

console.log('Rendering 5 cinematic motion scenes with FFmpeg...')

// Scene 1: Brand Intro (5s)
console.log('Rendering Scene 1: Brand Intro...')
const cmd1 = [
  'ffmpeg -y',
  '-f lavfi -i "color=c=0x060814:s=1920x1080:d=5:r=30"',
  `-loop 1 -t 5 -i "${ICON_PATH}"`,
  '-filter_complex "[1:v]scale=180:180[icon];[0:v][icon]overlay=(W-w)/2:(H-h)/2-120[v1];' +
    `[v1]drawtext=fontfile='${FONT_PATH}':text='NEXUS LAUNCHER':fontcolor=0x22d3ee:fontsize=76:x=(w-text_w)/2:y=(h-text_h)/2+70:shadowcolor=0x0891b2:shadowx=3:shadowy=3[v2];` +
    `[v2]drawtext=fontfile='${FONT_PATH}':text='NEXT-GEN DESKTOP GAME LAUNCHER':fontcolor=white:fontsize=30:x=(w-text_w)/2:y=(h-text_h)/2+145[v3];` +
    '[v3]fade=t=in:st=0:d=0.8,fade=t=out:st=4.3:d=0.7[vout]"',
  '-map "[vout]" -t 5 -vframes 150 -c:v libx264 -pix_fmt yuv420p -preset fast scripts/scene1.mp4',
].join(' ')
execSync(cmd1, { stdio: 'inherit' })

// Scene 2: Unified Game Library (5s)
console.log('Rendering Scene 2: Unified Game Library...')
const cmd2 = [
  'ffmpeg -y',
  `-loop 1 -t 5 -i "${HERO_PATH}"`,
  "-filter_complex \"[0:v]scale=2200:-1,zoompan=z='min(zoom+0.0015,1.2)':d=150:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080:fps=30[zp];" +
    'color=c=black:s=1920x340[bar];' +
    '[bar]format=rgba,colorchannelmixer=aa=0.85[bar_alpha];' +
    '[zp][bar_alpha]overlay=0:H-340[v1];' +
    `[v1]drawtext=fontfile='${FONT_PATH}':text='UNIFIED GAME LIBRARY':fontcolor=white:fontsize=64:x=90:y=h-240[v2];` +
    `[v2]drawtext=fontfile='${FONT_PATH}':text='Steam  •  Epic Games  •  GOG  •  Local Installs  •  Instant 1ms Search':fontcolor=0x38bdf8:fontsize=28:x=90:y=h-160[v3];` +
    '[v3]fade=t=in:st=0:d=0.7,fade=t=out:st=4.3:d=0.7[vout]"',
  '-map "[vout]" -t 5 -vframes 150 -c:v libx264 -pix_fmt yuv420p -preset fast scripts/scene2.mp4',
].join(' ')
execSync(cmd2, { stdio: 'inherit' })

// Scene 3: Turbo Booster Engine (5s)
console.log('Rendering Scene 3: Turbo Booster Engine...')
const cmd3 = [
  'ffmpeg -y',
  `-loop 1 -t 5 -i "${BOOSTER_PATH}"`,
  "-filter_complex \"[0:v]scale=2200:-1,zoompan=z='min(max(1.15-0.0012*on,1.0),1.15)':d=150:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080:fps=30[zp];" +
    'color=c=black:s=1920x340[bar];' +
    '[bar]format=rgba,colorchannelmixer=aa=0.85[bar_alpha];' +
    '[zp][bar_alpha]overlay=0:H-340[v1];' +
    `[v1]drawtext=fontfile='${FONT_PATH}':text='NEXUS TURBO BOOSTER':fontcolor=0xfbbf24:fontsize=64:x=90:y=h-240[v2];` +
    `[v2]drawtext=fontfile='${FONT_PATH}':text='RAM Flushing  •  Background Process Suppression  •  CPU Core Affinity':fontcolor=0xf87171:fontsize=28:x=90:y=h-160[v3];` +
    '[v3]fade=t=in:st=0:d=0.7,fade=t=out:st=4.3:d=0.7[vout]"',
  '-map "[vout]" -t 5 -vframes 150 -c:v libx264 -pix_fmt yuv420p -preset fast scripts/scene3.mp4',
].join(' ')
execSync(cmd3, { stdio: 'inherit' })

// Scene 4: Smart Save Vault (5s)
console.log('Rendering Scene 4: Smart Save Vault...')
const cmd4 = [
  'ffmpeg -y',
  `-loop 1 -t 5 -i "${VAULT_PATH}"`,
  "-filter_complex \"[0:v]scale=2200:-1,zoompan=z='min(zoom+0.0012,1.18)':d=150:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080:fps=30[zp];" +
    'color=c=black:s=1920x340[bar];' +
    '[bar]format=rgba,colorchannelmixer=aa=0.85[bar_alpha];' +
    '[zp][bar_alpha]overlay=0:H-340[v1];' +
    `[v1]drawtext=fontfile='${FONT_PATH}':text='SMART SAVE VAULT':fontcolor=0x34d399:fontsize=64:x=90:y=h-240[v2];` +
    `[v2]drawtext=fontfile='${FONT_PATH}':text='Auto Save Detection  •  Cloud Backups  •  Journaled Crash Recovery':fontcolor=0x67e8f9:fontsize=28:x=90:y=h-160[v3];` +
    '[v3]fade=t=in:st=0:d=0.7,fade=t=out:st=4.3:d=0.7[vout]"',
  '-map "[vout]" -t 5 -vframes 150 -c:v libx264 -pix_fmt yuv420p -preset fast scripts/scene4.mp4',
].join(' ')
execSync(cmd4, { stdio: 'inherit' })

// Scene 5: Outro & Call to Action (5s)
console.log('Rendering Scene 5: Outro & Call to Action...')
const cmd5 = [
  'ffmpeg -y',
  '-f lavfi -i "color=c=0x060814:s=1920x1080:d=5:r=30"',
  `-loop 1 -t 5 -i "${ICON_PATH}"`,
  '-filter_complex "[1:v]scale=190:190[icon];[0:v][icon]overlay=(W-w)/2:(H-h)/2-130[v1];' +
    `[v1]drawtext=fontfile='${FONT_PATH}':text='UNLEASH YOUR PLAY':fontcolor=white:fontsize=76:x=(w-text_w)/2:y=(h-text_h)/2+60[v2];` +
    `[v2]drawtext=fontfile='${FONT_PATH}':text='NEXUS LAUNCHER  •  TAURI 2 + REACT 19 + RUST':fontcolor=0xa855f7:fontsize=32:x=(w-text_w)/2:y=(h-text_h)/2+140[v3];` +
    '[v3]fade=t=in:st=0:d=0.8,fade=t=out:st=3.8:d=1.2[vout]"',
  '-map "[vout]" -t 5 -vframes 150 -c:v libx264 -pix_fmt yuv420p -preset fast scripts/scene5.mp4',
].join(' ')
execSync(cmd5, { stdio: 'inherit' })

// Concat list
console.log('Concatenating scenes and mixing with stereo synthwave soundtrack...')
const concatList = [
  "file 'scene1.mp4'",
  "file 'scene2.mp4'",
  "file 'scene3.mp4'",
  "file 'scene4.mp4'",
  "file 'scene5.mp4'",
].join('\n')
fs.writeFileSync(path.resolve('scripts', 'concat.txt'), concatList)

// Final Mux
const finalCmd = `ffmpeg -y -f concat -safe 0 -i scripts/concat.txt -i "${AUDIO_PATH}" -c:v copy -c:a aac -b:a 256k -shortest "${OUTPUT_DESKTOP}"`
execSync(finalCmd, { stdio: 'inherit' })

console.log(`\n🎉 PROMO MOTION GRAPHICS VIDEO SUCCESSFULLY CREATED!`)
console.log(`Destination: ${OUTPUT_DESKTOP}`)
