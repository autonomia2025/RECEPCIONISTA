import { Outlet } from 'react-router-dom';
import { AppSidebar } from './AppSidebar';
import { Button } from '@/components/ui/button';
import { Menu } from 'lucide-react';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { NotificationToast } from '@/components/notifications/NotificationToast';
import { TutorialButton, AdminTutorial } from '@/components/tutorial';
import { LeadNotificationListener } from '@/components/admin/LeadNotificationListener';
import { useAuth } from '@/contexts/AuthContext';

export const AppLayout = () => {
  const { user, profile } = useAuth();
  const isSuperAdmin = profile?.role === 'SUPERADMIN';

  return (
    <div className="flex min-h-screen min-h-[100dvh] bg-background">
      <AppSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar with notifications */}
        {user && (
          <header className="h-14 border-b border-border/60 flex items-center justify-between px-4 bg-background/70 backdrop-blur-md shrink-0 gap-2 sticky top-0 z-10">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => window.dispatchEvent(new Event('autonomia:sidebar-toggle'))}
            >
              <Menu className="w-5 h-5" />
            </Button>
            {!isSuperAdmin && <TutorialButton />}
            <NotificationBell />
          </header>
        )}
        <main className="flex-1 overflow-auto app-surface">
          <Outlet />
        </main>
      </div>
      {/* Real-time notification toast listener */}
      {user && <NotificationToast />}
      {/* Lead notifications for superadmin */}
      {user && isSuperAdmin && <LeadNotificationListener />}
      {/* Tutorial for non-superadmin users on first visit */}
      {user && !isSuperAdmin && <AdminTutorial />}
    </div>
  );
};
