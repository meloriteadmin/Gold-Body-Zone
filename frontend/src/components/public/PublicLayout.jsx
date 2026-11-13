import { Outlet } from 'react-router-dom';
import { PublicFooter } from './PublicFooter.jsx';
import { PublicNavbar } from './PublicNavbar.jsx';

export function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-[#101010] text-white">
      <PublicNavbar />
      <div className="flex-1">
        <Outlet />
      </div>
      <PublicFooter />
    </div>
  );
}
