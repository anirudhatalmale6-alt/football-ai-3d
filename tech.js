/* THE HARDWARE PANEL.
 *
 * AI2ORBIT Co. (c) 2026.
 *
 * One panel, shared by every page, with a switch on screen to turn it
 * off. It answers the question "what is this machine, and what is this
 * page costing it" - the frame rate, the delays between frames and the
 * ratios between those delays, the memory, the colours the screen can
 * show, the GPU, the cores, the link.
 *
 * *** EVERY LINE SAYS WHERE ITS NUMBER CAME FROM, AND THERE ARE
 *     THREE ANSWERS, NOT ONE. ***
 *
 *   MEASURED  counted or timed here, on this machine, just now.
 *   READ      the browser was asked and this is what it said. It may
 *             be rounded, it may be a lie told for privacy, and it is
 *             not a measurement.
 *   CANNOT    a web page has no way to know this. Saying so is the
 *             whole point of the line - an empty space invites
 *             somebody to assume, and a plausible invented figure is
 *             worse than a gap.
 *
 * That last one is why there is no DDR speed, no DDR type and no true
 * process CPU figure here. A browser cannot see any of them. What CAN
 * be measured is how much of one core this page's own code is using,
 * and that is what the CPU line reports - it says so on its face.
 */
(function (root, doc) {
  "use strict";

  var HZ_LADDER = [
    ["16", 4], ["256", 8], ["512", 9], ["1024", 10],
    ["65 536", 16], ["16.7 M", 24], ["1.07 B", 30]
  ];

  var S = {
    on: false,
    renderer: null,
    gaps: [],            // frame gaps in ms, most recent first
    busy: 0,             // ms spent inside our own code this second
    busyAcc: 0,
    last: 0,
    sec: 0,
    fps: 0,
    cpu: 0,
    el: null,
    body: null,
    btn: null
  };

  function q(n, d) { return (n === undefined || n === null) ? d : n; }

  /* ---------------------------------------------------- what we can read */
  function gpuName() {
    try {
      var c = doc.createElement("canvas");
      var gl = c.getContext("webgl2") || c.getContext("webgl");
      if (!gl) return null;
      var e = gl.getExtension("WEBGL_debug_renderer_info");
      if (!e) return gl.getParameter(gl.RENDERER) || null;
      return gl.getParameter(e.UNMASKED_RENDERER_WEBGL) || null;
    } catch (err) { return null; }
  }

  /* The colours the drawing surface actually carries, per channel, read
   * out of the live WebGL context rather than assumed from the screen.
   * A screen that reports 24 bit and a framebuffer that carries 5-6-5
   * are different facts and the panel shows both. */
  function channelBits() {
    try {
      var c = doc.createElement("canvas");
      var gl = c.getContext("webgl2") || c.getContext("webgl");
      if (!gl) return null;
      return {
        r: gl.getParameter(gl.RED_BITS),
        g: gl.getParameter(gl.GREEN_BITS),
        b: gl.getParameter(gl.BLUE_BITS),
        a: gl.getParameter(gl.ALPHA_BITS),
        d: gl.getParameter(gl.DEPTH_BITS)
      };
    } catch (err) { return null; }
  }

  var GPU = gpuName(), BITS = channelBits();

  function colourLadder(totalBits) {
    var out = [];
    for (var i = 0; i < HZ_LADDER.length; i++) {
      var name = HZ_LADDER[i][0], bits = HZ_LADDER[i][1];
      var mark = (bits === totalBits) ? "&#9632;" : "&middot;";
      var cls = (bits === totalBits) ? "hit" : "";
      out.push('<span class="' + cls + '">' + mark + " " + name + "</span>");
    }
    return out.join("");
  }

  /* -------------------------------------------------------- the readings */
  function percentiles(g) {
    if (g.length < 3) return null;
    var s = g.slice().sort(function (a, b) { return a - b; });
    return {
      best: s[0],
      mid: s[Math.floor(s.length / 2)],
      worst: s[s.length - 1],
      n: s.length
    };
  }

  function rows() {
    var out = [];
    function row(k, v, how) {
      out.push('<div class="r"><span class="k">' + k + '</span>' +
               '<span class="v">' + v + '</span>' +
               '<span class="t ' + how.toLowerCase() + '">' + how +
               '</span></div>');
    }

    /* ---- what this page is doing */
    var p = percentiles(S.gaps);
    row("FPS", S.fps ? S.fps.toFixed(0) : "&mdash;", "MEASURED");
    if (p) {
      row("frame delay", p.mid.toFixed(1) + " ms usual", "MEASURED");
      row("\u00a0\u00a0best / worst",
          p.best.toFixed(1) + " / " + p.worst.toFixed(1) + " ms", "MEASURED");
      /* THE RATIOS. A worst frame three times the usual one is a stutter
       * a person sees; the same worst frame beside a bad usual one is
       * just a slow page. The ratio separates them, which is why it is
       * here and not left for the reader to divide. */
      row("\u00a0\u00a0worst : usual",
          (p.worst / p.mid).toFixed(2) + " : 1", "MEASURED");
      row("\u00a0\u00a0usual : best",
          (p.mid / p.best).toFixed(2) + " : 1", "MEASURED");
    }
    row("CPU, one core",
        S.cpu.toFixed(1) + " %", "MEASURED");
    out.push('<div class="foot">CPU is the share of a single core spent '
           + 'inside this page\'s own code. A browser cannot see the whole '
           + 'machine\'s load.</div>');

    /* ---- memory */
    var m = root.performance && root.performance.memory;
    if (m) {
      row("RAM, this page",
          Math.round(m.usedJSHeapSize / 1024).toLocaleString() + " kB",
          "MEASURED");
      row("\u00a0\u00a0reserved",
          Math.round(m.totalJSHeapSize / 1024).toLocaleString() + " kB",
          "MEASURED");
    } else {
      row("RAM, this page", "this browser does not report it", "CANNOT");
    }
    if (navigator.deviceMemory) {
      row("RAM, machine", navigator.deviceMemory + " GB", "READ");
      out.push('<div class="foot">Rounded down to a power of two by the '
             + 'browser on purpose, and capped at 8.</div>');
    } else {
      row("RAM, machine", "not offered by this browser", "CANNOT");
    }
    row("DDR type and speed", "no web page can see this", "CANNOT");

    /* ---- the drawing */
    if (S.renderer && S.renderer.info) {
      var i = S.renderer.info;
      row("draw calls", i.render.calls.toLocaleString(), "MEASURED");
      row("triangles", i.render.triangles.toLocaleString(), "MEASURED");
      row("geometries", i.memory.geometries.toLocaleString(), "MEASURED");
      row("textures", i.memory.textures.toLocaleString(), "MEASURED");
      if (i.programs) {
        row("shader programs", i.programs.length, "MEASURED");
      }
    }
    row("GPU", GPU || "the browser will not say", GPU ? "READ" : "CANNOT");
    row("cores", q(navigator.hardwareConcurrency, "&mdash;"),
        navigator.hardwareConcurrency ? "READ" : "CANNOT");

    /* ---- the screen */
    row("screen", screen.width + " x " + screen.height + " points", "READ");
    row("\u00a0\u00a0this window",
        innerWidth + " x " + innerHeight + " at " +
        (root.devicePixelRatio || 1).toFixed(2) + "x", "READ");
    row("\u00a0\u00a0real pixels",
        Math.round(innerWidth * (root.devicePixelRatio || 1)) + " x " +
        Math.round(innerHeight * (root.devicePixelRatio || 1)), "MEASURED");
    row("colour depth", screen.colorDepth + " bit", "READ");
    if (BITS) {
      row("\u00a0\u00a0drawing surface",
          BITS.r + "-" + BITS.g + "-" + BITS.b +
          (BITS.a ? "-" + BITS.a : "") + " bits, depth " + BITS.d, "READ");
      out.push('<div class="ladder">' +
               colourLadder(BITS.r + BITS.g + BITS.b) + '</div>');
    }

    /* ---- the link */
    var c = navigator.connection;
    if (c) {
      row("link", (c.effectiveType || "?") + ", " +
          q(c.downlink, "?") + " Mbit/s down, " +
          q(c.rtt, "?") + " ms", "READ");
      out.push('<div class="foot">The browser\'s own estimate from recent '
             + 'traffic, not a speed test.</div>');
    } else {
      row("link", "not offered by this browser", "CANNOT");
    }

    return out.join("");
  }

  /* ------------------------------------------------------------ the panel */
  var CSS =
    "#techbtn{position:fixed;right:8px;bottom:8px;z-index:99998;" +
    "font:700 10px/1 ui-sans-serif,system-ui,sans-serif;letter-spacing:2px;" +
    "padding:9px 12px;border:1px solid #2b6ea8;border-radius:5px;" +
    "background:rgba(8,14,22,.88);color:#8fd0ff;cursor:pointer;" +
    "-webkit-tap-highlight-color:transparent}" +
    "#techbtn.on{background:#12507f;color:#eaf6ff;border-color:#4ea8ea}" +
    "#techpan{position:fixed;right:8px;bottom:46px;z-index:99999;" +
    "width:296px;max-width:calc(100vw - 16px);max-height:62vh;" +
    "overflow-y:auto;overflow-x:hidden;" +
    "background:rgba(6,11,18,.95);border:1px solid #21405c;border-radius:6px;" +
    "padding:10px 11px;color:#cfe3f5;display:none;" +
    "font:11px/1.4 ui-monospace,'DejaVu Sans Mono',Consolas,monospace}" +
    "#techpan.show{display:block}" +
    "#techpan h4{margin:0 0 7px;font:700 10px/1 ui-sans-serif,sans-serif;" +
    "letter-spacing:2.5px;color:#7fc4ff}" +
    /* EVERY ROW IS A FLEX LINE AND EVERY PART OF IT MAY WRAP.
       This was a table with nowrap cells: on a phone the value and the
       tag were pushed off the right hand edge, so the panel showed a
       column of labels and not one number. Nothing here has a fixed
       width except the tag. */
    "#techpan .r{display:flex;align-items:baseline;gap:6px;padding:1px 0;" +
    "flex-wrap:nowrap}" +
    "#techpan .k{color:#8ea9c2;flex:1 1 92px;min-width:0}" +
    "#techpan .v{color:#eaf4ff;flex:1 1 auto;text-align:right;" +
    "word-break:break-word;min-width:0}" +
    "#techpan .t{flex:0 0 54px;text-align:right;font-size:8px;" +
    "letter-spacing:.8px}" +
    "#techpan .t.measured{color:#3fd18a}" +
    "#techpan .t.read{color:#d8a53f}" +
    "#techpan .t.cannot{color:#e0645f}" +
    "#techpan .foot{color:#6d8399;font-size:9.5px;line-height:1.35;" +
    "padding:1px 0 6px}" +
    "#techpan .ladder{padding:3px 0 7px}" +
    "#techpan .ladder span{display:inline-block;margin-right:8px;" +
    "color:#63809a;font-size:9.5px}" +
    "#techpan .ladder span.hit{color:#3fd18a;font-weight:700}";

  function build() {
    var st = doc.createElement("style");
    st.textContent = CSS;
    doc.head.appendChild(st);

    S.btn = doc.createElement("button");
    S.btn.id = "techbtn";
    S.btn.type = "button";
    S.btn.textContent = "TECH";
    doc.body.appendChild(S.btn);

    S.el = doc.createElement("div");
    S.el.id = "techpan";
    S.el.innerHTML = '<h4>THIS MACHINE</h4><div id="techrows"></div>';
    doc.body.appendChild(S.el);
    S.body = doc.getElementById("techrows");

    S.btn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      set(!S.on);
    });
    /* A key as well as the button, because on a desktop the button sits
     * over the bottom right corner of the pitch. */
    doc.addEventListener("keydown", function (e) {
      if (e.key === "t" || e.key === "T") set(!S.on);
    });

    /* The switch remembers, so turning it off stays off through a
     * refresh rather than coming back every time. */
    try {
      set(localStorage.getItem("ai2.tech") === "1");
    } catch (err) { set(false); }
  }

  function set(on) {
    S.on = !!on;
    S.el.classList.toggle("show", S.on);
    S.btn.classList.toggle("on", S.on);
    try { localStorage.setItem("ai2.tech", S.on ? "1" : "0"); } catch (e) {}
    if (S.on) paint();
  }

  var paintT = 0;
  function paint() { S.body.innerHTML = rows(); }

  /* ------------------------------------------------------------- the loop
   * A frame callback of its own, so a page that does not call anything
   * still gets a frame rate, and so the panel cannot be starved by the
   * page forgetting to tick it. */
  function tick(now) {
    root.requestAnimationFrame(tick);
    if (S.last) {
      var gap = now - S.last;
      S.gaps.push(gap);
      if (S.gaps.length > 180) S.gaps.shift();
      S.sec += gap;
      S.fpsN = (S.fpsN || 0) + 1;
      if (S.sec >= 1000) {
        S.fps = S.fpsN * 1000 / S.sec;
        /* CPU: the share of the second that went into our own code, as
         * marked by mark()/done() below. Without those marks it stays
         * at zero rather than guessing. */
        S.cpu = Math.min(100, S.busyAcc / S.sec * 100);
        S.sec = 0; S.fpsN = 0; S.busyAcc = 0;
      }
    }
    S.last = now;
    if (S.on) {
      paintT += 1;
      if (paintT >= 15) { paintT = 0; paint(); }   // four times a second
    }
  }

  root.TECH = {
    /* The page hands over its renderer so the draw call and triangle
     * counts are the real ones from the engine, not a guess. */
    watch: function (renderer) { S.renderer = renderer; },
    /* Wrap the page's own per frame work in these two and the CPU line
     * becomes a measurement instead of an empty row. */
    mark: function () { S.busy = performance.now(); },
    done: function () {
      if (S.busy) { S.busyAcc += performance.now() - S.busy; S.busy = 0; }
    },
    show: function (on) { set(on); },
    /* For the checks: the same numbers the panel is showing. */
    read: function () {
      var p = percentiles(S.gaps);
      return { fps: S.fps, cpu: S.cpu, gaps: p, gpu: GPU, bits: BITS,
               calls: S.renderer ? S.renderer.info.render.calls : null,
               tris: S.renderer ? S.renderer.info.render.triangles : null,
               geoms: S.renderer ? S.renderer.info.memory.geometries : null,
               heapKB: (root.performance && root.performance.memory)
                       ? Math.round(performance.memory.usedJSHeapSize / 1024)
                       : null };
    }
  };

  if (doc.readyState === "loading") {
    doc.addEventListener("DOMContentLoaded", build);
  } else {
    build();
  }
  root.requestAnimationFrame(tick);
})(window, document);
