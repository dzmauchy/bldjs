import binaryen from "binaryen";
import { MEMORY_PAGES } from "../memory";

/** Shared memory and host services used by every assembled generator. */
export function addImports(module: binaryen.Module): void {
  module.setMemory(MEMORY_PAGES, MEMORY_PAGES, null, [], true);
  module.addMemoryImport("0", "env", "memory", true);
  module.addFunctionImport("now", "host", "now", binaryen.none, binaryen.f64);
  module.addFunctionImport("host_sin", "host", "sin", binaryen.f64, binaryen.f64);
  module.addFunctionImport("host_cos", "host", "cos", binaryen.f64, binaryen.f64);
}
