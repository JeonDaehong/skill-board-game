import { createApp } from "./router.js";
import { menuScreen } from "./screens/menu.js";

const root = document.getElementById("app");
if (!root) throw new Error("#app root element not found");

const app = createApp(root);
app.navigate(menuScreen);
