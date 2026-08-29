import "bootstrap/dist/css/bootstrap.min.css";
import "./app.css";
import { mount } from "svelte";
import { registerFlowElements } from "$lib/flow";
import App from "./App.svelte";

registerFlowElements();
mount(App, { target: document.getElementById("app")! });
