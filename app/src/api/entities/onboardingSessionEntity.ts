import axios from "@/api/axios";
import { onboardingSessionUrl } from "@/api/common";

export interface OnboardingSessionResponse {
  sessionId: string;
  anonymous: boolean;
}

/**
 * Issue (or recover) an anonymous onboarding session. The middleware sets a
 * signed cookie on first call; subsequent calls return the same `sessionId`.
 *
 * The session is anonymous (no Partner customer attached) until the user
 * completes the F6 gate via magic link / SSO / engineer call, at which point
 * the middleware promotes the session in place (cookie id preserved).
 */
export const issueOnboardingSession = async (): Promise<OnboardingSessionResponse> => {
  const response = await axios.post<OnboardingSessionResponse>(onboardingSessionUrl, {});
  return response.data;
};
