"use strict";

// Public configuration only. Never put account passwords or API secrets here.
// Set a real GA4 ID (G-...) to connect analytics. Until then no analytics tag loads.
// If new services/purposes are introduced, increase consentVersion so visitors choose again.
window.MG_SITE_CONFIG = Object.freeze({
  analyticsMeasurementId: "",
  allowLocalAnalytics: false,
  discordGuildId: "1221942429620506734",
  discordInviteCode: "mgrust",
  // The server's official widget is currently disabled in Discord server settings.
  // Enable it there before changing this flag. Live invite counts are handled by script.js.
  discordWidgetEnabled: false,
  consentVersion: 1,
  consentMaxAgeDays: 180,
  analyticsCookieDays: 180,
  controllerName: "",
  privacyContact: ""
});
