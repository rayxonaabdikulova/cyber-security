(function () {
  "use strict";

  var DESKTOP_MQ = "(min-width: 901px)";
  var STORAGE_KEY = "cyberlab-sidebar-collapsed";

  var body = document.body;
  var toggle = document.getElementById("sidebar-toggle");
  var sidebar = document.getElementById("sidebar");
  var backdrop = document.getElementById("sidebar-backdrop");
  var links = document.querySelectorAll(".sidebar__link");
  var main = document.getElementById("main-content");
  var panels = document.querySelectorAll(".main > [data-panel-group]");

  var VALID_SECTION = {
    kirish: true,
    dpi: true,
    ids: true,
    ips: true,
    test: true,
  };

  function isDesktop() {
    return window.matchMedia(DESKTOP_MQ).matches;
  }

  function readCollapsedPreference() {
    try {
      return window.localStorage.getItem(STORAGE_KEY) === "1";
    } catch (e) {
      return false;
    }
  }

  function writeCollapsedPreference(collapsed) {
    try {
      window.localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
    } catch (e) {
      /* ignore */
    }
  }

  function setDesktopCollapsed(collapsed) {
    body.classList.toggle("sidebar-collapsed", collapsed);
    writeCollapsedPreference(collapsed);
    if (toggle) {
      toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
      toggle.setAttribute(
        "aria-label",
        collapsed ? "Yon panelni ochish" : "Yon panelni yopish"
      );
    }
  }

  function setMobileOpen(open) {
    body.classList.toggle("sidebar-open-mobile", open);
    if (backdrop) {
      backdrop.hidden = !open;
      backdrop.setAttribute("aria-hidden", open ? "false" : "true");
    }
    if (toggle) {
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.setAttribute(
        "aria-label",
        open ? "Yon panelni yopish" : "Yon panelni ochish"
      );
    }
  }

  function syncUiToViewport() {
    body.classList.remove("sidebar-open-mobile");
    if (backdrop) {
      backdrop.hidden = true;
      backdrop.setAttribute("aria-hidden", "true");
    }

    if (isDesktop()) {
      setDesktopCollapsed(readCollapsedPreference());
    } else {
      body.classList.remove("sidebar-collapsed");
      if (toggle) {
        toggle.setAttribute("aria-expanded", "false");
        toggle.setAttribute("aria-label", "Yon panelni ochish");
      }
    }
  }

  function onToggleClick() {
    if (isDesktop()) {
      setDesktopCollapsed(!body.classList.contains("sidebar-collapsed"));
    } else {
      setMobileOpen(!body.classList.contains("sidebar-open-mobile"));
    }
  }

  function closeMobileIfOpen() {
    if (!isDesktop() && body.classList.contains("sidebar-open-mobile")) {
      setMobileOpen(false);
    }
  }

  function normalizeSection(raw) {
    if (!raw || raw.length === 0) {
      return "kirish";
    }
    if (raw === "ids-ips-taqqoslash") {
      return "ips";
    }
    return VALID_SECTION[raw] ? raw : "kirish";
  }

  function getSectionFromHash() {
    return normalizeSection(window.location.hash.replace(/^#/, ""));
  }

  function isKnownHashFragment(raw) {
    if (!raw) {
      return false;
    }
    if (raw === "ids-ips-taqqoslash") {
      return true;
    }
    return !!VALID_SECTION[raw];
  }

  function applyRoute(section) {
    section = normalizeSection(section);
    links.forEach(function (a) {
      var id = a.getAttribute("data-section");
      a.classList.toggle("is-active", id === section);
    });
    panels.forEach(function (el) {
      var g = el.getAttribute("data-panel-group");
      el.classList.toggle("is-panel-visible", g === section);
    });
    if (main) {
      main.scrollTop = 0;
    }
    window.scrollTo(0, 0);
  }

  function onHashRoute() {
    applyRoute(getSectionFromHash());
  }

  function initSpaNav() {
    body.classList.add("spa-ready");
    var raw = window.location.hash.replace(/^#/, "");
    if (!isKnownHashFragment(raw)) {
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, "", "#kirish");
      } else {
        window.location.hash = "kirish";
      }
    }
    onHashRoute();
  }

  if (toggle && sidebar) {
    toggle.addEventListener("click", onToggleClick);
  }

  if (backdrop) {
    backdrop.addEventListener("click", function () {
      setMobileOpen(false);
    });
  }

  links.forEach(function (a) {
    a.addEventListener("click", function (e) {
      e.preventDefault();
      var sec = a.getAttribute("data-section");
      if (!sec) {
        return;
      }
      var next = "#" + sec;
      if (window.location.hash !== next) {
        window.location.hash = sec;
      } else {
        onHashRoute();
      }
      closeMobileIfOpen();
    });
  });

  window.addEventListener("hashchange", onHashRoute);

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      closeMobileIfOpen();
    }
  });

  var mq = window.matchMedia(DESKTOP_MQ);
  if (typeof mq.addEventListener === "function") {
    mq.addEventListener("change", syncUiToViewport);
  } else if (typeof mq.addListener === "function") {
    mq.addListener(syncUiToViewport);
  }

  syncUiToViewport();
  initSpaNav();
})();

(function () {
  "use strict";

  function getCopyableText(el) {
    return (el.innerText || el.textContent || "").replace(/\r\n/g, "\n").trim();
  }

  function flashButton(btn, doneLabel, durationMs) {
    var prev = btn.textContent;
    btn.textContent = doneLabel;
    btn.disabled = true;
    window.setTimeout(function () {
      btn.textContent = prev;
      btn.disabled = false;
    }, durationMs);
  }

  document.querySelectorAll("[data-copy-target]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var id = btn.getAttribute("data-copy-target");
      var target = id ? document.getElementById(id) : null;
      if (!target) {
        return;
      }

      var text = getCopyableText(target);
      if (!text) {
        return;
      }

      function onCopied() {
        flashButton(btn, "Nusxa olindi!", 1600);
      }

      function onFailed() {
        flashButton(btn, "Xato", 1200);
      }

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(onCopied).catch(onFailed);
        return;
      }

      try {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        onCopied();
      } catch (e) {
        onFailed();
      }
    });
  });
})();

