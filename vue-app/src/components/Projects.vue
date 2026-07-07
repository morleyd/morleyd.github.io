<template>
  <v-card elevation="0" class="bg-transparent pa-6 pa-md-12">
    <h2 class="page-title">Past Projects</h2>
    <p class="text-body-2 text-medium-emphasis mb-2">
      Click on each image to get a description of my efforts. Most include a link to a demo or more info.
    </p>
    <ul id="filters" class="sub_nav">
      <li :class="{ active: activeFilter === '*' }" @click="setFilter('*')">All works</li>
      <li :class="{ active: activeFilter === '.nlp' }" @click="setFilter('.nlp')">NLP</li>
      <li :class="{ active: activeFilter === '.ai' }" @click="setFilter('.ai')">Machine Learning</li>
    </ul>
    <ul id="container" class="item-list">
      <li v-for="project in filteredProjects" :key="project.id" :class="`item ${project.classes}`"
        @mouseenter="hoveredProject = project.id" @mouseleave="hoveredProject = null">
        <div class="image" role="button" :aria-label="`View details for ${project.title}`"
          @click="openDialog(project)">
          <img :src="project.image" :alt="project.title" />
          <div class="hover" :class="{ 'hover--visible': hoveredProject === project.id }">
            <div class="item-content">
              <h4>{{ project.title }}</h4>
              <p>{{ project.description }}</p>
              <p v-if="project.date" class="item-year">{{ project.date.slice(0, 4) }}</p>
            </div>
          </div>
        </div>
      </li>
    </ul>
  </v-card>
  <!-- Vuetify Dialog for project details -->
  <v-dialog v-model="dialogOpen" max-width="1132" scrollable>
    <v-card v-if="selectedProject" class="popup_portfolio">
      <v-card-title class="d-flex justify-space-between align-center">
        <span class="text-h5">{{ selectedProject.title }}</span>
        <v-btn icon="mdi-close" variant="text" @click="dialogOpen = false"></v-btn>
      </v-card-title>
      <v-card-text>
        <div v-if="selectedProject.popupImage" class="mb-4">
          <img :src="selectedProject.popupImage" alt="" class="popup-image" />
        </div>
        <time :datetime="selectedProject.date" class="popup-time">{{ selectedProject.dateLabel }}</time>
        <div v-html="selectedProject.popupContent" class="popup-content" @click="handleContentClick"></div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

const activeFilter = ref('*')
const hoveredProject = ref<string | null>(null)
const dialogOpen = ref(false)
const selectedProject = ref<Project | null>(null)

/**
 * Intercept clicks on internal links inside v-html popup content so they use
 * client-side routing (no full reload) and close the dialog.
 */
function handleContentClick(event: MouseEvent) {
  const anchor = (event.target as HTMLElement | null)?.closest('a')
  if (!anchor) {
    return
  }
  const href = anchor.getAttribute('href') ?? ''
  const lastSegment = href.split('/').pop() ?? ''
  const looksLikeFile = lastSegment.includes('.') // e.g. /Projects/paper.pdf — let it download

  // Route only same-origin app paths (e.g. /wordle); leave files and external links alone.
  if (href.startsWith('/') && !looksLikeFile && anchor.target !== '_blank') {
    event.preventDefault()
    dialogOpen.value = false
    router.push(href)
  }
}

interface Project {
  id: string
  title: string
  description: string
  image: string
  classes: string
  popupId?: string
  link?: string
  date?: string
  dateLabel?: string
  popupImage?: string
  popupContent?: string
}

