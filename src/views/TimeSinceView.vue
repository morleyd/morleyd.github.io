<template>
  <v-container class="fill-height w-100">
  <v-card class="mx-auto text-center fill-height d-flex flex-column place-self-center bg-surface" width="500" max-width="100vw">
    <v-card-title class="d-block">
      <h1 class="page-title">Time Since</h1>
      <p class="text-body-2 text-medium-emphasis">Sept 2, 2022 at 11:07 AM MST</p>
    </v-card-title>
    <v-card-text>
      <div>
        <h2>Standard</h2>
        <p>{{ months }}</p>
        <p>{{ monthRemainder }}</p>
        <h2>Days</h2>
        <p>{{ days }}</p>
        <h2>Weeks</h2>
        <p>{{ weeks }}</p>
        <h2>Hours</h2>
        <p>{{ hours }}</p>
        <h2>Minutes</h2>
        <p>{{ minutes }}</p>
        <h2>Seconds</h2>
        <p>{{ seconds }}</p>
      </div>
    </v-card-text>
    <h2>Compute Future Time</h2>
    <v-card-actions class="flex-column flex-sm-row ga-2 px-4">
      <v-text-field v-model="inputVal" type="number" label="Value" hide-details class="w-100"></v-text-field>
      <v-select v-model="inputUnit" :items="['Seconds', 'Minutes', 'Hours', 'Days', 'Weeks']" label="Unit" hide-details class="w-100"></v-select>
      <v-btn @click="computeTime" class="w-100 w-sm-auto">Compute</v-btn>
    </v-card-actions>
    <p v-if="computedDate">{{ computedDate }}</p>
  </v-card>
  </v-container>
</template>
<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import {
  calendarDiff,
  formatCalendar,
  formatSeconds,
  formatMinutes,
  formatHours,
  formatDays,
  formatWeeks,
  addToDate,
} from '@/services/timeSince'

// Sept 2, 2022 at 11:07 AM Idaho Falls (Mountain) time
const anchor = new Date('2022-09-02T11:07:22-06:00')

const months = ref('')
const monthRemainder = ref('')
const days = ref('')
const weeks = ref('')
const hours = ref('')
const minutes = ref('')
const seconds = ref('')

const inputVal = ref('')
const inputUnit = ref('')
const computedDate = ref('')

let timer = null

function tick() {
  const now = new Date()
  const delta = now.getTime() - anchor.getTime()
  const cal = formatCalendar(calendarDiff(anchor, now))
  months.value = cal.main
  monthRemainder.value = cal.remainder
  days.value = formatDays(delta)
  weeks.value = formatWeeks(delta)
  hours.value = formatHours(delta)
  minutes.value = formatMinutes(delta)
  seconds.value = formatSeconds(delta)
}

function computeTime() {
  const x = parseInt(inputVal.value, 10)
  if (Number.isNaN(x) || !inputUnit.value) {
    return
  }
  computedDate.value = addToDate(anchor, x, inputUnit.value).toString()
}

onMounted(() => {
  tick()
  timer = setInterval(tick, 1000)
})

onBeforeUnmount(() => {
  if (timer) {
    clearInterval(timer)
  }
})
</script>