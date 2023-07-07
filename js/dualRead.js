document.addEventListener('DOMContentLoaded', async function () {

    await fillTable('./data/small_spa.json', './data/small_eng.json')

});

async function loadJSON(fpath) {
    const response = await fetch(fpath);
    const json = await response.json();
    console.log("loadJSON from ", fpath, " got ", json)
    return json
}

async function fillTable(fpathA, fpathB) {
    var colA = await loadJSON(fpathA)
    var colB = await loadJSON(fpathB)
    var table = document.getElementById('tbody');
    for (const row of zip(colA, colB)) {
        var tr = document.createElement('tr');
        tr.innerHTML = '<td class="col1">' + row[0] + '</td>' +
            '<td class="col2">' + row[1] + '</td>';
        table.appendChild(tr);
    }
    createResizableTable(document.getElementById('table'));
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
    icon.classList.add("icon")

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

        document.addEventListener('mousemove', (e) => {
            dx = e.clientX - x;
            moveHandler(dx)
        }, false);
        document.addEventListener('mouseup', endHandler);

        document.addEventListener('touchmove', (e) => {
            if (e.touches.length === 1) {
                dx = e.touches[0].screenX - x;
                moveHandler(dx)
            }
        }, false);
        document.addEventListener('touchend', endHandler);

        resizer.classList.add('resizing');
    };


    const moveHandler = function (dx) {
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