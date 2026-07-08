/**
 * Turns ranked `GameEvent`s into spoken lines. Fully authored + templated (no
 * network, no LLM): line pools are chosen by event kind, then narrowed by the
 * speaker's traits, mood and bonds, filled with names, and de-duplicated with a
 * short memory and a per-soul cooldown so the table talk stays fresh.
 *
 * All randomness comes from an injected seeded RNG, so a shared seed reproduces
 * not just the cast but the banter.
 */
import { TYPE_NAME } from './profiles'
import { dominantMood, type Society } from './social'
import type { GameEvent, PieceSoul, Utterance } from './types'

type Rng = () => number

export interface DialogueState {
  recent: string[] // ring buffer of recently spoken lines (filled text)
  recentTemplates: string[] // and their raw templates — two "You KILLED X" with
  // different names still read as the same canned line, so dedup both.
  lastSpoke: Record<string, number> // soulId -> ply
  // Ambient chatter is budgeted per side so the enemy isn't drowned out by your
  // own pieces — the two armies each get their own quiet slot.
  lastAmbientAlly: number
  lastAmbientEnemy: number
}

export const createDialogueState = (): DialogueState => ({
  recent: [],
  recentTemplates: [],
  lastSpoke: {},
  lastAmbientAlly: -99,
  lastAmbientEnemy: -99,
})

// Sized for a long game: the 50-game soak measured 26% repeated lines at 40 —
// a wider memory keeps the table talk fresher deep into the endgame.
const RECENT_MAX = 90

interface Ctx {
  me: string
  type: string
  target: string
  vtype: string
  fallen: string
  level: number
}

function fill(template: string, ctx: Ctx): string {
  return template
    .replace(/\{fallen\}/g, ctx.fallen)
    .replace(/\{me\}/g, ctx.me)
    .replace(/\{type\}/g, ctx.type)
    .replace(/\{target\}/g, ctx.target)
    .replace(/\{vtype\}/g, ctx.vtype)
}

// ── Authored line pools ─────────────────────────────────────────────────────

// Lines are kept SHORT on purpose — they surface as speech bubbles pinned over
// a piece, so on a phone a long line hides the board. Aim for a few words.
const CAPTURE_TAUNT = [
  'Down goes {target}!',
  'Sorry, {target}. Bit personal.',
  "That's how a {type} does it.",
  'You go first, {target}.',
  'One less {vtype}.',
  'That square was mine, {target}.',
  'Buh-bye, {target}.',
  'Wrong diagonal, {target}.',
  'Swept aside. Next!',
  'Should not have wandered over, {target}.',
  'Clean.',
  'Timber!',
]
const CAPTURE_REVENGE = [
  'THAT was for the fallen, {target}.',
  'Should have stayed home, {target}.',
  'Payback, {target}.',
  'Waited all game for you, {target}.',
  'This one was personal, {target}.',
  'You started this, {target}.',
  'Justice. Sleep well, {target}.',
]
const CAPTURE_GLOAT = [
  "Another! Who's next?",
  "I'm on a rampage.",
  'They keep sending {vtype}s.',
  'Unstoppable.',
  'Lost count, honestly.',
  'All day, easy.',
  'Fear me, etcetera.',
]

const DYING_BRAVE = [
  'I held the line. — {me}',
  'No regrets. — {me}',
  'The war goes on! — {me}',
  "Is that all? ...oh. — {me}",
  'Worth it. — {me}',
  'Onward, comrades! — {me}',
  'Remember me. — {me}',
]
const DYING_TIMID = [
  'Wait WAIT— aargh! — {me}',
  'KNEW I should have stayed home. — {me}',
  'I was afraid of this! — {me}',
  'Not by a {vtype}! — {me}',
  'So much left to shuffle! — {me}',
  'Someone was WATCHING me?! — {me}',
]

