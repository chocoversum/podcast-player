/**
 * Chocoversum Podcast – schlanker, eigener Audio-Player ohne Fremd-Embed.
 *
 * Umsetzt Claras Wunschliste:
 *   - Cover Foto, Hochladedatum, Folgenname, Textspalte
 *   - Fortschrittsbalken (zeigt die Länge)
 *   - gemeinsamer Play-/Pause-Knopf
 *   - 15 Sekunden zurück, 30 Sekunden vor
 *   - Homebutton zurück zur Menüseite
 */

const EPISODES_URL = "data/episodes.json";
const SKIP_BACK = 15; // Sekunden
const SKIP_FWD = 30; // Sekunden
const FALLBACK_COVER = "assets/cover.svg";

/** @type {object[]} */
let episodes = [];
/** @type {object} */
let show = {};
/** @type {number} */
let currentIndex = -1;

const el = (id) => document.getElementById(id);

const audio = el("audio");

/* ---------------------------------------------------------------- Hilfen */

/** Sekunden -> "mm:ss" oder "h:mm:ss". */
function formatTime(totalSeconds) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "00:00";
  const s = Math.floor(totalSeconds % 60);
  const m = Math.floor((totalSeconds / 60) % 60);
  const h = Math.floor(totalSeconds / 3600);
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** "hh:mm:ss" / "mm:ss" / Sekunden -> Sekunden (Zahl). */
function durationToSeconds(raw) {
  if (raw == null) return 0;
  const t = String(raw).trim();
  if (!t) return 0;
  const parts = t.split(":").map((p) => parseFloat(p));
  if (parts.some((n) => !Number.isFinite(n))) return 0;
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

/** ISO-Datum -> "12. April 2026". Fällt auf den Rohwert zurück. */
function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" });
}

/** Entfernt HTML-Tags für Kurztexte in der Liste. */
function stripHtml(html) {
  const tmp = document.createElement("div");
  tmp.innerHTML = html || "";
  return (tmp.textContent || "").trim();
}

function posterFor(ep) {
  return ep.poster || show.poster || FALLBACK_COVER;
}

/* ----------------------------------------------------------- Ansichten */