const projects: Project[] = [
  {
    id: 'relation',
    title: 'Relation Extraction',
    description: 'Model that uses NER to augment the power of relation extraction',
    image: '/images/project/relation.png',
    classes: 'ai nlp',
    popupId: 'relation',
    date: '2022-06-06',
    dateLabel: 'Made: June 6, 2022',
    popupContent: `
      <p>I was asked to create a model that given a raw chunk of text would extract all the employee relations. For example, if it received the input, "i just bumped into my buddy phil who is the ceo of XYZ Company", the model would show that Phil is an employee of XYZ Company. I also wanted to be able to account for the case where there were multiple people and relations in a given sentence.</p>
      <p>I was given the <a href="https://nlp.stanford.edu/projects/tacred/">TACRED relation classification dataset</a> reported in <a href="https://arxiv.org/abs/2010.01057">this paper</a>. My solution builds off pretrained models stored oh HuggingFace's Transformers. I selected LUKE, one of the best performing models on this dataset, as ranked by <a href="http://nlpprogress.com/english/relationship_extraction.html">NLP-Progress</a>. I used the <a href="https://huggingface.co/studio-ousia/luke-large-finetuned-tacred">fine-tuned model checkpoint</a> from Luke, <a href="https://aclanthology.org/2020.emnlp-main.523">"{LUKE}: Deep Contextualized Entity Representations with Entity-aware Self-attention"</a> for handling the relation extraction. However, this model requires the spans of the entities as inputs and only outputs one relation per utterance. To overcome these limitations, I used a Named Entity Recognition (NER) model to exctact all the entity spans relevant to my use case. The NER is handled by <a href="https://huggingface.co/dslim/bert-base-NER-uncased">BERT</a>.</p>
      <p><a href="https://github.com/morleyd/morleyd.github.io/blob/master/vue-app/public/Projects/Relation_Extraction_without_Given_Spans.ipynb">Click Here for a notebook with my completed code and or go to Google Colab to try it for yourself.</a></p>
    `,
  },
  {
    id: 'wordle',
    title: 'Wordle Helper',
    description: "Simple web tool for when you're stumped on Wordle",
    image: '/images/project/wordle.png',
    classes: '',
    popupId: 'wordle',
    date: '2022-01-24',
    dateLabel: 'Made: January 24, 2022',
    popupContent: `
      <p>This isn't the most impressive thing I've ever built, but it sure is handy. By digging through the source code of the original Wordle, I was able to find the dictionary of legal words. With this, I spent a few minutes constructing a tool that filters the possible words based on what you've discovered. It's kinda cheating, but it sure helps when you're stumped!</p>
      <p>*July 2022 Update* Since I love making things beautiful and I still regularly enjoy Wordle and its derivatives, I taught myself some web development to make a better interface for my tool.</p>
      <p><a href="/wordle">Try it out yourself!</a></p>
    `,
  },
  {
    id: 'conversation',
    title: 'Conversational AI Prospectus',
    description: 'Researched historical & cutting edge approaches to task-oriented dialogue as prospectus for future work',
    image: '/images/project/compute_study.png',
    classes: 'ai nlp',
    popupId: 'conversation',
    date: '2021-12-12',
    dateLabel: 'Made: December 12, 2021',
    popupContent: `
      <p>I have been excited about conversational machines for a long time. This work is the culmination of three months' research and hopefully the start of much more. Originally, this was written as the starting point for a capstone project. Though circumstances changed and that formal project didn't occur, I still hope to make the ideas presented in this paper a reality.</p>
      <p>This work gives particular emphasis to the historical background, shortcomings, and the future of task-oriented dialogue systems. Recent approaches are highlighted and serve as a starting point for future research and development. Lastly, I make proposals for future studies to build on the current successes of the field.</p>
      <p><a href="/Projects/conversational_ai.pdf">Here is a copy of the full research paper I wrote</a>.</p>
    `,
  },
  {
    id: 'catchphrase',
    title: 'Catch Phrase Game',
    description: 'Used word2vec and other tools to create a playable opponent for the Catch Phrase pary game by Hasbro.',
    image: '/images/project/catchphrase.png',
    classes: 'ai nlp',
    popupId: 'catchphrase',
    date: '2021-05-08',
    dateLabel: 'Made: May 8, 2021',
    popupImage: '/images/project/catchphrase_screenshot.png',
    popupContent: `
      <p>I created a textbased videogame version of the Hasbro party game Catch Phrase! The computer opponent parses natural language clues and uses a word2vec model to guess a given word. Next it provides clues using the BabelNet api. The full code is availiable on <a href="https://github.com/morleyd/catch_phrase">GitHub</a>.</p>
    `,
  },
  {
    id: 'distance',
    title: 'Minimum Edits',
    description: "Implemented an algorithm for the Levenshtein Edit Distance script to fill a need I couldn't find elsewhere",
    image: '/images/project/measuring-tape.png',
    classes: 'ai nlp',
    popupId: 'distance',
    date: '2020-12-14',
    dateLabel: 'Made: December 14, 2020',
    popupContent: `
      <p>I was asked to create a tool that would compare two documents and return a score based on the edits required to transform the first text into the second. Also, the client wanted to see a list of each edit used. Responding to the first request, I coded up a version of the Wagner–Fischer algorithm for computing the Levenshtein Distance. This dynamic programming algorithm is efficient because it does not keep track of the specific edits, just that they happened. This script allowed me to solve the client's first problem, but not the second. Further, I couldn't find an algorithm or premade package that would efficiently keep track of each edit. I delivered the tool and apologized that I was unable to fulfill their second wish at that time. This failure bugged me for several months until I was asked to implement another algorithm for a class. The dots connected; I suddenly knew how to solve the client's problem.</p>
      <p><a href="/Projects/LevenshteinEdits.html">Click Here for a notebook with my completed code and a time comparison with a similar package I found later.</a></p>
    `,
  },
  {
    id: 'conference',
    title: 'Conference Analysis',
    description: 'Used a variety of analysis tools and algorithms to discover trends across multiple sessions of a conference',
    image: '/images/project/podium.png',
    classes: 'nlp ai',
    popupId: 'conference',
    date: '2019-12-20',
    dateLabel: 'Made: December 20, 2019',
    popupContent: `
      <p>Over the course of two semesters, myself and two classmates used text archives of the biannual General Conference of the Church of Jesus Christ of Latter-day Saints to draw conclusions about trnds over time. The first semester was mainly devoted to gathering and cleaning the dataset and drawing initial conclusions. I built a webscraper and text-cleaning pipeline as well as analyzed the correlation of the number of missionaries serving from the Church with different conference themes over time. For our full results, <a href="/Projects/Trends_in_General_Conference.pdf">Click Here</a>. The second semester, we dedicated our time to implementing various machine learning algorithms on the dataset. I experimented with different clustering and classifying algorithms. For our full results at the end of this semester, <a href="/Projects/ma_general_conference.pdf">Click Here</a>.</p>
    `,
  },
  {
    id: 'tts_kiribati',
    title: 'Language Learning Tool',
    description: 'Built a text to speech engine and conversation tool to help Kiribati language learners',
    image: '/images/project/Utterance.png',
    classes: 'nlp',
    popupId: 'tts_kiribati',
    date: '2020-04-15',
    dateLabel: 'Made: April 15, 2020',
    popupContent: `
      <p>Learning a new language is always challenging, but the difficulty is compounded when there aren't many speakers or resources available. This is the situation for those trying to learn a small language like Kiribati. To mitigate this issue, I built a proof of concept tool that simulates conversations with a native speaker. Using open-source software and my own voice, I built a dialogue move engine with a speech synthesizer to read the generated responses.</p>
      <p>For a video walkthrough and demonstration, <a href="https://youtu.be/kMM3zPFvYzY">Click Here</a>. The full methodology and work are recorded in <a href="/Projects/kiribati_learning_tool.pdf">this paper</a>.</p>
    `,
  },
  {
    id: 'german_asr',
    title: 'German Speech Recognizer',
    description: 'Collaborated with Cobalt Speech inc. to create a German speech recognizer from scratch',
    image: '/images/project/microphone.png',
    classes: 'ai nlp',
    popupId: 'german_asr',
    date: '2019-12-10',
    dateLabel: 'Made: December 10, 2019',
    popupContent: `
      <p>In many domains, building an automatic speech recognizer has become a rather solved problem. The accuracy and quality that has been attained in English were only achieved after many years of optimization and by using large training sets. While the technology and some open-source data sets exist, few people have made acoustic models or speech recognizers in German. I sought to remedy this situation by using the Kaldi recipes prepared by Cobalt Speech Inc. and the opensource CommonVoice German dataset. Even with a major mistake in the data cleaning steps, we still acheived a word error rate of 33%. This number improved drastically when the model was re-trained with properly cleaned data. In the process of making the final model, I worked with several machine learning algorithms including Hidden Markov Models, Gaussian Mixture Models and Deep Neural Networks as well as other technologies. Due to the nature of my collaboration with Cobalt, they own the rights to the completed model and subsequent code that I made.</p>
      <p><a href="/Projects/recognizer_writeup.pdf">For the full write-up that I wrote about this project, Click Here</a>.</p>
    `,
  },
  {
    id: 'deepracer',
    title: 'AWS DeepRacer',
    description: 'Won third place by using reinforcement learning to train a racecar',
    image: '/images/project/car.png',
    classes: 'ai identity',
    popupId: 'deepracer',
    date: '2019-11-15',
    dateLabel: 'Made: November 15, 2019',
    popupContent: `
      <p>I was invited to compete in an AWS DeepRacer competition. After a fire-hose training on reinforcement learning, we were given the opportunity to use what we had learned to compete. We each coded up a cost function to 'teach' the car the best way around the track. Then we used the provided virtual racetrack to train our models. I was handicapped by only having half the time to train my model. However, cost function was among the most adaptable from the virtual training environment to the real-world test racetrack. In the real-world test situation, my car completed the track in 11 seconds placing me third amongst the fifty or so attendees that day.</p>
    `,
  },
  {
    id: 'forecast',
    title: 'Statistical Forecasting',
    description: 'Developed a pipeline to accurately forecast crucial information',
    image: '/images/project/forecast.png',
    classes: 'ai',
    popupId: 'forecast',
    date: '2019-08-16',
    dateLabel: 'Made: August 16, 2019',
    popupContent: `
      <p>I developed a model to forecast supply and demand of core services both in the short term and 10 years into the future. Using domain knowledge and SQL, I was able to obtain and clean data sets to find solutions to new problems. Then I worked with a Bayesian Structured Time Series approach in R to predict future quantities. I built dashboards in Tableau to display different aspects of the forecast and built tools to enable users to manipulate parameters. These tools were integral to the budgeting and planning efforts of many departments.</p>
    `,
  },
  {
    id: 'battery',
    title: 'Battery Vision',
    description: 'Won first place in a Data Modeling Competition by using Word2Vec to automatically extract information from research literature',
    image: '/images/project/battery.png',
    classes: 'ai nlp',
    popupId: 'battery',
    date: '2018-12-08',
    dateLabel: 'Made: December 8, 2018',
    popupContent: `
      <p>Due to the massive volume of research literature on any given topic, extracting specific data can be work-intensive. As an effort to mitigate this, my team implemented a Word2Vec approach to indexing data in lithium-sulfur battery literature. Word2Vec is an algorithm that converts each word in the training set to a vector and then embedding them in a high dimensional space based on their similarity. This technique allows researchers to use the relative distance between words to ascertain their similarity as well as to infer how they relate to other words. Using this method, we were able to determine which reported values were theoretical or actually observed in experiments. Our results and presentation were ranked most impressive in a class poster presentation.</p>
      <p><a href="/Projects/Battery_Vision_Poster.pdf">Here is a copy of the research poster we created</a>.</p>
    `,
  },
  {
    id: 'artwork',
    title: 'My Artwork',
    description: "Starting in 2021, I've found a new passion for using the other part of my brain to create",
    image: '/images/project/painter.png',
    classes: '',
    link: '/gallery',
  },
]

