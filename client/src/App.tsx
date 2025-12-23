import { Switch, Route } from "wouter";
import { Suspense, lazy } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger, SidebarInset, SidebarRail } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
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

  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3.5rem",
  } as React.CSSProperties;

  return (
    <>
      {/* Desktop Layout */}
      <div className="hidden md:block h-screen">
        <SidebarProvider style={sidebarStyle}>
          <div className="flex h-screen w-full overflow-hidden">
            <AppSidebar user={user} />
            <SidebarRail />
            <SidebarInset className="flex flex-col flex-1 min-w-0 bg-transparent">
              <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-4 border-b border-primary/10 bg-background/40 backdrop-blur-xl px-4">
                <SidebarTrigger data-testid="button-sidebar-toggle" className="-ml-1" />
              </header>
              <main className="flex-1 overflow-auto">
                <Switch>
                  <Route path="/auth" component={() => (
                    <Suspense fallback={SuspenseFallback}> 
                      <Dashboard />
                    </Suspense>
                  )} />
                  <Route path="/" component={() => (
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
            </SidebarInset>
          </div>
        </SidebarProvider>
      </div>

      {/* Mobile Layout */}
      <div className="md:hidden flex flex-col min-h-screen">
        <MobileHeader user={user} />
        <main className="flex-1 overflow-auto pb-20">
          <Switch>
            <Route path="/auth" component={() => (
              <Suspense fallback={SuspenseFallback}> 
                <Dashboard />
              </Suspense>
            )} />
            <Route path="/" component={() => (
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

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
        <PWAUpdatePrompt />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
