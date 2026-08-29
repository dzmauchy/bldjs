import { unsafeCSS } from "lit";
import bootstrapCss from "bootstrap/dist/css/bootstrap.min.css?inline";

/** Shared Bootstrap stylesheet adopted into chrome custom-element shadows. */
export const bootstrapStyles = unsafeCSS(bootstrapCss);