const THREATENED_BRAVE = [
  'Come take me, {target}.',
  'Scared of a {vtype}? Try it.',
  'I see you, {target}. Bring it.',
  'I do not flinch.',
  'Ready when you are, {target}.',
  'That supposed to scare me?',
  'Over here, {target}. If you dare.',
]
const THREATENED_TIMID = [
  'Anyone going to defend me??',
  "That {vtype} is eyeing me!",
  'HELP! {target}!',
  'I hate this square.',
  '{target} is RIGHT THERE!',
  'Too young to die!',
  'Can I go back?',
  'Is that pointed at ME?!',
  "I'm wide open!",
  'Cover me!',
]

const DEFENDED = [
  'Thanks, {target}. I owe you.',
  'Knew {target} had my back.',
  'Bless you, {target}.',
]

const PROMOTION = [
  'A {vtype} no more — I am QUEEN!',
  'PROMOTION!',
  'Look at me now.',
  'Front line to royalty!',
  'Crowned at last!',
]

const CHECK = [
  'Your king looks nervous.',
  'Check! Feel it yet?',
  'King on the run!',
  'Knock knock, {target}.',
  'Move that king, {target}.',
]

const VICTORY = [
  'Checkmate, {target}.',
  'And THAT is game.',
  'Nowhere to run, {target}.',
  'We did it!',
  'Any doubt? None.',
]

// Grief boiling into vengeance — names the fallen friend and the killer.
const VENGEANCE = [
  'You killed {fallen}, {target}. I will end you.',
  '{fallen} was my friend. Now you die, {target}.',
  'For {fallen}! You are done, {target}.',
  'They took {fallen}. Run, {target}.',
  'No... {fallen}! I am coming, {target}.',
  '{fallen} deserved better, {target}.',
]

const CASTLE = [
  'King tucked away. Smart.',
  'Castling — cosy corner now.',
  'King safe. Now, to work.',
]

// The restless-rook arc, escalating with impatience level (from character_notes).
const IMPATIENT: Record<number, string[]> = {
  1: [
    'Forgotten back here...',
    'Put me in, coach!',
    'Ugh, this is dull.',
    'Itching to move!',
  ],
  2: [
    "There's a kingdom to conquer!",
    'This wait is eternal.',
    "They're playing without me!",
    "I'm wasted back here!",
  ],
  3: [
    'Enough! This is torture!',
    'Release me from this corner!',
    'My rage BURNS!',
    'I AM THE UNLEASHED WRATH!',
  ],
}

// ── Selection ───────────────────────────────────────────────────────────────

const pick = (arr: string[], rng: Rng): string => arr[Math.floor(rng() * arr.length)]

function poolFor(event: GameEvent, speaker: PieceSoul): string[] {
  const brave = (speaker.persona.bravery ?? 0.5) >= 0.55
  switch (event.kind) {
    case 'capture': {
      if (speaker.kills >= 3 && speaker.mood.confidence > 0.7) return CAPTURE_GLOAT
      const bond = event.otherId ? (speaker.bonds[event.otherId] ?? 0) : 0
      return bond < -0.2 ? CAPTURE_REVENGE : CAPTURE_TAUNT
    }
    case 'captured':
      return brave ? DYING_BRAVE : DYING_TIMID
    case 'threatened':
      return brave && speaker.mood.fear < 0.6 ? THREATENED_BRAVE : THREATENED_TIMID
    case 'defended':
      return DEFENDED
    case 'promotion':
      return PROMOTION
    case 'check':
      return CHECK
    case 'checkmate':
      return VICTORY
    case 'vengeance':
      return VENGEANCE
    case 'castle':
      return CASTLE
    case 'impatient':
      return IMPATIENT[(event.data?.level as number) ?? 1] ?? IMPATIENT[1]
    default:
      return []
  }
}

function toneFor(event: GameEvent, speaker: PieceSoul): Utterance['tone'] {
  switch (event.kind) {
    case 'capture':
    case 'check':
    case 'checkmate':
      return 'gloat'
    case 'captured':
      return 'sad'
    case 'threatened':
      return (speaker.persona.bravery ?? 0.5) >= 0.55 && speaker.mood.fear < 0.6 ? 'angry' : 'afraid'
    case 'impatient':
    case 'vengeance':
      return 'angry'
    case 'defended':
      return 'warm'
    case 'promotion':
      return 'joy'
    default:
      return 'calm'
  }
}

