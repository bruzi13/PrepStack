import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AppProvider } from "@/app/AppContext";
import App from "@/app/App";
import "@/styles/global.css";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { installMonitor } from "@/app/monitor";

installMonitor();

createRoot(document.getElementById("root")!).render(
  <StrictMode><ErrorBoundary><BrowserRouter><AppProvider><App /></AppProvider></BrowserRouter></ErrorBoundary></StrictMode>,
);
