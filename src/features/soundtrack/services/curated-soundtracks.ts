import type { GameIdentity, SoundtrackAlbumWithTracks, SoundtrackTrack } from '../types'
import { extractCoreGameTitle } from './providers/base-provider'

interface CuratedOstSpec {
  albumTitle: string
  artist: string
  releaseYear: string
  tracks: { title: string; artist?: string; durationSec: number }[]
}

const CURATED_OST_CATALOG: Record<string, CuratedOstSpec> = {
  'elden ring': {
    albumTitle: 'Elden Ring (Original Soundtrack)',
    artist: 'Tsukasa Saitoh, Shoi Miyazawa, Tai Tomisawa, Yuka Kitamura, Yoshimi Kudo',
    releaseYear: '2022',
    tracks: [
      { title: 'Elden Ring', artist: 'Tsukasa Saitoh', durationSec: 113 },
      { title: 'Opening', artist: 'Tsukasa Saitoh', durationSec: 214 },
      { title: 'Limgrave', artist: 'Tai Tomisawa', durationSec: 228 },
      { title: 'Margit, the Fell Omen', artist: 'Tsukasa Saitoh', durationSec: 221 },
      { title: 'Godrick the Grafted', artist: 'Shoi Miyazawa', durationSec: 274 },
      { title: 'Starscourge Radahn', artist: 'Shoi Miyazawa', durationSec: 329 },
      { title: 'Leyndell, Royal Capital', artist: 'Yuka Kitamura', durationSec: 245 },
      { title: 'Morgott, the Omen King', artist: 'Tsukasa Saitoh', durationSec: 238 },
      { title: 'Malenia, Blade of Miquella', artist: 'Yuka Kitamura', durationSec: 229 },
      { title: 'Godskin Apostles', artist: 'Tai Tomisawa', durationSec: 276 },
      { title: 'Mohg, Lord of Blood', artist: 'Shoi Miyazawa', durationSec: 263 },
      { title: 'The Final Battle', artist: 'Tsukasa Saitoh', durationSec: 291 },
    ],
  },
  'the witcher 3 wild hunt': {
    albumTitle: 'The Witcher 3: Wild Hunt (Original Game Soundtrack)',
    artist: 'Marcin Przybyłowicz, Mikolai Stroinski, Percival',
    releaseYear: '2015',
    tracks: [
      { title: 'The Trail', artist: 'Marcin Przybyłowicz', durationSec: 169 },
      { title: 'Geralt of Rivia', artist: 'Marcin Przybyłowicz', durationSec: 141 },
      {
        title: 'Silver for Monsters...',
        artist: 'Marcin Przybyłowicz, Percival',
        durationSec: 139,
      },
      { title: '...Steel for Humans', artist: 'Marcin Przybyłowicz, Percival', durationSec: 87 },
      { title: 'Kaer Morhen', artist: 'Marcin Przybyłowicz', durationSec: 155 },
      { title: 'The Fields of Ard Skellig', artist: 'Marcin Przybyłowicz', durationSec: 189 },
      { title: 'Ladies of the Woods', artist: 'Marcin Przybyłowicz', durationSec: 111 },
      {
        title: 'The Wolven Storm (Priscilla’s Song)',
        artist: 'Marcin Przybyłowicz',
        durationSec: 185,
      },
      { title: 'Hunt or Be Hunted', artist: 'Marcin Przybyłowicz', durationSec: 145 },
      { title: 'Lullaby of Woe', artist: 'Marcin Przybyłowicz', durationSec: 151 },
    ],
  },
  'cyberpunk 2077': {
    albumTitle: 'Cyberpunk 2077 (Original Score)',
    artist: 'Marcin Przybyłowicz, P.T. Adamczyk, Paul Leonard-Morgan',
    releaseYear: '2020',
    tracks: [
      { title: 'V', artist: 'Marcin Przybyłowicz', durationSec: 196 },
      { title: 'The Rebel Path', artist: 'P.T. Adamczyk', durationSec: 251 },
      { title: 'Been Good to Know Ya', artist: 'Marcin Przybyłowicz', durationSec: 255 },
      { title: 'Never Fade Away (SAMURAI)', artist: 'Refused / P.T. Adamczyk', durationSec: 286 },
      { title: 'Chippin’ In', artist: 'SAMURAI', durationSec: 214 },
      { title: 'Outsider No More', artist: 'P.T. Adamczyk', durationSec: 230 },
      { title: 'No Save Point', artist: 'Run The Jewels', durationSec: 194 },
      {
        title: 'I Really Want to Stay at Your House',
        artist: ' Rosa Walton & Hallie Coggins',
        durationSec: 246,
      },
    ],
  },
  'baldurs gate 3': {
    albumTitle: "Baldur's Gate 3 (Original Game Soundtrack)",
    artist: 'Borislav Slavov',
    releaseYear: '2023',
    tracks: [
      { title: 'Main Theme Part I', artist: 'Borislav Slavov', durationSec: 168 },
      { title: 'Down by the River', artist: 'Borislav Slavov', durationSec: 140 },
      { title: 'Who Are You', artist: 'Borislav Slavov', durationSec: 145 },
      { title: 'Sixteen Strikes', artist: 'Borislav Slavov', durationSec: 242 },
      { title: 'I Want to Live', artist: 'Borislav Slavov', durationSec: 233 },
      { title: 'Nightsong', artist: 'Borislav Slavov', durationSec: 247 },
      { title: "Raphael's Final Act", artist: 'Borislav Slavov', durationSec: 158 },
      { title: 'The Power', artist: 'Borislav Slavov', durationSec: 215 },
    ],
  },
  'red dead redemption 2': {
    albumTitle: 'Red Dead Redemption 2 (Original Score & Soundtrack)',
    artist: 'Woody Jackson, Daniel Lanois',
    releaseYear: '2018',
    tracks: [
      { title: 'American Venom', artist: 'Woody Jackson', durationSec: 173 },
      { title: 'Outlaws from the West', artist: 'Woody Jackson', durationSec: 296 },
      { title: 'Unshaken', artist: "D'Angelo", durationSec: 233 },
      { title: "That's the Way It Is", artist: 'Daniel Lanois', durationSec: 198 },
      { title: 'Housebuilding Song', artist: 'David Ferguson', durationSec: 215 },
      { title: 'Blood Feuds, Ancient and Modern', artist: 'Woody Jackson', durationSec: 441 },
      { title: 'Cruel World', artist: 'Willie Nelson', durationSec: 205 },
      { title: 'Fleeting Joy', artist: 'Woody Jackson', durationSec: 238 },
    ],
  },
  'red dead redemption': {
    albumTitle: 'Red Dead Redemption (Original Soundtrack)',
    artist: 'Bill Elm & Woody Jackson',
    releaseYear: '2010',
    tracks: [
      { title: 'Born Unto Trouble', artist: 'Bill Elm & Woody Jackson', durationSec: 192 },
      { title: 'Far Away', artist: 'José González', durationSec: 280 },
      { title: 'Compass (Red Dead On Arrival Version)', artist: 'Jamie Lidell', durationSec: 179 },
      { title: "Deadman's Gun", artist: 'Ashtar Command', durationSec: 255 },
      { title: 'The Shootist', artist: 'Bill Elm & Woody Jackson', durationSec: 257 },
      { title: 'Exodus in America', artist: 'Bill Elm & Woody Jackson', durationSec: 299 },
    ],
  },
  'god of war': {
    albumTitle: 'God of War (PlayStation Soundtrack)',
    artist: 'Bear McCreary',
    releaseYear: '2018',
    tracks: [
      { title: 'God of War', artist: 'Bear McCreary', durationSec: 249 },
      { title: 'Memories of Mother', artist: 'Bear McCreary', durationSec: 221 },
      { title: 'Witch of the Woods', artist: 'Bear McCreary', durationSec: 185 },
      { title: 'Lullaby of the Giants', artist: 'Bear McCreary', durationSec: 219 },
      { title: 'Deliverance', artist: 'Bear McCreary', durationSec: 381 },
      { title: 'Valkyries', artist: 'Bear McCreary', durationSec: 310 },
      { title: 'Ashes', artist: 'Bear McCreary feat. Eivør', durationSec: 371 },
    ],
  },
  'god of war ragnarok': {
    albumTitle: 'God of War Ragnarök (Original Soundtrack)',
    artist: 'Bear McCreary',
    releaseYear: '2022',
    tracks: [
      { title: 'God of War Ragnarök', artist: 'Bear McCreary feat. Eivør', durationSec: 274 },
      { title: 'Blood Upon the Snow', artist: 'Hozier & Bear McCreary', durationSec: 272 },
      { title: 'Svartalfheim', artist: 'Bear McCreary', durationSec: 285 },
      { title: 'The Hammer of Thor', artist: 'Bear McCreary', durationSec: 251 },
      { title: 'A Son’s Path', artist: 'Bear McCreary', durationSec: 212 },
      { title: 'The All-Father', artist: 'Bear McCreary', durationSec: 244 },
      { title: 'Ragnarök', artist: 'Bear McCreary', durationSec: 318 },
      { title: 'Letting Go', artist: 'Bear McCreary', durationSec: 365 },
    ],
  },
  'ghost of tsushima': {
    albumTitle: 'Ghost of Tsushima (Music from the Video Game)',
    artist: 'Ilan Eshkeri & Shigeru Umebayashi',
    releaseYear: '2020',
    tracks: [
      {
        title: 'The Way of the Ghost',
        artist: 'Ilan Eshkeri feat. Clare Uchima',
        durationSec: 216,
      },
      { title: 'Jin Sakai', artist: 'Ilan Eshkeri', durationSec: 171 },
      { title: 'Komoda Beach', artist: 'Ilan Eshkeri', durationSec: 212 },
      { title: 'The Way of the Samurai', artist: 'Shigeru Umebayashi', durationSec: 204 },
      { title: 'Lord Shimura', artist: 'Ilan Eshkeri', durationSec: 162 },
      { title: 'Heart of the Jito', artist: 'Ilan Eshkeri', durationSec: 252 },
      { title: 'Sacrifice of Tradition', artist: 'Ilan Eshkeri', durationSec: 275 },
    ],
  },
  'the last of us': {
    albumTitle: 'The Last of Us (Original Score)',
    artist: 'Gustavo Santaolalla',
    releaseYear: '2013',
    tracks: [
      { title: 'The Last of Us', artist: 'Gustavo Santaolalla', durationSec: 183 },
      { title: 'All Gone (No Escape)', artist: 'Gustavo Santaolalla', durationSec: 174 },
      { title: 'The Choice', artist: 'Gustavo Santaolalla', durationSec: 102 },
      { title: 'Vanishing Grace', artist: 'Gustavo Santaolalla', durationSec: 126 },
      { title: 'Home', artist: 'Gustavo Santaolalla', durationSec: 188 },
      { title: 'The Path (A New Beginning)', artist: 'Gustavo Santaolalla', durationSec: 167 },
    ],
  },
  'the last of us part i': {
    albumTitle: 'The Last of Us Part I (Original Soundtrack)',
    artist: 'Gustavo Santaolalla',
    releaseYear: '2022',
    tracks: [
      { title: 'The Last of Us', artist: 'Gustavo Santaolalla', durationSec: 183 },
      { title: 'All Gone (No Escape)', artist: 'Gustavo Santaolalla', durationSec: 174 },
      { title: 'The Choice', artist: 'Gustavo Santaolalla', durationSec: 102 },
      { title: 'Vanishing Grace', artist: 'Gustavo Santaolalla', durationSec: 126 },
      { title: 'Left Behind (Together)', artist: 'Gustavo Santaolalla', durationSec: 158 },
      { title: 'The Path (A New Beginning)', artist: 'Gustavo Santaolalla', durationSec: 167 },
    ],
  },
  'the last of us part ii': {
    albumTitle: 'The Last of Us Part II (Original Soundtrack)',
    artist: 'Gustavo Santaolalla, Mac Quayle',
    releaseYear: '2020',
    tracks: [
      { title: 'The Last of Us Part II', artist: 'Gustavo Santaolalla', durationSec: 172 },
      { title: 'Unbroken', artist: 'Gustavo Santaolalla', durationSec: 278 },
      { title: 'Allowed to be Happy', artist: 'Gustavo Santaolalla', durationSec: 168 },
      { title: 'The Cycle of Violence', artist: 'Mac Quayle', durationSec: 304 },
      { title: 'Longing', artist: 'Gustavo Santaolalla', durationSec: 145 },
      { title: 'Beyond Desolation', artist: 'Gustavo Santaolalla', durationSec: 144 },
    ],
  },
  'marvels spider man': {
    albumTitle: "Marvel's Spider-Man (Original Video Game Soundtrack)",
    artist: 'John Paesano',
    releaseYear: '2018',
    tracks: [
      { title: 'Spider-Man', artist: 'John Paesano', durationSec: 205 },
      { title: 'Eight Years in the Making', artist: 'John Paesano', durationSec: 132 },
      { title: 'City of Hope', artist: 'John Paesano', durationSec: 161 },
      { title: 'The Golden Age', artist: 'John Paesano', durationSec: 187 },
      { title: 'Sinister Six', artist: 'John Paesano', durationSec: 196 },
      { title: 'Responsibility', artist: 'John Paesano', durationSec: 238 },
    ],
  },
  'marvels spider man miles morales': {
    albumTitle: "Marvel's Spider-Man: Miles Morales (Original Video Game Soundtrack)",
    artist: 'John Paesano',
    releaseYear: '2020',
    tracks: [
      { title: "New York's Only Spider-Man", artist: 'John Paesano', durationSec: 158 },
      { title: 'Won’t Give Up', artist: 'John Paesano', durationSec: 167 },
      { title: 'Make It Right', artist: 'John Paesano', durationSec: 184 },
      { title: 'I’m Ready', artist: 'Jaden', durationSec: 180 },
      { title: 'Where We Come From', artist: 'Lecrae', durationSec: 172 },
    ],
  },
  'marvels spider man 2': {
    albumTitle: "Marvel's Spider-Man 2 (Original Video Game Soundtrack)",
    artist: 'John Paesano',
    releaseYear: '2023',
    tracks: [
      { title: 'Greater Together', artist: 'John Paesano', durationSec: 142 },
      { title: 'The Great Hunter', artist: 'John Paesano', durationSec: 234 },
      { title: 'Swing', artist: 'EARTHGANG feat. Benji', durationSec: 188 },
      { title: 'Healing the World', artist: 'John Paesano', durationSec: 245 },
      { title: 'Fighting Back', artist: 'John Paesano', durationSec: 210 },
      { title: 'In Full Swing', artist: 'John Paesano', durationSec: 192 },
    ],
  },
  'black myth wukong': {
    albumTitle: 'Black Myth: Wukong (Original Game Soundtrack)',
    artist: '8082 Audio, Zhai Jinyan',
    releaseYear: '2024',
    tracks: [
      { title: 'Celestial Symphony (Main Theme)', artist: '8082 Audio', durationSec: 168 },
      { title: 'Black Cloud, Red Fire', artist: '8082 Audio', durationSec: 194 },
      {
        title: 'Headless Lingji Bodhisattva (Sanxian Ballad)',
        artist: 'Xiong Zhuying',
        durationSec: 156,
      },
      { title: 'Seeing Through', artist: '8082 Audio', durationSec: 212 },
      { title: 'Nonsense! (Yellowbrow)', artist: '8082 Audio', durationSec: 225 },
      { title: 'Unfinished (Destined One)', artist: '8082 Audio', durationSec: 242 },
    ],
  },
  'clair obscur expedition 33': {
    albumTitle: 'Clair Obscur: Expedition 33 (Original Soundtrack)',
    artist: 'Lorien Testard feat. Alice Duport-Percier',
    releaseYear: '2025',
    tracks: [
      { title: 'Alicia', artist: 'Lorien Testard & Alice Duport-Percier', durationSec: 198 },
      { title: 'Lumière', artist: 'Lorien Testard & Alice Duport-Percier', durationSec: 224 },
      {
        title: 'Une vie à t’aimer',
        artist: 'Lorien Testard & Alice Duport-Percier',
        durationSec: 265,
      },
      { title: 'Monoco', artist: 'Lorien Testard', durationSec: 184 },
      { title: 'Verso', artist: 'Lorien Testard', durationSec: 211 },
      { title: 'Clair-Obscur', artist: 'Lorien Testard', durationSec: 246 },
    ],
  },
  hades: {
    albumTitle: 'Hades: Original Soundtrack',
    artist: 'Darren Korb feat. Ashley Barrett',
    releaseYear: '2020',
    tracks: [
      { title: 'No Escape', artist: 'Darren Korb', durationSec: 145 },
      { title: 'The House of Hades', artist: 'Darren Korb', durationSec: 201 },
      { title: 'Out of Tartarus', artist: 'Darren Korb', durationSec: 344 },
      { title: 'Good Riddance', artist: 'Darren Korb feat. Ashley Barrett', durationSec: 177 },
      { title: 'Lament of Orpheus', artist: 'Darren Korb', durationSec: 194 },
      { title: 'In the Blood', artist: 'Darren Korb feat. Ashley Barrett', durationSec: 279 },
      { title: 'The Unseen Ones', artist: 'Darren Korb feat. Masahiro Aoki', durationSec: 258 },
    ],
  },
  'hades ii': {
    albumTitle: 'Hades II (Original Soundtrack)',
    artist: 'Darren Korb feat. Ashley Barrett',
    releaseYear: '2024',
    tracks: [
      { title: 'Death to Chronos', artist: 'Darren Korb', durationSec: 184 },
      { title: 'The Silver Sisters', artist: 'Darren Korb', durationSec: 228 },
      { title: 'Coral Crown', artist: 'Darren Korb & Scylla and the Sirens', durationSec: 215 },
      {
        title: 'I Am Gonna Claw (Out Your Eyes then Drown You to Death)',
        artist: 'Darren Korb',
        durationSec: 244,
      },
      { title: 'Song of the Sirens', artist: 'Darren Korb', durationSec: 192 },
      { title: 'Moonlight Guide Us', artist: 'Darren Korb feat. Ashley Barrett', durationSec: 210 },
    ],
  },
  'hollow knight': {
    albumTitle: 'Hollow Knight (Original Soundtrack)',
    artist: 'Christopher Larkin',
    releaseYear: '2017',
    tracks: [
      { title: 'Enter Hallownest', artist: 'Christopher Larkin', durationSec: 89 },
      { title: 'Dirtmouth', artist: 'Christopher Larkin', durationSec: 115 },
      { title: 'Greenpath', artist: 'Christopher Larkin', durationSec: 217 },
      { title: 'Hornet', artist: 'Christopher Larkin', durationSec: 166 },
      { title: 'City of Tears', artist: 'Christopher Larkin', durationSec: 178 },
      { title: 'Mantis Lords', artist: 'Christopher Larkin', durationSec: 105 },
      { title: 'Sealed Vessel', artist: 'Christopher Larkin', durationSec: 345 },
      { title: 'Nightmare King', artist: 'Christopher Larkin', durationSec: 170 },
    ],
  },
  'persona 5 royal': {
    albumTitle: 'Persona 5 Royal Original Soundtrack',
    artist: 'Shoji Meguro feat. Lyn',
    releaseYear: '2019',
    tracks: [
      { title: 'Colors Flying High', artist: 'Shoji Meguro feat. Lyn', durationSec: 242 },
      { title: 'Take Over', artist: 'Shoji Meguro feat. Lyn', durationSec: 224 },
      { title: 'Beneath the Mask', artist: 'Shoji Meguro feat. Lyn', durationSec: 277 },
      { title: 'Last Surprise', artist: 'Shoji Meguro feat. Lyn', durationSec: 235 },
      { title: 'Life Will Change', artist: 'Shoji Meguro feat. Lyn', durationSec: 262 },
      { title: 'Rivers in the Desert', artist: 'Shoji Meguro feat. Lyn', durationSec: 315 },
      { title: 'I Believe', artist: 'Shoji Meguro feat. Lyn', durationSec: 292 },
      { title: 'Throw Away Your Mask', artist: 'Shoji Meguro feat. Lyn', durationSec: 268 },
    ],
  },
  'persona 3 reload': {
    albumTitle: 'Persona 3 Reload Original Soundtrack',
    artist: 'Atsushi Kitajoh, Azumi Takahashi, Lotus Juice',
    releaseYear: '2024',
    tracks: [
      { title: 'Full Moon Full Life', artist: 'Azumi Takahashi & Lotus Juice', durationSec: 290 },
      { title: "It's Going Down Now", artist: 'Azumi Takahashi & Lotus Juice', durationSec: 186 },
      { title: 'Color Your Night', artist: 'Azumi Takahashi & Lotus Juice', durationSec: 227 },
      {
        title: 'Mass Destruction -Reload-',
        artist: 'Azumi Takahashi & Lotus Juice',
        durationSec: 204,
      },
      { title: 'Memories of You -Reload-', artist: 'Azumi Takahashi', durationSec: 358 },
    ],
  },
  'metaphor refantazio': {
    albumTitle: 'Metaphor: ReFantazio Special Soundtrack',
    artist: 'Shoji Meguro',
    releaseYear: '2024',
    tracks: [
      { title: 'Warriors in Valour', artist: 'Shoji Meguro', durationSec: 215 },
      { title: 'Traversing the Wastes', artist: 'Shoji Meguro', durationSec: 198 },
      { title: 'Verge of Life and Death', artist: 'Shoji Meguro', durationSec: 224 },
      { title: 'Royal Capital Grand Trad', artist: 'Shoji Meguro', durationSec: 204 },
      { title: 'King of Destruction', artist: 'Shoji Meguro', durationSec: 278 },
    ],
  },
  'nier automata': {
    albumTitle: 'NieR:Automata Original Soundtrack',
    artist: 'Keiichi Okabe, MONACA, Emi Evans, J’Nique Nicole',
    releaseYear: '2017',
    tracks: [
      { title: 'City Ruins (Rays of Light)', artist: 'Keiichi Okabe', durationSec: 382 },
      { title: 'Amusement Park', artist: 'Keiichi Okabe', durationSec: 379 },
      { title: 'A Beautiful Song', artist: 'Keiichi Okabe', durationSec: 246 },
      { title: 'Pascal', artist: 'Keiichi Okabe', durationSec: 287 },
      { title: 'Copied City', artist: 'Keiichi Okabe', durationSec: 240 },
      { title: 'Bipolar Nightmare', artist: 'Keiichi Okabe', durationSec: 300 },
      { title: 'Weight of the World', artist: 'Keiichi Okabe feat. Emi Evans', durationSec: 345 },
    ],
  },
  'final fantasy vii rebirth': {
    albumTitle: 'Final Fantasy VII Rebirth Original Soundtrack',
    artist: 'Nobuo Uematsu, Masashi Hamauzu, Mitsuto Suzuki',
    releaseYear: '2024',
    tracks: [
      { title: 'No Promises to Keep', artist: 'Nobuo Uematsu & Loren Allred', durationSec: 344 },
      { title: 'Toward Mt. Nibel', artist: 'Masashi Hamauzu', durationSec: 238 },
      { title: 'Main Theme of FFVII - Battle Edit', artist: 'Nobuo Uematsu', durationSec: 256 },
      { title: 'Cosmo Canyon - Sanctum of Planetology', artist: 'Nobuo Uematsu', durationSec: 242 },
      { title: "Aerith's Theme - The White Materia", artist: 'Nobuo Uematsu', durationSec: 295 },
      { title: 'One-Winged Angel - Reborn', artist: 'Nobuo Uematsu', durationSec: 378 },
    ],
  },
  'final fantasy vii remake': {
    albumTitle: 'Final Fantasy VII Remake Original Soundtrack',
    artist: 'Nobuo Uematsu, Masashi Hamauzu, Mitsuto Suzuki',
    releaseYear: '2020',
    tracks: [
      { title: 'The Prelude - Reunion', artist: 'Nobuo Uematsu', durationSec: 205 },
      { title: 'Opening - Bombing Mission', artist: 'Nobuo Uematsu', durationSec: 242 },
      { title: 'Let the Battles Begin! - A Merc’s Job', artist: 'Nobuo Uematsu', durationSec: 210 },
      { title: "Tifa's Theme - Seventh Heaven", artist: 'Nobuo Uematsu', durationSec: 246 },
      { title: 'The Airbuster', artist: 'Nobuo Uematsu', durationSec: 454 },
      { title: 'Hollow', artist: 'Nobuo Uematsu feat. Yosh', durationSec: 382 },
    ],
  },
  'final fantasy xvi': {
    albumTitle: 'Final Fantasy XVI Original Soundtrack',
    artist: 'Masayoshi Soken',
    releaseYear: '2023',
    tracks: [
      { title: 'Land of Eikons', artist: 'Masayoshi Soken', durationSec: 147 },
      { title: 'Find the Flame', artist: 'Masayoshi Soken', durationSec: 212 },
      { title: 'Away', artist: 'Masayoshi Soken', durationSec: 396 },
      { title: 'To Sail Forbidden Seas', artist: 'Masayoshi Soken', durationSec: 364 },
      { title: 'Ascension', artist: 'Masayoshi Soken', durationSec: 525 },
      { title: 'My Star', artist: 'Masayoshi Soken & Amanda Achen', durationSec: 291 },
    ],
  },
  'dark souls iii': {
    albumTitle: 'Dark Souls III (Original Game Soundtrack)',
    artist: 'Yuka Kitamura, Motoi Sakuraba, Tsukasa Saitoh',
    releaseYear: '2016',
    tracks: [
      { title: 'Dark Souls III', artist: 'Yuka Kitamura', durationSec: 169 },
      { title: 'Firelink Shrine', artist: 'Yuka Kitamura', durationSec: 187 },
      { title: 'Abyss Watchers', artist: 'Yuka Kitamura', durationSec: 282 },
      { title: 'Pontiff Sulyvahn', artist: 'Yuka Kitamura', durationSec: 224 },
      { title: 'Dancer of the Boreal Valley', artist: 'Yuka Kitamura', durationSec: 217 },
      { title: 'Twin Princes', artist: 'Yuka Kitamura', durationSec: 248 },
      { title: 'Soul of Cinder', artist: 'Yuka Kitamura', durationSec: 332 },
      { title: 'Slave Knight Gael', artist: 'Yuka Kitamura', durationSec: 291 },
    ],
  },
  bloodborne: {
    albumTitle: 'Bloodborne (Original Soundtrack)',
    artist: 'Ryan Amon, Tsukasa Saitoh, Yuka Kitamura, Nobuyoshi Suzuki',
    releaseYear: '2015',
    tracks: [
      { title: 'Omen', artist: 'Ryan Amon', durationSec: 126 },
      { title: 'The Night Unfurls', artist: 'Ryan Amon', durationSec: 125 },
      { title: 'Cleric Beast', artist: 'Tsukasa Saitoh', durationSec: 193 },
      { title: 'The Hunter', artist: 'Ryan Amon', durationSec: 204 },
      { title: 'Hail the Nightmare', artist: 'Ryan Amon', durationSec: 176 },
      { title: 'The First Hunter (Gehrman)', artist: 'Tsukasa Saitoh', durationSec: 311 },
      { title: 'Ludwig, the Holy Blade', artist: 'Nobuyoshi Suzuki', durationSec: 392 },
      { title: 'Lady Maria of the Astral Clocktower', artist: 'Yuka Kitamura', durationSec: 263 },
    ],
  },
  'sekiro shadows die twice': {
    albumTitle: 'Sekiro: Shadows Die Twice (Original Soundtrack)',
    artist: 'Yuka Kitamura, Noriyuki Asakura',
    releaseYear: '2019',
    tracks: [
      { title: 'Sekiro, the One-Armed Wolf', artist: 'Yuka Kitamura', durationSec: 184 },
      { title: 'Ashina Outskirts', artist: 'Yuka Kitamura', durationSec: 210 },
      { title: 'Lady Butterfly', artist: 'Yuka Kitamura', durationSec: 205 },
      { title: 'Genichiro Ashina', artist: 'Yuka Kitamura', durationSec: 248 },
      { title: 'Divine Dragon', artist: 'Yuka Kitamura', durationSec: 282 },
      { title: 'Sword Saint', artist: 'Yuka Kitamura', durationSec: 265 },
    ],
  },
  'alan wake 2': {
    albumTitle: 'Alan Wake 2 (Original Soundtrack)',
    artist: 'Petri Alanko, Old Gods of Asgard, Poets of the Fall',
    releaseYear: '2023',
    tracks: [
      { title: 'Herald of Darkness', artist: 'Old Gods of Asgard', durationSec: 512 },
      { title: 'Follow You into the Dark', artist: 'RAKAAEL', durationSec: 238 },
      { title: 'Wide Awake', artist: 'Jaimes', durationSec: 210 },
      { title: 'Dark Ocean Summoning', artist: 'Old Gods of Asgard', durationSec: 274 },
      {
        title: 'Yötön Yö (Nightless Night)',
        artist: 'Martti Suosalo & Petri Alanko',
        durationSec: 256,
      },
    ],
  },
  control: {
    albumTitle: 'Control (Original Video Game Soundtrack)',
    artist: 'Petri Alanko & Martin Stig Andersen',
    releaseYear: '2019',
    tracks: [
      { title: 'Take Control', artist: 'Old Gods of Asgard', durationSec: 354 },
      { title: 'Hiss Invaded', artist: 'Petri Alanko', durationSec: 218 },
      { title: 'Sankarin Tango', artist: 'Petri Alanko feat. Martti Suosalo', durationSec: 265 },
      { title: 'Nosedive', artist: 'Martin Stig Andersen', durationSec: 194 },
      { title: 'My Dark Disquiet', artist: 'Poets of the Fall', durationSec: 310 },
    ],
  },
  'doom eternal': {
    albumTitle: 'DOOM Eternal (Original Game Score)',
    artist: 'Mick Gordon',
    releaseYear: '2020',
    tracks: [
      { title: 'The Only Thing They Fear Is You', artist: 'Mick Gordon', durationSec: 413 },
      { title: 'Meathook', artist: 'Mick Gordon', durationSec: 368 },
      { title: 'Cultist Base', artist: 'Mick Gordon', durationSec: 334 },
      { title: 'Super Gore Nest', artist: 'Mick Gordon', durationSec: 292 },
      { title: 'BFG 10K', artist: 'Mick Gordon', durationSec: 198 },
      { title: 'Gladiator', artist: 'Mick Gordon', durationSec: 305 },
    ],
  },
  doom: {
    albumTitle: 'DOOM (Original Game Soundtrack)',
    artist: 'Mick Gordon',
    releaseYear: '2016',
    tracks: [
      { title: 'At Doom’s Gate', artist: 'Mick Gordon', durationSec: 70 },
      { title: 'Rip & Tear', artist: 'Mick Gordon', durationSec: 257 },
      { title: 'BFG Division', artist: 'Mick Gordon', durationSec: 506 },
      { title: 'Flesh & Metal', artist: 'Mick Gordon', durationSec: 422 },
      { title: 'Vega Core', artist: 'Mick Gordon', durationSec: 483 },
      { title: 'Mastermind', artist: 'Mick Gordon', durationSec: 397 },
    ],
  },
  'the elder scrolls v skyrim': {
    albumTitle: 'The Elder Scrolls V: Skyrim (Original Game Soundtrack)',
    artist: 'Jeremy Soule',
    releaseYear: '2011',
    tracks: [
      { title: 'Dragonborn', artist: 'Jeremy Soule', durationSec: 235 },
      { title: 'Awake', artist: 'Jeremy Soule', durationSec: 91 },
      { title: 'From Past to Present', artist: 'Jeremy Soule', durationSec: 304 },
      { title: 'The Streets of Whiterun', artist: 'Jeremy Soule', durationSec: 245 },
      { title: 'Secunda', artist: 'Jeremy Soule', durationSec: 124 },
      { title: 'Far Horizons', artist: 'Jeremy Soule', durationSec: 331 },
      { title: 'Sovngarde', artist: 'Jeremy Soule', durationSec: 217 },
    ],
  },
  'grand theft auto v': {
    albumTitle: 'The Music of Grand Theft Auto V (Original Score)',
    artist: 'Tangerine Dream, Woody Jackson, The Alchemist & Oh No',
    releaseYear: '2013',
    tracks: [
      { title: 'Welcome to Los Santos', artist: 'Oh No', durationSec: 154 },
      { title: 'We Were Set Up', artist: 'Tangerine Dream & Woody Jackson', durationSec: 211 },
      {
        title: 'A Legitimate Business Man',
        artist: 'Tangerine Dream & Woody Jackson',
        durationSec: 177,
      },
      { title: 'The Agency Heist', artist: 'Tangerine Dream & Woody Jackson', durationSec: 202 },
      { title: 'Minor Turbulence', artist: 'Tangerine Dream & Woody Jackson', durationSec: 273 },
      { title: 'Sleepwalking', artist: 'The Chain Gang of 1974', durationSec: 218 },
    ],
  },
  'resident evil 4': {
    albumTitle: 'Resident Evil 4 (Original Soundtrack)',
    artist: 'Kota Suzuki, Capcom Sound Team',
    releaseYear: '2023',
    tracks: [
      { title: 'The Drive ~ First Contact', artist: 'Capcom Sound Team', durationSec: 185 },
      { title: 'Save Theme (Serenity)', artist: 'Capcom Sound Team', durationSec: 142 },
      { title: 'The Merchant', artist: 'Capcom Sound Team', durationSec: 164 },
      { title: 'Salazar', artist: 'Capcom Sound Team', durationSec: 208 },
      { title: 'Krauser', artist: 'Capcom Sound Team', durationSec: 231 },
      { title: 'Bullet or Blade', artist: 'Capcom Sound Team', durationSec: 215 },
    ],
  },
  'silent hill 2': {
    albumTitle: 'Silent Hill 2 (Original Soundtrack)',
    artist: 'Akira Yamaoka',
    releaseYear: '2024',
    tracks: [
      { title: 'Theme of Laura', artist: 'Akira Yamaoka', durationSec: 204 },
      { title: 'White Noiz', artist: 'Akira Yamaoka', durationSec: 112 },
      { title: 'Promise (Reprise)', artist: 'Akira Yamaoka', durationSec: 165 },
      { title: 'Love Psalm', artist: 'Akira Yamaoka', durationSec: 266 },
      { title: 'True', artist: 'Akira Yamaoka', durationSec: 187 },
      { title: 'Promise', artist: 'Akira Yamaoka', durationSec: 280 },
    ],
  },
  'devil may cry 5': {
    albumTitle: 'Devil May Cry 5 Original Soundtrack',
    artist: 'Casey Edwards, Cody Matthew Johnson, Kota Suzuki',
    releaseYear: '2019',
    tracks: [
      { title: 'Devil Trigger', artist: 'Casey Edwards feat. Ali Edwards', durationSec: 405 },
      { title: 'Bury the Light', artist: 'Casey Edwards feat. Victor Borba', durationSec: 582 },
      { title: 'Crimson Cloud', artist: 'Jeff Rona feat. Rachel Fannan', durationSec: 289 },
      { title: 'Subhuman', artist: 'Cody Matthew Johnson', durationSec: 308 },
      { title: 'Silver Bullet', artist: 'Casey Edwards', durationSec: 265 },
    ],
  },
  celeste: {
    albumTitle: 'Celeste (Original Soundtrack)',
    artist: 'Lena Raine',
    releaseYear: '2018',
    tracks: [
      { title: 'Prologue', artist: 'Lena Raine', durationSec: 68 },
      { title: 'First Steps', artist: 'Lena Raine', durationSec: 218 },
      { title: 'Resurrections', artist: 'Lena Raine', durationSec: 578 },
      { title: 'Awake', artist: 'Lena Raine', durationSec: 148 },
      { title: 'Confronting Myself', artist: 'Lena Raine', durationSec: 249 },
      { title: 'Reach for the Summit', artist: 'Lena Raine', durationSec: 669 },
    ],
  },
  undertale: {
    albumTitle: 'UNDERTALE Soundtrack',
    artist: 'Toby Fox',
    releaseYear: '2015',
    tracks: [
      { title: 'Once Upon a Time', artist: 'Toby Fox', durationSec: 88 },
      { title: 'Bonetrousle', artist: 'Toby Fox', durationSec: 57 },
      { title: 'Spear of Justice', artist: 'Toby Fox', durationSec: 115 },
      { title: 'Spider Dance', artist: 'Toby Fox', durationSec: 106 },
      { title: 'Death by Glamour', artist: 'Toby Fox', durationSec: 134 },
      { title: 'Hopes and Dreams', artist: 'Toby Fox', durationSec: 181 },
      { title: 'MEGALOVANIA', artist: 'Toby Fox', durationSec: 156 },
    ],
  },
  minecraft: {
    albumTitle: 'Minecraft - Volume Alpha (Original Game Soundtrack)',
    artist: 'C418',
    releaseYear: '2011',
    tracks: [
      { title: 'Subwoofer Lullaby', artist: 'C418', durationSec: 208 },
      { title: 'Living Mice', artist: 'C418', durationSec: 177 },
      { title: 'Haggstrom', artist: 'C418', durationSec: 204 },
      { title: 'Minecraft', artist: 'C418', durationSec: 254 },
      { title: 'Mice on Venus', artist: 'C418', durationSec: 281 },
      { title: 'Sweden', artist: 'C418', durationSec: 215 },
      { title: 'Wet Hands', artist: 'C418', durationSec: 90 },
    ],
  },
  'stardew valley': {
    albumTitle: 'Stardew Valley (Original Game Soundtrack)',
    artist: 'ConcernedApe (Eric Barone)',
    releaseYear: '2016',
    tracks: [
      { title: 'Stardew Valley Overture', artist: 'ConcernedApe', durationSec: 136 },
      { title: "Spring (It's a Big World Outside)", artist: 'ConcernedApe', durationSec: 239 },
      { title: 'Summer (Nature’s Crescendo)', artist: 'ConcernedApe', durationSec: 210 },
      { title: 'Fall (The Smell of Mushroom)', artist: 'ConcernedApe', durationSec: 216 },
      { title: 'Winter (The Wind Can Be Still)', artist: 'ConcernedApe', durationSec: 173 },
      { title: 'Dance of the Moonlight Jellies', artist: 'ConcernedApe', durationSec: 112 },
    ],
  },
  'outer wilds': {
    albumTitle: 'Outer Wilds (Original Soundtrack)',
    artist: 'Andrew Prahlow',
    releaseYear: '2019',
    tracks: [
      { title: 'Timber Hearth', artist: 'Andrew Prahlow', durationSec: 210 },
      { title: 'Outer Wilds', artist: 'Andrew Prahlow', durationSec: 157 },
      { title: 'End Times', artist: 'Andrew Prahlow', durationSec: 92 },
      { title: 'The Sun Station', artist: 'Andrew Prahlow', durationSec: 129 },
      { title: 'Travelers', artist: 'Andrew Prahlow', durationSec: 137 },
      { title: '14.3 Billion Years', artist: 'Andrew Prahlow', durationSec: 271 },
    ],
  },
  'helldivers 2': {
    albumTitle: 'Helldivers 2 (Original Game Soundtrack)',
    artist: 'Wilbert Roget, II',
    releaseYear: '2024',
    tracks: [
      { title: 'A Cup of Liber-Tea (Main Theme)', artist: 'Wilbert Roget, II', durationSec: 217 },
      { title: 'Ode to Liberty', artist: 'Wilbert Roget, II', durationSec: 141 },
      { title: 'The Terminid Horde', artist: 'Wilbert Roget, II', durationSec: 325 },
      { title: 'The Automaton Legion', artist: 'Wilbert Roget, II', durationSec: 348 },
      { title: 'No Diver Left Behind', artist: 'Wilbert Roget, II', durationSec: 192 },
    ],
  },
  'the legend of zelda breath of the wild': {
    albumTitle: 'The Legend of Zelda: Breath of the Wild Original Soundtrack',
    artist: 'Manaka Kataoka, Yasuaki Iwata, Hajime Wakai',
    releaseYear: '2017',
    tracks: [
      { title: 'Main Theme', artist: 'Manaka Kataoka', durationSec: 120 },
      { title: 'Kakariko Village', artist: 'Yasuaki Iwata', durationSec: 235 },
      { title: 'Hateno Village', artist: 'Manaka Kataoka', durationSec: 218 },
      { title: 'Rito Village', artist: 'Hajime Wakai', durationSec: 196 },
      { title: 'Hyrule Castle', artist: 'Manaka Kataoka', durationSec: 284 },
      { title: 'Dark Beast Ganon Battle', artist: 'Manaka Kataoka', durationSec: 220 },
    ],
  },
  'the legend of zelda tears of the kingdom': {
    albumTitle: 'The Legend of Zelda: Tears of the Kingdom Original Soundtrack',
    artist: 'Manaka Kataoka, Maiki Fujii, Tsukasa Usui',
    releaseYear: '2023',
    tracks: [
      { title: 'Main Theme (Tears of the Kingdom)', artist: 'Manaka Kataoka', durationSec: 162 },
      { title: 'Lookout Landing', artist: 'Maiki Fujii', durationSec: 198 },
      { title: 'Colgera Battle', artist: 'Manaka Kataoka', durationSec: 285 },
      { title: 'Demon King Ganondorf', artist: 'Manaka Kataoka', durationSec: 244 },
      { title: 'Last Catch', artist: 'Manaka Kataoka', durationSec: 152 },
    ],
  },
  'horizon zero dawn': {
    albumTitle: 'Horizon Zero Dawn (Original Soundtrack)',
    artist: 'Joris de Man, The Flight, Niels van der Leest',
    releaseYear: '2017',
    tracks: [
      { title: "Aloy's Theme", artist: 'Joris de Man feat. Julie Elven', durationSec: 152 },
      { title: 'Years of Training', artist: 'The Flight', durationSec: 146 },
      { title: 'City on the Mesa', artist: 'Joris de Man', durationSec: 218 },
      { title: 'Victory', artist: 'Joris de Man', durationSec: 204 },
    ],
  },
  'horizon forbidden west': {
    albumTitle: 'Horizon Forbidden West (Original Soundtrack)',
    artist: 'Joris de Man, Niels van der Leest, The Flight, Oleksa Lozowchuk',
    releaseYear: '2022',
    tracks: [
      { title: 'In the Flood', artist: 'Lovisa Sjöberg & Oleksa Lozowchuk', durationSec: 242 },
      {
        title: 'The World on Her Shoulders',
        artist: 'Joris de Man feat. Julie Elven',
        durationSec: 210,
      },
      { title: 'Built to Kill', artist: 'The Flight', durationSec: 224 },
      { title: 'Guardian of the Deep', artist: 'Joris de Man', durationSec: 195 },
    ],
  },
  'death stranding': {
    albumTitle: 'Death Stranding (Original Score & Low Roar Selections)',
    artist: 'Ludvig Forssell, Low Roar',
    releaseYear: '2019',
    tracks: [
      { title: "Don't Be So Serious", artist: 'Low Roar', durationSec: 373 },
      { title: "BB's Theme", artist: 'Ludvig Forssell feat. Jenny Plant', durationSec: 316 },
      { title: 'Stranded', artist: 'Ludvig Forssell', durationSec: 242 },
      { title: 'Bones', artist: 'Low Roar', durationSec: 169 },
      { title: 'Almost Nothing', artist: 'SILENT POETS feat. Okay Kaya', durationSec: 354 },
    ],
  },
  'disco elysium': {
    albumTitle: 'Disco Elysium (Original Soundtrack)',
    artist: 'Sea Power',
    releaseYear: '2019',
    tracks: [
      { title: 'Instrument of Surrender', artist: 'Sea Power', durationSec: 315 },
      { title: 'Whirling-In-Rags, 8 AM', artist: 'Sea Power', durationSec: 256 },
      { title: 'Detective Arriving on the Scene', artist: 'Sea Power', durationSec: 312 },
      { title: 'La Revacholière', artist: 'Sea Power', durationSec: 242 },
      { title: 'Burn, Baby, Burn', artist: 'Sea Power', durationSec: 195 },
    ],
  },
}