function contextFor(event: GameEvent, society: Society): Ctx {
  const me = society.souls[event.soulId]
  const other = event.otherId ? society.souls[event.otherId] : undefined
  return {
    me: me?.persona.name ?? 'Someone',
    type: me ? TYPE_NAME[me.type] : 'piece',
    target: other?.persona.name ?? 'the enemy',
    vtype: other ? TYPE_NAME[other.type] : 'piece',
    fallen: (event.data?.fallen as string) ?? 'my friend',
    level: (event.data?.level as number) ?? 1,
  }
}

/**
 * Choose up to `max` lines to voice this ply. Events are considered most-salient
 * first; a soul that just spoke stays quiet unless the moment is dramatic, and
 * recently-heard lines are skipped.
 */
// The dramatic beats that always deserve a line; everything else is "ambient"
// chatter that must be spaced out and is usually skipped, to protect novelty.
const PRIORITY = new Set<GameEvent['kind']>(['capture', 'captured', 'promotion', 'checkmate', 'vengeance'])

export function speak(
  society: Society,
  events: GameEvent[],
  state: DialogueState,
  rng: Rng,
  chatter = 0.6,
  max = 2,
): Utterance[] {
  if (chatter <= 0 && !events.some((e) => PRIORITY.has(e.kind))) return []
  const out: Utterance[] = []
  const spokenThisPly = new Set<string>()
  const ranked = [...events].sort((a, b) => b.salience - a.salience)
  let ambientAlly = false
  let ambientEnemy = false

  for (const event of ranked) {
    if (out.length >= max) break
    const speaker = society.souls[event.soulId]
    if (!speaker) continue
    if (spokenThisPly.has(speaker.id)) continue

    const priority = PRIORITY.has(event.kind)
    const enemy = speaker.color === 'b' // the player is always White
    if (!priority) {
      // Ambient banter: one per side per call, spaced apart, usually skipped.
      // The enemy is a touch chattier; the Chattiness scaler widens/narrows both
      // the gap and the skip chance (0 → effectively silent, 1 → lively).
      if (enemy ? ambientEnemy : ambientAlly) continue
      const gap = Math.max(1, Math.round((enemy ? 3 : 4) + (0.6 - chatter) * 6))
      const last = enemy ? state.lastAmbientEnemy : state.lastAmbientAlly
      if (society.ply - last < gap) continue
      // Sassy pieces pipe up more often than shy ones.
      const sass = (speaker.sass ?? 0.5) - 0.5
      const skip = Math.min(0.97, Math.max(0.05, (enemy ? 0.4 : 0.6) + (0.6 - chatter) - sass * 0.4))
      if (rng() < skip) continue
    }

    // Per-piece cooldown so nobody monologues (looser for dramatic moments).
    const since = society.ply - (state.lastSpoke[speaker.id] ?? -99)
    if (since < (priority ? 2 : 4) && event.salience < 80) continue

    const pool = poolFor(event, speaker)
    if (pool.length === 0) continue

    const ctx = contextFor(event, society)
    let text = ''
    let template = ''
    for (let attempt = 0; attempt < 4; attempt += 1) {
      template = pick(pool, rng)
      text = fill(template, ctx) // fall back to a repeat rather than staying silent
      if (!state.recent.includes(text) && !state.recentTemplates.includes(template)) break
    }

    out.push({
      soulId: speaker.id,
      square: speaker.square,
      color: speaker.color,
      name: speaker.persona.name,
      text,
      tone: toneFor(event, speaker),
    })
    spokenThisPly.add(speaker.id)
    state.lastSpoke[speaker.id] = society.ply
    state.recent.push(text)
    state.recentTemplates.push(template)
    if (state.recent.length > RECENT_MAX) state.recent.shift()
    if (state.recentTemplates.length > RECENT_MAX) state.recentTemplates.shift()
    if (!priority) {
      if (enemy) {
        ambientEnemy = true
        state.lastAmbientEnemy = society.ply
      } else {
        ambientAlly = true
        state.lastAmbientAlly = society.ply
      }
    }
  }
  return out
}

