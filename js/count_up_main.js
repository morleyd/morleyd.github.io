const SECOND = 1000;
const MINUTE = SECOND * 60;
const HOUR = MINUTE * 60;
const DAY = HOUR * 24;
const WEEK = DAY * 7;

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
  yDelta = today.getFullYear() - wed.getFullYear()
  mDelta = today.getMonth() - wed.getMonth()
  dDelta = today.getDate() - wed.getDate()
  if (mDelta < 0) {
    yDelta = yDelta - 1
    mDelta = mDelta + 12
  }
  var out = '';
  if (yDelta > 0) {
    out += (yDelta > 1) ? yDelta + ' Years ' : yDelta + ' Year ';
  }
  if (mDelta > 0) {
    out += (mDelta > 1) ? mDelta + ' Months ' : mDelta + ' Month ';
  }
  if (dDelta > 0) {
    out += (dDelta > 1) ? dDelta + ' Days ' : dDelta + ' Day ';
  }
  return out
}

const wedding = new Date("2022-09-02T11:07:22-06:00"); // Sept 2, 2022 at 11:07 AM Idaho Falls Time

function timeAgo() {
  const today = new Date();
  const delta = today - wedding;
  document.getElementById("days").innerHTML = formatDays(delta);
  document.getElementById("months").innerHTML = formatMonths(today, wedding);
  document.getElementById("weeks").innerHTML = formatWeeks(delta);
  document.getElementById("seconds").innerHTML = formatSeconds(delta);
  document.getElementById("minutes").innerHTML = formatMinutes(delta);
  document.getElementById("hours").innerHTML = formatHours(delta);
  setTimeout(timeAgo, 1000);
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

function computeTime() {
  let inputUnit = document.getElementById("inputUnit").value
  let x = parseInt(document.getElementById("inputVal").value);
  let unit = getConversion(inputUnit);
  let new_date = new Date(wedding.getTime() + x * unit);
  document.getElementById("dateimeGoesHere").innerHTML = new_date;
}