export function lookupCuratedSoundtrack(game: GameIdentity): SoundtrackAlbumWithTracks | null {
  if (!game?.title) return null
  const core = extractCoreGameTitle(game.title).toLowerCase()
  const spec = CURATED_OST_CATALOG[core]
  if (!spec) return null

  const slug = core.replace(/\s+/g, '_')
  const albumId = `curated_ost_${slug}`
  let totalDurationMs = 0

  const tracks: SoundtrackTrack[] = spec.tracks.map((t, idx) => {
    const durationMs = t.durationSec * 1000
    totalDurationMs += durationMs
    return {
      id: `cur_trk_${slug}_${idx + 1}`,
      album_id: albumId,
      disc_number: 1,
      track_number: idx + 1,
      title: t.title,
      artist: t.artist || spec.artist,
      duration_ms: durationMs,
      preview_url: null,
      stream_url: null,
      download_url: null,
      local_path: null,
      provider_id: 'curated',
      external_id: null,
    }
  })

  return {
    album: {
      id: albumId,
      game_id: game.gameId,
      title: spec.albumTitle,
      album_type: 'original_soundtrack',
      artist: spec.artist,
      release_date: spec.releaseYear || game.releaseYear || null,
      cover_url:
        game.coverUrl ||
        CURATED_OST_COVERS[core] ||
        resolveAlbumCoverFallback(spec.albumTitle) ||
        null,
      track_count: tracks.length,
      total_duration_ms: totalDurationMs,
      provider_id: 'curated',
      external_id: null,
    },
    tracks,
  }
}

