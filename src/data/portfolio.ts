// Portfolio content: every word on Home, Work and About lives here, so the
// components only render. Numbers must match the résumé; when they change,
// change them here and in public/David-Morley-Resume.pdf together.

export interface Link {
  label: string;
  href: string;
}

export const profile = {
  name: 'David Morley',
  headline: 'Applied Research Scientist — Speech, NLU & Clinical AI',
  summary:
    'I build voice AI that puts humans first: from aircraft maintainers and surgeons to children learning to speak.',
  current: 'Research Scientist at Cobalt Speech & Language since 2022',
  location: 'Idaho Falls, ID',
  photo: '/images/DMorley2026-440.webp',
  // Square crops for the round avatars (200–220px CSS): 2x and 3x screens.
  photoSrcset: '/images/DMorley2026-440.webp 440w, /images/DMorley2026-660.webp 660w',
  resumeUrl: '/David-Morley-Resume.pdf',
  email: 'morley.david.c@gmail.com',
  linkedin: 'https://linkedin.com/in/dcmorley',
  github: 'https://github.com/morleyd'
};

/** One step in a featured project's flow diagram (drawn top to bottom). */
export interface DiagramStep {
  label: string;
  /** A step drawn dashed and dimmed: something filtered out or rejected. */
  muted?: boolean;
  /** A step I built the model or logic for: drawn in gold instead of green. */
  mine?: boolean;
}

/** One run of text in an illustrative coded transcript. */
export interface TranscriptToken {
  text: string;
  /** maze = (false start or repetition), code = [error code], speaker = line prefix. */
  kind?: 'maze' | 'code' | 'speaker';
}

/**
 * The picture on a Home card. Each project gets the kind that tells its story
 * best, so the four cards don't all look alike. Numbers must match the résumé;
 * transcripts and words are made-up examples, never real data.
 */
export type CardVisual =
  | { kind: 'transcript'; input: string; lines: TranscriptToken[][]; caption: string }
  | {
      kind: 'metric';
      label: string;
      before: { value: number; text: string };
      after: { value: number; text: string };
      /** Names for the two bars; defaults to before / after. */
      legend?: [string, string];
      extra?: { label: string; text: string };
    }
  | { kind: 'phonemes'; word: string; phones: { ipa: string; heard?: string }[]; caption: string }
  | { kind: 'shorthand'; pairs: { spoken: string; logged: string }[]; caption: string };

export interface CaseStudy {
  /** Anchor on /work, e.g. /work#salt. */
  id: string;
  title: string;
  years: string;
  role: string;
  /** The single line shown on the Home card. */
  summary: string;
  problem: string;
  myRole: string[];
  approach: string[];
  resultIntro?: string;
  result: string[];
  lesson: { intro: string; bullets?: string[]; outro?: string };
  /** Shown on the Home card. */
  card: CardVisual;
  /** Shown on /work. */
  diagram: DiagramStep[];
  diagramAlt: string;
}

