// document.addEventListener('DOMContentLoaded', async function () {

//     await fillTable('./data/small_spa.json', './data/small_eng.json')

// });

var BOOK
let selected = new Set()

const onCheck = event => {
  event.target.checked ? selected.add(event.target.value) : selected.delete(event.target.value)
  if (selected.size == 2) {
    addGo()
  } else {
    removeGo()
  }
}

function pathToTitle(fpath) {
  fpath = fpath.replace('/', ': ')
  return fpath.replaceAll('_', ' ')
}

function addGo() {
  console.log('addGo', document.getElementById('go-btn'))
  if (!document.getElementById('go-btn')) {
    var langList = document.getElementById('lang-checks');
    var go = document.createElement('button')
    go.onclick = () => (fillTable());
    go.id = "go-btn"
    go.textContent = "GO!"
    langList.appendChild(go)
  }
}

function removeGo() {
  if (document.getElementById('go-btn')) {
    document.getElementById('go-btn').remove()
  }
}

async function loadBook(fpath) {
  // Hide the dropdown menu on selection
  toggleDropDown()
  BOOK = await loadJSON('./data/' + fpath + '.json')
  document.getElementById('book_title').textContent = pathToTitle(fpath)
  var langList = document.getElementById('lang-checks');
  for (const lang of Object.keys(BOOK)) {
    // TODO: Check that lang has content
    var li = document.createElement('li');
    li.className = "lang-check"

    const input = document.createElement('input')
    input.type = 'checkbox'
    input.id = lang
    input.name = 'type'
    input.value = lang
    input.checked = selected.has(lang)
    input.onchange = onCheck
    const label = document.createElement('label')
    label.htmlFor = lang
    label.textContent = lang
    li.append(input, label)
    langList.appendChild(li)
  }
  // var go = document.createElement('button')
  // go.onclick = () => (fillTable());
  // go.textContent = "GO!"
  // langList.appendChild(go)
}

async function loadJSON(fpath) {
  const response = await fetch(fpath);
  const json = await response.json();
  console.log("loadJSON from ", fpath, " got ", json)
  return json
}

async function fillTable() {
  console.log('selected', selected)
  langA = Array.from(selected)[0];
  langB = Array.from(selected)[1];
  addColumnHeaders(langA, langB)
  var table = document.getElementById('tbody');
  while (table.childElementCount > 1) {
    table.removeChild(table.lastChild);
  }
  for (const row of zip(BOOK[langA], BOOK[langB])) {
    var tr = document.createElement('tr');
    tr.innerHTML = '<td class="col1">' + row[0] + '</td>' +
      '<td class="col2">' + row[1] + '</td>';
    table.appendChild(tr);
  }
  createResizableTable(document.getElementById('table'));
}

function addColumnHeaders(langA, langB) {
  var col1 = document.getElementById('col1_header');
  var col2 = document.getElementById('col2_header');
  col1.textContent = langA
  col2.textContent = langB
}

function zip() {
  var args = [].slice.call(arguments);
  var longest = args.reduce(function (a, b) {
    return a.length > b.length ? a : b
  }, []);

  return longest.map(function (_, i) {
    return args.map(function (array) { return array[i] })
  });
}
function createResizableTable(table) {
  const col = table.querySelector('th');
  // Add a resizer element to the column
  const resizer = document.createElement('div');
  resizer.classList.add('resizer');


  // Set the height
  resizer.style.height = `${table.offsetHeight}px`;
  const icon = document.createElement('span')
  icon.classList.add("slider")

  resizer.append(icon)

  col.appendChild(resizer);

  createResizableColumn(col, resizer);
};

function createResizableColumn(col, resizer) {
  let x = 0;
  let dx = 0;
  let w = 0;

  const mouseDownHandler = function (e) {
    if ("ontouchstart" in document.documentElement) {
      x = e.touches[0].screenX;
    } else {
      x = e.clientX;
    }

    const styles = window.getComputedStyle(col);
    w = parseInt(styles.width, 10);

    document.addEventListener('mousemove', moveHandler);
    document.addEventListener('mouseup', endHandler);

    document.addEventListener('touchmove', moveHandler);
    document.addEventListener('touchend', endHandler);

    resizer.classList.add('resizing');
  };


  const moveHandler = function (e) {
    if ("ontouchstart" in document.documentElement) {
      if (e.touches.length === 1) {
        dx = e.touches[0].screenX - x;
      }
    } else {
      dx = e.clientX - x;
    }

    const dw = w + dx
    const pageWidth = getWidth()

    if (dw >= pageWidth * .85) {
      setColSize('col2', 0, 0)
    } else if (dw <= pageWidth * .15) {
      setColSize('col1', 0, 0)
    } else {
      setColSize('col1', 16, dw)
      setColSize('col2', 16, pageWidth - dw)
    }
  };

  const endHandler = function () {
    resizer.classList.remove('resizing');
    document.removeEventListener('mousemove', moveHandler);
    document.removeEventListener('mouseup', endHandler);
    document.removeEventListener('touchmove', moveHandler);
    document.removeEventListener('touchend', endHandler);
  };

  resizer.addEventListener('mousedown', mouseDownHandler);
  resizer.addEventListener('touchstart', mouseDownHandler);
};

function setColSize(col, fontSize, width) {
  for (let element of Array.from(document.getElementsByClassName(col))) {
    element.style.fontSize = `${fontSize}px`
    element.style.width = `${width}px`
  }
}

function getWidth() {
  return Math.max(document.body.scrollWidth,
    document.documentElement.scrollWidth,
    document.body.offsetWidth,
    document.documentElement.offsetWidth,
    document.documentElement.clientWidth);
}
/* When the user clicks on the button,
toggle between hiding and showing the dropdown content */
function toggleDropDown() {
  document.getElementById("myDropdown").classList.toggle("show");
}

function subMenu(clickedElement) {
      let appropriateSubmenu = clickedElement.nextElementSibling;
      appropriateSubmenu.classList.toggle("show");
      
} 