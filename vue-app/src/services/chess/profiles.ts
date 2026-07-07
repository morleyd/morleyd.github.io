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
      { name: 'Kenneth', intro: "Greetings, I'm Kenneth, the pawn with a knack for unexpected twists and turns!", bravery: 0.7, obedience: 0.6, intelligence: 0.7 },
      { name: 'Brian', intro: "Hey there, Brian at your service! I might be a pawn, but I've got big aspirations!", bravery: 0.5, obedience: 0.8, intelligence: 0.5 },
      { name: 'Jake', intro: "Howdy, I'm Jake! I'll surprise you with my moves—just like life's surprises!", bravery: 0.6, obedience: 0.5, intelligence: 0.6 },
      { name: 'Phil', intro: "Phil's my name, pawnin' is my game! Ready to see where my path leads?", bravery: 0.4, obedience: 0.9, intelligence: 0.4 },
      { name: 'Dennis', intro: "Hi, I'm Dennis! I may be a pawn, but I'm ready to make my mark on the board!", bravery: 0.8, obedience: 0.7, intelligence: 0.8 },
      { name: 'Walter', intro: "Walter's the name, and I'm here to show that pawns can bring big waves!", bravery: 0.6, obedience: 0.7, intelligence: 0.6 },
      { name: 'Mikey', intro: "Mikey here, ready to put the 'pawn' in 'pawn-tastic'! Let's do this!", bravery: 0.9, obedience: 0.4, intelligence: 0.3 },
      { name: 'Gerard', intro: "Greetings, Gerard's the pawn in motion! Watch out for my unexpected twists!", bravery: 0.7, obedience: 0.6, intelligence: 0.7 },
      { name: 'Janice', intro: "Heya, I'm Janice, the pawn who's all about making the most out of every move!", bravery: 0.5, obedience: 0.9, intelligence: 0.9 },
      { name: 'Francy', intro: "Francy reporting in! I may be a pawn, but I've got flair and style!", bravery: 0.8, obedience: 0.5, intelligence: 0.5 },
      { name: 'Bev', intro: "Hi there, Bev's my name! I might be a pawn, but I'll pawn-fuse strategy and fun!", bravery: 0.4, obedience: 0.8, intelligence: 0.4 },
      { name: 'Barb', intro: "Barb's here, ready to weave some chess magic as a pawn with flair!", bravery: 0.9, obedience: 0.3, intelligence: 0.9 },
      { name: 'Flo', intro: "Flo's the name, pawn moves are my game! Get ready for a flood of surprises!", bravery: 0.7, obedience: 0.6, intelligence: 0.7 },
      { name: 'Karen', intro: "Hello, I'm Karen, the pawn who's ready to ask the board for the manager!", bravery: 0.3, obedience: 0.2, intelligence: 0.3 },
      { name: 'Nancy', intro: "Nancy here, pawn extraordinaire! I'll navigate the chaos and bring results!", bravery: 0.6, obedience: 0.7, intelligence: 0.6 },
      { name: 'Marg', intro: "Hey, it's Marg in action! As a pawn, I'll make sure to leave my mark!", bravery: 0.8, obedience: 0.4, intelligence: 0.8 },
      { name: 'Milo', intro: "Hello there, I'm Milo, the pawn who turns every move into an exciting discovery!", bravery: 0.4, obedience: 0.6, intelligence: 0.7 },
    ],
  },
  r: {
    stamina: 0.6,
    personas: [
      { name: 'Roland', intro: "Ahoy, I'm Roland! Stuck at the back, yearning to join the grand melee!", bravery: 0.6, patience: 0.3, recklessness: 0.8 },
      { name: 'Roxie', intro: "Hey there, I'm Roxie! Waiting patiently, but ready to rock and roll!", bravery: 0.5, patience: 0.8, recklessness: 0.4 },
      { name: 'Brick', intro: "Brick's the name, rock-solid defense is my game! Just waiting for my call to action.", bravery: 0.7, patience: 0.5, recklessness: 0.3 },
      { name: 'Gertrude', intro: "Greetings, I'm Gertrude! Eager to escape my corner and crush some foes!", bravery: 0.8, patience: 0.2, recklessness: 0.9 },
      { name: 'Mortimer', intro: "Hello, Mortimer here! Quietly guarding, but secretly craving a daring charge!", bravery: 0.4, patience: 0.6, recklessness: 0.7 },
      { name: 'Ramona', intro: "Ramona reporting in! Observing from afar, but yearning to roam free!", bravery: 0.6, patience: 0.7, recklessness: 0.5 },
      { name: 'Grizzle', intro: "Grizzle's the name, fierce and unwavering! Waiting to unleash my might!", bravery: 0.9, patience: 0.3, recklessness: 1 },
      { name: 'Roxbury', intro: "Roxbury in the house! Patiently guarding, but ready to roll with passion!", bravery: 0.7, patience: 0.8, recklessness: 0.6 },
    ],
  },
  n: {
    stamina: 0.6,
    personas: [
      { name: 'Lancelot', intro: "Hark! I'm Lancelot, charging fearlessly into the fray with honor and might!", bravery: 0.9, patience: 0.4, recklessness: 0.9 },
      { name: 'Percival', intro: "Greetings, I'm Percival, charging into battles with valor and resolve!", bravery: 0.9, patience: 0.4, recklessness: 0.8 },
      { name: 'Galahad', intro: "Salutations, I'm Galahad, riding the board with courage and a swift blade!", bravery: 0.8, patience: 0.5, recklessness: 0.7 },
      { name: 'Ignatius', intro: "Hello, I am Ignatius, a knight of honor, guarding with unyielding strength!", bravery: 0.7, patience: 0.6, recklessness: 0.6 },
      { name: 'Gawain', intro: "Greetings, I am Gawain, galloping forward with unshakable bravery!", bravery: 0.8, patience: 0.4, recklessness: 0.9 },
      { name: 'Huck', intro: "Howdy, I'm Huck, the knight always up for a daring escapade!", bravery: 0.6, patience: 0.4, recklessness: 0.8 },
    ],
  },
  b: {
    stamina: 0.5,
    personas: [
      { name: 'Cuthbert', intro: "Hello, I'm Cuthbert, weaving mystic patterns to guide the board's destiny!", bravery: 0.6, wisdom: 0.8, charisma: 0.6 },
      { name: 'Cassandra', intro: "Greetings, I'm Cassandra, foretelling destiny with mystical insight!", bravery: 0.5, wisdom: 0.9, charisma: 0.6 },
      { name: 'Ezekiel', intro: "Salutations, I'm Ezekiel, unraveling secrets with profound wisdom!", bravery: 0.4, wisdom: 0.8, charisma: 0.7 },
      { name: 'Thalia', intro: "Hello, I am Thalia, guiding with the harmonious balance of knowledge!", bravery: 0.6, wisdom: 0.7, charisma: 0.5 },
      { name: 'Bartholomew', intro: "Greetings, I am Bartholomew, uniting faith and strategy in my counsel!", bravery: 0.5, wisdom: 0.6, charisma: 0.7 },
    ],
  },
  q: {
    stamina: 0.7,
    personas: [
      { name: 'Seraphina', intro: "Greetings, I'm Seraphina, plotting grand schemes with elegance and grace!", bravery: 0.8, wisdom: 0.9, charisma: 0.7 },
      { name: 'Isabella', intro: "Greetings, I'm Isabella, orchestrating grand strategies with finesse and flair!", bravery: 0.7, wisdom: 0.8, charisma: 0.9 },
      { name: 'Ophelia', intro: "Salutations, I'm Ophelia, commanding with elegance and tactical brilliance!", bravery: 0.6, wisdom: 0.9, charisma: 0.8 },
      { name: 'Celestia', intro: "Hello, I am Celestia, guiding with grace and a cosmic perspective!", bravery: 0.5, wisdom: 0.8, charisma: 0.7 },
      { name: 'Arabella', intro: "Greetings, I am Arabella, ruling with power and a queenly demeanor!", bravery: 0.7, wisdom: 0.7, charisma: 0.8 },
    ],
  },
  k: {
    stamina: 0.8,
    personas: [
      { name: 'Reginald', intro: "Hail, I'm Reginald, ruling with dignity and a strategic mind!", bravery: 0.7, wisdom: 0.9, charisma: 0.8 },
      { name: 'Maximus', intro: "Behold, I am Maximus, the wise and unwavering ruler of the board!", bravery: 0.8, wisdom: 0.9, charisma: 0.7 },
      { name: 'Ferdinand', intro: "Greetings, I'm Ferdinand, leading with courage and strategic brilliance!", bravery: 0.7, wisdom: 0.8, charisma: 0.8 },
      { name: 'Octavius', intro: "Salutations, I am Octavius, reigning with intellect and regal elegance!", bravery: 0.6, wisdom: 0.9, charisma: 0.6 },
      { name: 'Regulus', intro: "Hear me, I am Regulus, ruling with honor and a heart for the kingdom!", bravery: 0.8, wisdom: 0.7, charisma: 0.7 },
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
