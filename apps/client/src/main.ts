import { createApp } from "./router.js";
import { menuScreen } from "./screens/menu.js";
import { applyLangAttrs } from "./i18n.js";
import { grantStarterIfNew } from "./economy.js";

const root = document.getElementById("app");
if (!root) throw new Error("#app root element not found");

applyLangAttrs();
// A brand new account owns nothing, and a collection of nothing cannot build a
// deck — hand out the starter set before the first screen can ask about decks.
grantStarterIfNew();

const app = createApp(root);
app.navigate(menuScreen);
