"use strict";

const videoGrid = document.getElementById("video-grid");
const videoData = Array.isArray(window.MG_RUST_VIDEOS) ? window.MG_RUST_VIDEOS : [];

function createIcon(name) {
  const namespace = "http://www.w3.org/2000/svg";
  const icon = document.createElementNS(namespace, "svg");
  icon.setAttribute("class", "icon");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("focusable", "false");
  const symbol = document.createElementNS(namespace, "use");
  symbol.setAttribute("href", `#${name}`);
  icon.append(symbol);
  return icon;
}

for (const video of videoData.slice(0, 3)) {
  if (!/^[\w-]{11}$/.test(video.id) || typeof video.title !== "string") continue;

  const card = document.createElement("a");
  card.className = "video-card";
  card.href = `https://www.youtube.com/watch?v=${video.id}`;
  if (Number.isSafeInteger(video.startSeconds) && video.startSeconds > 0) card.href += `&t=${video.startSeconds}s`;
  card.target = "_blank";
  card.rel = "noopener noreferrer";
  card.setAttribute("aria-label", `Pozrieť video: ${video.title}`);

  const thumb = document.createElement("div");
  thumb.className = "video-thumb";
  const image = document.createElement("img");
  image.src = `assets/videos/${video.id}.jpg`;
  image.alt = "";
  image.loading = "lazy";
  image.width = 1280;
  image.height = 720;
  thumb.append(image);
  const play = document.createElement("span");
  play.className = "play-mark";
  play.append(createIcon("play"));
  play.setAttribute("aria-hidden", "true");
  thumb.append(play);

  const title = document.createElement("h3");
  title.textContent = video.title;
  const open = document.createElement("span");
  open.className = "video-open";
  open.textContent = "Pozrieť video";
  open.append(createIcon("arrow"));
  card.append(thumb, title, open);
  videoGrid.append(card);
}

if (!videoGrid.children.length) {
  const fallback = document.createElement("div");
  fallback.className = "video-fallback";
  const message = document.createElement("p");
  message.textContent = "Moju tvorbu nájdeš na YouTube kanáli MG Rust Survival.";
  const link = document.createElement("a");
  link.className = "text-link";
  link.href = "https://www.youtube.com/@MGRustSurvival/videos";
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "Otvoriť kanál";
  link.append(createIcon("arrow"));
  fallback.append(message, link);
  videoGrid.append(fallback);
}

document.getElementById("year").textContent = String(new Date().getFullYear());

// Public Discord counts are requested only after the visitor opts into external content.
const discordShell = document.querySelector(".discord-live-shell");
let discordRequest = null;
let discordLoaded = false;

async function updateDiscordPresence(consent) {
  if (!discordShell || window.MG_SITE_CONFIG?.discordWidgetEnabled) return;
  const members = discordShell.querySelector("[data-discord-members]");
  const online = discordShell.querySelector("[data-discord-online]");
  const status = discordShell.querySelector("[data-discord-status]");
  const enableButton = discordShell.querySelector("[data-discord-enable]");
  if (!members || !online || !status || !enableButton) return;

  if (!consent?.externalMedia) {
    discordRequest?.abort();
    discordRequest = null;
    discordLoaded = false;
    discordShell.classList.remove("is-live");
    members.textContent = "1 300+";
    online.textContent = "—";
    status.textContent = "Povoľ externý obsah a pozri, koľkí sú práve online.";
    enableButton.hidden = false;
    return;
  }
  enableButton.hidden = true;
  if (discordLoaded || discordRequest) return;
  const controller = new AbortController();
  discordRequest = controller;
  status.textContent = "Načítavam živý prehľad z Discordu…";
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch("https://discord.com/api/v10/invites/mgrust?with_counts=true", {
      credentials: "omit", referrerPolicy: "no-referrer", signal: controller.signal
    });
    if (!response.ok) throw new Error("Discord response unavailable");
    const data = await response.json();
    if (data.guild?.id !== window.MG_SITE_CONFIG?.discordGuildId ||
        !Number.isSafeInteger(data.approximate_member_count) ||
        !Number.isSafeInteger(data.approximate_presence_count)) throw new Error("Unexpected Discord data");
    if (controller.signal.aborted || !window.MGConsent?.getState().externalMedia) return;
    const formatter = new Intl.NumberFormat("sk-SK");
    members.textContent = formatter.format(data.approximate_member_count);
    online.textContent = formatter.format(data.approximate_presence_count);
    status.textContent = "Približné počty priamo z Discordu. Obnovené pri otvorení stránky.";
    discordShell.classList.add("is-live");
    discordLoaded = true;
  } catch (error) {
    if (!window.MGConsent?.getState().externalMedia) return;
    status.textContent = "Živý prehľad teraz nie je dostupný. Na Discord sa môžeš pridať cez odkaz nižšie.";
  } finally {
    clearTimeout(timeout);
    if (discordRequest === controller) discordRequest = null;
  }
}
window.addEventListener("mg:consentchange", (event) => updateDiscordPresence(event.detail));
if (window.MGConsent) updateDiscordPresence(window.MGConsent.getState());
