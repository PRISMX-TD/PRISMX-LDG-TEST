import { Switch, Route, useLocation, Redirect } from "wouter";
import { Suspense, lazy } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SimpleSidebar } from "@/components/SimpleSidebar";
import { MobileNavBar } from "@/components/MobileNavBar";
import { MobileHeader } from "@/components/MobileHeader";
import { PWAUpdatePrompt } from "@/components/PWAUpdatePrompt";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";
const NotFound = lazy(() => import("@/pages/not-found"));
const Landing = lazy(() => import("@/pages/Landing"));
const Auth = lazy(() => import("@/pages/Auth"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Transactions = lazy(() => import("@/pages/Transactions"));
const Categories = lazy(() => import("@/pages/Categories"));
const Wallets = lazy(() => import("@/pages/Wallets"));
const Budgets = lazy(() => import("@/pages/Budgets"));
const Savings = lazy(() => import("@/pages/Savings"));
const Recurring = lazy(() => import("@/pages/Recurring"));
const Reminders = lazy(() => import("@/pages/Reminders"));
const Analytics = lazy(() => import("@/pages/Analytics"));
const Reports = lazy(() => import("@/pages/Reports"));
const Settings = lazy(() => import("@/pages/Settings"));
const Exchange = lazy(() => import("@/pages/Exchange"));
const Loans = lazy(() => import("@/pages/Loans"));
const SubLedgers = lazy(() => import("@/pages/SubLedgers"));
const WalletDetail = lazy(() => import("@/pages/WalletDetail"));
const Split = lazy(() => import("@/pages/Split"));

const SuspenseFallback = (
  <div className="w-full h-full min-h-[60vh] flex items-center justify-center">
    <Loader2 className="w-8 h-8 animate-spin text-primary" />
  </div>
);

function AuthenticatedLayout() {
  const { user, isLoading } = useAuth();
  const [location] = useLocation();
  const isDashboard = location === "/";

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <>
      {/* Desktop Layout */}
      <div className="hidden md:block h-screen overflow-hidden bg-background text-foreground relative">
        <SimpleSidebar user={user} />
        
        {/* Main Content Area - Shifted by Sidebar Width */}
        <div className="pl-64 h-full flex flex-col relative z-0">
          <main className="flex-1 h-full overflow-hidden flex flex-col">
            <Switch>
              <Route path="/" component={() => <Redirect to="/dashboard" />} />
              <Route path="/auth" component={() => (
                <Suspense fallback={SuspenseFallback}> 
                  <Dashboard />
                </Suspense>
              )} />
              <Route path="/dashboard" component={() => (
                <Suspense fallback={SuspenseFallback}> 
                  <Dashboard />
                </Suspense>
              )} />
              <Route path="/transactions" component={() => (
                <Suspense fallback={SuspenseFallback}> 
                  <Transactions />
                </Suspense>
              )} />
              <Route path="/categories" component={() => (
                <Suspense fallback={SuspenseFallback}> 
                  <Categories />
                </Suspense>
              )} />
              <Route path="/wallets" component={() => (
                <Suspense fallback={SuspenseFallback}> 
                  <Wallets />
                </Suspense>
              )} />
              <Route path="/wallets/:id" component={() => (
                <Suspense fallback={SuspenseFallback}> 
                  <WalletDetail />
                </Suspense>
              )} />
              <Route path="/exchange" component={() => (
                <Suspense fallback={SuspenseFallback}> 
                  <Exchange />
                </Suspense>
              )} />
              <Route path="/loans" component={() => (
                <Suspense fallback={SuspenseFallback}> 
                  <Loans />
                </Suspense>
              )} />
              <Route path="/budgets" component={() => (
                <Suspense fallback={SuspenseFallback}> 
                  <Budgets />
                </Suspense>
              )} />
              <Route path="/savings" component={() => (
                <Suspense fallback={SuspenseFallback}> 
                  <Savings />
                </Suspense>
              )} />
              <Route path="/recurring" component={() => (
                <Suspense fallback={SuspenseFallback}> 
                  <Recurring />
                </Suspense>
              )} />
              <Route path="/reminders" component={() => (
                <Suspense fallback={SuspenseFallback}> 
                  <Reminders />
                </Suspense>
              )} />
              <Route path="/analytics" component={() => (
                <Suspense fallback={SuspenseFallback}> 
                  <Analytics />
                </Suspense>
              )} />
              <Route path="/reports" component={() => (
                <Suspense fallback={SuspenseFallback}> 
                  <Reports />
                </Suspense>
              )} />
              <Route path="/sub-ledgers" component={() => (
                <Suspense fallback={SuspenseFallback}> 
                  <SubLedgers />
                </Suspense>
              )} />
              <Route path="/split" component={() => (
                <Suspense fallback={SuspenseFallback}> 
                  <Split />
                </Suspense>
              )} />
              <Route path="/split/:id" component={() => (
                <Suspense fallback={SuspenseFallback}> 
                  <Split />
                </Suspense>
              )} />
              <Route path="/settings" component={() => (
                <Suspense fallback={SuspenseFallback}> 
                  <Settings />
                </Suspense>
              )} />
              <Route component={() => (
                <Suspense fallback={SuspenseFallback}> 
                  <NotFound />
                </Suspense>
              )} />
            </Switch>
          </main>
        </div>
      </div>

      {/* Mobile Layout */}
      <div className="md:hidden flex flex-col h-screen overflow-hidden">
        <MobileHeader user={user} />
        <main className="flex-1 overflow-hidden pb-20 flex flex-col">
          <Switch>
            <Route path="/" component={() => <Redirect to="/dashboard" />} />
            <Route path="/auth" component={() => (
              <Suspense fallback={SuspenseFallback}> 
                <Dashboard />
              </Suspense>
            )} />
            <Route path="/dashboard" component={() => (
              <Suspense fallback={SuspenseFallback}> 
                <Dashboard />
              </Suspense>
            )} />
            <Route path="/transactions" component={() => (
              <Suspense fallback={SuspenseFallback}> 
                <Transactions />
              </Suspense>
            )} />
            <Route path="/categories" component={() => (
              <Suspense fallback={SuspenseFallback}> 
                <Categories />
              </Suspense>
            )} />
            <Route path="/wallets" component={() => (
              <Suspense fallback={SuspenseFallback}> 
                <Wallets />
              </Suspense>
            )} />
            <Route path="/wallets/:id" component={() => (
              <Suspense fallback={SuspenseFallback}> 
                <WalletDetail />
              </Suspense>
            )} />
            <Route path="/exchange" component={() => (
              <Suspense fallback={SuspenseFallback}> 
                <Exchange />
              </Suspense>
            )} />
            <Route path="/loans" component={() => (
              <Suspense fallback={SuspenseFallback}> 
                <Loans />
              </Suspense>
            )} />
            <Route path="/budgets" component={() => (
              <Suspense fallback={SuspenseFallback}> 
                <Budgets />
              </Suspense>
            )} />
            <Route path="/savings" component={() => (
              <Suspense fallback={SuspenseFallback}> 
                <Savings />
              </Suspense>
            )} />
            <Route path="/recurring" component={() => (
              <Suspense fallback={SuspenseFallback}> 
                <Recurring />
              </Suspense>
            )} />
            <Route path="/reminders" component={() => (
              <Suspense fallback={SuspenseFallback}> 
                <Reminders />
              </Suspense>
            )} />
            <Route path="/analytics" component={() => (
              <Suspense fallback={SuspenseFallback}> 
                <Analytics />
              </Suspense>
            )} />
            <Route path="/reports" component={() => (
              <Suspense fallback={SuspenseFallback}> 
                <Reports />
              </Suspense>
            )} />
            <Route path="/sub-ledgers" component={() => (
              <Suspense fallback={SuspenseFallback}> 
                <SubLedgers />
              </Suspense>
            )} />
            <Route path="/split" component={() => (
              <Suspense fallback={SuspenseFallback}> 
                <Split />
              </Suspense>
            )} />
            <Route path="/split/:id" component={() => (
              <Suspense fallback={SuspenseFallback}> 
                <Split />
              </Suspense>
            )} />
            <Route path="/settings" component={() => (
              <Suspense fallback={SuspenseFallback}> 
                <Settings />
              </Suspense>
            )} />
            <Route component={() => (
              <Suspense fallback={SuspenseFallback}> 
                <NotFound />
              </Suspense>
            )} />
          </Switch>
        </main>
        <MobileNavBar user={user} />
      </div>
    </>
  );
}

function Router() {
  const { isAuthenticated, isLoading } = useAuth();
  const [location] = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Suspense fallback={SuspenseFallback}>
        <Switch>
          <Route path="/" component={Landing} />
          <Route path="/auth" component={Auth} />
          <Route component={Landing} />
        </Switch>
      </Suspense>
    );
  }

  return <AuthenticatedLayout />;
}

import { PrivacyModeProvider } from "@/hooks/usePrivacyMode";

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <PrivacyModeProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
          <PWAUpdatePrompt />
        </TooltipProvider>
      </PrivacyModeProvider>
    </QueryClientProvider>
  );
}

export default App;
