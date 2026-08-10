import { render } from "solid-js/web";
import "./styles.css";
import App from "./App";

const root = document.getElementById("root");

if (!root) {
  throw new Error("缺少 #root 挂载节点");
}

render(() => <App />, root);
