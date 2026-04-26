(() => {
  const btn = document.getElementById("rainBtn");
  const cloudLayer = document.querySelector(".cloud-layer");
  const rainLayer = document.querySelector(".rain-layer");
  if (!btn || !cloudLayer || !rainLayer) return;

  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  let isRunning = false;

  const RAIN_DURATION_MS = reducedMotion ? 1500 : 4000;
  const SPAWN_INTERVAL_MS = reducedMotion ? 80 : 30;
  const DROPS_PER_TICK = reducedMotion ? 6 : 32;
  const CLOUD_SLIDE_MS = 1800;
  const SETTLE_MS = 600;

  // 5 clouds: side, horizontal position when settled, top offset, width, flip, z
  const CLOUD_PRESETS = [
    { side: "left",  hx: "4vw",   top: "6vh",  width: 360, flip: false, z: 3 },
    { side: "right", hx: "6vw",   top: "10vh", width: 420, flip: true,  z: 4 },
    { side: "left",  hx: "26vw",  top: "2vh",  width: 280, flip: true,  z: 2 },
    { side: "right", hx: "28vw",  top: "4vh",  width: 320, flip: false, z: 2 },
    { side: "left",  hx: "44vw",  top: "12vh", width: 240, flip: false, z: 1 },
  ];

  function makeCloud(preset, index) {
    const img = document.createElement("img");
    img.src = "images/cloud.png";
    img.alt = "";
    img.decoding = "async";
    img.loading = "eager";
    img.className = `cloud cloud--${preset.side}`;
    img.style.width = `clamp(180px, ${preset.width / 14}vw, ${preset.width}px)`;
    img.style.top = preset.top;
    if (preset.side === "left") {
      img.style.left = preset.hx;
    } else {
      img.style.right = preset.hx;
    }
    img.style.zIndex = String(preset.z);
    if (preset.flip) img.style.setProperty("--flip", "-1");
    // Stagger the slide-in/out for a nicer parallax effect
    img.style.transitionDelay = `${index * 140}ms`;
    return img;
  }

  function once(el, event, handler, timeoutMs) {
    let done = false;
    const cleanup = () => {
      if (done) return;
      done = true;
      el.removeEventListener(event, onEvent);
      handler();
    };
    function onEvent(e) {
      if (e.target !== el) return;
      cleanup();
    }
    el.addEventListener(event, onEvent);
    if (timeoutMs) setTimeout(cleanup, timeoutMs);
  }

  function spawnDrops(rects) {
    if (!rects.length) return;
    const totalWeight = rects.reduce((sum, r) => sum + r.width, 0);
    if (totalWeight <= 0) return;
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < DROPS_PER_TICK; i++) {
      // Pick a cloud weighted by its width so wider clouds rain more
      let pick = Math.random() * totalWeight;
      let chosen = rects[0];
      for (const r of rects) {
        pick -= r.width;
        if (pick <= 0) { chosen = r; break; }
      }
      const x = chosen.left + 12 + Math.random() * Math.max(0, chosen.width - 24);
      const top = chosen.bottom - 14;

      const drop = document.createElement("span");
      drop.className = "drop";
      drop.style.left = `${x}px`;
      drop.style.top = `${top}px`;

      const height = 14 + Math.random() * 14;
      const widthPx = Math.random() < 0.55 ? 1 : 2;
      drop.style.height = `${height}px`;
      drop.style.width = `${widthPx}px`;

      fragment.appendChild(drop);

      const fallDistance = window.innerHeight - top + 80;
      const drift = (Math.random() - 0.5) * 32;
      const duration = 550 + Math.random() * 500;
      const delay = Math.random() * 100;

      const anim = drop.animate(
        [
          { transform: "translate3d(0, 0, 0)", opacity: 0 },
          { transform: "translate3d(0, 6px, 0)", opacity: 0.9, offset: 0.05 },
          {
            transform: `translate3d(${drift}px, ${fallDistance}px, 0)`,
            opacity: 0.9,
          },
        ],
        {
          duration,
          delay,
          easing: "cubic-bezier(.45,.05,.55,.95)",
          fill: "forwards",
        }
      );
      anim.onfinish = () => drop.remove();
      anim.oncancel = () => drop.remove();
    }
    rainLayer.appendChild(fragment);
  }

  function startRainFromClouds(rectsGetter) {
    return new Promise((resolve) => {
      const startedAt = performance.now();
      const interval = setInterval(() => {
        const elapsed = performance.now() - startedAt;
        if (elapsed >= RAIN_DURATION_MS) {
          clearInterval(interval);
          setTimeout(resolve, SETTLE_MS);
          return;
        }
        spawnDrops(rectsGetter());
      }, SPAWN_INTERVAL_MS);
    });
  }

  async function makeItRain() {
    if (isRunning) return;
    isRunning = true;
    btn.disabled = true;
    btn.setAttribute("aria-pressed", "true");

    const clouds = CLOUD_PRESETS.map((preset, i) => {
      const el = makeCloud(preset, i);
      cloudLayer.appendChild(el);
      return el;
    });

    // Force a reflow so initial transforms are applied before transitioning in
    clouds.forEach((c) => void c.getBoundingClientRect());

    requestAnimationFrame(() => {
      clouds.forEach((c) => c.classList.add("is-in"));
    });

    const maxWaitMs =
      CLOUD_SLIDE_MS + 140 * (CLOUD_PRESETS.length - 1) + 300;

    await new Promise((resolve) => {
      if (reducedMotion) return setTimeout(resolve, 500);
      let remaining = clouds.length;
      const tick = () => {
        remaining -= 1;
        if (remaining <= 0) resolve();
      };
      clouds.forEach((c) => once(c, "transitionend", tick, maxWaitMs));
    });

    const getRects = () => clouds.map((c) => c.getBoundingClientRect());

    await startRainFromClouds(getRects);

    clouds.forEach((c) => c.classList.remove("is-in"));

    await new Promise((resolve) => {
      if (reducedMotion) return setTimeout(resolve, 500);
      let remaining = clouds.length;
      const tick = () => {
        remaining -= 1;
        if (remaining <= 0) resolve();
      };
      clouds.forEach((c) => once(c, "transitionend", tick, maxWaitMs));
    });

    clouds.forEach((c) => c.remove());

    btn.disabled = false;
    btn.removeAttribute("aria-pressed");
    isRunning = false;
  }

  btn.addEventListener("click", () => {
    makeItRain();
  });

  // Email tooltip toggle
  const emailLink = document.getElementById("emailLink");
  const emailTooltip = document.getElementById("emailTooltip");
  if (emailLink && emailTooltip) {
    const setOpen = (open) => {
      emailTooltip.classList.toggle("is-open", open);
      emailLink.setAttribute("aria-expanded", open ? "true" : "false");
    };

    emailLink.addEventListener("click", (e) => {
      e.preventDefault();
      setOpen(!emailTooltip.classList.contains("is-open"));
    });

    document.addEventListener("click", (e) => {
      if (!emailTooltip.classList.contains("is-open")) return;
      if (emailLink.contains(e.target) || emailTooltip.contains(e.target))
        return;
      setOpen(false);
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && emailTooltip.classList.contains("is-open")) {
        setOpen(false);
        emailLink.focus();
      }
    });
  }
})();
