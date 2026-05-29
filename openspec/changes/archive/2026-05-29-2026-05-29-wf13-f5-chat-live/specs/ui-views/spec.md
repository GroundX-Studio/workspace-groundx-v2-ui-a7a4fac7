# Spec Delta — ui-views

## ADDED Requirements

### Requirement: F5 Interact SHALL render live chat turns, not a seeded script

F5 InteractView SHALL render chat turns from the live chat session and SHALL NOT seed them from
`scenario.manifest.sampleChatScript`. The turns and their citations, and the `litRegions` derived
from the latest assistant turn, MUST reflect live chat replies. The manifest `chatSeeds` MAY remain
as starter-chip prompts that feed the real chat.

#### Scenario: F5 shows no seeded mock turn

- **GIVEN** F5 InteractView before the user has chatted
- **WHEN** it renders
- **THEN** it does not display the `sampleChatScript` mock turn (e.g. the "$9,418" demand line)
- **AND** any displayed turns come from the live chat session.
