import { registerClientErrorInstrumentation } from "@/lib/client-error-instrumentation";

const instrumentationKey = "__kaleidoClientErrorInstrumentation";
type InstrumentedWindow = Window & { __kaleidoClientErrorInstrumentation?: boolean };
const instrumentationScope = window as InstrumentedWindow;

if (!instrumentationScope[instrumentationKey]) {
  instrumentationScope[instrumentationKey] = true;
  registerClientErrorInstrumentation(window);
}
