import { beforeEach, describe, expect, it, vi } from "vitest";

const axiosMock = vi.hoisted(() => ({
  get: vi.fn(),
}));

vi.mock("@/api/axios", () => ({ default: axiosMock }));

import { getGroundXCustomer } from "./groundxCustomerEntity";

describe("groundxCustomerEntity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("gets the GroundX customer and unwraps response data", async () => {
    const response = { customer: { customerId: "cust-1", email: "a@example.com" } };
    axiosMock.get.mockResolvedValueOnce({ data: response });

    await expect(getGroundXCustomer()).resolves.toBe(response);

    expect(axiosMock.get).toHaveBeenCalledWith(
      "/api/v1/customer",
      expect.objectContaining({ signal: undefined })
    );
  });
});
