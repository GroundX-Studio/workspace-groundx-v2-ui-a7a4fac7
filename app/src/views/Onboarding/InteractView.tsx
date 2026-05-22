import SendOutlinedIcon from "@mui/icons-material/SendOutlined";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import InputBase from "@mui/material/InputBase";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useCallback, useState, type FC, type FormEvent } from "react";

import { BODY_TEXT, BORDER, CYAN, FONT_WEIGHT_LABEL, GREEN, NAVY, WHITE } from "@/constants";
import { useAppMode } from "@/contexts/AppModeContext";
import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { scenarioFixtures, type FixtureChatTurn } from "@/fixtures";
import { CiteChip } from "@/shared/components/CiteChip";

/**
 * F5 InteractView — grounded chat with citation chips.
 *
 * Placeholder rendering; the real Phase 2/7 wire-up mounts the
 * `chat-with-sources` widget configured for the scenario's ContentScope.
 * Here we replay the fixture chat script and respond to free-form input
 * with a canned "demo only" assistant turn.
 */
export const InteractView: FC = () => {
  const { state: appMode } = useAppMode();
  const { state: session, advanceFrame } = useOnboardingSession();
  const scenario = appMode.scenario ?? session.scenario ?? "utility";
  const fixture = scenarioFixtures[scenario];
  const [turns, setTurns] = useState<FixtureChatTurn[]>(fixture.chatScript);
  const [draft, setDraft] = useState("");

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmed = draft.trim();
      if (!trimmed) return;
      const userTurn: FixtureChatTurn = { id: `u-${Date.now()}`, role: "user", content: trimmed };
      const assistantTurn: FixtureChatTurn = {
        id: `a-${Date.now()}`,
        role: "assistant",
        content:
          "Live answers light up after sign-in. This is a placeholder so you can see the surface — sign in and I'll pull a real, cited answer from your sample.",
      };
      setTurns((current) => [...current, userTurn, assistantTurn]);
      setDraft("");
    },
    [draft]
  );

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateRows: "auto 1fr auto",
        gap: 1,
        p: { xs: 2, md: 3 },
        height: "100%",
        overflow: "hidden",
      }}
      aria-label="Interact"
    >
      <Stack spacing={0.5}>
        <Typography variant="overline" sx={{ color: GREEN, fontWeight: FONT_WEIGHT_LABEL }}>
          ANALYZE · INTERACT
        </Typography>
        <Typography variant="h5">Ask anything about the sample</Typography>
        <Typography variant="caption" sx={{ color: BODY_TEXT }}>
          Every answer cites the page it came from.
        </Typography>
      </Stack>

      <Box sx={{ overflow: "auto", pr: 1 }} aria-live="polite">
        <Stack spacing={1.5}>
          {turns.map((turn) => (
            <Box
              key={turn.id}
              data-testid={`chat-turn-${turn.role}`}
              sx={{
                alignSelf: turn.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "80%",
                px: 1.5,
                py: 1,
                borderRadius: 2,
                backgroundColor: turn.role === "user" ? NAVY : WHITE,
                color: turn.role === "user" ? WHITE : NAVY,
                border: turn.role === "assistant" ? `1px solid ${BORDER}` : "none",
              }}
            >
              <Typography variant="body2">{turn.content}</Typography>
              {turn.citations?.length ? (
                <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }}>
                  {turn.citations.map((c, idx) => (
                    <CiteChip key={`${turn.id}-${idx}`} citation={c} index={idx + 1} />
                  ))}
                </Stack>
              ) : null}
            </Box>
          ))}
        </Stack>
      </Box>

      <Box
        component="form"
        onSubmit={handleSubmit}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          backgroundColor: WHITE,
          border: `1px solid ${BORDER}`,
          borderRadius: 100,
          px: 2,
          py: 1,
        }}
      >
        <InputBase
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask about the sample…"
          sx={{ flex: 1, color: NAVY }}
          inputProps={{ "aria-label": "Chat input" }}
          data-testid="chat-input"
        />
        <IconButton type="submit" aria-label="Send" sx={{ backgroundColor: CYAN, color: NAVY, "&:hover": { backgroundColor: GREEN } }}>
          <SendOutlinedIcon />
        </IconButton>
        <Box
          role="button"
          tabIndex={0}
          data-testid="advance-to-f6"
          onClick={() => advanceFrame("f6")}
          onKeyDown={(event) => {
            if (event.key === "Enter") advanceFrame("f6");
          }}
          sx={{
            ml: 1,
            px: 1.5,
            py: 0.75,
            borderRadius: 100,
            color: NAVY,
            border: `1px solid ${NAVY}`,
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 600,
            "&:hover": { backgroundColor: "rgba(41, 51, 92, 0.04)" },
          }}
        >
          💾 Save
        </Box>
      </Box>
    </Box>
  );
};
