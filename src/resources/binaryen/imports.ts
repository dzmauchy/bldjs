import binaryen from "binaryen";
import { MEMORY_PAGES } from "../../lib/runtime/memory";

/** Memory import and host services used by every assembled generator. */
export function addImports(module: binaryen.Module, shared = true): void {
  module.setMemory(MEMORY_PAGES, MEMORY_PAGES, null, [], shared);
  module.addMemoryImport("0", "env", "memory", shared);
  module.addFunctionImport("now", "host", "now", binaryen.none, binaryen.f64);
  module.addFunctionImport("host_sin", "host", "sin", binaryen.f64, binaryen.f64);
  module.addFunctionImport("host_cos", "host", "cos", binaryen.f64, binaryen.f64);
}
