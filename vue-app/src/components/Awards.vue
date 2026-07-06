<template>
  <v-card elevation="0" class="bg-transparent pa-6 pa-md-12">
    <h2 class="page-title mb-6">Awards and Achievements</h2>
    <ul id="container" class="item-list">
      <li v-for="award in awards" :key="award.id" class="item ai nlp" @mouseenter="hoveredAward = award.id"
        @mouseleave="hoveredAward = null">
        <div class="image" role="button" :aria-label="`View details for ${award.title}`" @click="openDialog(award)">
          <img :src="award.image" :alt="award.title" />
          <div class="hover" :class="{ 'hover--visible': hoveredAward === award.id }">
            <div class="item-content">
              <h4>{{ award.title }}</h4>
              <p>{{ award.description }}</p>
              <p class="item-year">{{ award.year }}</p>
            </div>
          </div>
        </div>
      </li>
    </ul>
  </v-card>

  <!-- Vuetify Dialog for award details -->
  <v-dialog v-model="dialogOpen" max-width="1132" scrollable>
    <v-card v-if="selectedAward" class="popup_portfolio">
      <v-card-title class="d-flex justify-space-between align-center">
        <span class="text-h5">{{ selectedAward.title }}</span>
        <v-btn icon="mdi-close" variant="text" @click="dialogOpen = false"></v-btn>
      </v-card-title>
      <v-card-text>
        <time :datetime="selectedAward.year.toString()" class="popup-time">{{ selectedAward.year }}</time>
        <div class="popup-content">
          <p>{{ selectedAward.description }}</p>
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue'

interface Award {
  id: string
  title: string
  description: string
  image: string
  year: number
}

const awards: Award[] = [
  {
    id: 'duolingo',
    title: '250 Day Streak',
    description: "Award honoring the number of consecutive days I've studied Spanish",
    image: '/images/award/duolingo.png',
    year: 2022,
  },
  {
    id: 'racer',
    title: 'Deep Racer',
    description:
      'Won Third Place in AWS Deep Racer Competition by using reinforcement learning to teach a car to drive on real life track',
    image: '/images/award/racer.png',
    year: 2019,
  },
  {
    id: 'space-camp',
    title: '"Right Stuff" Award',
    description: 'Most prestigious medal for leadership and team unity building at the US Space Camp',
    image: '/images/award/space_camp.png',
    year: 2019,
  },
  {
    id: 'trophy',
    title: 'Data Modeling Competition',
    description:
      'Earned First Place with a team for using Word2Vec to automatically extract information from research literature',
    image: '/images/award/trophy.png',
    year: 2018,
  },
  {
    id: 'inspire',
    title: 'NASA INSPIRE',
    description: 'Ranked top 10% NASA community and was invited to attend a VIP NASA conference',
    image: '/images/award/inspire.png',
    year: 2012,
  },
  {
    id: 'eagle',
    title: 'Eagle Scout Rank',
    description: 'Supervised 150 volunteer hours to design and construct a handicap access ramp for a food cupboard',
    image: '/images/award/eagle.png',
    year: 2010,
  },
]

const hoveredAward = ref<string | null>(null)
const dialogOpen = ref(false)
const selectedAward = ref<Award | null>(null)

function openDialog(award: Award) {
  selectedAward.value = award
  dialogOpen.value = true
}
</script>

<style scoped>
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
