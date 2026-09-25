import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router";

import { homeFor } from "./auth/access";
import { useAuth } from "./auth/context";
import { FullPageNote, RequireAuth, RequireSection } from "./auth/guards";
import OpsLayout from "./layouts/OpsLayout";
import PortalLayout from "./layouts/PortalLayout";
import NotFound from "./pages/NotFound";
import CustomerDetail from "./pages/ops/CustomerDetail";
import MyDay from "./pages/crew/MyDay";
import Stop from "./pages/crew/Stop";
import Customers from "./pages/ops/Customers";
import Dispatch from "./pages/ops/Dispatch";
import Money from "./pages/ops/Money";
import MoneyDocument from "./pages/ops/MoneyDocument";
import Owner from "./pages/ops/Owner";
import PortalHome from "./pages/portal/PortalHome";
import PortalJob from "./pages/portal/PortalJob";
import Welcome from "./pages/Welcome";

// The map pulls in a map library; loading it only when someone opens the map
// keeps it out of the bundle everyone else downloads.
const MapView = lazy(() => import("./pages/ops/MapView"));

function Home() {
  const auth = useAuth();
  if (auth.status === "loading") return <FullPageNote>Loading…</FullPageNote>;
  return <Navigate to={auth.status === "signedIn" ? homeFor(auth.me.user.role) : "/welcome"} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route index element={<Home />} />
      <Route path="welcome" element={<Welcome />} />

      <Route
        element={
          <RequireAuth>
            <OpsLayout />
          </RequireAuth>
        }
      >
        <Route path="my-day" element={<RequireSection section="myDay"><MyDay /></RequireSection>} />
        <Route path="my-day/:id" element={<RequireSection section="myDay"><Stop /></RequireSection>} />
        <Route path="dispatch" element={<RequireSection section="dispatch"><Dispatch /></RequireSection>} />
        <Route
          path="map"
          element={
            <RequireSection section="map">
              <Suspense fallback={<p className="text-sm text-ink-muted">Loading the map…</p>}>
                <MapView />
              </Suspense>
            </RequireSection>
          }
        />
        <Route path="customers" element={<RequireSection section="customers"><Customers /></RequireSection>} />
        <Route path="customers/:id" element={<RequireSection section="customers"><CustomerDetail /></RequireSection>} />
        <Route path="money" element={<RequireSection section="money"><Money /></RequireSection>} />
        <Route path="money/quotes/:id" element={<RequireSection section="money"><MoneyDocument kind="quote" /></RequireSection>} />
        <Route path="money/invoices/:id" element={<RequireSection section="money"><MoneyDocument kind="invoice" /></RequireSection>} />
        <Route path="owner" element={<RequireSection section="owner"><Owner /></RequireSection>} />
      </Route>

      {/* The portal needs no session: the link is the credential. */}
      <Route path="portal" element={<PortalLayout />}>
        <Route index element={<PortalHome />} />
        <Route path=":token" element={<PortalJob />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
