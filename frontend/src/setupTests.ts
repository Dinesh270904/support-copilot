import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
  window.sessionStorage.clear(); // saved reply drafts are per tab; never leak them between tests
  window.location.hash = ""; // the URL hash is app state; never leak it between tests
});