export const featured: CaseStudy[] = [
  {
    id: 'salt',
    title: 'Automated language-sample analysis for SALT',
    years: '2026',
    role: 'Model design and training',
    summary:
      "Neural models that code children's language samples the way clinicians do. Segmentation F1 0.40 → 0.94 on human transcripts. Launching with paying clinicians at the Nov 2026 ASHA convention.",
    problem:
      "Speech-language pathologists evaluate a child's language by recording them talking, transcribing it, and hand-coding the transcript under SALT's conventions: where each utterance ends, which words are false starts or repetitions (mazes), which words are errors, etc. That coding takes skill and time. The existing rule-based modules worked on clean, punctuated transcripts and collapsed on unpunctuated speech-recognition output.",
    myRole: ["I designed and trained the neural models behind SALT's automated transcript coding."],
    approach: [
      'One model per convention: utterance segmentation, mazes, punctuation, error codes, code-switching, etc.',
      'I rebuilt evaluation around one canonical scorer, and I read its output line by line against the source transcripts before believing any number.',
      'I built data-provenance and license guards that check every training record against its permissions, and stamp each model with the data behind it. The approach is being adopted on other projects.'
    ],
    resultIntro: 'Measured on human transcripts:',
    result: [
      'Segmentation F1 went from 0.40 to 0.94.',
      'Agreement with human coders on mean length of utterance (MLU) went from ICC 0.02 to 0.98.',
      "Error coding, built from scratch, agrees with human coders at ICC 0.90 on each child's error rate.",
      'The models launch with paying clinicians at the November 2026 ASHA convention.'
    ],
    lesson: {
      intro:
        'A result can look believable and pass its tests, but still be wrong. Here are three errors that turned up when I dug into model output and the training data:',
      bullets: [
        "SALT's gold transcripts put one utterance per line, each ending in punctuation. My first model scored almost perfectly, but only because it had learned to copy the punctuation instead of learning where utterances end, and it fell apart on unpunctuated speech-recognition text. Training on a mix of punctuated and stripped transcripts fixed that: on text with the punctuation removed, F1 went from 0.60 to 0.85.",
        'The scorer deleted a child\'s first word whenever a sentence started with "I", because "I" looked like a speaker label. Fixing that, with no change to the model, moved the same model from F1 0.61 to 0.90.',
        "Scored on human-segmented utterances, our error-code model agreed with the human coders, so it looked finished. Inside the full pipeline, running on the segmenter's utterances, it flagged whole utterances as errors about four times as often as people do, which made typically developing children look worse than they are. Recalibrating its threshold, with no retraining, brought its flag rate within 5% of the human rate and doubled its agreement with annotators."
      ],
      outro:
        "None of those errors reached a clinician. I use AI heavily, and that's exactly why I read the output against the source data before I believe a number."
    },
    card: {
      kind: 'transcript',
      input: '“um the the boy looked in the jar and the frog was gone because it runned away”',
      lines: [
        [{ text: 'C', kind: 'speaker' }, { text: ' ' }, { text: '(um the)', kind: 'maze' }, { text: ' the boy look/ed in the jar.' }],
        [{ text: 'C', kind: 'speaker' }, { text: ' and the frog was gone because it runned' }, { text: '[EO:ran]', kind: 'code' }, { text: ' away.' }]
      ],
      caption: 'Illustrative example'
    },
    diagram: [
      { label: 'Child Speech' },
      { label: 'ASR Transcript' },
      { label: 'Segmentation', mine: true },
      { label: 'Code Switching & Mazes', mine: true },
      { label: 'Error codes', mine: true },
      { label: 'Clinical measures' }
    ],
    diagramAlt:
      "Flow: a child's speech sample is transcribed with AI. My models then mark utterance segmentation, code-switching and mazes, error codes, etc., and clinical measures are computed from those marks."
  },
  {
    id: 'surgical-device',
    title: 'Operating-room voice control',
    years: '2024 – present',
    role: 'Technical lead',
    summary:
      'For a surgical-device customer, I replaced an SVM intent classifier with a distilled-BERT model that understands commands phrased in ways it never saw in training (50% → 84%), and built the end-to-end test suite its releases are measured on (98.3% task completion at the July 2026 delivery).',
    problem:
      'A surgical-device customer lets surgeons control devices by voice. What they care about most is preventing false activations: the system doing something nobody asked for.',
    myRole: [
      "Technical lead since fall 2024. I scope the statements of work, run the customer's technical calls and own every release.",
      'My own work is mostly language understanding, dialog and test design, and overlaps with teammates who do speech-recognition and wakeword engineering.'
    ],
    approach: [
      "I replaced the customer's SVM intent classifier with a distilled-BERT intent and slot model, so a command no longer had to match the phrasings the classifier was trained on.",
      'The customer asked for confidence scores so they could filter out false activations. But confidence alone couldn\'t do it: many false activations were high-confidence. So I gave the model a "reject" class, trained on hard negatives: phrases that sound like commands but aren\'t. I also calibrated its confidence scores so a threshold on them means something, and tuned how many hard negatives to add against task completion, since too many made it reject real commands.',
      'I built an end-to-end task-completion harness, from speech recognition through dialog, that is now the core of all release testing. Bugs the customer reports become new test cases.',
      'I fixed how spoken numbers reach device settings ("five watts" had been heard as 55).'
    ],
    result: [
      'On new wordings, intent accuracy went from 50% to 84%, and on reworded commands from 63% to 91%. On the phrasings the old model was built for, both scored about 96%, so the whole gain is generalization.',
      "On a false-activation test set (speech that sounds like a command but isn't), the share wrongly acted on fell from 22.5% to 10%.",
      'Task completion reached 98.3% (287 of 292) at the July 2026 delivery.',
      'Accuracy for spoken device settings went from 91.5% to 98.1%.'
    ],
    lesson: {
      intro:
        'When I took over, the only regression set was 35 audio clips, and there was no language-understanding test set at all. Now there are over 600 cases across end-to-end tasks, false activations and speech-recognition errors, plus a 700-phrase language-understanding set, and every release is scored those cases before it ships. That rigor is what lets a customer trust a release.'
    },
    card: {
      kind: 'metric',
      label: 'Understanding new phrasings',
      before: { value: 50, text: '50%' },
      after: { value: 84, text: '84%' },
      legend: ['SVM', 'BERT'],
      extra: { label: 'Task completion', text: '98.3%' }
    },
    diagram: [
      { label: 'Spoken command' },
      { label: 'Intent + slot model', mine: true },
      { label: 'Not a command → reject', muted: true, mine: true },
      { label: 'Device setting' }
    ],
    diagramAlt:
      'Flow: a spoken command goes to the intent and slot model I built, which rejects speech that is not a command and sends real commands to the device setting.'
  },
  {
    id: 'articulation',
    title: "Scoring children's pronunciation",
    years: '2025 – present',
    role: 'Research scientist',
    summary: 'For a pre-release speech-practice app: error detection 79.9% → 86.8% with fewer false flags, on 173 held-out children.',
    problem:
      'In articulation therapy, a speech-language pathologist listens for which sounds a child says in error. An app that flags those errors could save clinicians time, but only if they can trust it: every false flag on a word the child said correctly costs that trust.',
    myRole: [
      'Research scientist on a clinician-facing speech-practice app (pre-release), starting in fall 2025.',
      'I built its front end and hand-coded the clinical-linguistics logic: phonological-process analysis and IPA ↔ X-SAMPA mapping.'
    ],
    approach: [
      'I combined self-supervised speech encoders with classic pronunciation features, and evaluated on held-out children under rules I wrote down before looking at the results.',
      'I calibrated per-sound scoring cutoffs, which removed 534 false flags at a cost of 34 lost detections on held-out data.',
      "At a one-week hackathon I finished that calibration in a day, then spent the rest of the week on what SLPs had told us the year before: they want to score a child talking about their day, not reading one word in a quiet room. I removed the push-to-talk button, extended scoring to free speech, and added a classifier that removes the adult's prompts, which were the largest remaining source of false flags."
    ],
    result: [
      'Error detection rose from 79.9% to 86.8%, with fewer false flags, on 173 held-out children.',
      'The free-speech prototype is part of our ASHA 2026 convention demo.'
    ],
    lesson: {
      intro: 'The brief is a floor. If you remember what customers actually asked for, you know which direction to push.'
    },
    card: {
      kind: 'phonemes',
      word: 'rabbit',
      phones: [{ ipa: 'ɹ', heard: 'w' }, { ipa: 'æ' }, { ipa: 'b' }, { ipa: 'ɪ' }, { ipa: 't' }],
      caption: 'Illustrative: /ɹ/ said as [w], flagged for the SLP'
    },
    diagram: [
      { label: 'Session audio' },
      { label: "Adult's prompts removed", muted: true, mine: true },
      { label: 'Score each sound' },
      { label: 'Per-sound cutoffs', mine: true },
      { label: 'Flag errors for the SLP' }
    ],
    diagramAlt:
      "Flow: session audio has the adult's prompts gated out, each of the child's sounds is scored, per-sound cutoffs decide which scores count as errors, and likely errors are flagged for the speech-language pathologist. I built the gate that removes the adult's prompts and the per-sound calibration."
  },
  {
    id: 'air-force',
    title: 'A hands-free assistant for aircraft maintainers',
    years: '2022 – 2025',
    role: 'NLP specialist',
    summary:
      "U.S. Air Force SBIR programs: speech, language understanding and a parts-and-procedures knowledge graph, built with the technicians who'd use it.",
    problem:
      'Aircraft maintainers on the flight line have their hands full. They need to look up procedures and log what they did, often over jet noise.',
    myRole: [
      'Sole NLP specialist on a 3-person team, on U.S. Air Force SBIR programs.',
      'I was also the primary demoer, from on-site sessions with technicians to briefings for colonels.'
    ],
    approach: [
      'I built the speech side: a domain language model and lexicon for Air Force jargon and part names, and an acoustic model fine-tuned on flight-line noise.',
      "I built the language understanding, the dialog, and a knowledge graph of parts and procedures with fuzzy voice search, so technicians didn't need exact names.",
      'In Phase II I led GUI and voice-UX design for an inspection-and-reporting app, and built a compiler that turns a maintenance form into a dialog model.'
    ],
    result: [
      "A working voice assistant, built with the technicians who'd use it. I demoed it for a new colonel's briefing, where it kept working through jet-engine noise and my baby crying in the background. He was impressed enough to have his technicians try it."
    ],
    lesson: {
      intro:
        'Listen to users before you tune anything. The biggest gains didn\'t come from bigger models. They came from going on site and hearing how technicians actually talk, which is fast and full of shorthand. I wrote rules that turn that shorthand into the exact format their maintenance logs require: "removed and replaced" becomes "R2", and "cannibalized" becomes "CANN\'D".'
    },
    card: {
      kind: 'shorthand',
      pairs: [
        { spoken: 'removed and replaced', logged: 'R2' },
        { spoken: 'cannibalized', logged: "CANN'D" }
      ],
      caption: 'Flight-line shorthand → maintenance-log format'
    },
    diagram: [
      { label: 'Headset' },
      { label: 'Speech recognition', mine: true },
      { label: 'Understanding + dialog', mine: true },
      { label: 'Parts & procedures graph', mine: true }
    ],
    diagramAlt:
      "Flow: a technician's headset feeds speech recognition, then language understanding and dialog, which look up a knowledge graph of parts and procedures. I built the last three."
  }
];