export const CURATED_OST_COVERS: Record<string, string> = {
  'elden ring': 'https://cdn.cloudflare.steamstatic.com/steam/apps/1245620/library_600x900_2x.jpg',
  'the witcher 3 wild hunt':
    'https://cdn.cloudflare.steamstatic.com/steam/apps/292030/library_600x900_2x.jpg',
  'witcher 3': 'https://cdn.cloudflare.steamstatic.com/steam/apps/292030/library_600x900_2x.jpg',
  'cyberpunk 2077':
    'https://cdn.cloudflare.steamstatic.com/steam/apps/1091500/library_600x900_2x.jpg',
  'baldurs gate 3':
    'https://cdn.cloudflare.steamstatic.com/steam/apps/1086940/library_600x900_2x.jpg',
  'red dead redemption 2':
    'https://cdn.cloudflare.steamstatic.com/steam/apps/1174180/library_600x900_2x.jpg',
  'red dead redemption':
    'https://cdn.cloudflare.steamstatic.com/steam/apps/2668510/library_600x900_2x.jpg',
  'god of war': 'https://cdn.cloudflare.steamstatic.com/steam/apps/1593500/library_600x900_2x.jpg',
  'god of war ragnarok':
    'https://cdn.cloudflare.steamstatic.com/steam/apps/2322010/library_600x900_2x.jpg',
  'ghost of tsushima':
    'https://cdn.cloudflare.steamstatic.com/steam/apps/2215430/library_600x900_2x.jpg',
  'the last of us':
    'https://cdn.cloudflare.steamstatic.com/steam/apps/1888930/library_600x900_2x.jpg',
  'the last of us part i':
    'https://cdn.cloudflare.steamstatic.com/steam/apps/1888930/library_600x900_2x.jpg',
  'the last of us part 1':
    'https://cdn.cloudflare.steamstatic.com/steam/apps/1888930/library_600x900_2x.jpg',
  'the last of us part ii':
    'https://cdn.cloudflare.steamstatic.com/steam/apps/2531310/library_600x900_2x.jpg',
  'the last of us part 2':
    'https://cdn.cloudflare.steamstatic.com/steam/apps/2531310/library_600x900_2x.jpg',
  'clair obscur expedition 33':
    'https://cdn.cloudflare.steamstatic.com/steam/apps/1903340/header.jpg',
  'hollow knight':
    'https://cdn.cloudflare.steamstatic.com/steam/apps/367520/library_600x900_2x.jpg',
  hades: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1145360/library_600x900_2x.jpg',
  'hades 2': 'https://cdn.cloudflare.steamstatic.com/steam/apps/1145350/library_600x900_2x.jpg',
  'hades ii': 'https://cdn.cloudflare.steamstatic.com/steam/apps/1145350/library_600x900_2x.jpg',
  'doom eternal': 'https://cdn.cloudflare.steamstatic.com/steam/apps/782330/library_600x900_2x.jpg',
  doom: 'https://cdn.cloudflare.steamstatic.com/steam/apps/379720/library_600x900_2x.jpg',
  'nier automata':
    'https://cdn.cloudflare.steamstatic.com/steam/apps/524220/library_600x900_2x.jpg',
  'persona 5 royal':
    'https://cdn.cloudflare.steamstatic.com/steam/apps/1687950/library_600x900_2x.jpg',
  'dark souls 3': 'https://cdn.cloudflare.steamstatic.com/steam/apps/374320/library_600x900_2x.jpg',
  'dark souls iii':
    'https://cdn.cloudflare.steamstatic.com/steam/apps/374320/library_600x900_2x.jpg',
  'sekiro shadows die twice':
    'https://cdn.cloudflare.steamstatic.com/steam/apps/814380/library_600x900_2x.jpg',
  'black myth wukong':
    'https://cdn.cloudflare.steamstatic.com/steam/apps/2358720/library_600x900_2x.jpg',
  'death stranding':
    'https://cdn.cloudflare.steamstatic.com/steam/apps/1850570/library_600x900_2x.jpg',
  'silent hill 2':
    'https://cdn.cloudflare.steamstatic.com/steam/apps/2124490/library_600x900_2x.jpg',
  'resident evil 4':
    'https://cdn.cloudflare.steamstatic.com/steam/apps/2050650/library_600x900_2x.jpg',
  'alan wake 2': 'https://cdn.cloudflare.steamstatic.com/steam/apps/108710/library_600x900_2x.jpg',
  control: 'https://cdn.cloudflare.steamstatic.com/steam/apps/870780/library_600x900_2x.jpg',
  celeste: 'https://cdn.cloudflare.steamstatic.com/steam/apps/504230/library_600x900_2x.jpg',
  undertale: 'https://cdn.cloudflare.steamstatic.com/steam/apps/391540/library_600x900_2x.jpg',
  'final fantasy 7 remake':
    'https://cdn.cloudflare.steamstatic.com/steam/apps/1462040/library_600x900_2x.jpg',
  'final fantasy vii remake':
    'https://cdn.cloudflare.steamstatic.com/steam/apps/1462040/library_600x900_2x.jpg',
  'final fantasy 7 rebirth':
    'https://cdn.cloudflare.steamstatic.com/steam/apps/2909400/library_600x900_2x.jpg',
  'final fantasy vii rebirth':
    'https://cdn.cloudflare.steamstatic.com/steam/apps/2909400/library_600x900_2x.jpg',
  'final fantasy 16':
    'https://cdn.cloudflare.steamstatic.com/steam/apps/2515020/library_600x900_2x.jpg',
  'final fantasy xvi':
    'https://cdn.cloudflare.steamstatic.com/steam/apps/2515020/library_600x900_2x.jpg',
  'the elder scrolls 5 skyrim':
    'https://cdn.cloudflare.steamstatic.com/steam/apps/489830/library_600x900_2x.jpg',
  'the elder scrolls v skyrim':
    'https://cdn.cloudflare.steamstatic.com/steam/apps/489830/library_600x900_2x.jpg',
  skyrim: 'https://cdn.cloudflare.steamstatic.com/steam/apps/489830/library_600x900_2x.jpg',
  'grand theft auto 5':
    'https://cdn.cloudflare.steamstatic.com/steam/apps/271590/library_600x900_2x.jpg',
  'grand theft auto v':
    'https://cdn.cloudflare.steamstatic.com/steam/apps/271590/library_600x900_2x.jpg',
  'marvels spider man':
    'https://cdn.cloudflare.steamstatic.com/steam/apps/1817070/library_600x900_2x.jpg',
  'marvels spider man 2': 'https://cdn.cloudflare.steamstatic.com/steam/apps/2651280/header.jpg',
  'marvels spider man miles morales':
    'https://cdn.cloudflare.steamstatic.com/steam/apps/1817190/library_600x900_2x.jpg',
  'horizon zero dawn':
    'https://cdn.cloudflare.steamstatic.com/steam/apps/1151640/library_600x900_2x.jpg',
  'horizon forbidden west':
    'https://cdn.cloudflare.steamstatic.com/steam/apps/2420110/library_600x900_2x.jpg',
  'detroit become human':
    'https://cdn.cloudflare.steamstatic.com/steam/apps/1222140/library_600x900_2x.jpg',
  'lies of p': 'https://cdn.cloudflare.steamstatic.com/steam/apps/1627720/library_600x900_2x.jpg',
  'armored core 6 fires of rubicon':
    'https://cdn.cloudflare.steamstatic.com/steam/apps/1888160/library_600x900_2x.jpg',
  'armored core vi fires of rubicon':
    'https://cdn.cloudflare.steamstatic.com/steam/apps/1888160/library_600x900_2x.jpg',
  'monster hunter world':
    'https://cdn.cloudflare.steamstatic.com/steam/apps/582010/library_600x900_2x.jpg',
  'monster hunter wilds':
    'https://cdn.cloudflare.steamstatic.com/steam/apps/2246340/library_600x900_2x.jpg',
  'kingdom come deliverance 2':
    'https://cdn.cloudflare.steamstatic.com/steam/apps/1771300/library_600x900_2x.jpg',
  'kingdom come deliverance ii':
    'https://cdn.cloudflare.steamstatic.com/steam/apps/1771300/library_600x900_2x.jpg',
  'metaphor refantazio':
    'https://cdn.cloudflare.steamstatic.com/steam/apps/2679460/library_600x900_2x.jpg',
  'persona 3 reload':
    'https://cdn.cloudflare.steamstatic.com/steam/apps/2161700/library_600x900_2x.jpg',
  'halo the master chief collection':
    'https://cdn.cloudflare.steamstatic.com/steam/apps/976730/library_600x900_2x.jpg',
  'mass effect legendary edition':
    'https://cdn.cloudflare.steamstatic.com/steam/apps/1328670/library_600x900_2x.jpg',
  stray: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1332010/library_600x900_2x.jpg',
  'outer wilds': 'https://cdn.cloudflare.steamstatic.com/steam/apps/753640/library_600x900_2x.jpg',
  'disco elysium':
    'https://cdn.cloudflare.steamstatic.com/steam/apps/632470/library_600x900_2x.jpg',
  'devil may cry 5':
    'https://cdn.cloudflare.steamstatic.com/steam/apps/601150/library_600x900_2x.jpg',
  'stardew valley':
    'https://cdn.cloudflare.steamstatic.com/steam/apps/413150/library_600x900_2x.jpg',
  'helldivers 2': 'https://cdn.cloudflare.steamstatic.com/steam/apps/553850/library_600x900_2x.jpg',
  'the legend of zelda breath of the wild':
    'https://images.igdb.com/igdb/image/upload/t_cover_big/co3p2d.jpg',
  'the legend of zelda tears of the kingdom':
    'https://images.igdb.com/igdb/image/upload/t_cover_big/co5vmg.jpg',
}