function showMenu() {
  el("player-view").hidden = true;
  el("menu-view").hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showPlayerView() {
  el("menu-view").hidden = true;
  el("player-view").hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ----------------------------------------------------------- Menüseite */

function renderMenu() {
  el("show-title").textContent = show.title || "Podcast";
  el("show-subtitle").textContent = show.subtitle || "";

  const cover = el("show-cover");
  cover.src = show.poster || FALLBACK_COVER;
  cover.alt = show.title ? `Cover: ${show.title}` : "Podcast-Cover";

  const list = el("episode-list");
  list.innerHTML = "";

  episodes.forEach((ep, index) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "episode-row";

    const img = document.createElement("img");
    img.className = "episode-row__cover";
    img.src = posterFor(ep);
    img.alt = "";
    img.loading = "lazy";

    const info = document.createElement("div");
    info.className = "episode-row__info";

    const title = document.createElement("span");
    title.className = "episode-row__title";
    title.textContent = ep.title || `Folge ${index + 1}`;

    const meta = document.createElement("span");
    meta.className = "episode-row__meta";
    const date = formatDate(ep.publicationDate);
    const dur = formatTime(durationToSeconds(ep.duration));
    meta.textContent = [date, dur].filter(Boolean).join(" · ");

    const text = document.createElement("span");
    text.className = "episode-row__text";
    text.textContent = ep.subtitle || stripHtml(ep.summary);

    info.append(title, meta, text);
    btn.append(img, info);
    btn.addEventListener("click", () => openEpisode(index));
    li.appendChild(btn);
    list.appendChild(li);
  });
}

/* --------------------------------------------------------- Player-Seite */

function openEpisode(index) {
  const ep = episodes[index];
  if (!ep) return;
  currentIndex = index;

  el("player-cover").src = posterFor(ep);
  el("player-cover").alt = ep.title ? `Cover: ${ep.title}` : "Cover";
  el("player-title").textContent = ep.title || `Folge ${index + 1}`;
  el("player-date").textContent = formatDate(ep.publicationDate);
  el("player-text").innerHTML = ep.summary || (ep.subtitle ? `<p>${ep.subtitle}</p>` : "");

  // Dauer schon vor dem Laden anzeigen (aus JSON), bis Metadaten da sind.
  const jsonDur = durationToSeconds(ep.duration);
  el("time-total").textContent = formatTime(jsonDur);
  el("time-current").textContent = "00:00";
  el("seek").value = "0";

  audio.src = ep.audioUrl || "";
  audio.playbackRate = parseFloat(el("playback-rate").value) || 1;
  audio.load();

  showPlayerView();

  audio.play().catch(() => {
    /* Autoplay kann blockiert sein – Nutzer:in tippt dann auf Play. */
  });
}

function setPlayIcon(isPlaying) {
  el("icon-play").hidden = isPlaying;
  el("icon-pause").hidden = !isPlaying;
  el("play-pause").setAttribute("aria-label", isPlaying ? "Pause" : "Abspielen");
}

function togglePlay() {
  if (!audio.src) return;
  if (audio.paused) audio.play().catch(() => {});
  else audio.pause();
}

function skip(seconds) {
  if (!Number.isFinite(audio.duration)) {
    audio.currentTime = Math.max(0, audio.currentTime + seconds);
    return;
  }
  audio.currentTime = Math.min(audio.duration, Math.max(0, audio.currentTime + seconds));
}

function updateProgress() {
  const dur = audio.duration;
  const cur = audio.currentTime;
  el("time-current").textContent = formatTime(cur);
  if (Number.isFinite(dur) && dur > 0) {
    el("time-total").textContent = formatTime(dur);
    el("seek").value = String(Math.round((cur / dur) * 1000));
  }
}

function seekFromSlider() {
  const dur = audio.duration;
  if (!Number.isFinite(dur) || dur <= 0) return;
  const ratio = parseInt(el("seek").value, 10) / 1000;
  audio.currentTime = ratio * dur;
}

/* --------------------------------------------------------------- Setup */

function wireEvents() {
  el("home-button").addEventListener("click", showMenu);
  el("play-pause").addEventListener("click", togglePlay);
  el("back-15").addEventListener("click", () => skip(-SKIP_BACK));
  el("fwd-30").addEventListener("click", () => skip(SKIP_FWD));
  el("seek").addEventListener("input", seekFromSlider);

  el("playback-rate").addEventListener("change", (e) => {
    const rate = parseFloat(e.target.value);
    if (Number.isFinite(rate)) audio.playbackRate = rate;
  });

  audio.addEventListener("play", () => setPlayIcon(true));
  audio.addEventListener("pause", () => setPlayIcon(false));
  audio.addEventListener("timeupdate", updateProgress);
  audio.addEventListener("loadedmetadata", updateProgress);
  audio.addEventListener("ended", () => setPlayIcon(false));

  // Cover-Bilder, die nicht laden, auf das Platzhalter-Cover zurücksetzen.
  document.addEventListener(
    "error",
    (e) => {
      const t = e.target;
      if (t instanceof HTMLImageElement && t.src && !t.src.endsWith(FALLBACK_COVER)) {
        t.src = FALLBACK_COVER;
      }
    },
    true
  );

  // Tastatur: Leertaste = Play/Pause, Pfeile = spulen (nur in Player-Ansicht).
  document.addEventListener("keydown", (e) => {
    if (el("player-view").hidden) return;
    const tag = (e.target && e.target.tagName) || "";
    if (tag === "SELECT" || tag === "INPUT") return;
    if (e.code === "Space") {
      e.preventDefault();
      togglePlay();
    } else if (e.code === "ArrowLeft") {
      e.preventDefault();
      skip(-SKIP_BACK);
    } else if (e.code === "ArrowRight") {
      e.preventDefault();
      skip(SKIP_FWD);
    }
  });
}

async function main() {
  const errEl = el("load-error");
  wireEvents();

  try {
    const res = await fetch(EPISODES_URL);
    if (!res.ok) throw new Error(`${EPISODES_URL} konnte nicht geladen werden (${res.status}).`);
    const catalog = await res.json();

    show = catalog.show || {};
    episodes = Array.isArray(catalog.episodes) ? catalog.episodes : [];

    renderMenu();

    if (!episodes.length) {
      errEl.hidden = false;
      errEl.textContent = "Keine Folgen in episodes.json gefunden.";
    }
  } catch (e) {
    console.error(e);
    errEl.hidden = false;
    errEl.textContent =
      e.message ||
      "Laden fehlgeschlagen. Beim direkten Öffnen der Datei bitte einen lokalen Webserver nutzen, damit fetch() das JSON lesen kann.";
  }
}

main();
