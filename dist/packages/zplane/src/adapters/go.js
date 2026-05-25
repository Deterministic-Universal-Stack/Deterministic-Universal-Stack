import { RuntimeLanguage } from "../index.js";
import { TypeScriptAdapter } from "./typescript.js";
export class GoAdapter extends TypeScriptAdapter {
    language = RuntimeLanguage.GO;
    version = "0.2.0-stub";
}
export const goAdapter = new GoAdapter();
//# sourceMappingURL=go.js.map