(function () {
  "use strict";

  var ANSWERS = { q1: "c", q2: "b", q3: "c" };
  var quizRoot = document.getElementById("security-quiz");
  var submit = document.getElementById("quiz-submit");
  var reset = document.getElementById("quiz-reset");
  var result = document.getElementById("quiz-result");

  if (!submit || !result || !quizRoot) {
    return;
  }

  function selectedValue(name) {
    var el = quizRoot.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : null;
  }

  function scoreAnswers() {
    var n = 0;
    if (selectedValue("q1") === ANSWERS.q1) {
      n += 1;
    }
    if (selectedValue("q2") === ANSWERS.q2) {
      n += 1;
    }
    if (selectedValue("q3") === ANSWERS.q3) {
      n += 1;
    }
    return n;
  }

  function setResult(html, kind) {
    result.hidden = false;
    result.className = "quiz__result quiz__result--" + kind;
    result.innerHTML = html;
  }

  function clearResult() {
    result.hidden = true;
    result.textContent = "";
    result.className = "quiz__result";
  }

  submit.addEventListener("click", function () {
    if (!selectedValue("q1") || !selectedValue("q2") || !selectedValue("q3")) {
      setResult(
        "<strong>Diqqat.</strong> Iltimos, har bir savol uchun bitta variantni tanlang.",
        "retry"
      );
      reset.hidden = true;
      submit.disabled = false;
      result.scrollIntoView({ block: "nearest", behavior: "smooth" });
      return;
    }

    var score = scoreAnswers();
    if (score === 3) {
      setResult(
        "<strong>Tabriklaymiz!</strong> Barcha javoblar to‘g‘ri — DPI, IDS va IPS bo‘yicha asosiy tushunchalarni yaxshi egallagansiz.",
        "success"
      );
    } else {
      setResult(
        "<strong>Yana bir bor urinib ko‘ring.</strong> To‘g‘ri javoblar: " +
          score +
          " / 3. Materiallarni qayta o‘qib, keyinroq testni yakunlang.",
        "retry"
      );
    }
    submit.disabled = true;
    reset.hidden = false;
    result.scrollIntoView({ block: "nearest", behavior: "smooth" });
  });

  if (reset) {
    reset.addEventListener("click", function () {
      quizRoot.querySelectorAll('input[type="radio"]').forEach(function (input) {
        input.checked = false;
      });
      clearResult();
      submit.disabled = false;
      reset.hidden = true;
    });
  }
})();

