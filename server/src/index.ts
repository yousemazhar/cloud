import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4000);

createApp().listen(port, () => {
  console.log(`Mini-Jira API running on http://localhost:${port}`);
});
