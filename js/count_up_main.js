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
  monDelta = today.getMonth() - wed.getMonth()
  dDelta = today.getDate() - wed.getDate()
  hDelta = today.getHours() -  wed.getHours()
  minDelta = today.getMinutes() -  wed.getMinutes()
  sDelta = today.getSeconds() -  wed.getSeconds()
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

const wedding = new Date("2022-09-02T11:07:22-06:00"); // Sept 2, 2022 at 11:07 AM Idaho Falls Time

function timeAgo() {
  const today = new Date();
  const delta = today - wedding;
  document.getElementById("days").innerHTML = formatDays(delta);
  let [monthsText, remainder ]= formatMonths(today, wedding);
  document.getElementById("months").innerHTML = monthsText;
  document.getElementById("monthRemainder").innerHTML = remainder;
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
