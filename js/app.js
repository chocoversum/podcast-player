/**
 * Loads `data/episodes.json` + `data/player-config.json`, builds Podlove episode payloads,
 * embeds the player once, then swaps episodes by remounting (clears prior iframe).
 */

const EPISODES_URL = "data/episodes.json";
const PLAYER_CONFIG_URL = "data/player-config.json";

/** @type {PodloveStore | null} Redux store returned by podlovePlayer(). */
let playerStore = null;

/** @typedef {{ dispatch: (a: { type: string; payload?: unknown }) => void }} PodloveStore */

/**
 * Normalizes duration to "hh:mm:ss" or "hh:mm:ss.mmm" as used by Podlove.
 * @param {string} raw
 */
function normalizeDuration(raw) {
  const t = raw.trim();
  const parts = t.split(":").map((p) => p.trim());
  if (parts.length === 1) {
    const sec = parseFloat(parts[0], 10);
    if (!Number.isFinite(sec)) return "00:00:00";
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
  }
  if (parts.length === 2) {
    return `00:${parts[0].padStart(2, "0")}:${parts[1].padStart(2, "0")}`;
  }
  if (parts.length === 3) {
    return `${parts[0].padStart(2, "0")}:${parts[1].padStart(2, "0")}:${parts[2].padStart(2, "0")}`;
  }
  return "00:00:00";
}

/** Best-effort MIME type from file extension when `mimeType` is omitted in JSON. */
function guessMimeType(audioUrl, explicit) {
  if (explicit) return explicit;
  const path = (audioUrl || "").split("?")[0].toLowerCase();
  if (path.endsWith(".wav")) return "audio/wav";
  if (path.endsWith(".ogg") || path.endsWith(".oga")) return "audio/ogg";
  if (path.endsWith(".m4a") || path.endsWith(".mp4") || path.endsWith(".aac")) return "audio/mp4";
  return "audio/mpeg";
}

/**
 * Maps our simplified JSON episode to a Podlove Web Player 5 episode object.
 * @param {object} show
 * @param {object} ep
 */
function toPodloveEpisode(show, ep) {
  return {
    version: 5,
    show: {
      title: show.title || "",
      subtitle: show.subtitle || "",
      summary: show.summary || "",
      poster: show.poster || "",
      link: show.link || "",
    },
    title: ep.title || "Untitled",
    subtitle: ep.subtitle || "",
    summary: ep.summary || "",
    publicationDate: ep.publicationDate || new Date().toISOString(),
    duration: normalizeDuration(ep.duration || "00:00:00"),
    poster: ep.poster || "",
    link: ep.link || "",
    audio: [
      {
        url: ep.audioUrl,
        size: ep.size != null ? String(ep.size) : "0",
        title: ep.audioTitle || "Audio",
        mimeType: guessMimeType(ep.audioUrl, ep.mimeType),
      },
    ],
  };
}

function applyPlaybackRate(store) {
  const sel = document.getElementById("playback-rate");
  const rate = parseFloat(sel.value, 10);
  if (!store || !Number.isFinite(rate)) return;
  // Podlove store action from @podlove/player-actions (playback speed).
  store.dispatch({ type: "PLAYER_SET_RATE", payload: rate });
}

/**
 * Destroys any iframe inside the mount node and creates a fresh player instance.
 * @param {HTMLElement} mount
 * @param {object} episodePayload
 * @param {object} playerConfig
 * @returns {Promise<PodloveStore>}
 */
async function embedPlayer(mount, episodePayload, playerConfig) {
  mount.innerHTML = "";
  if (typeof window.podlovePlayer !== "function") {
    throw new Error("podlovePlayer is not available. Check the CDN script.");
  }
  const store = await window.podlovePlayer(mount, episodePayload, playerConfig);
  applyPlaybackRate(store);
  return store;
}

function setActiveEpisode(index) {
  document.querySelectorAll(".episode-list button").forEach((btn, i) => {
    btn.classList.toggle("is-active", i === index);
    btn.setAttribute("aria-current", i === index ? "true" : "false");
  });
}

function renderShownotes(html) {
  const panel = document.getElementById("shownotes-panel");
  const body = document.getElementById("shownotes-body");
  if (!html || !html.trim()) {
    panel.hidden = true;
    body.innerHTML = "";
    return;
  }
  panel.hidden = false;
  // JSON is maintained by you; treat summary as trusted HTML for rich shownotes.
  body.innerHTML = html;
}

function formatDurationLabel(isoish) {
  return normalizeDuration(isoish);
}

async function main() {
  const errEl = document.getElementById("load-error");
  const mount = document.getElementById("player-root");
  const listEl = document.getElementById("episode-list");

  try {
    const [epRes, cfgRes] = await Promise.all([fetch(EPISODES_URL), fetch(PLAYER_CONFIG_URL)]);
    if (!epRes.ok) throw new Error(`Could not load ${EPISODES_URL} (${epRes.status})`);
    if (!cfgRes.ok) throw new Error(`Could not load ${PLAYER_CONFIG_URL} (${cfgRes.status})`);

    const catalog = await epRes.json();
    const playerConfig = await cfgRes.json();

    const show = catalog.show || {};
    const episodes = Array.isArray(catalog.episodes) ? catalog.episodes : [];

    document.getElementById("show-title").textContent = show.title || "Podcast";
    document.getElementById("show-subtitle").textContent = show.subtitle || "";

    if (!episodes.length) {
      errEl.hidden = false;
      errEl.textContent = "No episodes found in episodes.json.";
      return;
    }

    // Build clickable episode rows (loads track into Podlove on click).
    listEl.innerHTML = "";
    episodes.forEach((ep, index) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      const dur = formatDurationLabel(ep.duration || "00:00:00");
      btn.innerHTML = `<span class="ep-title"></span><span class="ep-meta"></span>`;
      btn.querySelector(".ep-title").textContent = ep.title || `Episode ${index + 1}`;
      btn.querySelector(".ep-meta").textContent = `${dur}${ep.subtitle ? ` · ${ep.subtitle}` : ""}`;
      btn.addEventListener("click", async () => {
        const payload = toPodloveEpisode(show, ep);
        playerStore = await embedPlayer(mount, payload, playerConfig);
        setActiveEpisode(index);
        renderShownotes(ep.summary || "");
      });
      li.appendChild(btn);
      listEl.appendChild(li);
    });

    document.getElementById("playback-rate").addEventListener("change", () => {
      applyPlaybackRate(playerStore);
    });

    // First episode on load
    const first = episodes[0];
    const firstPayload = toPodloveEpisode(show, first);
    playerStore = await embedPlayer(mount, firstPayload, playerConfig);
    setActiveEpisode(0);
    renderShownotes(first.summary || "");
  } catch (e) {
    console.error(e);
    errEl.hidden = false;
    errEl.textContent =
      e.message ||
      "Failed to load. If you opened this file directly, use a local web server so fetch() can read JSON.";
  }
}

main();
