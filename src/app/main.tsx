import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AppProvider } from "@/app/AppContext";
import { createAppServices } from "@/app/AppServices";
import App from "@/app/App";
import "@/styles/global.css";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const services = createAppServices(import.meta.env.VITE_DEMO === "1");
services.errorReporter.install();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary reporter={services.errorReporter}>
      <BrowserRouter>
        <AppProvider services={services}><App /></AppProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
