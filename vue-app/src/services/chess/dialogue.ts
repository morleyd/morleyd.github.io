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
  recent: string[] // ring buffer of recently spoken lines
  lastSpoke: Record<string, number> // soulId -> ply
  // Ambient chatter is budgeted per side so the enemy isn't drowned out by your
  // own pieces — the two armies each get their own quiet slot.
  lastAmbientAlly: number
  lastAmbientEnemy: number
}

export const createDialogueState = (): DialogueState => ({
  recent: [],
  lastSpoke: {},
  lastAmbientAlly: -99,
  lastAmbientEnemy: -99,
})

const RECENT_MAX = 40

interface Ctx {
  me: string
  type: string
  target: string
  vtype: string
  level: number
}

function fill(template: string, ctx: Ctx): string {
  return template
    .replace(/\{me\}/g, ctx.me)
    .replace(/\{type\}/g, ctx.type)
    .replace(/\{target\}/g, ctx.target)
    .replace(/\{vtype\}/g, ctx.vtype)
}

// ── Authored line pools ─────────────────────────────────────────────────────

const CAPTURE_TAUNT = [
  'Down goes {target}! This square is mine now.',
  'Sorry, {target} — nothing personal. Well, a little personal.',
  'And that, {target}, is how a {type} does it.',
  "Checkmate's coming, but you go first, {target}.",
  'One less {vtype} to worry about.',
  'Did {target} really think that square was safe?',
  'Buh-bye, {target}. Give my regards to the box.',
  'You picked the wrong diagonal, {target}.',
  'Swept aside like the rest. Next!',
  "That's what happens when you wander over here, {target}.",
  'A clean capture. My mother would be proud.',
  'Timber! Another {vtype} bites the dust.',
]
const CAPTURE_REVENGE = [
  'THAT was for what you did, {target}. We remember.',
  'You should have stayed on your side, {target}.',
  'Vengeance is a dish best served from this exact square, {target}.',
  "I've waited the whole game to take you down, {target}.",
  'This one was personal, {target}. You know why.',
  'You started this, {target}. I am finishing it.',
  'Justice, at last. Sleep well, {target}.',
]
const CAPTURE_GLOAT = [
  "Another one! Who's next? Line up.",
  "I'm on a rampage and the board knows it.",
  'They keep sending {vtype}s and I keep collecting them.',
  'Unstoppable. Simply unstoppable.',
  'Should I even keep count anymore?',
  'I could do this all day, honestly.',
  'Fear me, tremble, etcetera. You know the drill.',
]

const DYING_BRAVE = [
  'Tell my king... I held the line. — {me}',
  'A good square to fall on. No regrets. — {me}',
  'You got me, but the war is far from over! — {me}',
  "Is that all? I've had worse. ...oh. Oh no. — {me}",
  'Worth it. Every step. — {me}',
  'I regret nothing! Onward, comrades! — {me}',
  'Remember me as I was — glorious. — {me}',
]
const DYING_TIMID = [
  'Wait wait WAIT— aaargh! — {me}',
  'I KNEW I should have stayed home. — {me}',
  'This is exactly what I was afraid of! — {me}',
  "Tell {target} I forgive them. Actually, no, I don't. — {me}",
  'Not like this! Not by a {vtype}! — {me}',
  'I had so much left to shuffle! — {me}',
  "Somebody was supposed to be watching me! — {me}",
]

const THREATENED_BRAVE = [
  'Come and take me then, {target}. I dare you.',
  "You think I'm scared of a {vtype}? Try it.",
  'I see you eyeing me, {target}. Bring it.',
  'Threaten all you like — I do not flinch.',
  'Make your move, {target}. I will be ready.',
  'Is that supposed to frighten me? Cute.',
  "You found me, {target}? Good. Saves me the trouble of finding you.",
  'Over here, {target}. If you think you can.',
]
const THREATENED_TIMID = [
  'Um. Is anyone going to defend me? Anyone??',
  'That {vtype} is looking right at me and I do NOT like it.',
  'Help! HELP! {target} is going to get me!',
  "I'd like to file a complaint about my current square.",
  'Why is nobody moving?! {target} is RIGHT THERE!',
  'I am too young and too flat to die!',
  'Is it too late to go back to my starting square?',
  'Wait — is that {vtype} pointed at ME?!',
  "They've spotted me! I'm wide open here!",
  'Retreat! Somebody, cover me!',
  'Nothing to see here, {target}. Look away. Please look away.',
]

