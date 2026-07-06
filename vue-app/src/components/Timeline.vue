<script setup>
import { useDisplay } from 'vuetify'
const { mobile } = useDisplay()
</script>

<template>

  <v-card elevation="0" class="bg-transparent pa-6 pa-md-12">
    <v-card-title>Overview Timeline</v-card-title>
    <v-timeline
      :direction="mobile ? 'vertical' : 'horizontal'"
      side="end"
      dot-color="purple-lighten-1"
    >
    <v-timeline-item icon="mdi-map-marker">
      <div>
        <span>08/14</span>
        <div class="text-h6">Service Mission</div>
        <p>
          Moved to the Republic of Kiribati for a two-year volunteer experience
        </p>
      </div>
    </v-timeline-item>
    <v-timeline-item icon="mdi-map-marker">
      <div>
        <span>08/19</span>
        <div class="text-h6">"Right Stuff" Award</div>
        <p>
          Awarded the most prestigious medal for leadership and team unity building at Adult Space Camp
        </p>
      </div>
    </v-timeline-item>
    <v-timeline-item icon="mdi-map-marker">
      <div>
        <span>06/20</span>
        <div class="text-h6">Brigham Young University</div>
        <p>
          Graduated with a Bachelor's of Science in Applied and Computational Mathematics
        </p>
      </div>
    </v-timeline-item>
    <v-timeline-item icon="mdi-map-marker">
      <div>
        <span>05/22</span>
        <div class="text-h6">Brandeis University</div>
        <p>
          Graduated with a Master's of Science in Computational Linguistics
        </p>
      </div>
    </v-timeline-item>
    <v-timeline-item icon="mdi-map-marker">
      <div>
        <span>08/22</span>
        <div class="text-h6">Cobalt Speech</div>
        <p>
          Started working at Cobalt Speech & Language as a Research Scientist
        </p>
      </div>
    </v-timeline-item>
    </v-timeline>
</v-card>
</template>
