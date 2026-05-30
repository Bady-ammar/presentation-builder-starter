/* ============================================================
   review.js — the review + edit overlay.

   This is the supervise step: you look at what the agent built,
   leave comments, and fix small things inline. Comments and edits
   are written to `review.jsonl` next to the deck, where your agent
   reads them and acts.

   It only wakes up when the deck is served by `review.py` on
   localhost. Opened as a plain file (presenting) or on a normal web
   host, it stays completely dormant — no panel, no traces. So you
   present and share the same deck.html with nothing extra on it.

   Run the review server from the repo root:
       python3 review.py
   then open the printed http://localhost:8000/... URL.
   ============================================================ */
(function () {
  "use strict";

  // Only ever run in a local review session.
  if (["localhost", "127.0.0.1"].indexOf(location.hostname) === -1) return;

  // Confirm review.py is actually the thing serving us before showing UI.
  fetch("/__review/health")
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) { if (j && j.ok) init(); })
    .catch(function () { /* not the review server — stay dormant */ });

  // ---- slide helpers ------------------------------------------------
  function slides() {
    return Array.prototype.slice.call(document.querySelectorAll(".slide"));
  }
  function activeIndex() {
    var s = slides();
    for (var i = 0; i < s.length; i++) if (s[i].classList.contains("active")) return i;
    return 0;
  }
  function activeSlide() { return slides()[activeIndex()]; }
  function slideTitle(slide) {
    var h = slide.querySelector("h1, h2, h3, .t-hero, .t-xl, .t-lg");
    return h ? h.textContent.trim().slice(0, 80) : "";
  }

  // ---- network ------------------------------------------------------
  function postJSON(url, body) {
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, data: j }; }); });
  }

  var panel, textarea, sentList, editBtn, editing = false;

  function init() {
    injectStyles();
    buildPanel();
    refreshSent();
    setInterval(refreshSent, 4000);
  }

  // ---- panel --------------------------------------------------------
  function buildPanel() {
    panel = document.createElement("div");
    panel.id = "review-panel";
    panel.innerHTML =
      '<div class="rv-head"><span class="rv-dot"></span> Review' +
        '<button class="rv-min" title="Hide / show">–</button></div>' +
      '<div class="rv-body">' +
        '<textarea class="rv-text" rows="3" placeholder="Comment on this slide… (what to change and why)"></textarea>' +
        '<div class="rv-row">' +
          '<button class="rv-send">Send to agent</button>' +
          '<button class="rv-edit" title="Edit text directly (E)">Edit mode</button>' +
        "</div>" +
        '<div class="rv-sent-title">Sent for this deck</div>' +
        '<ul class="rv-sent"></ul>' +
        '<div class="rv-hint">Comments &amp; edits → <code>review.jsonl</code>. ' +
          'Then tell your agent: <em>“apply my review.”</em></div>' +
      "</div>";
    document.body.appendChild(panel);

    textarea = panel.querySelector(".rv-text");
    sentList = panel.querySelector(".rv-sent");
    editBtn = panel.querySelector(".rv-edit");

    panel.querySelector(".rv-send").addEventListener("click", sendComment);
    editBtn.addEventListener("click", toggleEdit);
    panel.querySelector(".rv-min").addEventListener("click", function () {
      panel.classList.toggle("rv-collapsed");
    });

    document.addEventListener("keydown", function (e) {
      if (e.target.isContentEditable || /^(input|textarea)$/i.test(e.target.tagName)) return;
      if ((e.key === "e" || e.key === "E") && !e.metaKey && !e.ctrlKey) { e.preventDefault(); toggleEdit(); }
    });
  }

  // ---- comments -----------------------------------------------------
  function sendComment() {
    var text = textarea.value.trim();
    if (!text) { textarea.focus(); return; }
    var slide = activeSlide();
    postJSON("/__review/comment", {
      slidePath: location.pathname,
      slideIndex: activeIndex(),
      slideTitle: slideTitle(slide),
      comment: text,
    }).then(function (res) {
      if (res.ok) { textarea.value = ""; toast("Sent to agent ✓"); refreshSent(); }
      else toast("Couldn't send — is review.py running?");
    });
  }

  function refreshSent() {
    fetch("/__review/comments?path=" + encodeURIComponent(location.pathname))
      .then(function (r) { return r.ok ? r.json() : { items: [] }; })
      .then(function (j) {
        var items = (j && j.items) || [];
        if (!items.length) { sentList.innerHTML = '<li class="rv-empty">Nothing yet.</li>'; return; }
        sentList.innerHTML = items.slice(-8).reverse().map(function (it) {
          var done = it.status === "done";
          var label = it.type === "edit"
            ? "✎ edit · slide " + ((it.slideIndex | 0) + 1)
            : "“" + (it.comment || "").slice(0, 60) + (it.comment && it.comment.length > 60 ? "…" : "") + "”";
          return '<li class="' + (done ? "rv-done" : "rv-pending") + '">' +
                   '<span class="rv-badge">' + (done ? "done ✓" : "pending") + "</span> " +
                   escapeHTML(label) + "</li>";
        }).join("");
      }).catch(function () {});
  }

  // ---- inline edit --------------------------------------------------
  // Only leaf elements (no child tags) are editable, so saving back to
  // the file is a safe, unambiguous text swap.
  function editableEls() {
    return Array.prototype.slice
      .call(activeSlide().querySelectorAll("h1,h2,h3,p,li,.kicker,.figure,.label,.index"))
      .filter(function (el) { return el.children.length === 0 && el.textContent.trim().length; });
  }

  function toggleEdit() { editing ? exitEdit() : enterEdit(); }

  function enterEdit() {
    editing = true;
    document.body.classList.add("review-editing");
    editBtn.classList.add("on");
    editBtn.textContent = "Editing — done";
    editableEls().forEach(function (el) {
      el.setAttribute("contenteditable", "true");
      el.dataset.rvOld = el.textContent;
      el.addEventListener("blur", saveEdit);
    });
    toast("Edit mode — click text to fix it, click away to save");
  }

  function exitEdit() {
    editing = false;
    document.body.classList.remove("review-editing");
    editBtn.classList.remove("on");
    editBtn.textContent = "Edit mode";
    editableEls().forEach(function (el) {
      el.removeAttribute("contenteditable");
      el.removeEventListener("blur", saveEdit);
    });
  }

  function saveEdit(e) {
    var el = e.target;
    var oldText = el.dataset.rvOld;
    var newText = el.textContent;
    if (oldText === undefined || newText === oldText) return;
    var slide = activeSlide();
    postJSON("/__review/edit", {
      slidePath: location.pathname,
      slideIndex: activeIndex(),
      editId: editId(slide, el),
      oldText: oldText,
      newText: newText,
    }).then(function (res) {
      if (res.ok && res.data && res.data.applied) { el.dataset.rvOld = newText; toast("Saved ✓"); refreshSent(); }
      else {
        // Couldn't apply cleanly (duplicate text) — hand it to the agent as a comment.
        el.textContent = oldText;
        postJSON("/__review/comment", {
          slidePath: location.pathname, slideIndex: activeIndex(), slideTitle: slideTitle(slide),
          comment: 'Change the text "' + oldText + '" to "' + newText + '".',
        }).then(function () { toast("Sent as a comment for the agent"); refreshSent(); });
      }
    });
  }

  function editId(slide, el) {
    var tag = el.tagName.toLowerCase();
    var same = slide.getElementsByTagName(tag), nth = 0;
    for (var i = 0; i < same.length; i++) if (same[i] === el) { nth = i; break; }
    return "slide" + activeIndex() + "-" + tag + "-" + nth;
  }

  // ---- misc ---------------------------------------------------------
  function toast(msg) {
    var t = document.createElement("div");
    t.className = "rv-toast";
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add("show"); });
    setTimeout(function () { t.classList.remove("show"); setTimeout(function () { t.remove(); }, 300); }, 2200);
  }
  function escapeHTML(s) { var d = document.createElement("div"); d.textContent = s; return d.innerHTML; }

  function injectStyles() {
    var css = document.createElement("style");
    css.textContent =
      "#review-panel{position:fixed;bottom:18px;right:18px;width:320px;max-width:calc(100vw - 36px);" +
      "background:#1f2429;color:#e7e2da;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,.35);" +
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;z-index:9999;overflow:hidden}" +
      "#review-panel .rv-head{display:flex;align-items:center;gap:8px;padding:12px 14px;font-weight:600;" +
      "background:#171b1f;cursor:default}" +
      "#review-panel .rv-dot{width:8px;height:8px;border-radius:50%;background:#6fcf97;box-shadow:0 0 8px #6fcf97}" +
      "#review-panel .rv-min{margin-left:auto;background:none;border:none;color:#9aa0a6;font-size:20px;line-height:1;cursor:pointer;padding:0 4px}" +
      "#review-panel.rv-collapsed .rv-body{display:none}" +
      "#review-panel .rv-body{padding:12px 14px;display:flex;flex-direction:column;gap:10px}" +
      "#review-panel .rv-text{width:100%;resize:vertical;background:#2a3036;color:#e7e2da;border:1px solid #3a424a;" +
      "border-radius:8px;padding:8px 10px;font:inherit;box-sizing:border-box}" +
      "#review-panel .rv-row{display:flex;gap:8px}" +
      "#review-panel button.rv-send,#review-panel button.rv-edit{flex:1;border:none;border-radius:8px;padding:9px 10px;" +
      "font:inherit;font-weight:600;cursor:pointer}" +
      "#review-panel .rv-send{background:#7b2e39;color:#fff}" +
      "#review-panel .rv-edit{background:#2a3036;color:#cdd2d6;border:1px solid #3a424a}" +
      "#review-panel .rv-edit.on{background:#6fcf97;color:#16331f;border-color:#6fcf97}" +
      "#review-panel .rv-sent-title{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#7e858c;margin-top:2px}" +
      "#review-panel .rv-sent{list-style:none;margin:0;padding:0;max-height:170px;overflow:auto;display:flex;flex-direction:column;gap:6px}" +
      "#review-panel .rv-sent li{font-size:12.5px;line-height:1.4;color:#c4c9ce;background:#23282d;border-radius:6px;padding:6px 8px}" +
      "#review-panel .rv-empty{color:#6b7177;background:none!important;padding-left:0!important}" +
      "#review-panel .rv-badge{display:inline-block;font-size:10px;font-weight:700;padding:1px 6px;border-radius:99px;margin-right:6px;vertical-align:middle}" +
      "#review-panel .rv-pending .rv-badge{background:#4a3a12;color:#f0c453}" +
      "#review-panel .rv-done .rv-badge{background:#16331f;color:#6fcf97}" +
      "#review-panel .rv-hint{font-size:11.5px;line-height:1.5;color:#8a9097}" +
      "#review-panel .rv-hint code{background:#2a3036;padding:1px 5px;border-radius:4px}" +
      "body.review-editing [contenteditable]{outline:2px dashed #7b2e39;outline-offset:3px;border-radius:3px;cursor:text}" +
      ".rv-toast{position:fixed;bottom:18px;left:50%;transform:translateX(-50%) translateY(12px);background:#1f2429;color:#e7e2da;" +
      "padding:10px 18px;border-radius:999px;font-family:-apple-system,sans-serif;font-size:13.5px;font-weight:500;" +
      "box-shadow:0 8px 28px rgba(0,0,0,.35);opacity:0;transition:all .28s ease;z-index:10000;pointer-events:none}" +
      ".rv-toast.show{opacity:1;transform:translateX(-50%) translateY(0)}";
    document.head.appendChild(css);
  }
})();
