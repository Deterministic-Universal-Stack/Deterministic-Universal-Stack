import { RuntimeLanguage } from "../index.js";
import { TypeScriptAdapter } from "./typescript.js";
export class RustAdapter extends TypeScriptAdapter {
    language = RuntimeLanguage.RUST;
    version = "0.2.0-stub";
}
export const rustAdapter = new RustAdapter();
//# sourceMappingURL=rust.js.map