// ── Agency lines (piece opinions) ────────────────────────────────────────────

const RESIST_REFUSE = [
  'No. That square is a trap.',
  'Me? THERE? Are you mad?',
  'Nope. Pick someone braver.',
  'I refuse.',
  'Not into that. Try again.',
]
const RESIST_SACRIFICE = [
  "That's a sacrifice! Sure?",
  "Throwing me away?! ...say it again.",
  "Suicide! Really?",
  'A martyr? Tell me twice.',
]
const SUGGEST = [
  "Psst — I've got a shot.",
  'I see an opening!',
  'Pick me — I can strike.',
  'Material! I volunteer.',
]
const SUGGEST_RECKLESS = [
  "Forget caution — send me!",
  'Glory! Choose me!',
  'Something reckless. Me. Now.',
]
// Confident, wrong. Pieces that don't trust your generalship shout bad ideas.
const BAD_ADVICE = [
  'Trust me — send me forward!',
  "I've a brilliant plan. Move me!",
  'Pick me! Definitely the winning move.',
  "MY instincts are never wrong. Usually.",
  'Put me in the thick of it!',
]
const HECKLE = [
  "We don't have all day.",
  'Any... century now?',
  'They will die of old age.',
  'Tap. Please. Anything.',
  'So. Slow.',
]

// Idle chit-chat before the first move — light, off-duty banter.
const SMALLTALK = [
  'Lovely day for a battle.',
  'Good luck, everyone.',
  'Hope I go last.',
  "There is a plan, right?",
  'Long game ahead, team.',
  'An honour to serve.',
  'Anyone else nervous?',
]
// A surviving comrade's faith in the general slips when one of ours is lost —
// directed at the player (the trust meter's voice), not the killer.
const LOSE_FAITH = [
  'We keep dying. Any plan, general?',
  'Another one gone. Really?',
  "I trusted that order. Mistake.",
  "We're being picked apart.",
  "Not sure I'd follow you again.",
  'The ranks are talking, general.',
]
export const loseFaithLine = (rng: Rng): string => pick(LOSE_FAITH, rng)

// A vengeful piece pines for its fallen friend across the turns before it
// strikes — so the rage-strike, when it comes, is clearly earned. {fallen} = name.
const PINING = [
  'I still hear {fallen} sometimes.',
  "{fallen}… I haven't forgotten.",
  'This one is for you, {fallen}.',
  'They took {fallen}. They will pay.',
  'Rest easy, {fallen}. I have this.',
  'Every square reminds me of {fallen}.',
  'Soon, {fallen}. Soon.',
]
export const pineLine = (fallen: string, rng: Rng): string => pick(PINING, rng).replace(/\{fallen\}/g, fallen)

// Too late: the player tapped a cheat after the window to send it home closed.
const MISSED_REPRIMAND = [
  'Too slow! I am staying RIGHT here.',
  'Your chance to send me back? Gone.',
  "Should have acted sooner. I'm home now.",
  'Ha! You blinked. I keep the square.',
]
export const missedReprimandLine = (rng: Rng): string => pick(MISSED_REPRIMAND, rng)

// A timid piece thinks better of a reckless capture and pulls back instead.
const BALK = [
  'Nearly! ...no. Too well guarded.',
  'On second thought — falling back.',
  "That's a trap. I'm out.",
  'Ooh— actually, no thank you.',
]
export const balkLine = (rng: Rng): string => pick(BALK, rng)

const POSTGAME_WIN = ['Told you we had it!', 'A famous victory!', 'Never doubted you, general.']
const POSTGAME_LOSS = ["Next time.", 'A good scrap.', 'Heads high, everyone.']

export const resistLine = (kind: 'refuse' | 'sacrifice', rng: Rng): string =>
  pick(kind === 'sacrifice' ? RESIST_SACRIFICE : RESIST_REFUSE, rng)
export const smallTalkLine = (rng: Rng): string => pick(SMALLTALK, rng)
export const postGameLine = (won: boolean, rng: Rng): string => pick(won ? POSTGAME_WIN : POSTGAME_LOSS, rng)

