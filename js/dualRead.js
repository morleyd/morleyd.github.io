document.addEventListener('DOMContentLoaded', async function () {
    
    await fillCollumn('./data/small_spa.json', './data/small_eng.json')

});

async function loadJSON(fpath) {
    const response = await fetch(fpath);
    const json = await response.json();
    console.log("loadJSON from ", fpath, " got ", json)
    return json
}

async function fillCollumn(fpathA, fpathB) {
    var colA = await loadJSON(fpathA)
    var colB = await loadJSON(fpathB)
    var table = document.getElementById('table');
    zip(colA, colB).forEach(function (a, b) {
        var tr = document.createElement('tr');
        tr.innerHTML = '<td>' + a + '</td>' +
            '<td>' + b + '</td>';
        table.appendChild(tr);
    });

    // createResizableTable(document.getElementById('table'));
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
    console.log('cols', col);
    // [].forEach.call(cols, function (col) {
    // Add a resizer element to the column
    const resizer = document.createElement('div');
    resizer.classList.add('resizer');

    // Set the height
    resizer.style.height = `${table.offsetHeight}px`;

    col.appendChild(resizer);

    createResizableColumn(col, resizer);
    // });
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

        resizer.classList.add('resizing');
    };

    const mouseMoveHandler = function (e) {
        const dx = e.clientX - x;
        console.log("resizer x w dx dw", x, w, dx, w + dx)
        col.style.width = `${w + dx}px`;
    };

    const mouseUpHandler = function () {
        resizer.classList.remove('resizing');
        document.removeEventListener('mousemove', mouseMoveHandler);
        document.removeEventListener('mouseup', mouseUpHandler);
    };

    resizer.addEventListener('mousedown', mouseDownHandler);
};