const filteredProjects = computed(() => {
  if (activeFilter.value === '*') {
    return projects
  }
  return projects.filter((p) => p.classes.includes(activeFilter.value.replace('.', '')))
})

function setFilter(filter: string) {
  activeFilter.value = filter
}

function openDialog(project: Project) {
  if (project.link) {
    // Internal app route → client-side nav; external → full navigation
    if (project.link.startsWith('/')) {
      router.push(project.link)
    } else {
      window.location.href = project.link
    }
    return
  }
  selectedProject.value = project
  dialogOpen.value = true
}
</script>

<style scoped>
/* Filter navigation styles */
.sub_nav {
  position: relative;
  display: table;
  margin: 48px auto;
  text-align: center;
}

.sub_nav li {
  color: #a4a7ac;
  font-size: 14px;
  line-height: 16px;
  text-transform: uppercase;
  margin: 0 22px;
  padding: 0 0 10px;
  border-bottom: 4px solid #3b3c3e;
  font-family: 'novecentosanswide', sans-serif;
  font-weight: normal;
  display: inline-block;
  cursor: pointer;
  transition: all 0.5s ease-in-out;
}

.sub_nav li:hover,
.sub_nav li.active {
  color: #50af6f;
  border-bottom: 4px solid #50af6f;
  text-decoration: none;
}