// Pregame conversations between adjacent pieces — this is how friendships form
// (and thus why anyone grieves later). Each pair gets a real back-and-forth:
// opener → reply → a couple of banter beats → closer, alternating speakers.
// {target} = the other piece's name.
const CHAT_OPENER = [
  'Stick close today, {target}?',
  'Nervous, {target}? I am.',
  'We make a good team, {target}.',
  '{target}, I watch your back, you watch mine.',
  'Good to have you beside me, {target}.',
  'Whatever happens out there, {target} — it was an honour.',
]
const CHAT_REPLY = [
  'Always, {target}.',
  "Right behind you, {target}.",
  "Wouldn't stand anywhere else, {target}.",
  "Don't you dare get taken, {target}.",
  'To the end, {target}.',
  'Count on it, {target}.',
]
const CHAT_BANTER = [
  'You were magnificent last time, {target}.',
  'A knight comes for me? Shout, {target}.',
  'Watch the long diagonals, {target}.',
  'The enemy queen is in a MOOD.',
  'Watch the flanks, {target}.',
  'Polished my base. Battle-ready.',
  'If I fall, {target}, avenge me.',
  'You always say that, {target}.',
  'Drew straws. I go first.',
  'The king wanders — watch him.',
]
const CHAT_CLOSER = [
  'For the king, {target}.',
  'Shoulder to shoulder, then.',
  'Let us give them a show, {target}.',
  'Till the last rank, {target}.',
  'See you on the other side of this, {target}.',
]
const fillName = (t: string, name: string) => t.replace(/\{target\}/g, name)
const pickFresh = (pool: string[], used: Set<string>, rng: Rng): string => {
  for (let i = 0; i < 6; i += 1) {
    const t = pick(pool, rng)
    if (!used.has(t)) {
      used.add(t)
      return t
    }
  }
  return pick(pool, rng)
}
export const chatOpener = (name: string, rng: Rng, used: Set<string>): string => fillName(pickFresh(CHAT_OPENER, used, rng), name)
export const chatReply = (name: string, rng: Rng, used: Set<string>): string => fillName(pickFresh(CHAT_REPLY, used, rng), name)
export const chatBanter = (name: string, rng: Rng, used: Set<string>): string => fillName(pickFresh(CHAT_BANTER, used, rng), name)
export const chatCloser = (name: string, rng: Rng, used: Set<string>): string => fillName(pickFresh(CHAT_CLOSER, used, rng), name)

// Enemy stunts arrive in two beats: a telegraph the player can read coming, then
// the payoff. Neither ever claims the player's own pieces have the same gear.
const ENEMY_ANNOUNCE: Record<'jetpack' | 'disguise', string[]> = {
  jetpack: ['Hear that rattle? Watch.', 'Strapped something on. Watch.'],
  disguise: ['A rook plays it straight? Ha.', 'Been practising diagonals...'],
}
const ENEMY_COMMIT: Record<'jetpack' | 'disguise', string[]> = {
  jetpack: ['AIRBORNE! Hahahaha!', 'The sky is MINE!'],
  disguise: ['Diagonals feel WONDERFUL.', 'Bishop lessons paid off!'],
}
export const enemyStuntAnnounce = (type: 'jetpack' | 'disguise', rng: Rng): string => pick(ENEMY_ANNOUNCE[type], rng)
export const enemyStuntCommit = (type: 'jetpack' | 'disguise', rng: Rng): string => pick(ENEMY_COMMIT[type], rng)
export const suggestLine = (reckless: boolean, rng: Rng): string => pick(reckless ? SUGGEST_RECKLESS : SUGGEST, rng)
export const badAdviceLine = (rng: Rng): string => pick(BAD_ADVICE, rng)
export const heckleLine = (rng: Rng): string => pick(HECKLE, rng)

/** A piece's self-introduction (used on click / at game start). */
export const introOf = (soul: PieceSoul): string => soul.persona.intro

// Keep the mood helper reachable for callers styling bubbles by tone.
export { dominantMood }