const DEFENDED = [
  "Phew. Thanks for having my back, {target}. I owe you one.",
  "Knew {target} would come through for me. Close one.",
  "That was terrifying — bless you, {target}.",
]

const PROMOTION = [
  'I made it to the end! A humble {vtype} no more — bow before your new queen!',
  'PROMOTION! Years of shuffling forward, all for this crown.',
  'They doubted a mere pawn. Look at me now.',
  'From the front line to royalty. What a journey.',
  'One small step for a pawn, one giant leap onto the back rank!',
  'Remember when I was nobody? Me neither.',
]

const CHECK = [
  'Your king looks nervous. As it should.',
  'Check! Feeling the pressure yet?',
  "We've got the king on the run, everyone!",
  'Knock knock. It is your doom calling.',
  'Better move that king, {target}. While you still can.',
]

const VICTORY = [
  'Checkmate. Tell the tavern bards how it ended, {target}.',
  'And THAT is game. Not even close.',
  'Your king has nowhere left to run, {target}. Glorious.',
  'We did it! Every square was worth it!',
  'Checkmate! Was there ever any doubt?',
]

const CASTLE = [
  'Tucked the king away nice and safe. Smart.',
  'Castling — the old switcheroo. Cosy in the corner now.',
  'Right, king is fortified. Now the real work begins.',
]

// The restless-rook arc, escalating with impatience level (from character_notes).
const IMPATIENT: Record<number, string[]> = {
  1: [
    "When will it get exciting? I've been forgotten back here.",
    'Put me in, coach! I can do it!',
    'Ugh, this is dull. Another game and still stuck in my corner.',
    "I'm itching to move! The battlefield calls my name!",
  ],
  2: [
    "Why keep me back here when there's a kingdom to conquer?",
    "Every minute I'm stuck here feels like an eternity.",
    "They're playing without me, and it's maddening!",
    'My power is wasted while I sit here idly!',
  ],
  3: [
    "Enough is enough! This is pure torture!",
    "I'll obliterate them all! Release me from this prison!",
    'My rage burns hotter than a thousand suns!',
    'I AM THE UNLEASHED WRATH! Prepare for annihilation!',
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
const PRIORITY = new Set<GameEvent['kind']>(['capture', 'captured', 'promotion', 'checkmate'])

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
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const candidate = fill(pick(pool, rng), ctx)
      text = candidate // fall back to a repeat rather than staying silent
      if (!state.recent.includes(candidate)) break
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
    if (state.recent.length > RECENT_MAX) state.recent.shift()
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
  'Absolutely not. That square is a death trap.',
  'You want ME to go THERE? Have you lost your mind?',
  'Nope. Nope nope nope. Pick someone braver.',
  'I refuse. Tap all you like.',
  "I'm not moving into that. Try again if you dare.",
]
const RESIST_SACRIFICE = [
  "Wait — that's a sacrifice! Are you SURE?",
  "You're throwing me away?! ...fine. Say it again and I'll go.",
  "That's suicide! ...is that really the plan?",
  'If I must be a martyr, you can tell me twice.',
]
const SUGGEST = [
  "Psst — I've got a shot from here. Send me in.",
  'I see an opening. Let me at it!',
  'Pick me — I can make something happen right now.',
  "There's material to be had, and I volunteer.",
]
const SUGGEST_RECKLESS = [
  "Forget caution — I'm going in! Just point me!",
  'Glory or nothing. Choose me, choose me!',
  "Let's do something gloriously reckless. Me. Now.",
]
const HECKLE = [
  "We don't have all day, you know.",
  'Any... century now?',
  'The enemy will die of old age at this rate.',
  'Tap tap tap. Please. Anything.',
  'I could have conquered a kingdom in the time this is taking.',
]

export const resistLine = (kind: 'refuse' | 'sacrifice', rng: Rng): string =>
  pick(kind === 'sacrifice' ? RESIST_SACRIFICE : RESIST_REFUSE, rng)
export const suggestLine = (reckless: boolean, rng: Rng): string => pick(reckless ? SUGGEST_RECKLESS : SUGGEST, rng)
export const heckleLine = (rng: Rng): string => pick(HECKLE, rng)

/** A piece's self-introduction (used on click / at game start). */
export const introOf = (soul: PieceSoul): string => soul.persona.intro

// Keep the mood helper reachable for callers styling bubbles by tone.
export { dominantMood }
