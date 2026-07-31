/*
This file is part of OmniDB.
OmniDB is open-source software, distributed "AS IS" under the MIT license in the hope that it will be useful.

The MIT License (MIT)

Portions Copyright (c) 2015-2026, The OmniDB Team
Portions Copyright (c) 2017-2026, 2ndQuadrant Limited
Portions Copyright (c) 2025-2026, Zbyněk Vanžura

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

export function blueHtmlRenderer(instance, td, row, col, prop, value, cellProperties) {
	if (cellProperties.__proto__.type == "dropdown" || cellProperties.__proto__.type == "autocomplete") {
		Handsontable.renderers.AutocompleteRenderer.apply(this, arguments);
	} else if (cellProperties.__proto__.type == "password") {
		Handsontable.renderers.PasswordRenderer.apply(this, arguments);
	} else if (cellProperties.__proto__.type == "checkbox") {
		Handsontable.renderers.CheckboxRenderer.apply(this, arguments);
	} else {
		Handsontable.renderers.HtmlRenderer.apply(this, arguments);
	}

	td.className = "cellEven";
}

export function greenHtmlRenderer(instance, td, row, col, prop, value, cellProperties) {
	if (cellProperties.__proto__.type == "dropdown" || cellProperties.__proto__.type == "autocomplete") {
		Handsontable.renderers.AutocompleteRenderer.apply(this, arguments);
	} else if (cellProperties.__proto__.type == "password") {
		Handsontable.renderers.PasswordRenderer.apply(this, arguments);
	} else if (cellProperties.__proto__.type == "checkbox") {
		Handsontable.renderers.CheckboxRenderer.apply(this, arguments);
	} else {
		Handsontable.renderers.HtmlRenderer.apply(this, arguments);
	}

	td.className = "cellNew";
}

export function yellowHtmlRenderer(instance, td, row, col, prop, value, cellProperties) {
	if (cellProperties.__proto__.type == "dropdown" || cellProperties.__proto__.type == "autocomplete") {
		Handsontable.renderers.AutocompleteRenderer.apply(this, arguments);
	} else if (cellProperties.__proto__.type == "password") {
		Handsontable.renderers.PasswordRenderer.apply(this, arguments);
	} else if (cellProperties.__proto__.type == "checkbox") {
		Handsontable.renderers.CheckboxRenderer.apply(this, arguments);
	} else {
		Handsontable.renderers.HtmlRenderer.apply(this, arguments);
	}

	td.className = "cellEdit";
}

export function whiteHtmlRenderer(instance, td, row, col, prop, value, cellProperties) {
	if (cellProperties.__proto__.type == "dropdown" || cellProperties.__proto__.type == "autocomplete") {
		Handsontable.renderers.AutocompleteRenderer.apply(this, arguments);
	} else if (cellProperties.__proto__.type == "password") {
		Handsontable.renderers.PasswordRenderer.apply(this, arguments);
	} else if (cellProperties.__proto__.type == "checkbox") {
		Handsontable.renderers.CheckboxRenderer.apply(this, arguments);
	} else {
		Handsontable.renderers.HtmlRenderer.apply(this, arguments);
	}

	td.className = "cellOdd";
}

export function whiteRightHtmlRenderer(instance, td, row, col, prop, value, cellProperties) {
	if (cellProperties.__proto__.type == "dropdown" || cellProperties.__proto__.type == "autocomplete") {
		Handsontable.renderers.AutocompleteRenderer.apply(this, arguments);
	} else if (cellProperties.__proto__.type == "password") {
		Handsontable.renderers.PasswordRenderer.apply(this, arguments);
	} else if (cellProperties.__proto__.type == "checkbox") {
		Handsontable.renderers.CheckboxRenderer.apply(this, arguments);
	} else {
		Handsontable.renderers.HtmlRenderer.apply(this, arguments);
	}

	td.style.textAlign = "right";
}

export function redHtmlRenderer(instance, td, row, col, prop, value, cellProperties) {
	if (cellProperties.__proto__.type == "dropdown" || cellProperties.__proto__.type == "autocomplete") {
		Handsontable.renderers.AutocompleteRenderer.apply(this, arguments);
	} else if (cellProperties.__proto__.type == "password") {
		Handsontable.renderers.PasswordRenderer.apply(this, arguments);
	} else if (cellProperties.__proto__.type == "checkbox") {
		Handsontable.renderers.CheckboxRenderer.apply(this, arguments);
	} else {
		Handsontable.renderers.HtmlRenderer.apply(this, arguments);
	}

	td.className = "cellRemove";
}

export function grayHtmlRenderer(instance, td, row, col, prop, value, cellProperties) {
	if (cellProperties.__proto__.type == "dropdown" || cellProperties.__proto__.type == "autocomplete") {
		Handsontable.renderers.AutocompleteRenderer.apply(this, arguments);
	} else if (cellProperties.__proto__.type == "password") {
		Handsontable.renderers.PasswordRenderer.apply(this, arguments);
	} else if (cellProperties.__proto__.type == "checkbox") {
		Handsontable.renderers.CheckboxRenderer.apply(this, arguments);
	} else {
		Handsontable.renderers.HtmlRenderer.apply(this, arguments);
	}

	td.className = "cellReadOnly";
}

export function yellowRenderer(instance, td, row, col, prop, value, cellProperties) {
	if (cellProperties.__proto__.type == "dropdown" || cellProperties.__proto__.type == "autocomplete") {
		Handsontable.renderers.AutocompleteRenderer.apply(this, arguments);
	} else {
		Handsontable.renderers.TextRenderer.apply(this, arguments);
	}

	td.className = "cellEdit";
}

export function blueRenderer(instance, td, row, col, prop, value, cellProperties) {
	if (cellProperties.__proto__.type == "dropdown" || cellProperties.__proto__.type == "autocomplete") {
		Handsontable.renderers.AutocompleteRenderer.apply(this, arguments);
	} else {
		Handsontable.renderers.TextRenderer.apply(this, arguments);
	}

	td.className = "cellEven";
}

export function whiteRenderer(instance, td, row, col, prop, value, cellProperties) {
	if (cellProperties.__proto__.type == "dropdown" || cellProperties.__proto__.type == "autocomplete") {
		Handsontable.renderers.AutocompleteRenderer.apply(this, arguments);
	} else {
		Handsontable.renderers.TextRenderer.apply(this, arguments);
	}

	td.className = "cellOdd";
}

export function redRenderer(instance, td, row, col, prop, value, cellProperties) {
	if (cellProperties.__proto__.type == "dropdown" || cellProperties.__proto__.type == "autocomplete") {
		Handsontable.renderers.AutocompleteRenderer.apply(this, arguments);
	} else {
		Handsontable.renderers.TextRenderer.apply(this, arguments);
	}

	td.className = "cellRemove";
}

export function grayRenderer(instance, td, row, col, prop, value, cellProperties) {
	if (cellProperties.__proto__.type == "dropdown" || cellProperties.__proto__.type == "autocomplete") {
		Handsontable.renderers.AutocompleteRenderer.apply(this, arguments);
	} else {
		Handsontable.renderers.TextRenderer.apply(this, arguments);
	}

	td.className = "cellReadOnly";
}

export function greenRenderer(instance, td, row, col, prop, value, cellProperties) {
	if (cellProperties.__proto__.type == "dropdown" || cellProperties.__proto__.type == "autocomplete") {
		Handsontable.renderers.AutocompleteRenderer.apply(this, arguments);
	} else {
		Handsontable.renderers.TextRenderer.apply(this, arguments);
	}

	td.className = "cellNew";
}

export function grayEmptyRenderer(instance, td, row, col, prop, value, cellProperties) {
	arguments[5] = "";

	Handsontable.renderers.HtmlRenderer.apply(this, arguments);

	td.className = "cellReadOnly";
}

export function newRowRenderer(instance, td, row, col, prop, value, cellProperties) {
	arguments[5] = "+";
	td.style.textAlign = "center";

	Handsontable.renderers.HtmlRenderer.apply(this, arguments);

	td.className = "cellReadOnly";
}

export function columnsActionRenderer(instance, td, row, col, prop, value, cellProperties) {
	arguments[5] =
		"<i title='Remove' class='fas fa-times action-grid action-close text-danger' onclick='dropColumnAlterTable()'></i>";

	Handsontable.renderers.HtmlRenderer.apply(this, arguments);

	td.className = "cellReadOnly";
}

export function editDataActionRenderer(instance, td, row, col, prop, value, cellProperties) {
	arguments[5] =
		"<div class='text-center'><i title='Remove' class='fas fa-times action-grid action-close text-danger' onclick='deleteRowEditData()'></i></div>";

	Handsontable.renderers.HtmlRenderer.apply(this, arguments);

	td.className = "cellReadOnly";
}

export function monitorStatusRenderer(instance, td, row, col, prop, value, cellProperties) {
	if (cellProperties.__proto__.type == "dropdown" || cellProperties.__proto__.type == "autocomplete") {
		Handsontable.renderers.AutocompleteRenderer.apply(this, arguments);
	} else {
		Handsontable.renderers.HtmlRenderer.apply(this, arguments);
	}
	if (value == "unknown") td.setAttribute("style", "background-color: rgb(165, 84, 175) !important");
	else if (value == "ok" || value == "recovery") td.setAttribute("style", "background-color: rgb(74, 183, 65) !important");
	else if (value == "warning") td.setAttribute("style", "background-color: rgb(255, 161, 45) !important");
	else if (value == "critical") td.setAttribute("style", "background-color: rgb(232, 79, 79) !important");

	td.style.color = "white";
	td.style["text-align"] = "center";
}
