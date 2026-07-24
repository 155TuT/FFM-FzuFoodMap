import React from "react";
import ReactDOM from "react-dom/client";
import "./styles/global.css";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/?$/, "/");
  const swUrl = `${base}sw.js`;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(swUrl).catch(() => undefined);
  });
}
