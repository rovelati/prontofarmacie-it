import BasicAuthGate from '@/components/admin/BasicAuthGate';
import AdminTestPanel from '@/components/admin/AdminTestPanel';
import AppToaster from '@/components/AppToaster';
import '@/styles/admin-console.css';

export default function AdminTestApp() {
  return (
    <>
      <AppToaster />
      <div className="admin-console min-h-screen">
        <BasicAuthGate>
          <AdminTestPanel />
        </BasicAuthGate>
      </div>
    </>
  );
}
