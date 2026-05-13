import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, vi } from "vitest";

let consoleErrorSpy: { mockRestore: () => void };

beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    throw new Error(`Unexpected console.error during test: ${args.map(String).join(" ")}`);
  });
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});