(function () {
  "use strict";

  var HOST = "cyberlab-vm";
  var USER = "user";
  var HISTORY_CAP = 500;

  var root = document.getElementById("packet-terminal");
  var scrollEl = document.getElementById("term-scroll");
  var field = document.getElementById("term-field");
  var echo = document.getElementById("term-echo");
  var promptEl = document.getElementById("term-prompt-prefix");

  if (!root || !scrollEl || !field || !echo) {
    return;
  }

  function fd(content) {
    return { kind: "file", content: content };
  }

  function dd(children) {
    return { kind: "dir", children: children || {} };
  }

  var VFS_ROOT = dd({
    tmp: dd({}),
    etc: dd({
      passwd: fd(
        "root:x:0:0:root:/root:/bin/bash\n" +
          "daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin\n" +
          "user:x:1000:1000:CyberLab User:/home/user:/bin/bash\n"
      ),
      hosts: fd("127.0.0.1 localhost\n::1 localhost ip6-loopback\n"),
      shadow: fd("root:!:19800:0:99999:7:::\n"),
    }),
    var: dd({
      log: dd({
        syslog: fd(
          "Jan 02 10:01:01 cyberlab kernel: [    0.000000] Linux version 6.x\n" +
            "Jan 02 10:01:02 cyberlab systemd[1]: Started Session 1 of user user.\n" +
            "Jan 02 10:02:15 cyberlab sshd[884]: Accepted password for user from 192.168.1.42 port 22\n" +
            "Jan 02 10:03:01 cyberlab CRON[900]: (root) CMD ( /etc/cron.hourly/audit)\n"
        ),
        auth: fd(
          "Jan 02 10:02:10 cyberlab sudo: user : TTY=pts/0 ; PWD=/home/user ; USER=root ; COMMAND=/bin/cat /etc/shadow\n"
        ),
      }),
    }),
    home: dd({
      user: dd({
        readme: fd("Welcome to CyberLab VFS. Try: cat /var/log/syslog\n"),
        notes: fd("DPI: analyze-packet \"GET /?id=1\"   IDS: ids-status\n"),
        Desktop: dd({}),
      }),
    }),
    usr: dd({
      bin: dd({}),
    }),
  });

  var state = {
    cwdSegments: ["home", "user"],
    homeSegments: ["home", "user"],
  };

  var commandHistory = [];
  var historyNavIndex = null;
  var settingFromHistory = false;

  function segmentsToPath(segments) {
    if (!segments.length) {
      return "/";
    }
    return "/" + segments.join("/");
  }

  function normalizeParts(parts) {
    var stack = [];
    for (var i = 0; i < parts.length; i += 1) {
      var p = parts[i];
      if (!p || p === ".") {
        continue;
      }
      if (p === "..") {
        if (stack.length) {
          stack.pop();
        }
        continue;
      }
      stack.push(p);
    }
    return stack;
  }

  function tildeExpand(pathStr) {
    if (pathStr === "~") {
      return segmentsToPath(state.homeSegments);
    }
    if (pathStr.indexOf("~/") === 0) {
      return segmentsToPath(state.homeSegments) + pathStr.slice(1);
    }
    return pathStr;
  }

  function resolveUserPath(currentSegs, pathStr) {
    if (!pathStr) {
      return currentSegs.slice();
    }
    var p = tildeExpand(pathStr);
    if (p.charAt(0) === "/") {
      return normalizeParts(p.split("/"));
    }
    return normalizeParts(currentSegs.concat(pathStr.split("/")));
  }

  function getNode(segments) {
    var node = VFS_ROOT;
    var i;
    for (i = 0; i < segments.length; i += 1) {
      var key = segments[i];
      if (node.kind !== "dir" || !node.children[key]) {
        return null;
      }
      node = node.children[key];
    }
    return node;
  }

  /**
   * Bash-like tokenization: single/double quotes, backslash escapes outside quotes.
   */
  function parseArgv(line) {
    line = line.trim();
    if (!line) {
      return [];
    }
    var out = [];
    var buf = "";
    var q = null;
    var i = 0;
    while (i < line.length) {
      var c = line.charAt(i);
      if (q) {
        if (c === q) {
          q = null;
          i += 1;
          continue;
        }
        buf += c;
        i += 1;
        continue;
      }
      if (c === "\\") {
        if (i + 1 < line.length) {
          buf += line.charAt(i + 1);
          i += 2;
        } else {
          i += 1;
        }
        continue;
      }
      if (c === '"' || c === "'") {
        q = c;
        i += 1;
        continue;
      }
      if (/\s/.test(c)) {
        if (buf.length) {
          out.push(buf);
          buf = "";
        }
        i += 1;
        continue;
      }
      buf += c;
      i += 1;
    }
    if (buf.length) {
      out.push(buf);
    }
    return out;
  }

  function mkdirSegments(segs, parentsFlag) {
    if (segs.length === 0) {
      return { err: "mkdir: cannot create directory '/': File exists" };
    }
    var pathStr = segmentsToPath(segs);
    var node = VFS_ROOT;
    for (var i = 0; i < segs.length; i += 1) {
      var comp = segs[i];
      var isLast = i === segs.length - 1;
      if (node.children[comp]) {
        var ex = node.children[comp];
        if (ex.kind !== "dir") {
          return {
            err:
              "mkdir: cannot create directory '" +
              pathStr +
              "': Not a directory",
          };
        }
        if (isLast) {
          if (parentsFlag) {
            return {};
          }
          return {
            err: "mkdir: cannot create directory '" + comp + "': File exists",
          };
        }
        node = ex;
        continue;
      }
      if (!isLast) {
        if (!parentsFlag) {
          return {
            err:
              "mkdir: cannot create directory '" +
              segmentsToPath(segs.slice(0, i + 1)) +
              "': No such file or directory",
          };
        }
        node.children[comp] = dd();
        node = node.children[comp];
        continue;
      }
      node.children[comp] = dd();
      return {};
    }
    return {};
  }

  function cmdMkdir(args) {
    var pFlag = false;
    var paths = [];
    var j;
    for (j = 0; j < args.length; j += 1) {
      if (args[j] === "-p") {
        pFlag = true;
      } else {
        paths.push(args[j]);
      }
    }
    if (!paths.length) {
      return [{ cls: "dim", text: "mkdir: missing operand" }];
    }
    var outLines = [];
    for (j = 0; j < paths.length; j += 1) {
      var segs = resolveUserPath(state.cwdSegments, paths[j]);
      var res = mkdirSegments(segs, pFlag);
      if (res.err) {
        outLines.push({ cls: "dim", text: res.err });
      }
    }
    return outLines;
  }

  function cmdTouch(args) {
    if (!args.length) {
      return [{ cls: "dim", text: "touch: missing file operand" }];
    }
    var lines = [];
    var k;
    for (k = 0; k < args.length; k += 1) {
      var segs = resolveUserPath(state.cwdSegments, args[k]);
      if (segs.length === 0) {
        lines.push({
          cls: "dim",
          text: "touch: cannot touch '/': Is a directory",
        });
        continue;
      }
      var parentSegs = segs.slice(0, -1);
      var base = segs[segs.length - 1];
      var pnode = parentSegs.length ? getNode(parentSegs) : VFS_ROOT;
      if (!pnode || pnode.kind !== "dir") {
        lines.push({
          cls: "dim",
          text:
            "touch: cannot touch '" +
            args[k] +
            "': No such file or directory",
        });
        continue;
      }
      var existing = pnode.children[base];
      if (existing) {
        if (existing.kind === "dir") {
          lines.push({
            cls: "dim",
            text:
              "touch: cannot touch '" +
              segmentsToPath(segs) +
              "': Is a directory",
          });
        }
        continue;
      }
      pnode.children[base] = fd("");
    }
    return lines;
  }

  function scrollToBottom() {
    scrollEl.scrollTop = scrollEl.scrollHeight;
  }

  function appendLine(text, classSuffix) {
    var div = document.createElement("div");
    div.className =
      "term__line" + (classSuffix ? " term__line--" + classSuffix : "");
    div.textContent = text;
    scrollEl.appendChild(div);
    scrollToBottom();
  }

  function formatPrompt() {
    var p = segmentsToPath(state.cwdSegments);
    var homeP = segmentsToPath(state.homeSegments);
    var pathDisp = p === homeP ? "~" : p;
    return USER + "@" + HOST + ":" + pathDisp + "$";
  }

  function syncFieldPadding() {
    if (!promptEl) {
      return;
    }
    var w = promptEl.offsetWidth || 140;
    field.style.paddingLeft = w + 10 + "px";
  }

  function clearTerminal() {
    while (scrollEl.firstChild) {
      scrollEl.removeChild(scrollEl.firstChild);
    }
  }

  var COMMAND_TABLE = {};

  function register(name, fn) {
    COMMAND_TABLE[name] = fn;
  }

  /** Strip leading sudo (repeatable), bash-style. */
  function stripLeadingSudo(s) {
    var t = s.trim();
    var guard = 0;
    while (guard < 32) {
      guard += 1;
      if (!/^\s*sudo\b/i.test(t)) {
        break;
      }
      t = t.replace(/^\s*sudo\s*/i, "").trim();
    }
    return t;
  }

  function isCommentLine(trimmed) {
    return trimmed.length > 0 && trimmed.charAt(0) === "#";
  }

  function isPacketCaptureCommand(stripped) {
    var t = stripped.trim();
    return /^(tcpdump|tshark)\b/i.test(t);
  }

  function mockPacketCaptureLines(isTshark) {
    var iface = "eth0";
    var lines = [];
    if (isTshark) {
      lines.push(
        "Capturing on '" +
          iface +
          "', link-type EN10MB (Ethernet), snapshot length 65535 bytes (simulation)"
      );
    } else {
      lines.push(
        "tcpdump: listening on " +
          iface +
          ", link-type EN10MB (Ethernet), capture size 65535 bytes (simulation)"
      );
    }
    lines.push(
      "10:30:15.123 IP 192.168.1.10.443 > 10.0.0.5.54321: Flags [P.], seq 1:50, ack 88, win 502, length 49"
    );
    lines.push(
      "10:30:15.124 IP 203.0.113.9.22 > 192.168.1.42.49152: Flags [S.], seq 0:1, ack 1, win 64240, options [mss 1460], length 0"
    );
    lines.push(
      "0x0000:  4500 003c 1c46 4000 4006 b1e6 c0a8 010a  E..<.F@.@......."
    );
    lines.push(
      "0x0010:  0a00 0005 01bb 8d41 d432 8f2e 8018 01fe  .......A.2......"
    );
    lines.push(
      "10:30:15.125 IP6 2001:db8::1.443 > 2001:db8::2.60443: Flags [.], ack 120, win 88, options [nop,nop,TS val 1 ecr 2], length 0"
    );
    lines.push(
      "6 packets captured | 6 packets received by filter | 0 packets dropped by kernel (mock)"
    );
    return lines;
  }

  function setTermBusy(busy) {
    root.classList.toggle("term--busy", !!busy);
    root.setAttribute("aria-busy", busy ? "true" : "false");
    field.disabled = !!busy;
  }

  function cmdLs(args) {
    var pathArg = args[0] || ".";
    var segs =
      pathArg === "."
        ? state.cwdSegments.slice()
        : resolveUserPath(state.cwdSegments, pathArg);
    var node = getNode(segs);
    if (!node) {
      return [
        {
          cls: "dim",
          text: "ls: cannot access '" + pathArg + "': No such file or directory",
        },
      ];
    }
    if (node.kind !== "dir") {
      return [{ cls: "dim", text: "ls: '" + pathArg + "': Not a directory" }];
    }
    var names = Object.keys(node.children).sort();
    return [{ cls: "out", text: names.join("  ") }];
  }

  function cmdCd(args) {
    if (args.length === 0) {
      state.cwdSegments = state.homeSegments.slice();
      return [];
    }
    var raw = args[0];
    var resolved = resolveUserPath(state.cwdSegments, raw);
    var node = getNode(resolved);
    if (!node || node.kind !== "dir") {
      return [
        {
          cls: "dim",
          text: "bash: cd: " + raw + ": No such file or directory",
        },
      ];
    }
    state.cwdSegments = resolved;
    return [];
  }

  function cmdPwd() {
    return [{ cls: "out", text: segmentsToPath(state.cwdSegments) }];
  }

  function cmdCat(args) {
    if (!args.length) {
      return [{ cls: "dim", text: "cat: missing file operand" }];
    }
    var lines = [];
    var i;
    for (i = 0; i < args.length; i += 1) {
      var segs = resolveUserPath(state.cwdSegments, args[i]);
      var node = getNode(segs);
      if (!node) {
        lines.push({
          cls: "dim",
          text: "cat: " + args[i] + ": No such file or directory",
        });
        continue;
      }
      if (node.kind !== "file") {
        lines.push({
          cls: "dim",
          text: "cat: " + args[i] + ": Is a directory",
        });
        continue;
      }
      lines.push({ cls: "out", text: node.content });
    }
    return lines;
  }

  function cmdEcho(args) {
    return [{ cls: "out", text: args.join(" ") }];
  }

  function cmdClear() {
    clearTerminal();
    return [];
  }

  function cmdHistoryList() {
    if (!commandHistory.length) {
      return [{ cls: "dim", text: "(no commands in history yet)" }];
    }
    var lines = [];
    var h;
    for (h = 0; h < commandHistory.length; h += 1) {
      lines.push(h + 1 + "  " + commandHistory[h]);
    }
    return [{ cls: "out", text: lines.join("\n") }];
  }

  function cmdHelp() {
    var text =
      "CyberLab bash (VFS). Standard:\n" +
      "  ls [path]   cd [path]   pwd   mkdir [-p] <dir>...   touch <file>...\n" +
      "  cat <file>...   echo <text...>   clear   history\n" +
      "  Lines starting with # are comments. Prefix with sudo to run as root (simulated).\n" +
      "Security / capture (mock):\n" +
      "  tcpdump ...   tshark ...   (realistic capture output, ~1s delay)\n" +
      "  analyze-packet <payload>   ids-status   start-ids   ping -flood\n" +
      "Tip: Up/Down arrows browse history.";
    return [{ cls: "dim", text: text }];
  }

  function cmdAnalyzePacket(args) {
    var joined = args.join(" ");
    var lower = joined.toLowerCase();
    if (/--type\s+sql-injection\b/.test(lower)) {
      return [
        {
          cls: "crit",
          text: "CRITICAL THREAT DETECTED! Connection Blocked by IPS.",
        },
      ];
    }
    if (/--type\s+normal\b/.test(lower)) {
      return [{ cls: "ok", text: "Packet Safe. Allowed by IPS." }];
    }
    if (
      /\bdrop\s+table\b/i.test(joined) ||
      /union\s+select/i.test(lower) ||
      /or\s+1\s*=\s*1/i.test(lower) ||
      /<script/i.test(joined)
    ) {
      return [
        {
          cls: "crit",
          text: "CRITICAL THREAT DETECTED! Connection Blocked by IPS.",
        },
      ];
    }
    if (!joined.trim()) {
      return [
        {
          cls: "dim",
          text:
            "analyze-packet: provide a payload string, or --type normal|sql-injection",
        },
      ];
    }
    return [
      {
        cls: "ok",
        text:
          "DPI: payload scanned (" +
          joined.length +
          " bytes). No threat signatures matched (simulation).",
      },
      {
        cls: "dim",
        text:
          "    Heuristics: SQLi, XSS stub, L7 keyword sweep — all clear.",
      },
    ];
  }

  function cmdIdsStatus() {
    return [
      {
        cls: "out",
        text: "=== simulated IDS / network log (rolling window) ===",
      },
      {
        cls: "dim",
        text:
          "[10:22:01] ACCEPT tcp :443 <- 203.0.113.44:54210 (TLS1.3, SNI=cyberlab.local)",
      },
      {
        cls: "dim",
        text:
          "[10:22:03] ALERT  suricata: ET SCAN Potential port scan (15 events/min from 198.51.100.2)",
      },
      {
        cls: "dim",
        text:
          "[10:22:07] DROP   tcp :445 <- 192.0.2.88:49152 (IPS: SMB exploit attempt)",
      },
      {
        cls: "dim",
        text:
          "[10:22:11] ACCEPT udp :53 -> 192.168.1.5:55321 (DNS response, 42 ms)",
      },
      {
        cls: "ok",
        text:
          "Status: ONLINE   iface: eth0 (promisc)   ruleset: cyberlab-2026.01",
      },
    ];
  }

  function cmdStartIds() {
    return [
      { cls: "ok", text: "[+] IDS engine started (simulation)." },
      {
        cls: "dim",
        text: "    Run ids-status for live-style log snapshot.",
      },
    ];
  }

  function cmdPing(args) {
    var joined = args.join(" ");
    if (/\b-flood\b/i.test(joined)) {
      return [
        {
          cls: "warn",
          text: "Warning: High frequency of requests detected (IDS Alert).",
        },
      ];
    }
    return [
      {
        cls: "dim",
        text: "ping: use -flood for load simulation (e.g. ping -flood 127.0.0.1)",
      },
    ];
  }

  register("ls", cmdLs);
  register("cd", cmdCd);
  register("pwd", cmdPwd);
  register("cat", cmdCat);
  register("echo", cmdEcho);
  register("clear", cmdClear);
  register("help", cmdHelp);
  register("mkdir", cmdMkdir);
  register("touch", cmdTouch);
  register("history", cmdHistoryList);
  register("ping", cmdPing);
  register("analyze-packet", cmdAnalyzePacket);
  register("ids-status", cmdIdsStatus);
  register("start-ids", cmdStartIds);

  function dispatchShell(trimmed) {
    trimmed = stripLeadingSudo(trimmed);

    if (/^\s*drop\s+table\b/i.test(trimmed)) {
      return [
        {
          cls: "crit",
          text: "CRITICAL THREAT DETECTED! Connection Blocked by IPS.",
        },
      ];
    }

    var argv = parseArgv(trimmed);
    if (argv.length === 0) {
      return [];
    }

    var name = argv[0];
    var rest = argv.slice(1);

    var handler = COMMAND_TABLE[name];
    if (!handler) {
      return [{ cls: "dim", text: "bash: " + name + ": command not found" }];
    }

    return handler(rest);
  }

  function runCommand(raw) {
    var line = raw.trim();
    if (!line) {
      return;
    }

    var promptSnap = formatPrompt();
    appendLine(promptSnap + " " + line, "cmd");

    if (isCommentLine(line)) {
      if (promptEl) {
        promptEl.textContent = formatPrompt();
      }
      syncFieldPadding();
      return;
    }

    var execLine = stripLeadingSudo(line);

    if (isPacketCaptureCommand(execLine)) {
      var isTshark = /^\s*tshark\b/i.test(execLine.trim());
      setTermBusy(true);
      window.setTimeout(function () {
        var mockLines = mockPacketCaptureLines(isTshark);
        var j;
        for (j = 0; j < mockLines.length; j += 1) {
          var rowCls =
            j === 0 || j === mockLines.length - 1 ? "dim" : "out";
          appendLine(mockLines[j], rowCls);
        }
        setTermBusy(false);
        if (promptEl) {
          promptEl.textContent = formatPrompt();
        }
        syncFieldPadding();
        try {
          field.focus();
        } catch (fe) {
          /* ignore */
        }
      }, 1000);
      return;
    }

    var outs = dispatchShell(line);
    var i;
    for (i = 0; i < outs.length; i += 1) {
      appendLine(outs[i].text, outs[i].cls);
    }

    if (promptEl) {
      promptEl.textContent = formatPrompt();
    }
    syncFieldPadding();
  }

  function syncEcho() {
    echo.textContent = field.value;
  }

  function applyHistoryNav() {
    if (historyNavIndex === null) {
      return;
    }
    settingFromHistory = true;
    field.value = commandHistory[historyNavIndex] || "";
    syncEcho();
    settingFromHistory = false;
  }

  field.addEventListener("input", function () {
    syncEcho();
    if (settingFromHistory) {
      return;
    }
    if (
      historyNavIndex !== null &&
      field.value !== (commandHistory[historyNavIndex] || "")
    ) {
      historyNavIndex = null;
    }
  });

  field.addEventListener("keydown", function (e) {
    if (e.key === "ArrowUp") {
      if (!commandHistory.length) {
        return;
      }
      e.preventDefault();
      if (historyNavIndex === null) {
        historyNavIndex = commandHistory.length - 1;
      } else if (historyNavIndex > 0) {
        historyNavIndex -= 1;
      }
      applyHistoryNav();
      return;
    }
    if (e.key === "ArrowDown") {
      if (historyNavIndex === null) {
        return;
      }
      e.preventDefault();
      if (historyNavIndex < commandHistory.length - 1) {
        historyNavIndex += 1;
        applyHistoryNav();
      } else {
        historyNavIndex = null;
        settingFromHistory = true;
        field.value = "";
        syncEcho();
        settingFromHistory = false;
      }
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      var v = field.value;
      var trimmed = v.trim();
      if (trimmed) {
        commandHistory.push(v);
        if (commandHistory.length > HISTORY_CAP) {
          commandHistory.shift();
        }
      }
      historyNavIndex = null;
      runCommand(v);
      field.value = "";
      syncEcho();
      scrollToBottom();
    }
  });

  root.addEventListener("click", function (e) {
    if (e.target !== field) {
      field.focus();
    }
  });

  window.addEventListener("resize", syncFieldPadding);

  if (promptEl) {
    promptEl.textContent = formatPrompt();
  }
  syncFieldPadding();
  syncEcho();

  if (typeof window !== "undefined") {
    window.CyberLabShell = {
      register: function (name, handler) {
        if (typeof name === "string" && typeof handler === "function") {
          COMMAND_TABLE[name] = handler;
        }
      },
    };
  }
})();

