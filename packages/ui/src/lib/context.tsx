import { createContext, createSignal, useContext } from "solid-js";
import { APP_STATE_KEY, type AppState } from "./state";

export { APP_STATE_KEY };

const reactiveMap = new WeakMap<AppState, AppState>();

export function createReactiveApp(app: AppState): AppState {
  let proxy = reactiveMap.get(app);
  if (proxy) return proxy;
  const [rev, setRev] = createSignal(0);
  app.subscribe(() => setRev((r) => r + 1));
  proxy = new Proxy(app, {
    get(target, prop) {
      rev();
      const val = Reflect.get(target, prop, target);
      return typeof val === "function" ? val.bind(target) : val;
    },
    set(target, prop, value) {
      return Reflect.set(target, prop, value, target);
    },
    has(target, prop) {
      rev();
      return Reflect.has(target, prop);
    },
  });
  reactiveMap.set(app, proxy);
  reactiveMap.set(proxy, proxy);
  return proxy;
}

export const AppContext = createContext<AppState>();
export const useApp = (): AppState => useContext(AppContext)!;
