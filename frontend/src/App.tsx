import { lazy, Suspense } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import RouteFallback from './components/RouteFallback';
import WalletBar from './components/WalletBar';
import Activity from './pages/Activity';
import { useWallet } from './hooks/useWallet';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const PoolDetails = lazy(() => import('./pages/PoolDetails'));

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/activity', label: 'Activity', end: false },
];

export default function App() {
  const wallet = useWallet();

  return (
    <div className="min-h-screen">
      <header className="border-b border-ink-800 bg-ink-900/50">
        <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-mist-200">
                StellarNest
              </h1>
              <p className="text-[11px] text-mist-400">Savings &amp; Thrift on Stellar</p>
            </div>

            <WalletBar
              address={wallet.address}
              connecting={wallet.connecting}
              error={wallet.error}
              onConnect={wallet.connect}
              onDisconnect={wallet.disconnect}
            />
          </div>

          <nav className="mt-4 flex gap-1" aria-label="Main">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    isActive
                      ? 'bg-ink-700 text-mist-200'
                      : 'text-mist-400 hover:bg-ink-800 hover:text-mist-200'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
        <Routes>
          <Route
            path="/"
            element={
              <Suspense fallback={<RouteFallback />}>
                <Dashboard />
              </Suspense>
            }
          />
          <Route
            path="/pools/:poolId"
            element={
              <Suspense fallback={<RouteFallback />}>
                <PoolDetails />
              </Suspense>
            }
          />
          <Route path="/activity" element={<Activity />} />
        </Routes>
      </main>

      <footer className="border-t border-ink-800 px-4 py-6 text-center text-[11px] text-mist-400">
        StellarNest runs on the Stellar Testnet. Funds are custodied by the treasury
        contract and moved only through the savings contract.
      </footer>
    </div>
  );
}
