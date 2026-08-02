import { createApp } from "./router.js";
import { menuScreen } from "./screens/menu.js";
import { applyLangAttrs } from "./i18n.js";

const root = document.getElementById("app");
if (!root) throw new Error("#app root element not found");

applyLangAttrs();

const app = createApp(root);
app.navigate(menuScreen);
