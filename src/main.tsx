import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installKeyboardInset } from "./lib/keyboardInset";

installKeyboardInset();

createRoot(document.getElementById("root")!).render(<App />);
