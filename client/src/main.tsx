import { createRoot } from "react-dom/client";
import App from "./App";
import { startAppHistory } from "./lib/appHistoryStore";
import "./index.css";
startAppHistory();
createRoot(document.getElementById("root")!).render(<App />);
