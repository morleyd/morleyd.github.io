/**
 * Piece personalities. Every piece type has a roster of named characters with
 * traits in [0, 1]; at game start each side draws names from these pools
 * (seeded, so a shared code reproduces the same cast). Ported and expanded from
 * the original chess-ai `profiles.js`.
 *
 * Two names are load-bearing for the social layer's seeded quirks:
 *   - "Dennis"  — everybody's favourite (bonds seeded positive toward him)
 *   - "Karen"   — rubs everyone the wrong way (bonds seeded negative)
 */
import type { PieceType, Persona } from './types'

export interface Roster {
  stamina: number
  personas: Persona[]
}

export const BELOVED = 'Dennis'
export const DISLIKED = 'Karen'

export const ROSTER: Record<PieceType, Roster> = {
  p: {
    stamina: 0.4,
    personas: [
      { name: 'Kenneth', intro: "Kenneth. Small piece, unexpected twists.", bravery: 0.7, obedience: 0.6, intelligence: 0.7 },
      { name: 'Brian', intro: "Brian, at your service. Big aspirations, small salary.", bravery: 0.5, obedience: 0.8, intelligence: 0.5 },
      { name: 'Jake', intro: "Jake. Expect the unexpected from me.", bravery: 0.6, obedience: 0.5, intelligence: 0.6 },
      { name: 'Phil', intro: "Phil. Point me somewhere; I'll go.", bravery: 0.4, obedience: 0.9, intelligence: 0.4 },
      { name: 'Dennis', intro: "Dennis! Yes, THAT Dennis. Ready to make my mark.", bravery: 0.8, obedience: 0.7, intelligence: 0.8 },
      { name: 'Walter', intro: "Walter. Small pawn, big waves.", bravery: 0.6, obedience: 0.7, intelligence: 0.6 },
      { name: 'Mikey', intro: "Mikey! Point me at something. Anything.", bravery: 0.9, obedience: 0.4, intelligence: 0.3 },
      { name: 'Gerard', intro: "Gerard. Full of surprises, mostly good ones.", bravery: 0.7, obedience: 0.6, intelligence: 0.7 },
      { name: 'Janice', intro: "Janice. I make every square count.", bravery: 0.5, obedience: 0.9, intelligence: 0.9 },
      { name: 'Francy', intro: "Francy. A pawn, but make it fashion.", bravery: 0.8, obedience: 0.5, intelligence: 0.5 },
      { name: 'Bev', intro: "Bev. Strategy and fun, in that order.", bravery: 0.4, obedience: 0.8, intelligence: 0.4 },
      { name: 'Barb', intro: "Barb. I do my own kind of magic.", bravery: 0.9, obedience: 0.3, intelligence: 0.9 },
      { name: 'Flo', intro: "Flo. Brace for a flood of surprises.", bravery: 0.7, obedience: 0.6, intelligence: 0.7 },
      { name: 'Karen', intro: "Karen. I'd like to speak to the board's manager.", bravery: 0.3, obedience: 0.2, intelligence: 0.3 },
      { name: 'Nancy', intro: "Nancy. I'll navigate the chaos, thanks.", bravery: 0.6, obedience: 0.7, intelligence: 0.6 },
      { name: 'Marg', intro: "Marg. I leave a mark. Always.", bravery: 0.8, obedience: 0.4, intelligence: 0.8 },
      { name: 'Milo', intro: "Milo. Every move's a little discovery.", bravery: 0.4, obedience: 0.6, intelligence: 0.7 },
    ],
  },
  r: {
    stamina: 0.6,
    personas: [
      { name: 'Roland', intro: "Roland. Stuck at the back, dying to charge.", bravery: 0.6, patience: 0.3, recklessness: 0.8 },
      { name: 'Roxie', intro: "Roxie. Waiting patiently... for now.", bravery: 0.5, patience: 0.8, recklessness: 0.4 },
      { name: 'Brick', intro: "Brick. Rock-solid. Awaiting the call.", bravery: 0.7, patience: 0.5, recklessness: 0.3 },
      { name: 'Gertrude', intro: "Gertrude. Free me from this corner!", bravery: 0.8, patience: 0.2, recklessness: 0.9 },
      { name: 'Mortimer', intro: "Mortimer. Quietly guarding, secretly itching.", bravery: 0.4, patience: 0.6, recklessness: 0.7 },
      { name: 'Ramona', intro: "Ramona. Watching from afar, longing to roam.", bravery: 0.6, patience: 0.7, recklessness: 0.5 },
      { name: 'Grizzle', intro: "Grizzle. Unleash me and stand back.", bravery: 0.9, patience: 0.3, recklessness: 1 },
      { name: 'Roxbury', intro: "Roxbury. Guarding now, roaring later.", bravery: 0.7, patience: 0.8, recklessness: 0.6 },
    ],
  },
  n: {
    stamina: 0.6,
    personas: [
      { name: 'Lancelot', intro: "Lancelot! Into the fray, fearless as ever.", bravery: 0.9, patience: 0.4, recklessness: 0.9 },
      { name: 'Percival', intro: "Percival. Valor first, questions later.", bravery: 0.9, patience: 0.4, recklessness: 0.8 },
      { name: 'Galahad', intro: "Galahad. Courage and a swift blade.", bravery: 0.8, patience: 0.5, recklessness: 0.7 },
      { name: 'Ignatius', intro: "Ignatius. Honour-bound and unyielding.", bravery: 0.7, patience: 0.6, recklessness: 0.6 },
      { name: 'Gawain', intro: "Gawain. Forward, always forward.", bravery: 0.8, patience: 0.4, recklessness: 0.9 },
      { name: 'Huck', intro: "Huck. Always up for an escapade.", bravery: 0.6, patience: 0.4, recklessness: 0.8 },
    ],
  },
  b: {
    stamina: 0.5,
    personas: [
      { name: 'Cuthbert', intro: "Cuthbert. I read the board's destiny.", bravery: 0.6, wisdom: 0.8, charisma: 0.6 },
      { name: 'Cassandra', intro: "Cassandra. I foretell doom. Theirs, mostly.", bravery: 0.5, wisdom: 0.9, charisma: 0.6 },
      { name: 'Ezekiel', intro: "Ezekiel. Keeper of quiet secrets.", bravery: 0.4, wisdom: 0.8, charisma: 0.7 },
      { name: 'Thalia', intro: "Thalia. Balance in all things.", bravery: 0.6, wisdom: 0.7, charisma: 0.5 },
      { name: 'Bartholomew', intro: "Bartholomew. Faith and strategy, aligned.", bravery: 0.5, wisdom: 0.6, charisma: 0.7 },
    ],
  },
  q: {
    stamina: 0.7,
    personas: [
      { name: 'Seraphina', intro: "Seraphina. Grand schemes, elegant grace.", bravery: 0.8, wisdom: 0.9, charisma: 0.7 },
      { name: 'Isabella', intro: "Isabella. Strategy, with flair.", bravery: 0.7, wisdom: 0.8, charisma: 0.9 },
      { name: 'Ophelia', intro: "Ophelia. Elegance and cold tactics.", bravery: 0.6, wisdom: 0.9, charisma: 0.8 },
      { name: 'Celestia', intro: "Celestia. I take the cosmic view.", bravery: 0.5, wisdom: 0.8, charisma: 0.7 },
      { name: 'Arabella', intro: "Arabella. Every inch a queen.", bravery: 0.7, wisdom: 0.7, charisma: 0.8 },
    ],
  },
  k: {
    stamina: 0.8,
    personas: [
      { name: 'Reginald', intro: "Reginald. I rule with a steady mind.", bravery: 0.7, wisdom: 0.9, charisma: 0.8 },
      { name: 'Maximus', intro: "Maximus. Wise, and quite immovable.", bravery: 0.8, wisdom: 0.9, charisma: 0.7 },
      { name: 'Ferdinand', intro: "Ferdinand. Courage guides the crown.", bravery: 0.7, wisdom: 0.8, charisma: 0.8 },
      { name: 'Octavius', intro: "Octavius. Intellect and regal calm.", bravery: 0.6, wisdom: 0.9, charisma: 0.6 },
      { name: 'Regulus', intro: "Regulus. My heart is with the kingdom.", bravery: 0.8, wisdom: 0.7, charisma: 0.7 },
    ],
  },
}

/** Human-readable type name, for dialogue. */
export const TYPE_NAME: Record<PieceType, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
}
