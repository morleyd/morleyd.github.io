document.addEventListener('DOMContentLoaded', async function () {

    await fillTable('./data/small_spa.json', './data/small_eng.json')
    console.log(getWidth())

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

    col.appendChild(resizer);

    createResizableColumn(col, resizer);
};

function createResizableColumn(col, resizer) {
    let x = 0;
    let w = 0;

    const mouseDownHandler = function (e) {
        x = e.clientX;

        const styles = window.getComputedStyle(col);
        w = parseInt(styles.width, 10);

        document.addEventListener('mousemove', mouseMoveHandler);
        document.addEventListener('mouseup', mouseUpHandler);
        // document.addEventListener('touchmove', mouseMoveHandler);
        // document.addEventListener('touchend', mouseUpHandler);

        resizer.classList.add('resizing');
    };

    const mouseMoveHandler = function (e) {
        const dx = e.clientX - x;
        const dw = w + dx
        console.log("resizer x w dx dw", x, w, dx, dw)
        col.style.width = `${dw}px`;
        if (dw >= getWidth()) {
            setColSize('col2', 0)
        } else if (dw <= 0) {
            setColSize('col1', 0)
        } else {
            setColSize('col1', 16)
            setColSize('col2', 16)
        }
    };

    const mouseUpHandler = function () {
        resizer.classList.remove('resizing');
        document.removeEventListener('mousemove', mouseMoveHandler);
        document.removeEventListener('mouseup', mouseUpHandler);
    };

    resizer.addEventListener('mousedown', mouseDownHandler);
};

function setColSize(col, size) {
    for (let element of Array.from(document.getElementsByClassName(col))) {
        element.style.fontSize = `${size}px`
    }
}

function getWidth() {
    return Math.max(document.body.scrollWidth,
        document.documentElement.scrollWidth,
        document.body.offsetWidth,
        document.documentElement.offsetWidth,
        document.documentElement.clientWidth);
}