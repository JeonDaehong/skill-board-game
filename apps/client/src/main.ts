import { createApp } from "./router.js";
import { menuScreen } from "./screens/menu.js";
import { makeAuth } from "./screens/auth.js";
import { applyLangAttrs } from "./i18n.js";
import { hasStoredToken, installSaveSync, restoreSession } from "./account.js";
import { grantStarterIfNew } from "./economy.js";
import { installUiSounds, primeAudio } from "./audio.js";

const root = document.getElementById("app");
if (!root) throw new Error("#app root element not found");

applyLangAttrs();
// Browsers keep an AudioContext suspended until the page has been touched, and
// one built before that never wakes on its own. The very first click anywhere
// starts it, so the first sound the game wants to make is already able to play.
for (const evt of ["pointerdown", "keydown"] as const) {
  window.addEventListener(evt, () => primeAudio(), { once: true, capture: true });
}
installUiSounds();
// Watch progress and upload it. Installed before anything reads or writes
// storage, so no change made during boot goes unnoticed.
installSaveSync();

const app = createApp(root);

/**
 * Boot: show something immediately, then find out who is playing.
 *
 * The token on file decides the first screen, without waiting for the network
 * to confirm it. A returning player should not be asked to log in again every
 * launch, and should not watch a blank page while a server that may be down
 * takes its time saying so — a refused connection alone costs a couple of
 * seconds, and a dead network costs the full timeout.
 *
 * So the game opens on local progress, and the session restore lands behind
 * it: a save that arrives rebuilds the menu under it (coins in the HUD would
 * otherwise be a version stale), and a token the server has forgotten sends
 * the player to the door instead.
 */
function boot(): void {
  // A brand new account owns nothing, and a collection of nothing cannot build
  // a deck — hand out the starter set before the first screen asks about decks.
  // Signing in does the same for its own save; this covers the player who has
  // not signed in at all yet.
  grantStarterIfNew();

  if (!hasStoredToken()) {
    app.navigate(makeAuth());
    return;
  }

  app.navigate(menuScreen);
  void restoreSession().then((account) => {
    if (account) {
      // Only if the player is still standing where we left them.
      if (app.isCurrent(menuScreen)) app.reload();
    } else if (!hasStoredToken()) {
      // The token was rejected, not merely unanswered.
      app.navigate(makeAuth());
    }
  });
}

boot();
