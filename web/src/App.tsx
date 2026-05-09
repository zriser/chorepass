import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ParentProvider } from "./useParent.js";
import Landing from "./pages/Landing.js";
import KidView from "./pages/KidView.js";
import Parent from "./pages/Parent.js";

export default function App() {
  return (
    <BrowserRouter>
      <ParentProvider>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/kid/:slug" element={<KidView />} />
          <Route path="/parent" element={<Parent />} />
          <Route path="*" element={<Landing />} />
        </Routes>
      </ParentProvider>
    </BrowserRouter>
  );
}
