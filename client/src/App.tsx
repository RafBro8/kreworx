import { Navigate, Route, Routes } from "react-router";

import OpsLayout from "./layouts/OpsLayout";
import PortalLayout from "./layouts/PortalLayout";
import NotFound from "./pages/NotFound";
import Customers from "./pages/ops/Customers";
import Dispatch from "./pages/ops/Dispatch";
import MapView from "./pages/ops/MapView";
import Money from "./pages/ops/Money";
import Owner from "./pages/ops/Owner";
import PortalHome from "./pages/portal/PortalHome";

export default function App() {
  return (
    <Routes>
      {/* Dispatch is the front door: it is what the business opens in the
          morning and what a demo should land on. */}
      <Route index element={<Navigate to="/dispatch" replace />} />

      <Route element={<OpsLayout />}>
        <Route path="dispatch" element={<Dispatch />} />
        <Route path="map" element={<MapView />} />
        <Route path="customers" element={<Customers />} />
        <Route path="money" element={<Money />} />
        <Route path="owner" element={<Owner />} />
      </Route>

      <Route path="portal" element={<PortalLayout />}>
        <Route index element={<PortalHome />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
