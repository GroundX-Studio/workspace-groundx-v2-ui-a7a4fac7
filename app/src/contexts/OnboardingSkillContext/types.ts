/**
 * OnboardingSkillContext — empty stub for v1.
 *
 * The SDR (sales rep) skill ships as a remote plugin via the plugin loader
 * workstream. The plugin loader is NOT on the critical path; this context is
 * just the docked surface where the loader will hand us a manifest plus the
 * skill's voice + tour state machine.
 *
 * For v1 (onboarding release) this context returns a sentinel `{ loaded: false }`
 * and views skip any SDR-specific behavior. F6 gate copy is app-owned and
 * works whether or not this skill is loaded — see `project-plugin-model` memory.
 */

export interface OnboardingSkillState {
  loaded: false;
  /** When a plugin loader lands, this will hold the parsed manifest. */
  manifest?: unknown;
}
