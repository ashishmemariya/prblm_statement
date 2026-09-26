import { useEffect, useState } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { AppProvider, useApp } from './store';
import { MobileNav, SideNav, TopNav } from './components/shell';
import { Toasts } from './components/chrome';
import CommandPalette from './components/CommandPalette';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Card, Empty, Icon } from './components/ui';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Products, { ProductDetail } from './pages/Products';
import Receipts, { ReceiptDetail } from './pages/Receipts';
import Deliveries, { DeliveryDetail } from './pages/Deliveries';
import Transfers from './pages/Transfers';
import PhysicalCounts from './pages/PhysicalCounts';
import Ledger from './pages/Ledger';
import Warehouses from './pages/Warehouses';
import SettingsPage from './pages/Settings';

function Booting() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-card bg-primary text-on-primary">
          <Icon name="deployed_code" size={26} fill />
        </div>
        <p className="flex items-center gap-2 text-[12.5px] font-semibold text-outline">
          <Icon name="progress_activity" size={16} /> Loading your workspace…
        </p>
      </div>
    </div>
  );
}

function Offline() {
  return (
    <Card>
      <Empty
        icon="cloud_off"
        title="Cannot reach the StockSense API"
        detail="Start the backend on port 4000 (npm run dev) and this page will reconnect automatically."
      />
    </Card>
  );
}

function Shell() {
  const { snap, loading, user, restoring } = useApp();
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Ctrl/Cmd+K opens the command palette from anywhere in the workspace.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (restoring) return <Booting />;
  if (!user) return <Login />;

  return (
    <div className="flex h-full">
      <SideNav />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopNav />
        <MobileNav />
        <main className="flex-1 overflow-y-auto px-3 py-4 md:px-5 md:py-5">
          {loading ? (
            <Booting />
          ) : !snap ? (
            <Offline />
          ) : (
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/products" element={<Products />} />
              <Route path="/products/:sku" element={<ProductDetail />} />
              <Route path="/receipts" element={<Receipts />} />
              <Route path="/receipts/:ref" element={<ReceiptDetail />} />
              <Route path="/deliveries" element={<Deliveries />} />
              <Route path="/deliveries/:ref" element={<DeliveryDetail />} />
              <Route path="/transfers" element={<Transfers />} />
              <Route path="/counts" element={<PhysicalCounts />} />
              <Route path="/ledger" element={<Ledger />} />
              <Route path="/warehouse" element={<Warehouses />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route
                path="*"
                element={
                  <Card>
                    <Empty
                      icon="explore_off"
                      title="Page not found"
                      detail="That route does not exist in StockSense."
                    />
                  </Card>
                }
              />
            </Routes>
          )}
        </main>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <Toasts />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <HashRouter>
        <AppProvider>
          <Routes>
            <Route path="*" element={<Shell />} />
          </Routes>
        </AppProvider>
      </HashRouter>
    </ErrorBoundary>
  );
}
