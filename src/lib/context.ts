import { getContext, setContext } from "svelte";
import { APP_STATE_KEY, AppState } from "./state.svelte";

export function provideAppState(state: AppState): AppState {
  setContext(APP_STATE_KEY, state);
  return state;
}

export function getAppState(): AppState {
  return getContext<AppState>(APP_STATE_KEY);
}
