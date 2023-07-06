document.addEventListener('DOMContentLoaded', function () {
    const createResizableTable = function (table) {
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

    const createResizableColumn = function (col, resizer) {
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

    createResizableTable(document.getElementById('table'));
    ajaxGetJson('./small_eng.json')
    
});

async function printJSON(fpath) {
    const response = await fetch(fpath);
    const json = await response.json();
    console.log("printJSON", json);
    return json
}

async function ajaxGetJson(fpath) {
    var data
    // var xhr = new XMLHttpRequest();
    // xhr.open("GET", fpath, true);
    // xhr.setRequestHeader("Content-type", "application/json", true);
    // xhr.setRequestHeader("X-PINGOTHER", "pingpong");
    // xhr.onreadystatechange = function () {
    //     if (xhr.readyState == 4 && xhr.status == 200) {
    //         data = JSON.parse(xhr.responseText);
    //     }
    // }
    // xhr.send(null);
    // fetch(fpath)
    //     .then(response => response.json())
    //     .then(jsonResponse => data = jsonResponse)
    data = await printJSON(fpath)
    console.log("ajaxGetJson data",data)
    var table = document.getElementById('table');
    data.forEach(function (object) {
        var tr = document.createElement('tr');
        tr.innerHTML = '<td>' + object.subject + '</td>';
        table.appendChild(tr);
    });
}