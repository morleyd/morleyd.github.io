
let availableNow = false;

function createURL(key, query) {
    let out = "https://"+key+".overdrive.com/"+key+"-visitor/content/search?query="+query;
    if (availableNow){
        out += "&showOnlyAvailable=true&sortBy=relevance";
    }
    return out;
}

function findBooks() {
    let query = document.getElementById("userInput").value;

    let checkboxes = document.getElementById("mySelectOptions");
    let checkedCheckboxes = checkboxes.querySelectorAll('input[type=checkbox]:checked');

    for (const item of checkedCheckboxes) {
        let key = item.getAttribute('value');
        let URL = createURL(key, query)
        window.open(URL, '_blank');
    }
}

window.onload = (event) => {
    initMultiselect();
};

function initMultiselect() {
    checkboxStatusChange();

    document.addEventListener("click", function(evt) {
        let flyoutElement = document.getElementById('myMultiselect'),
            targetElement = evt.target; // clicked element

        do {
            if (targetElement === flyoutElement) {
                // This is a click inside. Do nothing, just return.
                //console.log('click inside');
                return;
            }

            // Go up the DOM
            targetElement = targetElement.parentNode;
        } while (targetElement);

        // This is a click outside.
        toggleCheckboxArea(true);
        //console.log('click outside');
    });
}

function checkboxStatusChange() {
    let multiselect = document.getElementById("mySelectLabel");
    let multiselectOption = multiselect.getElementsByTagName('option')[0];

    let values = [];
    let checkboxes = document.getElementById("mySelectOptions");
    let checkedCheckboxes = checkboxes.querySelectorAll('input[type=checkbox]:checked');

    for (const item of checkedCheckboxes) {
        let checkboxValue = item.getAttribute('id');
        values.push(checkboxValue);
    }

    let dropdownValue = "Nothing is selected";
    if (values.length > 0) {
        dropdownValue = values.join(', ');
    }
    multiselectOption.innerText = dropdownValue;
}

function toggleCheckboxArea(onlyHide = false) {
    let checkboxes = document.getElementById("mySelectOptions");
    let displayValue = checkboxes.style.display;

    if (displayValue !== "block") {
        if (onlyHide === false) {
            checkboxes.style.display = "block";
        }
    } else {
        checkboxes.style.display = "none";
    }
}

/*
Title:      Toggle Switch
URL:        http://github.com/jamiebicknell/Toggle-Switch
Author:     Jamie Bicknell
Twitter:    @jamiebicknell
Thanks:     @steve228uk for prop/var mods and plugin suggestion
*/

jQuery(document).ready(function ($) {
    $('.toggleswitch').toggleSwitch({
        onClick: function () {
        },
        onChangeOn: function () {
            availableNow = true;
        },
        onChangeOff: function () {
            availableNow = false;
        }
    });
});

(function ($) {
    'use strict';
    $.fn.toggleSwitch = function (options) {
        var settings = $.extend({
            onClick: function () { return true; },
            onChangeOn: function () { return true; },
            onChangeOff: function () { return true; }
        }, options);
        $(this).each(function () {
            var obj = $(this), status = obj.is(':checked') ? '' : ' off';
            if (!obj.parent('div.switch').length) {
                obj.wrap('<div class="switch"></div>');
                obj.parent('div.switch').prepend('<span class="switched' + status + '" />').prepend('<div class="overlay" />');
            }
            obj.parent('div.switch').add($('label[for=' + obj.prop('id') + ']')).click(function (e) {
                e.preventDefault();
                if (!obj.prop('disabled')) {
                    var value, check;
                    settings.onClick.call(obj);
                    if ($(this).is('label')) {
                        value = $('#' + $(this).prop('for')).prev('span.switched');
                        check = $('#' + $(this).prop('for'));
                    } else {
                        value = $(this).children('span.switched');
                        check = $(this).children('input[type=checkbox]');
                    }
                    if (value.is('.off')) {
                        value.stop().animate({left: 0}, 150, 'linear').removeClass('off');
                        check.prop('checked', 'checked');
                        settings.onChangeOn.call(obj);
                    } else {
                        value.stop().animate({left: -21}, 150, 'linear').addClass('off');
                        check.prop('checked', '');
                        settings.onChangeOff.call(obj);
                    }
                }
            });
        });
    };
}(jQuery));

/* End Jamie Bicknell code */