export const alsoAtCobalt: string[] = [
  'Built a dashboard showing how transcript errors shift clinical measures, with an exact small-cell privacy audit.',
  'Built AI-assisted code-review tooling (custom Claude Code skills and agents) that writes mutation-tested regression tests and finds bugs.',
  "Reviewed 430+ teammates' pull requests since 2022. Mentored a summer research intern."
];

export interface SideProject {
  id: string;
  title: string;
  description: string;
  icon: string;
  links: Link[];
  /** Shown on Home when true; set false to hide a project that isn't ready to share. */
  live: boolean;
}

export const sideProjects: SideProject[] = [
  {
    // Add a "Play Doodle Drift" link once it's hosted.
    id: 'party-game',
    title: 'Doodle Drift',
    description:
      'A multiplayer drawing game you play from your phones. I hand-built the core, a Go/PocketBase backend and a Vue front end, then hardened it with race-condition tests, randomized model-based games and end-to-end browser tests.',
    icon: 'mdi-draw',
    links: [{ label: 'Code on GitHub', href: 'https://github.com/morleyd/telestrations' }],
    live: true
  },
  {
    id: 'wizard-chess',
    title: 'Wizard Chess',
    description:
      'Real chess against an iterative-deepening negamax search with alpha-beta pruning, running in a Web Worker so the board never freezes. On top of that sits a social sim. Every piece is a character with moods, friendships and grudges, and they talk about the game as it happens.',
    icon: 'mdi-chess-queen',
    links: [{ label: 'Play Wizard Chess', href: '/wizard-chess' }],
    live: true
  }
];

