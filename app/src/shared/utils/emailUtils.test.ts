import { describe, expect, it } from "vitest";

import { getEmailType } from "./emailUtils";

describe("getEmailType", () => {
  it.each([
    ["user@gmail.com"],
    ["USER@ICLOUD.COM"],
    [" user@protonmail.com "],
  ])("classifies personal email domain %s", (email) => {
    expect(getEmailType(email)).toBe("personal");
  });

  it.each([
    ["person@example.com"],
    [" teammate@groundx.ai "],
    ["OWNER@EYELEVEL.AI"],
  ])("classifies business email domain %s", (email) => {
    expect(getEmailType(email)).toBe("business");
  });

  it.each(["", "missing-at-symbol", "@example.com", "name@", "name@example.com@extra"])(
    "rejects invalid email value %s",
    (email) => {
      expect(getEmailType(email)).toBe("invalid");
    }
  );
});
