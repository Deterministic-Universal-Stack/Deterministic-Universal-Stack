import { RuntimeLanguage } from "../index.js";
import { TypeScriptAdapter } from "./typescript.js";
export class WasmAdapter extends TypeScriptAdapter {
    language = RuntimeLanguage.WASM;
    version = "0.2.0-stub";
}
export const wasmAdapter = new WasmAdapter();
//# sourceMappingURL=wasm.js.map