/** A round line-art tile that opens a dialog (earlier projects, archive, awards). */
export interface Tile {
  id: string;
  title: string;
  year: string;
  image: string;
  /** One line under the tile. */
  blurb: string;
  /** Dialog body, one string per paragraph. */
  body: string[];
  links: Link[];
}

export const earlierProjects: Tile[] = [
  {
    id: 'distance',
    title: 'Minimum Edits',
    year: '2020',
    image: '/images/project/measuring-tape.png',
    blurb: 'A transcript-scoring tool that lists every edit',
    body: [
      "Cobalt's CEO referred me to a transcription company that needed a tool to score a transcript against a reference: count the insertions, deletions and substitutions, and list each edit. I delivered the score but couldn't find an efficient way to produce the edit list, and it bugged me for months. A class assignment on a different algorithm finally showed me how, and I rewrote the tool on my own time with the full edit list."
    ],
    links: [{ label: 'Notebook', href: '/Projects/LevenshteinEdits.html' }]
  },
  {
    id: 'german_asr',
    title: 'German Speech Recognizer',
    year: '2019',
    image: '/images/project/microphone.png',
    blurb: 'My first work with Cobalt',
    body: [
      "My first work with Cobalt: a German speech recognizer built from Cobalt's Kaldi recipes and Mozilla's Common Voice data. My first model scored 33% word error rate because of a mistake I'd made cleaning the data. Retraining on properly cleaned data improved it a lot, and I've checked the data first ever since. Cobalt owns the finished model."
    ],
    links: [{ label: 'Write-up (PDF)', href: '/Projects/recognizer_writeup.pdf' }]
  },
  {
    id: 'tts_kiribati',
    title: 'Kiribati Language Learning Tool',
    year: '2020',
    image: '/images/project/Utterance.png',
    blurb: 'Conversation practice with a synthesized voice',
    body: [
      'Kiribati has few speakers and fewer learning resources. I built a proof-of-concept that lets a learner hold a simple conversation: a dialogue engine plus a speech synthesizer trained on my own voice.'
    ],
    links: [
      { label: 'Video', href: 'https://youtu.be/kMM3zPFvYzY' },
      { label: 'Paper (PDF)', href: '/Projects/kiribati_learning_tool.pdf' }
    ]
  },
  {
    id: 'catchphrase',
    title: 'Catch Phrase Opponent',
    year: '2021',
    image: '/images/project/catchphrase.png',
    blurb: 'A computer opponent for the party game',
    body: [
      'A text version of the party game Catch Phrase with a computer opponent. It reads your clues and guesses with word2vec, then gives its own clues using BabelNet.'
    ],
    links: [{ label: 'GitHub', href: 'https://github.com/morleyd/catch_phrase' }]
  }
];