(function () {
  "use strict";

  var BLACKLIST_SRC = "192.168.1.99";
  var MALWARE_PATTERN = /\b(malware|hack|virus)\b/i;

  var form = document.getElementById("dpi-inspector-form");
  var resultEl = document.getElementById("dpi-inspector-result");
  var srcInput = document.getElementById("inspector-src");
  var payloadInput = document.getElementById("inspector-payload");

  if (!form || !resultEl || !srcInput || !payloadInput) {
    return;
  }

  function payloadFailsDpiScan(payload) {
    if (payload.trim().length === 0) {
      return true;
    }
    return MALWARE_PATTERN.test(payload);
  }

  function isBlacklistedSource(src) {
    return src.trim() === BLACKLIST_SRC;
  }

  function showCard(cardClass, messageText) {
    resultEl.hidden = false;
    resultEl.textContent = "";
    var card = document.createElement("div");
    card.className = "inspector-card " + cardClass;
    var p = document.createElement("p");
    var strong = document.createElement("strong");
    strong.textContent = messageText;
    p.appendChild(strong);
    card.appendChild(p);
    resultEl.appendChild(card);
    resultEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();

    var payload = payloadInput.value;
    var src = srcInput.value;

    if (payloadFailsDpiScan(payload)) {
      showCard(
        "inspector-card--danger",
        "IPS Action: Packet Dropped. Malicious payload found inside DPI scan."
      );
      return;
    }

    if (isBlacklistedSource(src)) {
      showCard(
        "inspector-card--warn",
        "IDS Alert: Suspicious IP address detected, monitoring activity."
      );
      return;
    }

    showCard("inspector-card--ok", "Packet successfully transmitted.");
  });
})();

