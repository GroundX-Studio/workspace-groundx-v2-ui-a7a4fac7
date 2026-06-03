import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Api } from "@/api/client";
import { ApiProvider, useApi } from "@/contexts/ApiContext";

const Probe = () => {
  const api = useApi();
  return <div data-testid="probe">{typeof api.chat.sendChatMessage}</div>;
};

describe("ApiContext", () => {
  it("provides the injected client to consumers via useApi()", () => {
    const sendChatMessage = vi.fn();
    const fake = { chat: { sendChatMessage } } as unknown as Api;

    render(
      <ApiProvider value={fake}>
        <Probe />
      </ApiProvider>
    );

    expect(screen.getByTestId("probe").textContent).toBe("function");
  });

  it("throws when useApi() is used outside an ApiProvider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(<Probe />)).toThrow(/useApi must be used inside an ApiProvider/);
    spy.mockRestore();
  });
});