export const archiveProjects: Tile[] = [
  {
    id: 'relation',
    title: 'Relation Extraction',
    year: '2022',
    image: '/images/project/relation.png',
    blurb: 'Who works for whom, from raw text',
    body: ['Named-entity recognition plus a LUKE relation model, to find who works for whom in raw text.'],
    links: [
      {
        label: 'Notebook',
        href: 'https://github.com/morleyd/morleyd.github.io/blob/master/public/Projects/Relation_Extraction_without_Given_Spans.ipynb'
      }
    ]
  },
  {
    id: 'conversation',
    title: 'Conversational AI Prospectus',
    year: '2021',
    image: '/images/project/compute_study.png',
    blurb: 'Three months of reading on task-oriented dialogue',
    body: ['Three months of reading on task-oriented dialogue: where it came from, where it falls short, what to try next.'],
    links: [{ label: 'Paper (PDF)', href: '/Projects/conversational_ai.pdf' }]
  },
  {
    id: 'conference',
    title: 'Conference Analysis',
    year: '2019',
    image: '/images/project/podium.png',
    blurb: 'Decades of conference talks, scraped and modeled',
    body: ['Two semesters of web scraping, cleaning and machine learning on decades of conference talks.'],
    links: [
      { label: 'Report 1 (PDF)', href: '/Projects/Trends_in_General_Conference.pdf' },
      { label: 'Report 2 (PDF)', href: '/Projects/ma_general_conference.pdf' }
    ]
  },
  {
    id: 'deepracer',
    title: 'AWS DeepRacer',
    year: '2019',
    image: '/images/project/car.png',
    blurb: 'Third place with reinforcement learning',
    body: ['Third place out of about fifty, with a reward function that transferred from simulation to a real track.'],
    links: []
  },
  {
    id: 'forecast',
    title: 'Statistical Forecasting',
    year: '2019',
    image: '/images/project/forecast.png',
    blurb: 'Supply and demand forecasts with dashboards',
    body: ['Bayesian structural time-series forecasts and Tableau dashboards for supply and demand planning.'],
    links: []
  },
  {
    id: 'battery',
    title: 'Battery Vision',
    year: '2018',
    image: '/images/project/battery.png',
    blurb: 'First place in a data-modeling competition',
    body: ['First place in a data-modeling competition: word2vec over lithium-sulfur battery papers to tell measured values from theoretical ones.'],
    links: [{ label: 'Poster (PDF)', href: '/Projects/Battery_Vision_Poster.pdf' }]
  }
];

