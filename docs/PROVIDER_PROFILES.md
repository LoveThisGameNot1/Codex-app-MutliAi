# Provider Profiles

Provider profiles let users save reusable LLM provider setups without retyping endpoints, models, prompts, and keys.

## What Is Stored

Profiles are stored locally in the Electron user data directory as `provider-profiles.json`.

Each profile contains:

- profile name
- provider id
- base URL
- selected model
- system prompt
- default-profile flag
- timestamps
- API key, if the user saved one

The renderer never receives raw profile keys. IPC list responses only include:

- `apiKeyMasked`
- `hasApiKey`

Raw keys are only returned inside the Electron main process when a profile is applied to the active runtime config.

## UI Behavior

Runtime Settings includes a Provider Profiles section.

Users can:

- save the current provider configuration
- save the current provider configuration as the preferred default
- apply a saved profile to the active runtime config
- delete a profile
- refresh the profile list

Applying a profile updates the persisted app config and then hydrates the renderer state with the new config.

## Safety Notes

Provider profiles are intentionally not included in continuity exports because they may contain API secrets.

The profile store enforces:

- a maximum of 24 profiles
- one default profile
- masked public key display
- local file writes with restricted file mode where the operating system supports it

Consumer subscriptions such as ChatGPT Plus or Claude Pro are still distinct from API access. Profiles store API-compatible configuration only; account-linking flows remain a separate backlog item.