/* Item list styles */
.item-list {
  overflow: hidden;
  text-align: center;
  margin: 0 0 0 -24px;
}

.item-list li {
  display: inline-block;
  margin: 0 0 25px 24px;
  vertical-align: top;
  font-size: 0;
}

.item {
  text-align: center;
  width: 270px;
  margin: 0 auto;
}

.item .image {
  position: relative;
  cursor: pointer;
}

.item .image img {
  max-width: 100%;
  height: auto;
  border-radius: 50%;
}

.item .hover {
  height: 100%;
  left: 0;
  position: absolute;
  top: 0;
  width: 100%;
  background: #6abb84;
  opacity: 0;
  visibility: hidden;
  border-radius: 50%;
  cursor: pointer;
  transition: opacity 0.3s ease;
}

/* Revealed on hover (desktop). On touch, tapping the image opens the dialog directly. */
.item .hover--visible {
  opacity: 0.9;
  visibility: visible;
}

.item .item-content {
  position: relative;
  display: table-cell;
  vertical-align: middle;
  height: 270px;
  z-index: 400;
  padding: 0 30px;
}

.item .item-content h4 {
  display: block;
  background: url(/images/bg_white_border.gif) no-repeat 50% 100%;
  color: #fff;
  text-transform: uppercase;
  font-family: 'novecentosanswide', sans-serif;
  font-weight: bold;
  font-size: 14px;
  line-height: 16px;
  padding: 0 0 20px;
  text-align: center;
  margin: 0 0 15px;
}

