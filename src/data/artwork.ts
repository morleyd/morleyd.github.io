export interface ArtPiece {
  file: string
  title: string
}

// Each piece has a thumbnail (icon_<file>.png) and a full image (<file>.png).
export const artworkPieces: ArtPiece[] = [
  { file: 'cadillac_boom', title: 'Cadillac Boom' },
  { file: 'this_is_fine', title: 'This Is Fine' },
  { file: 'holding_sun', title: 'Holding the Sun' },
  { file: 'soft_joy', title: 'Soft Joy' },
  { file: 'sunset_over_ocean', title: 'Sunset Over Ocean' },
  { file: 'starry_mountain', title: 'Starry Mountain' },
  { file: 'logan_mountains', title: 'Logan Mountains' },
  { file: 'sailing', title: 'Sailing' },
  { file: 'zoom_fatigue', title: 'Zoom Fatigue' },
  { file: 'frog', title: 'Frog' },
  { file: 'birb', title: 'Birb' },
  { file: 'wings', title: 'Wings' },
  { file: 'temple', title: 'Temple' },
  { file: 'sun_set', title: 'Sunset' },
  { file: 'rose', title: 'Rose' },
  { file: 'stars_bookmark', title: 'Stars Bookmark' },
]

export const thumbUrl = (file: string) => `/images/artwork/icon_${file}.png`
export const fullUrl = (file: string) => `/images/artwork/${file}.png`
