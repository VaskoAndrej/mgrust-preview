"use strict";

(() => {
  const config = window.MG_SITE_CONFIG || {};
  const version = Number.isInteger(config.consentVersion) ? config.consentVersion : 1;
  const storageKey = "mgrust.consent.v1";
  const maxAgeDays = Math.min(365, Math.max(1, Number(config.consentMaxAgeDays) || 180));
  const maxAge = maxAgeDays * 86400000;
  const measurementId = String(config.analyticsMeasurementId || "").trim().toUpperCase();
  const analyticsConfigured = /^G-[A-Z0-9]{5,}$/.test(measurementId);
  const localPreview = !/^https?:$/.test(location.protocol) || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || /\.test$/.test(location.hostname);
  const analyticsAvailable = analyticsConfigured && (!localPreview || config.allowLocalAnalytics === true);
  const guildId = /^\d{15,22}$/.test(String(config.discordGuildId || "")) ? String(config.discordGuildId) : "";
  const externalMediaConfigured = Boolean(guildId || config.discordInviteCode);
  let preferences = { analytics: false, externalMedia: false };
  let hasChoice = false;
  let tagStarted = false;
  let analyticsActive = false;
  let storageAvailable = true;
  let returnFocus = null;

  function loadChoice() {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      const choice = JSON.parse(raw);
      if (!choice || choice.version !== version || typeof choice.savedAt !== "number" || choice.savedAt > Date.now() || Date.now() - choice.savedAt >= maxAge || typeof choice.analytics !== "boolean" || typeof choice.externalMedia !== "boolean") {
        localStorage.removeItem(storageKey);
        return null;
      }
      return { analytics: choice.analytics && analyticsAvailable, externalMedia: choice.externalMedia && externalMediaConfigured };
    } catch (_) {
      storageAvailable = false;
      return null;
    }
  }

  function storeChoice(choice) {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ version, savedAt: Date.now(), analytics: choice.analytics, externalMedia: choice.externalMedia }));
      storageAvailable = true;
    } catch (_) {
      storageAvailable = false;
      // A full/blocked store must not retain an earlier opt-in after withdrawal.
      try { localStorage.removeItem(storageKey); } catch (_) { /* Storage may be inaccessible. */ }
    }
  }

  function clearAnalyticsCookies() {
    // Only cookies belonging to known Google Analytics namespaces are removed.
    // Cookies on Google/Discord origins cannot be deleted from this origin.
    const names = document.cookie.split(";").map((cookie) => cookie.split("=")[0].trim()).filter((name) => /^(_ga(?:_|$)|_gid$|_gat(?:_|$))/.test(name));
    const domains = [""];
    const hostParts = location.hostname.split(".");
    for (let i = 0; i < hostParts.length - 1; i++) {
      const domain = hostParts.slice(i).join(".");
      domains.push(domain, "." + domain);
    }
    const paths = new Set(["/"]);
    const segments = location.pathname.split("/").filter(Boolean);
    let path = "";
    for (const segment of segments) {
      path += "/" + segment;
      paths.add(path);
      paths.add(path + "/");
    }
    for (const name of names) for (const domain of domains) for (const cookiePath of paths) {
      document.cookie = `${name}=; Max-Age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${cookiePath}${domain ? "; domain=" + domain : ""}`;
    }
  }

  function getState() {
    return Object.freeze({ ...preferences, hasChoice, analyticsConfigured, analyticsActive, externalMediaConfigured, discordWidgetEnabled: config.discordWidgetEnabled === true, storageAvailable });
  }

  function emitChange() {
    window.dispatchEvent(new CustomEvent("mg:consentchange", { detail: getState() }));
  }

  function startAnalytics() {
    if (!preferences.analytics || !analyticsAvailable || tagStarted) return;
    window["ga-disable-" + measurementId] = false;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    // Basic consent mode: no Google library or requests before affirmative opt-in.
    window.gtag("consent", "default", { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
    window.gtag("consent", "update", { analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
    window.gtag("js", new Date());
    window.gtag("config", measurementId, {
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      cookie_expires: Math.min(365, Math.max(1, Number(config.analyticsCookieDays) || 180)) * 86400,
      cookie_update: false,
      page_location: location.origin + location.pathname,
      page_referrer: safeReferrer()
    });
    const tag = document.createElement("script");
    tag.id = "mg-analytics-tag";
    tag.async = true;
    tag.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(measurementId);
    tag.addEventListener("load", () => {
      analyticsActive = preferences.analytics;
      refreshStatus();
      emitChange();
    });
    tag.addEventListener("error", () => {
      analyticsActive = false;
      refreshStatus();
      emitChange();
    });
    tagStarted = true;
    document.head.append(tag);
  }

  function safeReferrer() {
    try { return document.referrer ? new URL(document.referrer).origin + "/" : ""; }
    catch (_) { return ""; }
  }

  function stopAnalytics() {
    if (analyticsConfigured) window["ga-disable-" + measurementId] = true;
    analyticsActive = false;
    if (tagStarted && typeof window.gtag === "function") {
      window.gtag("consent", "update", { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
    }
    document.getElementById("mg-analytics-tag")?.remove();
    clearAnalyticsCookies();
  }

  function renderExternalMedia() {
    // The parent page handles the public invite-count card. The official iframe
    // is inserted only when the server owner has enabled it in Discord settings.
    if (config.discordWidgetEnabled !== true || !guildId) return;
    document.querySelectorAll("[data-discord-widget]").forEach((container) => {
      const current = container.querySelector("iframe[data-mg-discord-frame]");
      if (preferences.externalMedia) {
        if (current) return;
        const placeholder = container.querySelector(".discord-widget-placeholder");
        if (placeholder) placeholder.hidden = true;
        const frame = document.createElement("iframe");
        frame.className = "discord-widget-frame";
        frame.dataset.mgDiscordFrame = "";
        frame.title = "MG Rust Survival — Discord komunita a online členovia";
        frame.src = "https://discord.com/widget?id=" + guildId + "&theme=dark";
        frame.width = "350";
        frame.height = "500";
        frame.loading = "lazy";
        frame.referrerPolicy = "no-referrer";
        frame.setAttribute("sandbox", "allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts");
        container.append(frame);
      } else {
        current?.remove();
        const placeholder = container.querySelector(".discord-widget-placeholder");
        if (placeholder) placeholder.hidden = false;
      }
    });
  }

  const storedChoice = loadChoice();
  if (storedChoice) { preferences = storedChoice; hasChoice = true; }
  if (!preferences.analytics) stopAnalytics();

  const dialog = document.createElement("dialog");
  dialog.id = "privacy-dialog";
  dialog.className = "consent-dialog";
  dialog.setAttribute("aria-labelledby", "consent-title");
  dialog.setAttribute("aria-describedby", "consent-intro");
  dialog.innerHTML = `
    <div class="consent-inner">
      <div class="consent-topline"><span class="consent-brand">TVOJE SÚKROMIE</span><button class="consent-close" type="button" data-consent-close aria-label="Zavrieť bez zmeny nastavení"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></div>
      <h2 class="consent-title" id="consent-title">Povoliť cookies?</h2>
      <p class="consent-intro" id="consent-intro">Dáta nám pomáhajú rásť a zlepšovať web. Vyber si, ktoré voliteľné služby nám dovolíš používať.</p>
      <a class="consent-policy" href="privacy.html">Ochrana súkromia a cookies <svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 19 19 5M7 5h12v12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></a>
      <div class="consent-settings" id="consent-settings" hidden>
        <div class="consent-category"><div class="consent-category-heading"><h3>Nevyhnutné nastavenia</h3><span class="consent-always">VŽDY AKTÍVNE</span></div><p>Uložíme len tvoju voľbu súkromia do tohto prehliadača, aby sa okno nezobrazovalo pri každej návšteve. Platnosť voľby je najviac ${maxAgeDays} dní.</p></div>
        <div class="consent-category"><label for="consent-analytics">Analytika návštevnosti<input type="checkbox" role="switch" id="consent-analytics" aria-describedby="consent-analytics-description consent-analytics-status"></label><p id="consent-analytics-description">Google Analytics 4 pomáha porozumieť návštevám. Po povolení môže Google spracúvať informácie o stránke, prehliadači a zariadení a uložiť analytické cookies. Reklamná personalizácia je vypnutá.</p><p class="consent-service-status" id="consent-analytics-status"></p></div>
        <div class="consent-category"><label for="consent-external">Externý obsah Discord<input type="checkbox" role="switch" id="consent-external" aria-describedby="consent-external-description"></label><p id="consent-external-description">Načíta živé počty členov komunity a dostupný Discord widget. Prehliadač sa spojí so službou Discord, ktorej sprístupní IP adresu a technické údaje. Vložený obsah môže používať vlastné úložiská.</p></div>
      </div>
      <div class="consent-actions"><button class="consent-button" type="button" data-consent-reject>Odmietnuť voliteľné</button><button class="consent-button" type="button" data-consent-accept>Prijať všetky dostupné</button><button class="consent-button consent-button-secondary consent-customize" type="button" data-consent-customize aria-expanded="false" aria-controls="consent-settings">Prispôsobiť nastavenia</button><button class="consent-button consent-button-secondary consent-customize" type="button" data-consent-save hidden>Uložiť môj výber</button></div>
      <p class="consent-note" data-consent-note>Nastavenia môžeš kedykoľvek zmeniť alebo súhlas odvolať v päte webu. Zatvorenie okna ani posúvanie stránky nie je súhlas.</p>
      <button class="consent-reset" type="button" data-consent-reset hidden>Vymazať uloženú voľbu a odvolať súhlasy</button>
    </div>`;
  document.body.append(dialog);

  const announcement = document.createElement("p");
  announcement.className = "consent-announcement";
  announcement.setAttribute("role", "status");
  announcement.setAttribute("aria-live", "polite");
  document.body.append(announcement);

  const analyticsInput = dialog.querySelector("#consent-analytics");
  const externalInput = dialog.querySelector("#consent-external");
  const settings = dialog.querySelector("#consent-settings");
  const customizeButton = dialog.querySelector("[data-consent-customize]");
  const saveButton = dialog.querySelector("[data-consent-save]");
  analyticsInput.disabled = !analyticsAvailable;
  externalInput.disabled = !externalMediaConfigured;

  function refreshStatus() {
    const status = dialog.querySelector("#consent-analytics-status");
    status.textContent = !analyticsConfigured ? "Analytika zatiaľ nie je pripojená. V tejto verzii sa návštevy nemerajú." : !analyticsAvailable ? "V lokálnom náhľade je meranie vypnuté." : !preferences.analytics ? "Aktuálne vypnutá. Spustí sa až po tvojom súhlase." : analyticsActive ? "Povolená. Google tag sa načítal." : "Povolená. Načítanie môže obmedziť prehliadač alebo blokovanie obsahu.";
    dialog.querySelector("[data-consent-reset]").hidden = !hasChoice;
    if (!storageAvailable) dialog.querySelector("[data-consent-note]").textContent = "Prehliadač nepovolil uloženie voľby. Nastavenie platí pre túto otvorenú stránku a pri ďalšej návšteve sa okno zobrazí znova.";
  }

  function showSettings(category) {
    settings.hidden = false;
    customizeButton.hidden = true;
    customizeButton.setAttribute("aria-expanded", "true");
    saveButton.hidden = false;
    const focusTarget = category === "externalMedia" && !externalInput.disabled ? externalInput : !analyticsInput.disabled ? analyticsInput : externalInput.disabled ? saveButton : externalInput;
    focusTarget.focus({ preventScroll: true });
    focusTarget.scrollIntoView({ block: "nearest", behavior: "instant" });
  }

  function open(category) {
    returnFocus = document.activeElement;
    analyticsInput.checked = preferences.analytics;
    externalInput.checked = preferences.externalMedia;
    settings.hidden = true;
    customizeButton.hidden = false;
    customizeButton.setAttribute("aria-expanded", "false");
    saveButton.hidden = true;
    refreshStatus();
    if (!dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else { dialog.setAttribute("open", ""); dialog.setAttribute("role", "dialog"); dialog.setAttribute("aria-modal", "true"); }
    }
    if (category) showSettings(category);
    else dialog.querySelector("[data-consent-close]").focus();
  }

  function close() {
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
    if (returnFocus instanceof HTMLElement && returnFocus.isConnected) returnFocus.focus({ preventScroll: true });
  }

  function setPreferences(choice, options = {}) {
    const reloadRequired = tagStarted && preferences.analytics && !choice.analytics;
    preferences = { analytics: choice.analytics === true && analyticsAvailable, externalMedia: choice.externalMedia === true && externalMediaConfigured };
    hasChoice = options.persist !== false;
    if (options.persist !== false) storeChoice(preferences);
    if (preferences.analytics) startAnalytics();
    else stopAnalytics();
    renderExternalMedia();
    refreshStatus();
    emitChange();
    close();
    announcement.textContent = "Nastavenia súkromia boli uložené.";
    // A reload removes the already executed Google runtime after withdrawal.
    if (reloadRequired) location.reload();
    return getState();
  }

  function reset() {
    try { localStorage.removeItem(storageKey); } catch (_) { storageAvailable = false; }
    const hadTag = tagStarted;
    setPreferences({ analytics: false, externalMedia: false }, { persist: false });
    if (!hadTag) open("settings");
  }

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest("[data-consent-open]") : null;
    if (!target) return;
    event.preventDefault();
    open(target.dataset.consentOpen || (hasChoice ? "settings" : ""));
  });
  dialog.querySelector("[data-consent-close]").addEventListener("click", close);
  dialog.querySelector("[data-consent-reject]").addEventListener("click", () => setPreferences({ analytics: false, externalMedia: false }));
  dialog.querySelector("[data-consent-accept]").addEventListener("click", () => setPreferences({ analytics: analyticsAvailable, externalMedia: externalMediaConfigured }));
  customizeButton.addEventListener("click", () => showSettings());
  saveButton.addEventListener("click", () => setPreferences({ analytics: analyticsInput.checked, externalMedia: externalInput.checked }));
  dialog.querySelector("[data-consent-reset]").addEventListener("click", reset);
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); close(); });
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { event.preventDefault(); close(); }
    if (event.key !== "Tab" || typeof dialog.showModal === "function") return;
    const focusable = [...dialog.querySelectorAll("button:not([disabled]), a[href], input:not([disabled])")].filter((element) => !element.hidden && element.getClientRects().length);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  window.addEventListener("storage", (event) => {
    if (event.key !== storageKey && event.key !== null) return;
    const next = loadChoice();
    const reloadRequired = tagStarted && preferences.analytics && !next?.analytics;
    preferences = next || { analytics: false, externalMedia: false };
    hasChoice = Boolean(next);
    if (preferences.analytics) startAnalytics();
    else stopAnalytics();
    renderExternalMedia();
    refreshStatus();
    emitChange();
    if (reloadRequired) location.reload();
  });

  document.querySelectorAll("[data-controller-name]").forEach((element) => {
    if (typeof config.controllerName === "string" && config.controllerName.trim()) element.textContent = config.controllerName.trim();
  });
  document.querySelectorAll("[data-privacy-contact]").forEach((element) => {
    const contact = typeof config.privacyContact === "string" ? config.privacyContact.trim() : "";
    if (contact && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) {
      const link = document.createElement("a");
      link.href = "mailto:" + contact;
      link.textContent = contact;
      element.replaceChildren(link);
    }
  });
  document.querySelectorAll("[data-analytics-policy-status]").forEach((element) => {
    element.textContent = analyticsConfigured ? "Google Analytics 4 je pripojený a načíta sa len po povolení analytiky. Bez súhlasu sa službe Google neposiela meranie ani stav súhlasu." : "Google Analytics 4 zatiaľ nie je pripojený. Tento web momentálne nemeria návštevnosť cez analytickú službu.";
  });
  window.MGConsent = Object.freeze({ getState, open, reset, setPreferences });
  refreshStatus();
  startAnalytics();
  renderExternalMedia();
  emitChange();
  if (!hasChoice) open();
})();