.item .item-content p {
  color: #fff;
  text-align: center;
  display: block;
  font-size: 15px;
  line-height: 17px;
}

/* Year, visually separated from the description */
.item .item-content .item-year {
  margin-top: 12px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.35);
  font-size: 12px;
  letter-spacing: 2px;
  opacity: 0.9;
}

/* Dialog styles */
.popup_portfolio {
  background-color: #dedede;
  border-color: #545454;
}

.popup_portfolio :deep(.v-card-title) {
  font-family: 'novecentosanswide', sans-serif;
  font-weight: bold;
  color: #63666a;
  font-size: 18px;
  line-height: 18px;
  text-transform: uppercase;
  padding-top: 26px;
}

.popup-time {
  font-family: 'novecentosanswide', sans-serif;
  color: #abacaf;
  font-size: 12px;
  line-height: 12px;
  text-transform: uppercase;
  display: block;
  margin-bottom: 17px;
}

.popup-content {
  padding: 17px 0 8px;
  color: #808286;
  font-size: 16px;
  line-height: 30px;
}

.popup-content :deep(p) {
  margin-bottom: 1em;
}

.popup-content :deep(a) {
  color: #50af6f;
  text-decoration: underline;
}

.popup-image {
  display: block;
  width: auto;
  height: auto;
  max-height: 450px;
  border-radius: 8px;
  margin-left: auto;
  margin-right: auto;
}

@media only screen and (max-width: 1190px) {
  #container.item-list {
    width: 900px;
    margin: 0 auto;
  }
}

@media only screen and (max-width: 980px) {
  #container.item-list {
    width: 600px;
  }

  .sub_nav li {
    padding: 10px 0;
  }
}

@media only screen and (max-width: 680px) {
  #container.item-list {
    width: 300px;
  }

  .item-list li {
    margin-left: 0;
  }
}
</style>
