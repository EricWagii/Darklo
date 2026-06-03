import React, { useEffect, useState } from 'react';
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import Footer from "./components/Footer";
import { ThemeProvider } from "./contexts/ThemeContext";
import { SerialConnectionProvider } from "./contexts/SerialConnectionContext";
import { AuthProvider } from "./contexts/AuthContext";
import { UserProvider } from "./contexts/UserContext";
import { UserSessionProvider } from "./contexts/UserSessionContext";
import Home from "./pages/Home";
import CollectionMode from "./pages/CollectionMode";
import RecognitionMode from "./pages/RecognitionMode";
import RecognitionDiagnostics from "./pages/RecognitionDiagnostics";
import DataManagement from "./pages/DataManagement";
import Settings from "./pages/Settings";
import DemoMode from "./pages/DemoMode";
import DebugSerial from "./pages/DebugSerial";
import AdminDashboard from "./pages/AdminDashboard";
import AuditLogs from "./pages/AuditLogs";

import { ProtectedRoute } from './components/ProtectedRoute';
import '@/lib/init-admin';
import { emgDatabase } from '@/lib/db';
import { performVersionCheck } from '@/lib/version-management';
import { detectDuplicateCommands, canonicalizeCommand } from '@/lib/command-canonicalization';

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/collection">
        {() => (
          <ProtectedRoute>
            <CollectionMode />
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/recognition">
        {() => (
          <ProtectedRoute>
            <RecognitionMode />
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/recognition-diagnostics">
        {() => (
          <ProtectedRoute>
            <RecognitionDiagnostics />
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/data-management">
        {() => (
          <ProtectedRoute>
            <DataManagement />
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/settings">
        {() => (
          <ProtectedRoute>
            <Settings />
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/demo">
        {() => (
          <ProtectedRoute>
            <DemoMode />
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/debug">
        {() => (
          <ProtectedRoute>
            <DebugSerial />
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin">
        {() => (
          <ProtectedRoute requiredAdmin>
            <AdminDashboard />
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/audit-logs">
        {() => (
          <ProtectedRoute requiredAdmin>
            <AuditLogs />
          </ProtectedRoute>
        )}
      </Route>

      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  const [dbReady, setDbReady] = useState(false);

  // 初始化 IndexedDB
  useEffect(() => {
    const initializeDB = async () => {
      try {
        await emgDatabase.init();
        console.log('[App] IndexedDB 初始化成功');
        
        // ✅ 修复：执行同名指令规范化（自动合并重复指令）
        const duplicates = await detectDuplicateCommands(emgDatabase);
        if (duplicates.size > 0) {
          console.log(`[App] 检测到 ${duplicates.size} 个重复指令，开始合并...`);
          const entries = Array.from(duplicates.entries());
          for (const [commandName, records] of entries) {
            await canonicalizeCommand(emgDatabase, commandName, records);
            console.log(`[App] 指令 "${commandName}" 合并完成`);
          }
        }
        
        // 执行版本检查（不清空数据，仅记录版本信息）
        await performVersionCheck();
        
        setDbReady(true);
      } catch (error) {
        console.error('[App] IndexedDB 初始化失败:', error);
        // 即使初始化失败，也继续加载应用（使用 localStorage 作为备份）
        setDbReady(true);
      }
    };

    initializeDB();
  }, []);

  // 等待 IndexedDB 初始化完成后再渲染应用
  if (!dbReady) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <div className="text-center">
          <div className="text-xl text-gray-400 mb-4">初始化数据库中...</div>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-500 mx-auto"></div>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <AuthProvider>
        <UserProvider>
          <UserSessionProvider>
            <SerialConnectionProvider>
              <ThemeProvider
                defaultTheme="dark"
                // switchable
              >
                <TooltipProvider>
                  <Toaster />
                  <div className="flex flex-col min-h-screen">
                    <div className="flex-1">
                      <Router />
                    </div>
                    <Footer />
                  </div>
                </TooltipProvider>
              </ThemeProvider>
            </SerialConnectionProvider>
          </UserSessionProvider>
        </UserProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
