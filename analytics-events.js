"use strict";

(() => {
  // Guard repeated inclusion: one delegated listener for each browser action.
  if (window.MGAnalyticsEvents) return;
  const config = window.MG_SITE_CONFIG || {};
  const measurementId = String(config.analyticsMeasurementId || "").trim().toUpperCase();
  const allowedHosts = (Array.isArray(config.analyticsAllowedHosts) ? config.analyticsAllowedHosts : ["mgrust.eu", "www.mgrust.eu"])
    .filter((host) => typeof host === "string" && /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/i.test(host.trim()))
    .map((host) => host.trim().toLowerCase());
  const productionHost = location.protocol === "https:" && allowedHosts.includes(location.hostname.toLowerCase());
  const seenEvents = new WeakSet();

  function measurementReady() {
    const state = window.MGConsent?.getState();
    return productionHost && /^G-[A-Z0-9]{5,}$/.test(measurementId)
      && state?.analytics === true && state.analyticsAvailable === true && state.analyticsHostAllowed === true
      && state.analyticsActive === true && typeof window.gtag === "function"
      && window["ga-disable-" + measurementId] !== true;
  }

  function identifyDestination(url) {
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "discord.gg" || (host === "discord.com" && /^\/invite\//.test(url.pathname))) {
      return { cta_id: "discord_join", destination_host: host };
    }
    if (host === "youtube.com" || host === "youtu.be") {
      if (/\/join\/?$/.test(url.pathname)) return { cta_id: "youtube_membership", destination_host: host };
      const candidate = host === "youtu.be" ? url.pathname.split("/")[1] : url.pathname === "/watch" ? url.searchParams.get("v") : url.pathname.match(/^\/(?:shorts|live)\/([\w-]{11})(?:\/|$)/)?.[1];
      return /^[\w-]{11}$/.test(candidate || "")
        ? { cta_id: "youtube_video", destination_host: host, video_id: candidate }
        : { cta_id: "youtube_channel", destination_host: host };
    }
    const destinations = {
      "twitch.tv": "twitch_channel",
      "mgrust.printify.me": "merch_store",
      "streamelements.com": "tip_support",
      "herohero.co": "herohero_support",
      "tiktok.com": "tiktok_channel",
      "store.steampowered.com": "steam_rust",
      "facepunch.com": "facepunch_website"
    };
    return destinations[host] ? { cta_id: destinations[host], destination_host: host } : null;
  }

  function placementFor(anchor) {
    const placements = [
      [".site-header", "header"],
      [".hero", "hero"],
      [".video-section", "creation"],
      [".community-section", "community"],
      [".membership-section", "membership"],
      [".site-footer", "footer"]
    ];
    return placements.find(([selector]) => anchor.closest(selector))?.[1] || "content";
  }

  function onOutboundClick(event) {
    if (event.defaultPrevented || seenEvents.has(event) || !measurementReady()) return;
    if (event.type === "click" && event.button !== 0) return;
    if (event.type === "auxclick" && event.button !== 1) return;
    const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (!anchor || anchor.hasAttribute("download")) return;
    let url;
    try { url = new URL(anchor.href, location.href); } catch (_) { return; }
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.origin === location.origin) return;
    const destination = identifyDestination(url);
    if (!destination) return;
    seenEvents.add(event);
    // Fixed identifiers only: never collect anchor text, full URLs, query strings,
    // account names, invitation tokens or user-entered values.
    window.gtag("event", "outbound_click", {
      send_to: measurementId,
      ...destination,
      link_placement: placementFor(anchor)
    });
  }

  document.addEventListener("click", onOutboundClick);
  document.addEventListener("auxclick", onOutboundClick);
  window.MGAnalyticsEvents = Object.freeze({ version: 1, eventName: "outbound_click" });
})();