(function () {
  "use strict";

  /*
   * Skaner URL: internetdagi domen — bir xil origin + /api/scan-file.
   * Local: faqat loopback + 8000 bo‘lganda shu origin; Live Server kabi boshqa portda — alohida :8000 API.
   * To‘liq URL override: HTML da <script>window.__CYBERLAB_SCAN_API__="https://api.mening.uz/api/scan-file";</script>
   */
  function resolveUploadScanUrl() {
    if (typeof window === "undefined") {
      return "http://127.0.0.1:8000/api/scan-file";
    }
    if (window.__CYBERLAB_SCAN_API__) {
      return String(window.__CYBERLAB_SCAN_API__).replace(/\/$/, "");
    }
    var loc = window.location;
    if (loc.protocol === "file:") {
      return "http://127.0.0.1:8000/api/scan-file";
    }
    var host = (loc.hostname || "").toLowerCase();
    var effectivePort =
      loc.port ||
      (loc.protocol === "https:" ? "443" : loc.protocol === "http:" ? "80" : "");
    var loopback = host === "127.0.0.1" || host === "localhost";
    if (loopback && effectivePort !== "8000") {
      return "http://127.0.0.1:8000/api/scan-file";
    }
    return loc.origin.replace(/\/$/, "") + "/api/scan-file";
  }

  var MAX_CLIENT_BYTES = 50 * 1024 * 1024;

  var dropZone = document.getElementById("file-drop");
  var fileInput = document.getElementById("file-input");
  var folderInput = document.getElementById("folder-input");
  var browseBtn = document.getElementById("file-browse-btn");
  var folderBrowseBtn = document.getElementById("folder-browse-btn");
  var metaEl = document.getElementById("file-meta");
  var resultEl = document.getElementById("file-analyzer-result");
  var visual = document.getElementById("file-drop-visual");

  if (!dropZone || !fileInput || !resultEl) {
    return;
  }

  function setBusy(busy) {
    dropZone.classList.toggle("file-drop--busy", busy);
    dropZone.setAttribute("aria-busy", busy ? "true" : "false");
  }

  function setMeta(text) {
    if (metaEl) {
      metaEl.textContent = text || "";
    }
  }

  function clearResult() {
    resultEl.hidden = true;
    resultEl.textContent = "";
  }

  function showErrorCard(title, detail) {
    resultEl.hidden = false;
    resultEl.textContent = "";
    var card = document.createElement("div");
    card.className = "inspector-card inspector-card--warn";
    var p1 = document.createElement("p");
    var s1 = document.createElement("strong");
    s1.textContent = title;
    p1.appendChild(s1);
    card.appendChild(p1);
    if (detail) {
      var p2 = document.createElement("p");
      p2.style.marginTop = "0.5rem";
      p2.style.fontSize = "0.9rem";
      p2.textContent = detail;
      card.appendChild(p2);
    }
    resultEl.appendChild(card);
    resultEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function showLoader() {
    resultEl.hidden = false;
    resultEl.textContent = "";
    var wrap = document.createElement("div");
    wrap.className = "upload-scan-loader";
    wrap.setAttribute("role", "status");
    var rings = document.createElement("div");
    rings.className = "upload-scan-loader__rings";
    for (var r = 0; r < 3; r += 1) {
      var dot = document.createElement("span");
      dot.className = "upload-scan-loader__ring";
      dot.setAttribute("aria-hidden", "true");
      rings.appendChild(dot);
    }
    wrap.appendChild(rings);
    var t = document.createElement("p");
    t.className = "upload-scan-loader__title";
    t.textContent = "Analyzing binary data…";
    wrap.appendChild(t);
    var sub = document.createElement("p");
    sub.className = "upload-scan-loader__sub";
    sub.textContent = "Deep Packet Inspection in progress — server-side mock scan";
    wrap.appendChild(sub);
    resultEl.appendChild(wrap);
    resultEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function formatBytes(n) {
    if (n < 1024) {
      return n + " B";
    }
    if (n < 1024 * 1024) {
      return (n / 1024).toFixed(1) + " KB";
    }
    return (n / (1024 * 1024)).toFixed(2) + " MB";
  }

  function isThreatStatus(status) {
    if (!status) {
      return false;
    }
    var s = String(status);
    var u = s.toUpperCase();
    if (u === "SAFE") {
      return false;
    }
    return (
      u === "MALICIOUS" ||
      u === "CRITICAL THREAT" ||
      u === "SPAM/MALICIOUS" ||
      u.indexOf("THREAT") !== -1 ||
      u.indexOf("MALICIOUS") !== -1 ||
      u.indexOf("XAVF") !== -1
    );
  }

  function badgeLabelForStatus(status, threat) {
    if (!threat) {
      return "Safe";
    }
    if (String(status).toUpperCase().indexOf("CRITICAL") !== -1) {
      return "Critical";
    }
    return "Threat";
  }

  function renderScanReport(data) {
    resultEl.hidden = false;
    resultEl.textContent = "";
    var statusRaw = data.status != null ? String(data.status) : "";
    var threat = isThreatStatus(statusRaw);
    var root = document.createElement("div");
    root.className =
      "scan-report " + (threat ? "scan-report--threat" : "scan-report--safe");

    var head = document.createElement("div");
    head.className = "scan-report__head";
    var h = document.createElement("h3");
    h.className = "scan-report__title";
    h.textContent = "DPI / IPS analysis report";
    head.appendChild(h);
    var badge = document.createElement("span");
    badge.className = "scan-report__badge";
    badge.textContent = badgeLabelForStatus(statusRaw, threat);
    head.appendChild(badge);
    root.appendChild(head);

    var body = document.createElement("div");
    body.className = "scan-report__body";

    var grid = document.createElement("dl");
    grid.className = "scan-report__grid";

    function addRow(label, valueNode) {
      var dt = document.createElement("dt");
      dt.textContent = label;
      var dd = document.createElement("dd");
      dd.appendChild(valueNode);
      grid.appendChild(dt);
      grid.appendChild(dd);
    }

    var fn = document.createElement("span");
    fn.textContent = data.filename || "—";
    addRow("File", fn);

    if (Object.prototype.hasOwnProperty.call(data, "extension")) {
      var extEl = document.createElement("span");
      extEl.textContent = data.extension ? data.extension : "(none)";
      addRow("Extension", extEl);
    }

    var stEl = document.createElement("span");
    stEl.textContent = statusRaw || "—";
    addRow("Scan status", stEl);

    var ft = document.createElement("span");
    ft.textContent = data.file_type || data.mime_type || "—";
    addRow("Type", ft);

    var sz = document.createElement("span");
    if (data.size_human) {
      sz.textContent = data.size_human;
    } else if (typeof data.size_bytes === "number") {
      sz.textContent =
        formatBytes(data.size_bytes) + " (" + data.size_bytes + " bytes)";
    } else if (typeof data.file_size === "number") {
      sz.textContent = data.file_size.toFixed(6) + " MiB (binary)";
    } else {
      sz.textContent = "—";
    }
    addRow("Size", sz);

    var hash = document.createElement("code");
    hash.className = "scan-report__hash";
    hash.textContent = data.sha256 || data.sha256_hash || "—";
    addRow("SHA-256", hash);

    body.appendChild(grid);

    var dpiTitle = document.createElement("p");
    dpiTitle.className = "scan-report__section-title";
    dpiTitle.textContent = "Simulated DPI findings";
    body.appendChild(dpiTitle);

    var dpiList = document.createElement("ul");
    dpiList.className = "scan-report__list";
    var findings = data.dpi_findings;
    if (findings && findings.length) {
      for (var i = 0; i < findings.length; i += 1) {
        var f = findings[i];
        var li = document.createElement("li");
        var t1 = document.createElement("div");
        t1.className = "scan-report__finding-title";
        t1.textContent =
          f.title || f.layer || f.rule || f.name || "Finding";
        li.appendChild(t1);
        var meta = document.createElement("div");
        meta.className = "scan-report__finding-meta";
        var parts = [];
        if (f.severity) {
          parts.push("Severity: " + f.severity);
        }
        if (f.layer) {
          parts.push("Layer: " + f.layer);
        }
        if (f.rule) {
          parts.push("Rule: " + f.rule);
        }
        var metaLine = parts.join(" · ");
        if (f.detail) {
          metaLine += (metaLine ? " — " : "") + f.detail;
        }
        if (!metaLine) {
          metaLine = "(no detail)";
        }
        meta.textContent = metaLine;
        li.appendChild(meta);
        dpiList.appendChild(li);
      }
    } else {
      var empty = document.createElement("li");
      empty.textContent = "No structured findings.";
      dpiList.appendChild(empty);
    }
    body.appendChild(dpiList);

    var ipsTitle = document.createElement("p");
    ipsTitle.className = "scan-report__section-title";
    ipsTitle.textContent = "IPS actions (simulated)";
    body.appendChild(ipsTitle);

    var ipsList = document.createElement("ul");
    ipsList.className = "scan-report__list";
    var actions = data.ips_actions;
    if (!actions || !actions.length) {
      if (data.IPS_Action && String(data.IPS_Action).length) {
        actions = [data.IPS_Action];
      } else if (data.action && String(data.action).length) {
        actions = [data.action];
      }
    }
    if (actions && actions.length) {
      for (var j = 0; j < actions.length; j += 1) {
        var li2 = document.createElement("li");
        li2.textContent = actions[j];
        ipsList.appendChild(li2);
      }
    } else {
      var liEmpty = document.createElement("li");
      liEmpty.textContent = "No actions recorded.";
      ipsList.appendChild(liEmpty);
    }
    body.appendChild(ipsList);

    if (data.details) {
      var sum = document.createElement("p");
      sum.className = "scan-report__summary";
      sum.textContent = data.details;
      body.appendChild(sum);
    }

    if (data.dpi_triggers && data.dpi_triggers.length) {
      var trigTitle = document.createElement("p");
      trigTitle.className = "scan-report__section-title";
      trigTitle.textContent = "DPI triggers";
      body.appendChild(trigTitle);
      var trigUl = document.createElement("ul");
      trigUl.className = "scan-report__list";
      for (var t = 0; t < data.dpi_triggers.length; t += 1) {
        var tri = document.createElement("li");
        tri.textContent = data.dpi_triggers[t];
        trigUl.appendChild(tri);
      }
      body.appendChild(trigUl);
    }

    root.appendChild(body);
    resultEl.appendChild(root);
    resultEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function sortFileList(fileList) {
    var arr = Array.prototype.slice.call(fileList);
    arr.sort(function (a, b) {
      var pa = a.webkitRelativePath || a.name || "";
      var pb = b.webkitRelativePath || b.name || "";
      return pa.localeCompare(pb);
    });
    return arr;
  }

  function uploadScan(file, totalInBatch) {
    if (!file) {
      return;
    }

    clearResult();

    if (file.size > MAX_CLIENT_BYTES) {
      showErrorCard(
        "Fayl juda katta",
        "Limit: " +
          formatBytes(MAX_CLIENT_BYTES) +
          ". Tanlangan: " +
          formatBytes(file.size) +
          "."
      );
      setMeta(file.name + " — hajm limiti.");
      return;
    }

    var batchNote =
      totalInBatch > 1
        ? "Jami " +
          totalInBatch +
          " ta fayl; serverga birinchi yuborilmoqda: " +
          file.name
        : file.name + " · " + formatBytes(file.size);

    setMeta(batchNote + " — tahlil qilinmoqda…");
    setBusy(true);
    showLoader();

    var fd = new FormData();
    fd.append("file", file, file.name);

    fetch(resolveUploadScanUrl(), {
      method: "POST",
      body: fd,
      mode: "cors",
      credentials: "omit",
    })
      .then(function (res) {
        if (!res.ok) {
          return res.text().then(function (txt) {
            var err = new Error("HTTP " + res.status);
            err.body = txt;
            throw err;
          });
        }
        return res.json();
      })
      .then(function (data) {
        setBusy(false);
        renderScanReport(data);
        setMeta(
          (totalInBatch > 1 ? "[" + totalInBatch + " ta] " : "") +
            file.name +
            " — " +
            (data.status || "OK")
        );
      })
      .catch(function (err) {
        setBusy(false);
        var detail = "";
        var loc =
          typeof window !== "undefined" ? window.location : null;
        var host = loc ? (loc.hostname || "").toLowerCase() : "";
        var loopback =
          host === "127.0.0.1" || host === "localhost";
        var port =
          loc && loc.port
            ? loc.port
            : loc && loc.protocol === "https:"
              ? "443"
              : loc && loc.protocol === "http:"
                ? "80"
                : "";
        if (typeof window !== "undefined" && window.location.protocol === "file:") {
          detail +=
            "Sahifa diskdan (file://) ochilgan — brauzer API ga ulanmaydi. " +
            "Terminalda: cd api → uvicorn main:app --reload --host 127.0.0.1 --port 8000 " +
            "keyin faqat brauzerda http://127.0.0.1:8000 manzilini oching (diskdan emas). ";
        } else if (loopback && port !== "8000") {
          detail +=
            "Local dev: skaner so‘rovi http://127.0.0.1:8000 ga ketadi. " +
            "Terminal: cd api → uvicorn main:app --reload --host 127.0.0.1 --port 8000. " +
            "Tekshiruv: http://127.0.0.1:8000/health ";
        } else {
          detail +=
            "API ishlamayapti yoki tarmoq xatosi: " +
            (loc ? loc.origin + "/health" : "/health") +
            " ni tekshiring. ";
        }
        if (err && err.body) {
          detail += String(err.body).slice(0, 200);
        } else if (err && err.message) {
          detail += err.message;
        }
        showErrorCard("Skaner so‘rovi muvaffaqiyatsiz (Failed to fetch)", detail);
        setMeta(file.name + " — ulanish xatosi.");
      });
  }

  function onFiles(fileList) {
    if (!fileList || fileList.length === 0) {
      return;
    }
    var sorted = sortFileList(fileList);
    uploadScan(sorted[0], sorted.length);
  }

  ["dragenter", "dragover"].forEach(function (ev) {
    dropZone.addEventListener(ev, function (e) {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add("file-drop--hover");
    });
  });

  dropZone.addEventListener("dragleave", function (e) {
    e.preventDefault();
    e.stopPropagation();
    var rt = e.relatedTarget;
    if (rt && dropZone.contains(rt)) {
      return;
    }
    dropZone.classList.remove("file-drop--hover");
  });

  dropZone.addEventListener("drop", function (e) {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove("file-drop--hover");
    var dt = e.dataTransfer;
    if (dt && dt.files && dt.files.length > 0) {
      onFiles(dt.files);
    }
  });

  fileInput.addEventListener("change", function () {
    onFiles(fileInput.files);
    fileInput.value = "";
  });

  if (folderInput) {
    folderInput.addEventListener("change", function () {
      onFiles(folderInput.files);
      folderInput.value = "";
    });
  }

  if (browseBtn) {
    browseBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      fileInput.click();
    });
  }

  if (folderBrowseBtn && folderInput) {
    folderBrowseBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      folderInput.click();
    });
  }

  if (visual) {
    visual.addEventListener("click", function (e) {
      if (
        (browseBtn && browseBtn.contains(e.target)) ||
        (folderBrowseBtn && folderBrowseBtn.contains(e.target))
      ) {
        return;
      }
      fileInput.click();
    });
  }

  dropZone.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInput.click();
    }
  });
})();
