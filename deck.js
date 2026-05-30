/* ============================================================
   deck.js — a tiny, dependency-free slide engine.

   Drop it into any HTML file that has:
     <div id="deck">
       <section class="slide"> ... </section>
       <section class="slide"> ... </section>
     </div>
     <script src="deck.js"></script>

   Controls
     →  Space  PageDown   next (reveals fragments first, then advances)
     ←  PageUp             previous
     Home / End            first / last slide
     F                     toggle fullscreen
     URL #3                deep-link to slide 3

   No build step. No framework. Open the file in a browser.
   ============================================================ */
(function () {
  "use strict";

  var slides = Array.prototype.slice.call(document.querySelectorAll(".slide"));
  if (!slides.length) return;

  var current = 0;

  // Progress bar + page number are injected so the slide files stay clean.
  var bar = document.createElement("div");
  bar.id = "progress";
  document.body.appendChild(bar);

  var pageNum = document.createElement("div");
  pageNum.id = "page-num";
  document.body.appendChild(pageNum);

  function fragments(slide) {
    return Array.prototype.slice.call(slide.querySelectorAll(".fragment"));
  }

  function render() {
    slides.forEach(function (s, i) {
      s.classList.toggle("active", i === current);
    });
    // On entering a slide, hide its fragments until clicked forward.
    fragments(slides[current]).forEach(function (f) {
      f.classList.remove("visible");
    });
    bar.style.width = ((current + 1) / slides.length) * 100 + "%";
    pageNum.textContent = (current + 1) + " / " + slides.length;
    if (history.replaceState) history.replaceState(null, "", "#" + (current + 1));
  }

  function next() {
    // Reveal the next hidden fragment on the current slide before moving on.
    var frags = fragments(slides[current]);
    for (var i = 0; i < frags.length; i++) {
      if (!frags[i].classList.contains("visible")) {
        frags[i].classList.add("visible");
        return;
      }
    }
    if (current < slides.length - 1) {
      current++;
      render();
    }
  }

  function prev() {
    if (current > 0) {
      current--;
      render();
      // Show all fragments of the slide we just stepped back into.
      fragments(slides[current]).forEach(function (f) {
        f.classList.add("visible");
      });
    }
  }

  function go(i) {
    current = Math.max(0, Math.min(slides.length - 1, i));
    render();
  }

  document.addEventListener("keydown", function (e) {
    switch (e.key) {
      case "ArrowRight":
      case " ":
      case "PageDown":
        e.preventDefault(); next(); break;
      case "ArrowLeft":
      case "PageUp":
        e.preventDefault(); prev(); break;
      case "Home":
        e.preventDefault(); go(0); break;
      case "End":
        e.preventDefault(); go(slides.length - 1); break;
      case "f":
      case "F":
        if (!document.fullscreenElement) document.documentElement.requestFullscreen();
        else document.exitFullscreen();
        break;
    }
  });

  // Tap/click the right two-thirds to advance, left third to go back.
  document.addEventListener("click", function (e) {
    if (e.target.closest("a")) return; // let links work
    var dir = getComputedStyle(slides[current]).direction;
    var x = e.clientX / window.innerWidth;
    var forward = dir === "rtl" ? x < 0.34 : x > 0.34;
    forward ? next() : prev();
  });

  // Deep-link support: open the deck at #N.
  var start = parseInt((location.hash || "").slice(1), 10);
  if (start && start >= 1 && start <= slides.length) current = start - 1;

  render();
})();
