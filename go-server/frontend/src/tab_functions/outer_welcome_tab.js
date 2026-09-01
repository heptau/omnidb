// @ts-check
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

import { endLoading } from "../ajax_control_bridge.js";
import { refreshBootstrapTooltips } from "../workspace.js";


/**
 * Builds the Welcome section's content once, at startup. Static content --
 * unlike a v_connTabControl connection tab, there is only ever one of these,
 * so it is rendered directly into #omnidb__section_welcome rather than
 * through the tab-control engine (no tab object, no close button: the
 * section nav is what switches away from it now).
 */
export function initWelcomeSection() {
	var v_target = /** @type {HTMLElement} */ (document.getElementById("omnidb__section_welcome"));

	var v_width = Math.ceil((300 / window.innerWidth) * 100);
	var v_complement_width = 100 - v_width;

	// Self-contained on purpose: every rule and keyframe the draw-in
	// animation needs lives in this <style> block, under class names used
	// nowhere else in the app (welcome-logo__*, not the animated-omnis__*
	// names the AI assistant's idle icon uses elsewhere). It used to reuse
	// those classes and pull its animation from _base.scss, which quietly
	// broke it: .animated-omnis__group--to-blue path already carries a
	// static `fill: #1e88e5` there, same specificity, later in the
	// stylesheet -- so it always won the cascade outside this animation's
	// own active window, and the logo sat fully colored (with a stroke
	// drawing on top) until the fill animation kicked in and yanked it down
	// to the start color first. Keeping the whole thing inside the SVG
	// means nothing outside it can collide with these class names again.
	var v_animated_omnis = `<svg
			version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
			x="0px" y="0px"
			width="269.667px" height="82.333px"
			viewBox="0 0 269.667 82.333" enable-background="new 0 0 269.667 82.333"
			xml:space="preserve"
	>
			<style>
					.welcome-logo__to-blue path,
					.welcome-logo__to-blue rect,
					.welcome-logo__to-darkblue path,
					.welcome-logo__to-darkblue rect {
							stroke: #818181;
							stroke-width: 1px;
							stroke-dasharray: 100;
							stroke-dashoffset: 100;
					}

					.welcome-logo__to-blue path,
					.welcome-logo__to-blue rect {
							fill: transparent;
							animation:
									welcome-logo-draw 1s ease forwards 0s,
									welcome-logo-fill-blue 0.8s ease forwards 1s,
									welcome-logo-fade-stroke 0.8s ease forwards 1s;
					}

					.welcome-logo__to-darkblue path,
					.welcome-logo__to-darkblue rect {
							fill: transparent;
							animation:
									welcome-logo-draw 1s ease forwards 0s,
									welcome-logo-fill-darkblue 0.8s ease forwards 1s,
									welcome-logo-fade-stroke 0.8s ease forwards 1s;
					}

					@keyframes welcome-logo-draw {
							to { stroke-dashoffset: 0; }
					}

					@keyframes welcome-logo-fade-stroke {
							to { stroke: transparent; }
					}

					@keyframes welcome-logo-fill-blue {
							from { fill: #cfe4fb; }
							to { fill: #1e88e5; }
					}

					@keyframes welcome-logo-fill-darkblue {
							from { fill: #d7dbe8; }
							to { fill: #37517e; }
					}
			</style>
			<g class="welcome-logo__to-blue">
					<path fill="#1E88E5" d="M109.192,30.407H98.141c-5.478,0-9.919,4.847-9.919,10.826c0,5.982,4.441,10.829,9.919,10.829h11.051
							c5.48,0,9.921-4.847,9.921-10.829C119.113,35.253,114.672,30.407,109.192,30.407z M106.959,47.145h-6.585
							c-3.264,0-5.911-2.645-5.911-5.912c0-3.264,2.646-5.909,5.911-5.909h6.585c3.266,0,5.911,2.646,5.911,5.909
							C112.871,44.5,110.225,47.145,106.959,47.145z"/>
					<path fill="#1E88E5" d="M150.642,33.76c-0.66-2.21-1.79-3.358-3.812-3.358c-1.313,0-2.932,0.419-3.816,2.163
							c-1.638,3.23-5.112,10.241-5.112,10.241s-3.464-6.972-5.103-10.202c-0.884-1.745-2.513-2.202-3.825-2.202
							c-2.021,0-3.151,1.148-3.812,3.358c-0.655,2.194-5.286,17.963-5.286,17.963h6.365L129.557,39c0,0,1.636,4.402,3.127,7.943
							c1.026,2.438,3.197,3.315,4.987,3.315s3.551-0.805,4.842-3.113c1.581-2.823,3.734-8.249,3.734-8.249l3.315,12.827h6.364
							C155.927,51.723,151.297,35.955,150.642,33.76z"/>
					<path fill="#1E88E5" d="M158.298,51.723c0,0,0-15.711,0-17.401c0-1.691,1.19-3.92,3.245-3.92s3.731,1.869,4.688,2.729
							c0.956,0.86,11.397,10.188,11.397,10.188V30.747h5.599c0,0,0,15.63,0,17.56s-1.192,3.761-3.575,3.761s-3.541-1.477-5.057-2.992
							c-1.516-1.515-10.432-10.739-10.432-10.739v13.388H158.298z"/>
					<rect x="187.146" y="30.747" fill="#1E88E5" width="5.599" height="20.977"/>
			</g>
			<g class="welcome-logo__to-darkblue">
					<path fill="#37517E" d="M196.758,38.648c0,0,0,8.991,0,10.275s0.506,2.8,2.664,2.8c2.159,0,6.265,0,11.381,0
							c5.117,0,12.639-4.041,12.639-10.692s-5.927-10.284-12.814-10.284s-9.73,0-9.73,0l-4.139,5.456c0,0,8.466,0,14.045,0
							c5.58,0,6.211,3.886,6.211,5.11c0,1.224-0.894,5.016-6.211,5.016c-5.316,0-7.525,0-7.525,0v-7.681H196.758z"/>
					<path fill="#37517E" d="M250.405,40.937c0,0,2.853-1.397,2.853-4.39s-2.125-5.801-8.244-5.801c-6.12,0-13.892,0-13.892,0
							l-4.39,5.456c0,0,16.303,0,17.917,0s2.465,0.354,2.465,1.347c0,0.993-0.767,1.412-2.565,1.412c-1.8,0-17.816,0-17.816,0
							s0,8.061,0,9.448s0.648,3.313,4.503,3.313s10.441,0,13.933,0c3.49,0,8.521-1.923,8.521-5.831
							C253.688,41.985,250.405,40.937,250.405,40.937z M244.495,46.329c-1.746,0-11.243,0-11.243,0v-2.884c0,0,9.923,0,11.397,0
							s2.557,0.07,2.557,1.412S246.242,46.329,244.495,46.329z"/>
			</g>
			<g class="welcome-logo__to-blue">
					<path fill="#1E88E5" d="M57.694,31.129c-1.484-2.352-3.474-4.342-5.825-5.823c0.646,1.263,1.214,2.643,1.691,4.129
							C55.049,29.915,56.43,30.486,57.694,31.129z"/>
					<path fill="#1E88E5" d="M43.292,22.507v5.234c2.323,0.072,4.553,0.333,6.649,0.762c-0.969-2.344-2.205-4.237-3.614-5.531
							C45.343,22.736,44.331,22.58,43.292,22.507z"/>
					<path fill="#1E88E5" d="M57.692,50.87c-1.265,0.644-2.643,1.215-4.132,1.691c-0.477,1.489-1.046,2.867-1.691,4.132
							C54.221,55.211,56.21,53.221,57.692,50.87z"/>
					<path fill="#1E88E5" d="M60.188,44.681c-0.359-0.742-0.612-1.537-0.744-2.381h-4.192c-0.072,2.322-0.332,4.551-0.756,6.645
							c2.344-0.969,4.238-2.207,5.532-3.618C60.08,45.11,60.145,44.9,60.188,44.681z"/>
					<path fill="#1E88E5" d="M60.029,36.675c-1.293-1.414-3.187-2.652-5.534-3.624c0.424,2.097,0.684,4.325,0.756,6.647h4.192
							c0.132-0.844,0.385-1.639,0.747-2.378C60.145,37.101,60.08,36.889,60.029,36.675z"/>
					<path fill="#1E88E5" d="M52.168,42.3h-8.875v8.873c2.79-0.092,5.421-0.475,7.782-1.094C51.693,47.718,52.076,45.09,52.168,42.3z"/>
					<path fill="#1E88E5" d="M43.292,39.699h8.875c-0.092-2.79-0.475-5.421-1.094-7.782c-2.361-0.619-4.992-1.002-7.782-1.094V39.699z"
							/>
					<path fill="#1E88E5" d="M43.292,59.493c1.039-0.072,2.05-0.229,3.036-0.466c1.409-1.296,2.645-3.187,3.614-5.531
							c-2.096,0.427-4.327,0.687-6.649,0.759V59.493z"/>
					<path fill="#1E88E5" d="M29.499,48.945c-0.427-2.094-0.687-4.322-0.759-6.645H23.5c0.071,1.036,0.228,2.046,0.462,3.026
							C25.257,46.741,27.152,47.976,29.499,48.945z"/>
					<path fill="#1E88E5" d="M40.695,22.507c-1.038,0.072-2.05,0.229-3.034,0.465c-1.409,1.294-2.645,3.188-3.612,5.528
							c2.096-0.426,4.324-0.687,6.646-0.759V22.507z"/>
					<path fill="#1E88E5" d="M40.695,30.823c-2.789,0.092-5.419,0.475-7.779,1.094c-0.621,2.361-1.002,4.992-1.094,7.782h8.873V30.823z"
							/>
					<path fill="#1E88E5" d="M32.123,25.304c-2.353,1.481-4.344,3.472-5.827,5.822c1.265-0.643,2.645-1.214,4.135-1.691
							C30.91,27.947,31.479,26.566,32.123,25.304z"/>
					<path fill="#1E88E5" d="M40.695,59.493v-5.238c-2.322-0.072-4.552-0.332-6.646-0.759c0.967,2.345,2.202,4.238,3.612,5.531
							C38.646,59.263,39.657,59.42,40.695,59.493z"/>
					<path fill="#1E88E5" d="M23.499,39.699h5.241c0.071-2.322,0.332-4.551,0.759-6.647c-2.348,0.969-4.243,2.21-5.538,3.624
							C23.727,37.656,23.571,38.665,23.499,39.699z"/>
					<path fill="#1E88E5" d="M32.123,56.695c-0.644-1.265-1.213-2.643-1.691-4.131c-1.489-0.478-2.868-1.049-4.133-1.691
							C27.781,53.223,29.771,55.213,32.123,56.695z"/>
					<path fill="#1E88E5" d="M40.695,42.3h-8.873c0.092,2.79,0.475,5.418,1.094,7.779c2.359,0.619,4.99,1.002,7.779,1.094V42.3z"/>
			</g>
			<g class="welcome-logo__to-blue">
					<g>
							<path fill="#1E88E5" d="M36.436,14.434c0.642,1.11,0.979,2.306,1.082,3.505c1.451-0.281,2.944-0.438,4.477-0.438
									c10.299,0,19.03,6.635,22.203,15.854c1.094-0.513,2.301-0.823,3.59-0.823c0.431,0,0.846,0.064,1.26,0.127
									c-3.561-11.562-14.325-19.967-27.052-19.967c-2.165,0-4.264,0.266-6.291,0.726C35.961,13.743,36.223,14.065,36.436,14.434z"/>
							<path fill="#1E88E5" d="M21.771,59.104c0.646-1.115,1.519-2.007,2.513-2.695c-3.58-4.107-5.765-9.463-5.783-15.339
									c0-0.022-0.006-0.044-0.006-0.068c0-0.019,0.005-0.036,0.005-0.055c0.013-5.874,2.193-11.227,5.766-15.339
									c-0.99-0.689-1.854-1.593-2.497-2.706c-0.211-0.366-0.356-0.747-0.508-1.127c-4.685,5.052-7.572,11.795-7.572,19.227
									c0,7.436,2.889,14.179,7.576,19.228C21.415,59.851,21.561,59.468,21.771,59.104z"/>
							<path fill="#1E88E5" d="M67.787,49.47c-1.289,0-2.499-0.311-3.592-0.826c-3.175,9.222-11.901,15.853-22.2,15.853
									c-1.535,0-3.031-0.159-4.483-0.438c-0.103,1.202-0.432,2.401-1.072,3.515c-0.212,0.368-0.472,0.687-0.728,1.01
									c2.023,0.46,4.121,0.725,6.283,0.725c12.728,0,23.492-8.403,27.055-19.965C68.632,49.405,68.218,49.47,67.787,49.47z"/>
					</g>
					<g class="welcome-logo__to-darkblue">
							<path fill="#37517E" d="M73.462,41.001c0-3.137-2.539-5.678-5.676-5.678s-5.683,2.541-5.683,5.678s2.546,5.674,5.683,5.674
									S73.462,44.138,73.462,41.001z"/>
							<path fill="#37517E" d="M26.262,13.754c-2.718,1.566-3.647,5.033-2.079,7.753c1.566,2.715,5.042,3.645,7.757,2.079
									c2.718-1.568,3.645-5.045,2.079-7.755C32.446,13.116,28.979,12.181,26.262,13.754z"/>
							<path fill="#37517E" d="M26.267,68.256c2.72,1.568,6.187,0.639,7.755-2.076c1.566-2.715,0.636-6.189-2.077-7.755
									c-2.72-1.571-6.191-0.639-7.752,2.074C22.622,63.219,23.549,66.691,26.267,68.256z"/>
					</g>
			</g>
	</svg>`;

	// Title html string -- the full logotype (icon + "OmniDB" wordmark) now
	// plays a stroke-draw-in once on load (see the <style> block inside
	// v_animated_omnis above), borrowing the animation the desktop app's
	// startup splash used to do -- that splash rarely stayed on screen long
	// enough for anyone to see it play, so it now shows here instead (see
	// wails-app/frontend/index.html). The wordmark spells out "OmniDB"
	// itself, so there's no separate "Hi, welcome to OmniDB!" heading
	// alongside it any more.
	let v_html_title = '<div class="d-flex justify-content-center mb-4">' + '<span class="omnidb__welcome__logo">' + v_animated_omnis + "</span>" + "</div>";
	// Intro html string
	let v_html_intro =
		'<div class="card p-3 omnidb__welcome__intro-card">' +
		'<p class="text-center">OmniDB puts you directly in the driver\'s seat of your databases &mdash; that\'s what makes it so useful. While you\'re getting comfortable with it, we recommend practicing on a <strong>test environment rather than production</strong>.</p>' +
		'<button type="button" class="btn btn-lg omnidb__theme__btn--primary w-auto mx-auto my-4" data-omnidb-action="start-tutorial" data-omnidb-arg="getting_started">' +
		'<i class="fas fa-list me-2"></i>' +
		"Getting started" +
		"</button>" +
		'<div class="alert-info p-2 rounded mt-4" style="display: grid; grid-template: \'icon text\';">' +
		'<i class="fas fa-info-circle p-4" style="grid-area: icon;"></i>' +
		'<div style="grid-area: text;">' +
		`
				We aim to keep OmniDB flexible, secure and work-effective across multiple DBMS.<br>
				Just keep in mind that many actions here <strong>talk directly to the database you're connected to</strong>.
				` +
		"</div>" +
		"</div>" +
		"</div>";
	// Usel links html string
	let v_html_useful_links =
		'<div class="alert alert-success p-3 omnidb__welcome__useful-card">' +
		'<h2 class="text-center mb-4">Useful stuff</h2>' +
		"<ul>" +
		'<li class="mb-2"><a class="btn btn-success text-white" href="#" data-omnidb-action="open-external-url" data-omnidb-arg="https://www.omnidb.net"><i class="fas fa-globe-americas"></i> <span>OmniDB web</span></a></li>' +
		'<li class="mb-2"><a class="btn btn-success text-white" href="#" data-omnidb-action="open-external-url" data-omnidb-arg="https://github.com/heptau/omnidb"><i class="fab fa-github"></i> <span>GitHub repo</span></a></li>' +
		'<li><a class="btn btn-success text-white" href="#" data-omnidb-action="open-external-url" data-omnidb-arg="https://www.omnidb.net/en/introduction.html"><i class="fas fa-list"></i> <span>Read the docs</span></a></li>' +
		"</ul>" +
		"</div>";
	// About html string -- same version/license info as the header's About
	// dialog (modal_about in workspace.html), so a first-time user sees it
	// without having to go looking for the "i" icon in the nav rail.
	let v_html_about =
		'<div class="card p-3 mt-3 text-center">' +
		'<span class="badge bg-light text-dark border p-2 mb-2">' +
		'<i class="fas fa-code-branch me-1"></i> Version ' +
		v_short_version +
		"</span>" +
		'<span class="badge bg-light text-dark border p-2">' +
		'<i class="fas fa-balance-scale me-1"></i> License: MIT' +
		"</span>" +
		"</div>";
	// Template html string
	var v_html =
		'<div class="container" style="position: relative;">' +
		'<div class="row">' +
		'<div class="col-12">' +
		// Welcome main block
		'<div id="welcome_content" class="omnidb__welcome" style="height: 100vh;display: flex;align-items: center;font-size: 1.2rem;justify-content: center;">' +
		"<div>" +
		// Welcome grid
		"<div style=\"display: grid; grid-template: 'intro getting_started links'; grid-gap: 64px;\">" +
		// Intro area -- the logo sits above the card here, rather than as its
		// own full-width row, so it centers over the card's width instead of
		// the whole two-column grid's.
		'<div style="grid-area: intro;">' +
		v_html_title +
		v_html_intro +
		"</div>" +
		// Links area
		'<div style="grid-area: links;">' +
		v_html_useful_links +
		v_html_about +
		"</div>" +
		"</div>" +
		"</div>" +
		"</div>" +
		"</div>" + //.row
		"</div>";

	v_target.innerHTML = v_html;

	refreshBootstrapTooltips();

	endLoading();
}
