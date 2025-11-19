<template>
  <v-container class="fill-height w-100 bg-surface">
  <v-card class="mx-auto text-center fill-height d-flex flex-column place-self-center bg-blue-grey-darken-4" width="500" max-width="100vw">
    <v-card-title>
      <h1>Time Since</h1>
      <h3>Sept 2, 2022 at 11:07 AM MST</h3>
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
    <v-card-actions>
      <v-text-field v-model="inputVal" type="number" label="Value"></v-text-field>
      <v-select v-model="inputUnit" :items="['Seconds', 'Minutes', 'Hours', 'Days', 'Weeks']" label="Unit"></v-select>
      <v-btn @click="computeTime">Compute</v-btn>
    </v-card-actions>
    <p v-if="computedDate">{{ computedDate }}</p>
  </v-card>
  </v-container>
</template>
<script setup>
import { ref, onMounted } from 'vue'

// ============================================================================
//  State
// ============================================================================

const SECOND = 1000;
const MINUTE = SECOND * 60;
const HOUR = MINUTE * 60;
const DAY = HOUR * 24;
const WEEK = DAY * 7;

const wedding = new Date("2022-09-02T11:07:22-06:00"); // Sept 2, 2022 at 11:07 AM Idaho Falls Time

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


// ============================================================================
// Lifecycle Hooks
// ============================================================================
onMounted(() => {
  timeAgo();
})

// ============================================================================
// Formating Functions
// ============================================================================
function numberWithCommas(x) {
  return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatSeconds(ms) {
  return numberWithCommas(Math.floor(ms / SECOND)) + " Seconds";
}

function formatMinutes(ms) {
  const raw_minutes = ms / MINUTE;
  const clean_minutes = Math.floor(raw_minutes);
  const seconds = formatSeconds((raw_minutes - clean_minutes) * MINUTE);
  return numberWithCommas(clean_minutes) + " Minutes " + seconds;
}

function formatHours(ms) {
  const raw_hours = ms / HOUR;
  const clean_hours = Math.floor(raw_hours);
  const minutes = formatMinutes((raw_hours - clean_hours) * HOUR);
  return numberWithCommas(clean_hours) + " Hours " + minutes;
}

function formatDays(ms) {
  const raw_days = ms / DAY;
  const clean_days = Math.floor(raw_days);
  const hours = formatHours((raw_days - clean_days) * DAY);
  return numberWithCommas(clean_days) + " Days " + hours;
}

function formatWeeks(ms) {
  const raw_weeks = ms / WEEK;
  const clean_weeks = Math.floor(raw_weeks);
  const days = formatDays((raw_weeks - clean_weeks) * WEEK);
  return numberWithCommas(clean_weeks) + " Weeks " + days;
}

function formatMonths(today, wed) {
  let yDelta = today.getFullYear() - wed.getFullYear()
  let monDelta = today.getMonth() - wed.getMonth()
  let dDelta = today.getDate() - wed.getDate()
  let hDelta = today.getHours() - wed.getHours()
  let minDelta = today.getMinutes() - wed.getMinutes()
  let sDelta = today.getSeconds() - wed.getSeconds()
  // TODO: There are some off by one errors below!
  if (sDelta < 0) {
    minDelta = minDelta - 1
    sDelta = sDelta + 60
  }
  if (minDelta < 0) {
    hDelta = hDelta - 1
    minDelta = minDelta + 60
  }
  if (hDelta < 0) {
    if (minDelta < 0) {
      hDelta = hDelta + 24
    } else {
      hDelta = hDelta + 24 + 1
    }
    dDelta = dDelta - 1
  }
  // if (dDelta < 0) {
  //   monDelta = monDelta - 1
  //   dDelta = dDelta + // HOW MANY?
  // }
  if (monDelta < 0) {
    yDelta = yDelta - 1
    monDelta = monDelta + 12
  }
  var monthsOut = '';
  var remainderOut = hDelta + ' Hours ' + minDelta + ' Minutes ' + sDelta + " Seconds";
  if (yDelta > 0) {
    monthsOut += (yDelta > 1) ? yDelta + ' Years ' : yDelta + ' Year ';
  }
  if (monDelta > 0) {
    monthsOut += (monDelta > 1) ? monDelta + ' Months ' : monDelta + ' Month ';
  }
  if (dDelta > 0) {
    monthsOut += (dDelta > 1) ? dDelta + ' Days ' : dDelta + ' Day ';
  }
  return [monthsOut, remainderOut]
}

function getConversion(unit) {
  if (unit === "Seconds") {
    return SECOND;
  } else if (unit === "Minutes") {
    return MINUTE;
  } else if (unit === "Hours") {
    return HOUR;
  } else if (unit === "Days") {
    return DAY;
  } else if (unit === "Weeks") {
    return WEEK;
  } else {
    return 0;
  }
}

// ============================================================================
// Methods
// ============================================================================
function timeAgo() {
  const today = new Date();
  const delta = today - wedding;
  let [monthsText, remainder] = formatMonths(today, wedding);
  days.value = formatDays(delta);
  months.value = monthsText || '';
  monthRemainder.value = remainder || '';
  weeks.value = formatWeeks(delta);
  seconds.value = formatSeconds(delta);
  minutes.value = formatMinutes(delta);
  hours.value = formatHours(delta);
  setTimeout(timeAgo, 1000);
}

function computeTime() {
  let unit = getConversion(inputUnit.value);
  let x = parseInt(inputVal.value);
  let new_date = new Date(wedding.getTime() + x * unit);
  computedDate.value = new_date;
}
</script>