// Shown both as an award tile and on the timeline.
const EAGLE_SCOUT = 'I supervised 150 volunteer hours to build an accessible ramp for a food cupboard.';

export const recognition: Tile[] = [
  {
    id: 'eagle',
    title: 'Eagle Scout',
    year: '2010',
    image: '/images/award/eagle.png',
    blurb: 'An accessible ramp for a food cupboard',
    body: [EAGLE_SCOUT],
    links: []
  },
  {
    id: 'space-camp',
    title: 'Space Camp "Right Stuff" award',
    year: '2019',
    image: '/images/award/space_camp.png',
    blurb: 'Leadership and team unity at Space Camp',
    body: ['The medal for leadership and team unity at U.S. Space Camp.'],
    links: []
  },
  {
    id: 'inspire',
    title: 'NASA INSPIRE',
    year: '2012',
    image: '/images/award/inspire.png',
    blurb: 'Top 10%',
    body: ['Ranked in the top 10% of the NASA INSPIRE community and invited to a NASA conference.'],
    links: []
  }
];

export interface TimelineEntry {
  when: string;
  title: string;
  text?: string;
}

export const timeline: TimelineEntry[] = [
  {
    when: 'Nov 2026',
    title: 'ASHA convention',
    text: "SALT's automated coding launches with paying clinicians, and the speech-practice app gets its own demo."
  },
  {
    when: 'Mar 2026',
    title: "Neural models for SALT's automated language-sample analysis"
  },
  {
    when: 'Sep 2025',
    title: "Children's pronunciation scoring",
    text: 'For a pre-release speech-practice app.'
  },
  {
    when: 'Oct 2024',
    title: 'Technical lead',
    text: "On a surgical-device customer's operating-room voice-control program."
  },
  { when: 'Aug 2022', title: 'Research Scientist, Cobalt Speech & Language' },
  { when: '2022', title: 'M.S., Computational Linguistics', text: 'Brandeis University' },
  { when: '2020', title: 'B.S., Applied & Computational Mathematics', text: 'Brigham Young University' },
  {
    when: 'Nov 2017',
    title: 'The talk that changed my career',
    text: 'A physics major goes to a speech-technology talk on a whim.'
  },
  {
    when: 'Aug 2014',
    title: 'Kiribati',
    text: 'Two-year volunteer service mission in the Republic of Kiribati.'
  },
  {
    when: '2010',
    title: 'Eagle Scout',
    text: EAGLE_SCOUT
  }
];

export const about: string[] = [
  "In November 2017 I was a physics/astronomy major at BYU when I saw a flyer for a talk by Jeff Adams, the CEO of a speech-technology company, asking what's left to do in speech after Alexa. I went on a whim. I grew up with Star Trek, where characters talk to computers, and here was someone saying that's a real job. Within a month I'd switched majors to applied math. I asked Jeff to be my mentor as I set out to make a career in NLP. As I built my skillset, he let me collaborate on a German speech-recognition project in 2019 and referred me to a transcript-scoring job in 2020. Then after grad school in computational linguistics, he hired me in August 2022.",
  "I try hard to look for the people beyond the numbers: a system that scores well but needs a manual hasn't done its job. I strive to make voice user interfaces that flow so naturally that nobody has to be coached on what to say, whether or not they're technical.",
  "My mom was a respite caregiver for children with special needs, so I grew up wanting to help kids who needed more help than the adults around them could always give. In 2019 I wrote a proposal for AI tools that would let one therapist reach more children, and argued the first step was real data from clinicians. Today I build the models behind SALT's language-sample analysis and tools that score children's pronunciation.",
  'I spent two years as a volunteer in the Kiribati islands and still speak the language. When Kiribati\'s president visited BYU, I was asked on the spot to interpret. His jokes depended on knowing particular islands, so a literal translation would have been accurate and still fallen flat. I had to understand why each joke was funny and find a way to make it work for the deans. It\'s the same problem I work on now: being accurate isn\'t enough if the person on the other end doesn\'t get it.',
];