export function resolveAlbumCoverFallback(rawTitle?: string | null): string | null {
  if (!rawTitle) return null
  const core = extractCoreGameTitle(rawTitle)
    .toLowerCase()
    .replace(
      /\b(?:original|official|video|game|soundtrack|soundtracks|score|ost|music|complete|expanded|edition|playstation)\b/g,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim()
  if (!core) return null
  if (CURATED_OST_COVERS[core]) return CURATED_OST_COVERS[core]
  for (const [k, url] of Object.entries(CURATED_OST_COVERS)) {
    if (core.includes(k) || k.includes(core)) {
      return url
    }
  }
  return null
}

export function getSecondaryCoverFallbackUrl(currentUrl?: string | null): string | null {
  if (!currentUrl) return null
  if (currentUrl.includes('/library_600x900_2x.jpg')) {
    return currentUrl.replace('/library_600x900_2x.jpg', '/header.jpg')
  }
  if (currentUrl.includes('shared.akamai.steamstatic.com/store_item_assets/steam/apps/')) {
    const m = currentUrl.match(/\/apps\/(\d+)\//)
    if (m) {
      return `https://cdn.cloudflare.steamstatic.com/steam/apps/${m[1]}/header.jpg`
    }
  }
  return null
}

export function getAllCuratedSoundtracks(): SoundtrackAlbumWithTracks[] {
  const keys = Object.keys(CURATED_OST_CATALOG)
  const seenAlbumTitles = new Set<string>()
  const list: SoundtrackAlbumWithTracks[] = []

  for (const key of keys) {
    const spec = CURATED_OST_CATALOG[key]
    if (!spec || seenAlbumTitles.has(spec.albumTitle)) continue
    seenAlbumTitles.add(spec.albumTitle)

    const cover = CURATED_OST_COVERS[key] || resolveAlbumCoverFallback(spec.albumTitle) || null
    const resolved = lookupCuratedSoundtrack({
      gameId: `curated_${key.replace(/\s+/g, '_')}`,
      title: key,
      releaseYear: spec.releaseYear,
      coverUrl: cover,
    })
    if (resolved) {
      if (!resolved.album.cover_url && cover) {
        resolved.album.cover_url = cover
      }
      list.push(resolved)
    }
  }

  return list
}
