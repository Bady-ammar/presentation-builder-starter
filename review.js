/* ============================================================
   review.js — the review + edit overlay.

   This is the supervise step: you look at what the agent built,
   leave comments, and fix small things inline. Comments and edits
   are written to `review.jsonl` next to the deck, where your agent
   reads them and acts.

   It only wakes up when the deck is served by `review.py` on
   localhost. Opened as a plain file (presenting) or on a normal web
   host, it stays completely dormant — no button, no panel, no traces.
   So you present and share the same deck.html with nothing extra on it.

   Run the review server from the repo root:
       python3 review.py
   then open the printed http://localhost:8000/... URL.

   Controls (match the rest of the deck):
     R              toggle the review panel
     E              toggle edit mode (fix text inline)
     Esc            close the panel / leave edit mode
     Ctrl/Cmd+Enter send the comment you're typing
   The floating pencil button (top-right) does the same as R, and
   disappears in fullscreen so it never shows while you present.
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

  var btn, panel, textarea, sentList, slideInfo, sendBtn, editBtn, badge, open = false, editing = false;
  var attachBtn, hoverEl = null, attachedInfo = null;

  // Elements you can pin a comment to. Hovering one (with the panel open)
  // pops an "Attach" button; clicking it ties your next comment to that
  // exact element so the agent changes the right thing.
  var ATTACH_SEL = "h1,h2,h3,h4,h5,h6,p,li,blockquote,code,figure,svg,ul,ol,table," +
    ".kicker,.figure,.label,.index,.metric,.cols,.bullets,.steps,.chart-bars,.bar-wrap," +
    ".chart-note,.t-hero,.t-xl,.t-lg,.t-md,.divider";

  function init() {
    injectStyles();
    buildButton();
    buildPanel();
    bindKeys();
    refreshSent();
    refreshStatus();
    setInterval(refreshSent, 4000);
    setInterval(refreshStatus, 4000);
  }

  // ---- watcher status pill -----------------------------------------
  // Polls the server's /__review/health, which reports how long ago the
  // watcher (watch.py) last checked in. Mirrors the course tool's pill so
  // you can see whether your agent is listening live.
  function refreshStatus() {
    var pill = panel && panel.querySelector(".rv-status");
    if (!pill) return;
    fetch("/__review/health")
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        pill.className = "rv-status";
        if (!j || !j.ok) {
          pill.classList.add("offline"); pill.textContent = "⚠ server down";
          pill.title = "Can't reach review.py."; return;
        }
        var L = j.listener || {};
        var age = L.last_seen_seconds_ago;
        if (age === null || age === undefined) {
          pill.classList.add("offline");
          pill.textContent = "⚠ no watcher";
          pill.title = "Comments are saved, but no watcher is running — your agent isn't listening live. Start one with: python3 watch.py";
        } else if (age < 45) {
          pill.classList.add("live");
          pill.textContent = "● watcher live";
          pill.title = "Heartbeat " + Math.round(age) + "s ago. Comments stream to your agent as you send them.";
        } else if (age < 300) {
          pill.classList.add("stale");
          pill.textContent = "⚠ watcher stale";
          pill.title = "Watcher went quiet " + Math.round(age) + "s ago — it may have stopped.";
        } else {
          pill.classList.add("offline");
          pill.textContent = "⚠ no watcher";
          pill.title = "Last heartbeat " + Math.round(age) + "s ago — treat as stopped.";
        }
      })
      .catch(function () {
        pill.className = "rv-status offline";
        pill.textContent = "⚠ server down";
      });
  }

  // ---- floating toggle button --------------------------------------
  function buildButton() {
    btn = document.createElement("button");
    btn.className = "rv-toggle-btn";
    btn.title = "Toggle review (R)";
    btn.innerHTML = '<span class="rv-toggle-icon">&#9998;</span><span class="rv-badge" style="display:none">0</span>';
    btn.addEventListener("click", toggle);
    badge = btn.querySelector(".rv-badge");
    document.body.appendChild(btn);
  }

  // ---- panel --------------------------------------------------------
  function buildPanel() {
    panel = document.createElement("div");
    panel.id = "review-panel";
    panel.innerHTML =
      '<div class="rv-head">' +
        '<h3>Review</h3>' +
        '<span class="rv-status unknown" title="Watcher status">checking…</span>' +
        '<button class="rv-close" title="Close (Esc)">&times;</button>' +
      "</div>" +
      '<div class="rv-body">' +
        '<div class="rv-slide-info"></div>' +
        '<textarea class="rv-text" rows="3" placeholder="Comment on this slide… (what to change and why)"></textarea>' +
        '<div class="rv-row">' +
          '<button class="rv-send">Send to agent</button>' +
          '<button class="rv-edit" title="Edit text directly (E)">Edit mode</button>' +
        "</div>" +
        '<div class="rv-send-hint">Ctrl+Enter to send</div>' +
        '<div class="rv-sent-title">Sent for this deck</div>' +
        '<ul class="rv-sent"></ul>' +
        '<div class="rv-hint">Hover any element and click <strong>📌 Attach</strong> to pin a comment to it. ' +
          'Comments &amp; edits → <code>review.jsonl</code>; then tell your agent: <em>“apply my review.”</em><br>' +
          '<kbd>R</kbd> toggle · <kbd>E</kbd> edit · <kbd>Esc</kbd> close</div>' +
      "</div>";
    document.body.appendChild(panel);

    textarea = panel.querySelector(".rv-text");
    sentList = panel.querySelector(".rv-sent");
    slideInfo = panel.querySelector(".rv-slide-info");
    sendBtn = panel.querySelector(".rv-send");
    editBtn = panel.querySelector(".rv-edit");

    sendBtn.addEventListener("click", sendComment);
    editBtn.addEventListener("click", toggleEdit);
    panel.querySelector(".rv-close").addEventListener("click", close);

    // Ctrl/Cmd+Enter sends; Esc closes. Stop these keys from reaching the
    // deck so typing a comment never advances slides.
    textarea.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendComment(); }
      if (e.key === "Escape") { e.preventDefault(); close(); }
      // Backspace in an empty box pops the attached-element chip.
      if (e.key === "Backspace" && textarea.value === "" && attachedInfo) { e.preventDefault(); clearAttachment(); }
      e.stopPropagation();
    });
    textarea.addEventListener("keyup", function (e) { e.stopPropagation(); });
  }

  function bindKeys() {
    document.addEventListener("keydown", function (e) {
      // Esc leaves edit mode even while a field is focused.
      if (e.key === "Escape" && editing) { e.preventDefault(); if (e.target.blur) e.target.blur(); exitEdit(); return; }
      // Don't hijack keys while typing in a field or editing slide text.
      if (e.target.isContentEditable || /^(input|textarea)$/i.test(e.target.tagName)) return;
      if ((e.key === "r" || e.key === "R") && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); toggle(); }
      if ((e.key === "e" || e.key === "E") && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); toggleEdit(); }
      if (e.key === "Escape" && open) { e.preventDefault(); close(); }
    });
  }

  // ---- open / close -------------------------------------------------
  function toggle() { open ? close() : openPanel(); }

  function openPanel() {
    open = true;
    panel.classList.add("open");
    btn.classList.add("active");
    document.body.classList.add("rv-panel-open");
    updateSlideInfo();
    installAttachUI();
    setTimeout(function () { textarea.focus(); }, 280);
  }

  function close() {
    if (editing) exitEdit();
    uninstallAttachUI();
    clearAttachment();
    // Release focus so the deck's nav keys fire again.
    if (document.activeElement && panel.contains(document.activeElement) && document.activeElement.blur) {
      document.activeElement.blur();
    }
    open = false;
    panel.classList.remove("open");
    btn.classList.remove("active");
    document.body.classList.remove("rv-panel-open");
  }

  function updateSlideInfo() {
    var s = activeSlide();
    var title = slideTitle(s) || "(No title)";
    slideInfo.textContent = "Slide " + (activeIndex() + 1) + " of " + slides().length + " — " + title;
  }

  // ---- comments -----------------------------------------------------
  function sendComment() {
    var text = textarea.value.trim();
    if (!text) { textarea.focus(); return; }
    var slide = activeSlide();
    var payload = {
      slidePath: location.pathname,
      slideIndex: activeIndex(),
      slideTitle: slideTitle(slide),
      comment: text,
    };
    if (attachedInfo) {
      payload.elementId = attachedInfo.id;
      payload.elementTag = attachedInfo.tag;
      payload.elementClasses = attachedInfo.classes;
      payload.elementSnippet = attachedInfo.snippet;
    }
    sendBtn.disabled = true;
    postJSON("/__review/comment", payload).then(function (res) {
      sendBtn.disabled = false;
      if (res.ok) {
        textarea.value = "";
        textarea.blur();
        clearAttachment();
        toast("Sent to agent ✓");
        refreshSent();
      } else toast("Couldn't send — is review.py running?");
    });
  }

  function refreshSent() {
    fetch("/__review/comments?path=" + encodeURIComponent(location.pathname))
      .then(function (r) { return r.ok ? r.json() : { items: [] }; })
      .then(function (j) {
        var items = (j && j.items) || [];
        var pending = items.filter(function (it) { return it.status !== "done"; }).length;
        if (pending > 0) { badge.textContent = pending; badge.style.display = ""; }
        else badge.style.display = "none";
        if (!items.length) { sentList.innerHTML = '<li class="rv-empty">Nothing yet.</li>'; return; }
        sentList.innerHTML = items.slice(-8).reverse().map(function (it) {
          var done = it.status === "done";
          var label = it.type === "edit"
            ? "✎ edit · slide " + ((it.slideIndex | 0) + 1)
            : "“" + (it.comment || "").slice(0, 60) + (it.comment && it.comment.length > 60 ? "…" : "") + "”";
          return '<li class="' + (done ? "rv-done" : "rv-pending") + '">' +
                   '<span class="rv-badge-pill">' + (done ? "done ✓" : "pending") + "</span> " +
                   escapeHTML(label) + "</li>";
        }).join("");
      }).catch(function () {});
  }

  // ---- attach an element to a comment ------------------------------
  // Hover any element on the slide (panel open) → an "Attach" button pops
  // at its corner. Click it and your next comment is pinned to that exact
  // element, so the agent edits the right thing instead of guessing.
  function installAttachUI() {
    if (!attachBtn) {
      attachBtn = document.createElement("button");
      attachBtn.className = "rv-attach-btn";
      attachBtn.type = "button";
      attachBtn.innerHTML = "📌 Attach";
      attachBtn.addEventListener("click", onAttachClick, true);
      document.body.appendChild(attachBtn);
    }
    document.addEventListener("mouseover", onHover, true);
    window.addEventListener("scroll", positionAttachBtn, true);
    window.addEventListener("resize", positionAttachBtn);
  }

  function uninstallAttachUI() {
    document.removeEventListener("mouseover", onHover, true);
    window.removeEventListener("scroll", positionAttachBtn, true);
    window.removeEventListener("resize", positionAttachBtn);
    if (hoverEl) { hoverEl.classList.remove("rv-hover-target"); hoverEl = null; }
    if (attachBtn) attachBtn.classList.remove("visible");
  }

  function onHover(e) {
    // Keep the current target while the cursor is on the Attach button itself.
    if (attachBtn && (e.target === attachBtn || attachBtn.contains(e.target))) return;
    var slide = activeSlide();
    var target = e.target.closest ? e.target.closest(ATTACH_SEL) : null;
    // Only elements inside the active slide are attachable (not the panel).
    if (target && !slide.contains(target)) target = null;
    if (target === hoverEl) return;
    if (hoverEl) hoverEl.classList.remove("rv-hover-target");
    hoverEl = target;
    if (target) { target.classList.add("rv-hover-target"); positionAttachBtn(); }
    else if (attachBtn) attachBtn.classList.remove("visible");
  }

  function positionAttachBtn() {
    if (!attachBtn || !hoverEl) return;
    var r = hoverEl.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) { attachBtn.classList.remove("visible"); return; }
    var isRtl = getComputedStyle(hoverEl).direction === "rtl";
    attachBtn.style.top = Math.max(4, r.top - 30) + "px";
    if (isRtl) { attachBtn.style.right = (window.innerWidth - r.right) + "px"; attachBtn.style.left = "auto"; }
    else { attachBtn.style.left = r.left + "px"; attachBtn.style.right = "auto"; }
    attachBtn.classList.add("visible");
  }

  function onAttachClick(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!hoverEl) return;
    setAttachment(hoverEl);
    if (!open) openPanel();
    textarea.focus();
  }

  function setAttachment(el) {
    var classes = (el.className || "").toString().trim().split(/\s+/)
      .filter(function (c) { return c && c.indexOf("rv-") !== 0; }).join(" ");
    var text = (el.textContent || "").trim().replace(/\s+/g, " ");
    attachedInfo = {
      id: editId(activeSlide(), el),
      tag: el.tagName.toLowerCase(),
      classes: classes,
      snippet: text.slice(0, 200),
    };
    renderChip();
    textarea.placeholder = "Comment on this element… (what to change and why)";
  }

  function clearAttachment() {
    attachedInfo = null;
    var chip = panel.querySelector(".rv-attached-chip");
    if (chip) chip.remove();
    if (textarea) textarea.placeholder = "Comment on this slide… (what to change and why)";
  }

  function renderChip() {
    if (!attachedInfo) return;
    var primary = attachedInfo.classes.split(/\s+/).filter(Boolean)[0] || "";
    var label = attachedInfo.tag + (primary ? "." + primary : "");
    var snip = attachedInfo.snippet.length > 56 ? attachedInfo.snippet.slice(0, 56) + "…" : attachedInfo.snippet;
    var chip = panel.querySelector(".rv-attached-chip");
    if (!chip) {
      chip = document.createElement("div");
      chip.className = "rv-attached-chip";
      textarea.parentNode.insertBefore(chip, textarea);
    }
    chip.innerHTML = "";
    var tagEl = document.createElement("span");
    tagEl.className = "rv-chip-tag"; tagEl.textContent = "📌 " + label;
    var snipEl = document.createElement("span");
    snipEl.className = "rv-chip-snippet"; snipEl.textContent = snip;
    var x = document.createElement("button");
    x.type = "button"; x.className = "rv-chip-x"; x.title = "Remove attachment"; x.textContent = "✕";
    x.addEventListener("click", clearAttachment);
    chip.appendChild(tagEl); chip.appendChild(snipEl); chip.appendChild(x);
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
    if (!open) openPanel();
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
      // Floating toggle button — mirrors the course tool: round, top-right,
      // and hidden in fullscreen so it never shows while presenting.
      ".rv-toggle-btn{position:fixed;top:16px;right:16px;z-index:2002;width:44px;height:44px;border-radius:50%;" +
      "border:2px solid var(--accent,#7b2e39);background:rgba(255,255,255,.85);backdrop-filter:blur(8px);" +
      "-webkit-backdrop-filter:blur(8px);cursor:pointer;display:flex;align-items:center;justify-content:center;" +
      "box-shadow:0 2px 10px rgba(0,0,0,.12);transition:all .2s ease}" +
      ".rv-toggle-btn:hover{box-shadow:0 4px 15px rgba(0,0,0,.22)}" +
      ".rv-toggle-btn.active{background:var(--accent,#7b2e39)}" +
      ".rv-toggle-btn.active .rv-toggle-icon{color:#fff}" +
      ".rv-toggle-icon{font-size:1.25em;line-height:1;color:var(--accent,#7b2e39)}" +
      ".rv-toggle-btn .rv-badge{position:absolute;top:-4px;right:-4px;min-width:20px;height:20px;padding:0 5px;" +
      "background:#ef4444;color:#fff;font-size:.7em;font-weight:700;border-radius:10px;display:flex;align-items:center;" +
      "justify-content:center;line-height:1}" +
      // Slide-in panel from the right edge.
      "#review-panel{position:fixed;top:0;right:-360px;width:340px;height:100vh;z-index:2001;" +
      "background:rgba(31,36,41,.98);color:#e7e2da;box-shadow:-4px 0 20px rgba(0,0,0,.35);display:flex;" +
      "flex-direction:column;transition:right .3s cubic-bezier(.4,0,.2,1);direction:ltr;" +
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px}" +
      "#review-panel.open{right:0}" +
      // Push the deck off the panel rather than covering it (deck is fixed/inset:0).
      "#deck{transition:inset .3s cubic-bezier(.4,0,.2,1)}" +
      "body.rv-panel-open #deck{inset-inline-end:340px}" +
      "#review-panel .rv-head{display:flex;align-items:center;gap:8px;padding:14px 16px;background:#171b1f}" +
      "#review-panel .rv-head h3{margin:0;font-size:1.05em;font-weight:600}" +
      "#review-panel .rv-status{flex:1 1 auto;min-width:0;font-size:.72em;font-weight:600;letter-spacing:.3px;" +
      "padding:3px 9px;border-radius:999px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center}" +
      "#review-panel .rv-status.unknown{background:#2a3036;color:#9aa0a6}" +
      "#review-panel .rv-status.live{background:#16331f;color:#6fcf97}" +
      "#review-panel .rv-status.stale{background:#4a3a12;color:#f0c453}" +
      "#review-panel .rv-status.offline{background:#3a1f22;color:#f0928a}" +
      "#review-panel .rv-close{margin-left:auto;background:none;border:none;color:#9aa0a6;font-size:24px;line-height:1;cursor:pointer;padding:0 4px}" +
      "#review-panel .rv-body{padding:14px 16px;display:flex;flex-direction:column;gap:10px;overflow:auto}" +
      "#review-panel .rv-slide-info{font-size:12px;color:#9aa0a6;border-bottom:1px solid #2d343b;padding-bottom:8px}" +
      "#review-panel .rv-text{width:100%;resize:vertical;background:#2a3036;color:#e7e2da;border:1px solid #3a424a;" +
      "border-radius:8px;padding:8px 10px;font:inherit;box-sizing:border-box}" +
      "#review-panel .rv-row{display:flex;gap:8px}" +
      "#review-panel button.rv-send,#review-panel button.rv-edit{flex:1;border:none;border-radius:8px;padding:9px 10px;" +
      "font:inherit;font-weight:600;cursor:pointer}" +
      "#review-panel .rv-send{background:var(--accent,#7b2e39);color:#fff}" +
      "#review-panel .rv-send:disabled{opacity:.5;cursor:default}" +
      "#review-panel .rv-edit{background:#2a3036;color:#cdd2d6;border:1px solid #3a424a}" +
      "#review-panel .rv-edit.on{background:#6fcf97;color:#16331f;border-color:#6fcf97}" +
      "#review-panel .rv-send-hint{font-size:11px;color:#7e858c;margin-top:-4px}" +
      "#review-panel .rv-sent-title{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#7e858c;margin-top:4px}" +
      "#review-panel .rv-sent{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}" +
      "#review-panel .rv-sent li{font-size:12.5px;line-height:1.4;color:#c4c9ce;background:#23282d;border-radius:6px;padding:6px 8px}" +
      "#review-panel .rv-empty{color:#6b7177;background:none!important;padding-left:0!important}" +
      "#review-panel .rv-badge-pill{display:inline-block;font-size:10px;font-weight:700;padding:1px 6px;border-radius:99px;margin-right:6px;vertical-align:middle}" +
      "#review-panel .rv-pending .rv-badge-pill{background:#4a3a12;color:#f0c453}" +
      "#review-panel .rv-done .rv-badge-pill{background:#16331f;color:#6fcf97}" +
      "#review-panel .rv-hint{font-size:11.5px;line-height:1.6;color:#8a9097;margin-top:4px}" +
      "#review-panel .rv-hint code{background:#2a3036;padding:1px 5px;border-radius:4px}" +
      "#review-panel .rv-hint kbd{background:#2a3036;border:1px solid #3a424a;border-radius:4px;padding:0 5px;font:inherit;font-size:11px}" +
      "body.review-editing [contenteditable]{outline:2px dashed var(--accent,#7b2e39);outline-offset:3px;border-radius:3px;cursor:text}" +
      // Attach-an-element UI.
      ".rv-attach-btn{position:fixed;z-index:2003;display:none;align-items:center;gap:5px;padding:4px 10px;border:none;" +
      "border-radius:7px;background:var(--accent,#7b2e39);color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;" +
      "font-size:12px;font-weight:600;cursor:pointer;box-shadow:0 3px 12px rgba(0,0,0,.3)}" +
      ".rv-attach-btn.visible{display:flex}" +
      ".rv-hover-target{outline:2px dashed var(--accent,#7b2e39);outline-offset:3px;border-radius:3px}" +
      "#review-panel .rv-attached-chip{display:flex;align-items:center;gap:7px;background:#2a3036;border:1px solid #3a424a;" +
      "border-radius:8px;padding:6px 9px}" +
      "#review-panel .rv-chip-tag{font-weight:700;font-size:11.5px;color:#e7a3ad;white-space:nowrap}" +
      "#review-panel .rv-chip-snippet{flex:1 1 auto;min-width:0;font-size:11.5px;color:#9aa0a6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
      "#review-panel .rv-chip-x{background:none;border:none;color:#9aa0a6;font-size:14px;line-height:1;cursor:pointer;padding:0 2px}" +
      ".rv-toast{position:fixed;bottom:18px;left:50%;transform:translateX(-50%) translateY(12px);background:#1f2429;color:#e7e2da;" +
      "padding:10px 18px;border-radius:999px;font-family:-apple-system,sans-serif;font-size:13.5px;font-weight:500;" +
      "box-shadow:0 8px 28px rgba(0,0,0,.35);opacity:0;transition:all .28s ease;z-index:10000;pointer-events:none}" +
      ".rv-toast.show{opacity:1;transform:translateX(-50%) translateY(0)}" +
      // Hide every review chrome in fullscreen so a recording / presentation is clean.
      ":fullscreen .rv-toggle-btn,:fullscreen #review-panel,:fullscreen .rv-toast,:fullscreen .rv-attach-btn," +
      ":-webkit-full-screen .rv-toggle-btn,:-webkit-full-screen #review-panel,:-webkit-full-screen .rv-toast,:-webkit-full-screen .rv-attach-btn{display:none!important}";
    document.head.appendChild(css);
  }
})();
