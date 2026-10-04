/*
 * Dockyard site behaviour: mobile menu, copy buttons, scroll reveal,
 * and the small interactive touches in the hero and agent-map mocks.
 */
(function () {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---- Mobile navigation ------------------------------------------------
  const topbar = document.querySelector(".topbar");
  const toggle = document.querySelector(".nav-toggle");
  if (topbar && toggle) {
    const setOpen = (open) => {
      topbar.classList.toggle("open", open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    };
    toggle.addEventListener("click", () => setOpen(!topbar.classList.contains("open")));
    topbar.querySelectorAll(".nav a").forEach((a) => a.addEventListener("click", () => setOpen(false)));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") setOpen(false);
    });
  }

  // ---- Image downloads ---------------------------------------------------
  // CI writes stats.json from the GHCR package page. Rounded down, so the
  // site never claims more than the real count (1,299 shows as 1.2k).
  function compactCount(n) {
    const floor1 = (value) => (Math.floor(value * 10) / 10).toString();
    if (n >= 1e6) return `${floor1(n / 1e6)}M`;
    if (n >= 1e3) return `${floor1(n / 1e3)}k`;
    return String(n);
  }
  const downloads = document.getElementById("downloads");
  if (downloads) {
    fetch("stats.json", { cache: "no-cache" })
      .then((res) => (res.ok ? res.json() : null))
      .then((stats) => {
        const n = stats && stats.downloads;
        if (!Number.isSafeInteger(n) || n <= 0) return;
        document.getElementById("downloadCount").textContent = compactCount(n);
        downloads.title = `${n.toLocaleString("en")} downloads of ghcr.io/piyushdoorwar/dockyard`;
        downloads.hidden = false;
      })
      .catch(() => {});
  }

  // ---- Copy buttons -----------------------------------------------------
  // Delegated, so blocks rendered later (the releases list) work too.
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
      ta.remove();
      return ok;
    }
  }

  document.addEventListener("click", async (event) => {
    const btn = event.target.closest(".copy-btn");
    if (!btn) return;
    const text = btn.dataset.copy ?? btn.closest(".cmd")?.querySelector("code")?.innerText ?? "";
    const ok = await copyText(text);
    const label = btn.querySelector("span");
    btn.classList.toggle("done", ok);
    if (label) label.textContent = ok ? "Copied" : "Press Ctrl+C";
    clearTimeout(btn._timer);
    btn._timer = setTimeout(() => {
      btn.classList.remove("done");
      if (label) label.textContent = "Copy";
    }, 1800);
  });

  // ---- Scroll reveal ----------------------------------------------------
  const revealEls = document.querySelectorAll("[data-reveal]");
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          // Elements above the viewport (after an anchor jump or reload) are shown as well.
          if (entry.isIntersecting || entry.boundingClientRect.top < 0) {
            entry.target.classList.add("in");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -40px 0px" }
    );
    revealEls.forEach((el) => observer.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add("in"));
  }

  // ---- Hero mock: live CPU meters and start/stop buttons ----------------
  const mock = document.getElementById("mock");
  if (mock) {
    const rows = Array.from(mock.querySelectorAll(".crow[data-cpu]"));
    const tileRunning = document.getElementById("tileRunning");
    const tileStopped = document.getElementById("tileStopped");
    const summary = document.getElementById("mockSummary");

    // CPU percent is drawn against a 10% scale so small values are still visible.
    const paint = (row, cpu) => {
      row.querySelector(".bar i").style.width = Math.min(100, cpu * 10) + "%";
      row.querySelector(".meter code").textContent = (cpu < 10 ? cpu.toFixed(1) : Math.round(cpu)) + "%";
    };

    const setRunning = (row, running) => {
      const status = row.querySelector(".status");
      row.classList.toggle("stopped", !running);
      status.classList.toggle("running", running);
      status.textContent = running ? "running" : "exited";
      paint(row, running ? Number(row.dataset.cpu) : 0);
      if (!running) row.querySelector(".meter code").textContent = "0%";
    };

    const updateCounts = () => {
      const running = rows.filter((r) => !r.classList.contains("stopped")).length;
      tileRunning.textContent = String(running);
      tileStopped.textContent = String(rows.length - running);
      summary.textContent = running + " running";
    };

    const flash = (row) => {
      row.classList.add("flash");
      setTimeout(() => row.classList.remove("flash"), 500);
    };

    rows.forEach((row) => {
      setRunning(row, !row.classList.contains("stopped"));

      row.querySelector("[data-toggle]")?.addEventListener("click", () => {
        setRunning(row, row.classList.contains("stopped"));
        updateCounts();
        flash(row);
      });

      row.querySelector("[data-restart]")?.addEventListener("click", () => {
        setRunning(row, false);
        row.querySelector(".status").textContent = "restarting";
        setTimeout(() => {
          setRunning(row, true);
          updateCounts();
          flash(row);
        }, 650);
      });
    });
    updateCounts();

    // Let running containers wobble a little, like a real stats stream.
    if (!reduceMotion) {
      setInterval(() => {
        rows.forEach((row) => {
          if (row.classList.contains("stopped")) return;
          const base = Number(row.dataset.cpu);
          const cpu = Math.max(0.1, base + (Math.random() - 0.5) * base * 0.8);
          paint(row, cpu);
        });
      }, 1400);
    }
  }

  // ---- Agent map mock: live filter --------------------------------------
  const filter = document.getElementById("agentFilter");
  const list = document.getElementById("agentList");
  if (filter && list) {
    const files = Array.from(list.querySelectorAll(".agent-file"));
    const empty = document.getElementById("agentEmpty");

    // Remember each heading's plain text so highlighting can be redone safely.
    files.forEach((file) => {
      file.querySelectorAll("li > span:last-child").forEach((s) => {
        s.dataset.text = s.textContent;
      });
    });

    const highlight = (el, needle) => {
      const text = el.dataset.text;
      el.textContent = "";
      const at = needle ? text.toLowerCase().indexOf(needle) : -1;
      if (at < 0) {
        el.textContent = text;
        return;
      }
      const mark = document.createElement("mark");
      mark.textContent = text.slice(at, at + needle.length);
      el.append(text.slice(0, at), mark, text.slice(at + needle.length));
    };

    filter.addEventListener("input", () => {
      const needle = filter.value.trim().toLowerCase();
      let shown = 0;
      files.forEach((file) => {
        const path = file.querySelector("header b").textContent.toLowerCase();
        const pathHit = needle && path.includes(needle);
        let headingHits = 0;
        file.querySelectorAll("ul li").forEach((li) => {
          const span = li.querySelector("span:last-child");
          const hit = !needle || pathHit || span.dataset.text.toLowerCase().includes(needle);
          li.hidden = !hit;
          highlight(span, pathHit ? "" : needle);
          if (hit) headingHits += 1;
        });
        const visible = !needle || pathHit || headingHits > 0;
        file.hidden = !visible;
        if (visible) shown += 1;
      });
      empty.classList.toggle("hidden", shown > 0);
    });
  }
})();
